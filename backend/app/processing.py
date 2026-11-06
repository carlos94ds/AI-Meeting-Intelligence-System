"""Verwerkingspijplijn van een nieuwe vergadering (transcriberen → ... → voorbereiding)."""

import asyncio
import logging
from datetime import datetime

from sqlmodel import Session, col, select

from .ai import AIProvider, get_provider
from .ai.schemas import MeetingAnalysis, OpenActionItemRef, TranscriptionHints
from .config import get_settings
from .db import engine
from .models import (
    ActionItem,
    ActionStatus,
    ChangeOrigin,
    Decision,
    Goal,
    Meeting,
    MeetingParticipant,
    Participant,
    PrepQuestion,
    ProcessingState,
    StatusChange,
    SuggestionState,
    SummaryItem,
    SummaryKind,
    TranscriptSegment,
)
from .services import Lookup, build_project_state

log = logging.getLogger(__name__)

PROCESSING_STEPS: list[tuple[str, str]] = [
    ("transcribe", "Transcriberen"),
    ("diarize", "Sprekers herkennen"),
    ("extract", "Afspraken extraheren"),
    ("compare", "Vergelijken met vorige vergaderingen"),
    ("prepare", "Voorbereiding maken"),
]

SUMMARY_FIELDS: dict[str, SummaryKind] = {
    "topics": SummaryKind.ONDERWERP,
    "problems": SummaryKind.PROBLEEM,
    "ideas": SummaryKind.IDEE,
    "agreements": SummaryKind.AFSPRAAK,
    "deadlines": SummaryKind.DEADLINE,
}


def _set_step(session: Session, meeting: Meeting, step: int) -> None:
    meeting.processing_step = step
    meeting.processing_state = ProcessingState.PROCESSING
    session.add(meeting)
    session.commit()


def save_analysis(
    session: Session, meeting: Meeting, analysis: MeetingAnalysis, segment_ids: list[int]
) -> list[ActionItem]:
    """Slaat samenvatting, besluiten en (voorgestelde) actiepunten op."""
    assert meeting.id is not None

    def seg(idx: int) -> int | None:
        return segment_ids[idx] if 0 <= idx < len(segment_ids) else None

    for field, kind in SUMMARY_FIELDS.items():
        for entry in getattr(analysis, field):
            session.add(SummaryItem(meeting_id=meeting.id, kind=kind, text=entry.text,
                                    source_segment_id=seg(entry.segment_index)))
    for d in analysis.decisions:
        session.add(Decision(meeting_id=meeting.id, text=d.text, source_segment_id=seg(d.segment_index)))

    participants = session.exec(select(Participant)).all()
    by_name = {p.name.lower(): p.id for p in participants}
    goals = session.exec(select(Goal).where(Goal.project_id == meeting.project_id)).all()
    goal_by_title = {g.title.lower(): g.id for g in goals}

    created: list[ActionItem] = []
    end = meeting.date
    for a in analysis.action_items:
        item = ActionItem(
            project_id=meeting.project_id,
            meeting_id=meeting.id,
            goal_id=goal_by_title.get(a.goal_hint.lower()) if a.goal_hint else None,
            title=a.title,
            description=a.description,
            owner_id=by_name.get(a.owner_name.lower()) if a.owner_name else None,
            deadline=a.deadline,
            original_deadline=a.deadline,
            status=ActionStatus.VOORGESTELD,
            source_segment_id=seg(a.segment_index),
            ai_confidence=a.confidence,
            created_at=end,
            updated_at=end,
        )
        session.add(item)
        session.flush()
        session.add(StatusChange(
            action_item_id=item.id,  # type: ignore[arg-type]
            meeting_id=meeting.id, from_status=None, to_status=ActionStatus.VOORGESTELD,
            origin=ChangeOrigin.AI, state=SuggestionState.ACCEPTED,
            source_segment_id=item.source_segment_id, rationale="Door AI herkend in het transcript.",
            actor="AI", created_at=end, decided_at=end,
        ))
        created.append(item)
    session.commit()
    return created


