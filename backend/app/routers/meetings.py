from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from sqlmodel import Session, col, select

from ..db import get_session
from ..models import (
    ActionItem,
    ActionStatus,
    ChangeOrigin,
    Decision,
    Meeting,
    MeetingParticipant,
    Participant,
    ProcessingState,
    Project,
    StatusChange,
    SummaryItem,
    TranscriptSegment,
)
from ..processing import PROCESSING_STEPS, process_meeting
from ..schemas import (
    ComparisonCounts,
    ComparisonItemOut,
    ComparisonOut,
    DecisionOut,
    MeetingDetailOut,
    MeetingSummaryOut,
    ProcessingStatusOut,
    ProcessingStepOut,
    SegmentOut,
    SpeakerMappingIn,
    SummaryItemOut,
)
from ..services import (
    Lookup,
    action_item_out,
    get_app_settings,
    meeting_summary_out,
    project_meetings,
    project_participants,
    status_at,
    status_change_out,
)
from ..status import STATUS_LABELS

router = APIRouter(prefix="/meetings", tags=["Vergaderingen"])

ALLOWED_AUDIO = {".mp3", ".m4a", ".wav", ".ogg", ".webm", ".mp4", ".aac", ".flac"}
MAX_UPLOAD_BYTES = 200 * 1024 * 1024