async def process_meeting(meeting_id: int, audio: bytes) -> None:
    provider = get_provider()
    with Session(engine) as session:
        meeting = session.get(Meeting, meeting_id)
        if meeting is None:
            return
        try:
            # 1. Transcriberen
            _set_step(session, meeting, 1)
            participant_ids = [
                link.participant_id
                for link in session.exec(
                    select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting_id)
                ).all()
            ]
            names = [p.name for p in session.exec(
                select(Participant).where(col(Participant.id).in_(participant_ids)).order_by(col(Participant.id))
            ).all()]
            transcript = await provider.transcribe(audio, TranscriptionHints(participant_names=names))
            segment_ids: list[int] = []
            for pos, s in enumerate(transcript.segments):
                row = TranscriptSegment(meeting_id=meeting_id, position=pos, speaker_label=s.speaker_label,
                                        start_seconds=s.start_seconds, end_seconds=s.end_seconds, text=s.text)
                session.add(row)
                session.flush()
                assert row.id is not None
                segment_ids.append(row.id)
            meeting.duration_minutes = max(1, round(transcript.duration_seconds / 60))
            session.commit()

            # 2. Sprekers herkennen (diarisatie zit in de transcriptie; koppelen doet de gebruiker)
            _set_step(session, meeting, 2)
            if provider.name == "mock":
                await asyncio.sleep(get_settings().mock_delay_seconds)

            # 3. Afspraken extraheren
            _set_step(session, meeting, 3)
            analysis = await provider.extract(transcript)
            save_analysis(session, meeting, analysis, segment_ids)

            # 4. Vergelijken met vorige vergaderingen
            _set_step(session, meeting, 4)
            lk = Lookup(session)
            open_items = session.exec(
                select(ActionItem).where(
                    ActionItem.project_id == meeting.project_id,
                    ActionItem.meeting_id != meeting_id,
                    col(ActionItem.status).in_(
                        [ActionStatus.OPEN, ActionStatus.UITGESTELD, ActionStatus.GEMELD_AFGEROND]
                    ),
                )
            ).all()
            refs = [
                OpenActionItemRef(
                    id=i.id, title=i.title, status=i.status, deadline=i.deadline, postpone_count=i.postpone_count,
                    owner_name=lk.participants[i.owner_id].name if i.owner_id in lk.participants else None,
                )
                for i in open_items
                if i.id is not None
            ]
            suggestions = await provider.match(analysis, refs)
            current = {i.id: i for i in open_items}
            for sug in suggestions:
                item = current.get(sug.action_item_id)
                if item is None:
                    continue
                session.add(StatusChange(
                    action_item_id=sug.action_item_id, meeting_id=meeting_id,
                    from_status=item.status, to_status=sug.suggested_status,
                    origin=ChangeOrigin.AI, state=SuggestionState.PENDING,
                    source_segment_id=segment_ids[sug.segment_index] if sug.segment_index < len(segment_ids) else None,
                    quote=sug.quote, rationale=sug.rationale, new_deadline=sug.new_deadline,
                    actor="AI", created_at=datetime.now(),
                ))
            session.commit()

            # 5. Voorbereiding maken
            _set_step(session, meeting, 5)
            await regenerate_preparation(session, meeting.project_id)

            meeting.processing_step = len(PROCESSING_STEPS)
            meeting.processing_state = ProcessingState.DONE
            session.add(meeting)
            session.commit()
        except Exception as exc:  # pragma: no cover - zichtbaar in de UI
            log.exception("Verwerking van vergadering %s mislukt", meeting_id)
            session.rollback()
            meeting.processing_state = ProcessingState.FAILED
            meeting.processing_error = f"Verwerking mislukt: {exc}"
            session.add(meeting)
            session.commit()


async def regenerate_preparation(session: Session, project_id: int, provider: AIProvider | None = None) -> None:
    """Vervangt de door AI voorgestelde vragen; zelf toegevoegde vragen blijven staan."""
    from .models import Project

    project = session.get(Project, project_id)
    if project is None:
        return
    lk = Lookup(session)
    drafts = await (provider or get_provider()).prepare_next(build_project_state(session, project, lk))
    existing = session.exec(select(PrepQuestion).where(PrepQuestion.project_id == project_id)).all()
    custom = [q for q in existing if q.is_custom]
    for q in existing:
        if not q.is_custom:
            session.delete(q)
    for pos, d in enumerate(drafts):
        session.add(PrepQuestion(project_id=project_id, text=d.text, reason=d.reason,
                                 action_item_id=d.action_item_id, source_segment_id=d.source_segment_id,
                                 included=d.priority <= 3, position=pos))
    for offset, q in enumerate(custom):
        q.position = len(drafts) + offset
        session.add(q)
    session.commit()