def _get_meeting(session: Session, meeting_id: int) -> Meeting:
    meeting = session.get(Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(404, "Vergadering niet gevonden.")
    return meeting


def _previous_meeting(session: Session, meeting: Meeting) -> Meeting | None:
    earlier = [m for m in project_meetings(session, meeting.project_id) if m.date < meeting.date]
    return earlier[-1] if earlier else None


@router.get("", response_model=list[MeetingSummaryOut])
def list_meetings(project_id: int | None = None, session: Session = Depends(get_session)) -> list[MeetingSummaryOut]:
    stmt = select(Meeting).order_by(col(Meeting.date).desc())
    if project_id is not None:
        stmt = stmt.where(Meeting.project_id == project_id)
    lk = Lookup(session)
    return [meeting_summary_out(m, lk) for m in session.exec(stmt).all()]


@router.post("", response_model=MeetingSummaryOut, status_code=202)
async def create_meeting(
    background: BackgroundTasks,
    project_id: int = Form(...),
    title: str = Form(..., min_length=1),
    date: datetime = Form(...),
    participant_ids: str = Form("", description="Komma-gescheiden deelnemer-id's"),
    consent: bool = Form(False),
    audio: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> MeetingSummaryOut:
    if session.get(Project, project_id) is None:
        raise HTTPException(404, "Project niet gevonden.")
    if get_app_settings(session).consent_required and not consent:
        raise HTTPException(422, "Bevestig dat alle deelnemers zijn geïnformeerd over de opname.")
    filename = audio.filename or "opname"
    suffix = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix not in ALLOWED_AUDIO:
        raise HTTPException(422, f"Bestandstype niet ondersteund. Toegestaan: {', '.join(sorted(ALLOWED_AUDIO))}.")
    data = await audio.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Het bestand is te groot (maximaal 200 MB).")

    meeting = Meeting(project_id=project_id, title=title, date=date, audio_filename=filename,
                      consent_confirmed=consent, processing_state=ProcessingState.PENDING, processing_step=0)
    session.add(meeting)
    session.flush()
    ids = [int(x) for x in participant_ids.split(",") if x.strip().isdigit()]
    for pid in ids:
        if session.get(Participant, pid):
            session.add(MeetingParticipant(meeting_id=meeting.id, participant_id=pid))  # type: ignore[arg-type]
    session.commit()
    session.refresh(meeting)

    # Audio alleen tijdelijk bewaren als de bewaartermijn dat toestaat (prototype: niet op schijf).
    assert meeting.id is not None
    background.add_task(process_meeting, meeting.id, data)
    return meeting_summary_out(meeting, Lookup(session))


@router.get("/{meeting_id}", response_model=MeetingDetailOut)
def get_meeting(meeting_id: int, session: Session = Depends(get_session)) -> MeetingDetailOut:
    meeting = _get_meeting(session, meeting_id)
    lk = Lookup(session)
    segments = session.exec(
        select(TranscriptSegment).where(TranscriptSegment.meeting_id == meeting_id)
        .order_by(col(TranscriptSegment.position))
    ).all()
    participant_ids = [l.participant_id for l in session.exec(
        select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting_id)).all()]
    items = session.exec(
        select(ActionItem).where(ActionItem.meeting_id == meeting_id).order_by(col(ActionItem.id))
    ).all()
    prev = _previous_meeting(session, meeting)

    seg_out: list[SegmentOut] = []
    labels: list[str] = []
    for s in segments:
        assert s.id is not None
        p = lk.participants.get(s.participant_id) if s.participant_id else None
        if s.speaker_label not in labels:
            labels.append(s.speaker_label)
        seg_out.append(SegmentOut(
            id=s.id, position=s.position, speaker_label=s.speaker_label, participant_id=s.participant_id,
            speaker_name=p.name if p else s.speaker_label, color=p.color if p else "slate",
            start_seconds=s.start_seconds, end_seconds=s.end_seconds, text=s.text,
        ))

    summary = meeting_summary_out(meeting, lk)
    return MeetingDetailOut(
        **summary.model_dump(),
        participants=[p for p in (lk.participant_out(pid) for pid in participant_ids) if p],
        project_participants=project_participants(session, meeting.project_id, lk),
        speaker_labels=labels,
        segments=seg_out,
        summary_items=[
            SummaryItemOut(id=i.id, kind=i.kind, text=i.text, source_segment_id=i.source_segment_id)  # type: ignore[arg-type]
            for i in session.exec(select(SummaryItem).where(SummaryItem.meeting_id == meeting_id)
                                  .order_by(col(SummaryItem.id))).all()
        ],
        decisions=[
            DecisionOut(id=d.id, text=d.text, source_segment_id=d.source_segment_id)  # type: ignore[arg-type]
            for d in session.exec(select(Decision).where(Decision.meeting_id == meeting_id)
                                  .order_by(col(Decision.id))).all()
        ],
        action_items=[action_item_out(i, lk) for i in items],
        previous_meeting_id=prev.id if prev else None,
    )


@router.get("/{meeting_id}/processing-status", response_model=ProcessingStatusOut)
def processing_status(meeting_id: int, session: Session = Depends(get_session)) -> ProcessingStatusOut:
    meeting = _get_meeting(session, meeting_id)
    steps: list[ProcessingStepOut] = []
    for idx, (key, label) in enumerate(PROCESSING_STEPS, start=1):
        if meeting.processing_state == ProcessingState.DONE or idx < meeting.processing_step:
            state = "klaar"
        elif idx == meeting.processing_step:
            state = "fout" if meeting.processing_state == ProcessingState.FAILED else "bezig"
        else:
            state = "wachten"
        steps.append(ProcessingStepOut(key=key, label=label, state=state))  # type: ignore[arg-type]
    return ProcessingStatusOut(meeting_id=meeting_id, state=meeting.processing_state,
                               step=meeting.processing_step, steps=steps, error=meeting.processing_error)


@router.put("/{meeting_id}/speakers", response_model=MeetingDetailOut)
def map_speakers(meeting_id: int, body: SpeakerMappingIn, session: Session = Depends(get_session)) -> MeetingDetailOut:
    _get_meeting(session, meeting_id)
    segments = session.exec(select(TranscriptSegment).where(TranscriptSegment.meeting_id == meeting_id)).all()
    for s in segments:
        if s.speaker_label in body.mapping:
            s.participant_id = body.mapping[s.speaker_label]
            session.add(s)
    session.commit()
    return get_meeting(meeting_id, session)


@router.get("/{meeting_id}/comparison", response_model=ComparisonOut)
def comparison(meeting_id: int, session: Session = Depends(get_session)) -> ComparisonOut:
    meeting = _get_meeting(session, meeting_id)
    lk = Lookup(session)
    earlier_ids = [m.id for m in project_meetings(session, meeting.project_id) if m.date < meeting.date]
    prev = _previous_meeting(session, meeting)
    items = session.exec(
        select(ActionItem).where(col(ActionItem.meeting_id).in_(earlier_ids)).order_by(col(ActionItem.id))
    ).all() if earlier_ids else []

    out: list[ComparisonItemOut] = []
    counts = ComparisonCounts()
    for item in items:
        changes = session.exec(
            select(StatusChange).where(StatusChange.action_item_id == item.id)
            .order_by(col(StatusChange.created_at), col(StatusChange.id))
        ).all()
        suggestion = next(
            (c for c in reversed(changes)
             if c.meeting_id == meeting_id and c.origin == ChangeOrigin.AI and c.from_status is not None),
            None,
        )
        before = status_at(list(changes), meeting.date) or item.status
        if before in (ActionStatus.VOORGESTELD, ActionStatus.VERVALLEN) and suggestion is None:
            continue
        previous_status = suggestion.from_status if suggestion and suggestion.from_status else before
        pending = suggestion is not None and suggestion.state.value == "pending"
        result = suggestion.to_status if pending and suggestion else item.status
        if pending:
            counts.te_beoordelen += 1
            # Een nog niet bevestigde afronding telt nooit als "afgerond".
            if result == ActionStatus.AFGEROND:
                result = ActionStatus.GEMELD_AFGEROND
        match result:
            case ActionStatus.AFGEROND:
                counts.afgerond += 1
            case ActionStatus.GEMELD_AFGEROND:
                counts.gemeld += 1
            case ActionStatus.UITGESTELD:
                counts.uitgesteld += 1
            case ActionStatus.VERVALLEN:
                counts.vervallen += 1
            case _:
                counts.openstaand += 1
        out.append(ComparisonItemOut(
            action_item=action_item_out(item, lk),
            previous_status=previous_status,
            suggestion=status_change_out(suggestion, lk) if suggestion else None,
        ))
    return ComparisonOut(
        meeting_id=meeting_id,
        previous_meeting=meeting_summary_out(prev, lk) if prev else None,
        items=out,
        counts=counts,
    )


@router.get("/{meeting_id}/export", response_class=PlainTextResponse)
def export_meeting(meeting_id: int, session: Session = Depends(get_session)) -> str:
    """Export als Markdown (samenvatting, besluiten en actiepunten)."""
    detail = get_meeting(meeting_id, session)
    lines = [f"# {detail.title}", "", f"Datum: {detail.date:%d-%m-%Y %H:%M} · Duur: {detail.duration_minutes} min",
             f"Deelnemers: {', '.join(p.name for p in detail.participants)}", ""]
    labels = {"onderwerp": "Onderwerpen", "probleem": "Problemen", "idee": "Ideeën",
              "afspraak": "Afspraken", "deadline": "Deadlines"}
    for kind, label in labels.items():
        entries = [i for i in detail.summary_items if i.kind.value == kind]
        if entries:
            lines += [f"## {label}", *[f"- {e.text}" for e in entries], ""]
    if detail.decisions:
        lines += ["## Besluiten", *[f"- {d.text}" for d in detail.decisions], ""]
    if detail.action_items:
        lines += ["## Actiepunten"]
        for a in detail.action_items:
            owner = a.owner.name if a.owner else "geen eigenaar"
            deadline = a.deadline.strftime("%d-%m-%Y") if a.deadline else "geen deadline"
            lines.append(f"- [{STATUS_LABELS[a.status]}] {a.title} — {owner}, {deadline}")
    return "\n".join(lines) + "\n"

