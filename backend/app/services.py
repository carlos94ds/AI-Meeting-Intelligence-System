"""Servicelaag: opbouwen van API-objecten, KPI's en voortgang."""

from datetime import date, datetime, timedelta

from sqlmodel import Session, col, select

from .ai.schemas import ActionItemState, ProjectState
from .models import (
    ACTIVE_STATUSES,
    ActionItem,
    ActionStatus,
    AgendaItem,
    AppSettings,
    ChangeOrigin,
    Goal,
    Meeting,
    MeetingParticipant,
    Participant,
    PrepQuestion,
    Project,
    ProjectParticipant,
    StatusChange,
    SuggestionState,
    TranscriptSegment,
)
from .schemas import (
    ActionItemOut,
    AgendaItemOut,
    GoalOut,
    Kpis,
    MeetingProgressPoint,
    MeetingSummaryOut,
    ParticipantOut,
    PreparationOut,
    PrepQuestionOut,
    ProjectSummaryOut,
    StatusChangeOut,
)

S = ActionStatus
OPEN_LIKE = {S.OPEN, S.UITGESTELD}


def get_app_settings(session: Session) -> AppSettings:
    settings = session.get(AppSettings, 1)
    if settings is None:
        settings = AppSettings(id=1)
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


class Lookup:
    """Laadt kleine referentietabellen één keer per request (prototype-schaal)."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.participants = {p.id: p for p in session.exec(select(Participant)).all()}
        self.goals = {g.id: g for g in session.exec(select(Goal)).all()}
        self.projects = {p.id: p for p in session.exec(select(Project)).all()}
        self.meetings = {m.id: m for m in session.exec(select(Meeting)).all()}
        self._segment_meeting: dict[int, int] | None = None
        self.settings = get_app_settings(session)

    def segment_meeting(self, segment_id: int | None) -> int | None:
        if segment_id is None:
            return None
        if self._segment_meeting is None:
            rows = self.session.exec(select(TranscriptSegment.id, TranscriptSegment.meeting_id)).all()
            self._segment_meeting = {sid: mid for sid, mid in rows if sid is not None}
        return self._segment_meeting.get(segment_id)

    def participant_out(self, pid: int | None) -> ParticipantOut | None:
        p = self.participants.get(pid) if pid is not None else None
        if p is None or p.id is None:
            return None
        return ParticipantOut(id=p.id, name=p.name, role=p.role, color=p.color)


def is_overdue(item: ActionItem, today: date | None = None) -> bool:
    today = today or date.today()
    return (
        item.deadline is not None
        and item.deadline < today
        and item.status in {S.OPEN, S.UITGESTELD, S.VOORGESTELD}
    )


def item_warnings(item: ActionItem, threshold: int) -> list[str]:
    warnings: list[str] = []
    if item.status not in {S.AFGEROND, S.VERVALLEN}:
        if item.owner_id is None:
            warnings.append("Geen eigenaar")
        if item.deadline is None:
            warnings.append("Geen deadline")
        if is_overdue(item):
            warnings.append("Deadline verstreken")
        if item.postpone_count >= threshold:
            warnings.append(f"{item.postpone_count}× uitgesteld")
    return warnings


def action_item_out(item: ActionItem, lk: Lookup) -> ActionItemOut:
    assert item.id is not None
    meeting = lk.meetings.get(item.meeting_id) if item.meeting_id else None
    goal = lk.goals.get(item.goal_id) if item.goal_id else None
    project = lk.projects[item.project_id]
    return ActionItemOut(
        id=item.id,
        project_id=item.project_id,
        project_name=project.name,
        meeting_id=item.meeting_id,
        meeting_title=meeting.title if meeting else None,
        goal_id=item.goal_id,
        goal_title=goal.title if goal else None,
        title=item.title,
        description=item.description,
        owner=lk.participant_out(item.owner_id),
        deadline=item.deadline,
        original_deadline=item.original_deadline,
        status=item.status,
        postpone_count=item.postpone_count,
        is_overdue=is_overdue(item),
        source_segment_id=item.source_segment_id,
        source_meeting_id=lk.segment_meeting(item.source_segment_id),
        ai_confidence=item.ai_confidence,
        evidence_url=item.evidence_url,
        evidence_filename=item.evidence_filename,
        evidence_note=item.evidence_note,
        confirmed_by=item.confirmed_by,
        completed_at=item.completed_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
        warnings=item_warnings(item, lk.settings.postpone_threshold),
    )


def status_change_out(change: StatusChange, lk: Lookup) -> StatusChangeOut:
    assert change.id is not None
    meeting = lk.meetings.get(change.meeting_id) if change.meeting_id else None
    return StatusChangeOut(
        id=change.id,
        action_item_id=change.action_item_id,
        meeting_id=change.meeting_id,
        meeting_title=meeting.title if meeting else None,
        meeting_date=meeting.date if meeting else None,
        from_status=change.from_status,
        to_status=change.to_status,
        origin=change.origin,
        state=change.state,
        source_segment_id=change.source_segment_id,
        source_meeting_id=lk.segment_meeting(change.source_segment_id),
        quote=change.quote,
        rationale=change.rationale,
        new_deadline=change.new_deadline,
        actor=change.actor,
        note=change.note,
        created_at=change.created_at,
        decided_at=change.decided_at,
    )


def meeting_summary_out(meeting: Meeting, lk: Lookup) -> MeetingSummaryOut:
    assert meeting.id is not None
    session = lk.session
    participant_count = len(
        session.exec(select(MeetingParticipant).where(MeetingParticipant.meeting_id == meeting.id)).all()
    )
    items = session.exec(select(ActionItem).where(ActionItem.meeting_id == meeting.id)).all()
    pending_suggestions = session.exec(
        select(StatusChange).where(
            StatusChange.meeting_id == meeting.id, StatusChange.state == SuggestionState.PENDING
        )
    ).all()
    return MeetingSummaryOut(
        id=meeting.id,
        project_id=meeting.project_id,
        project_name=lk.projects[meeting.project_id].name,
        title=meeting.title,
        date=meeting.date,
        duration_minutes=meeting.duration_minutes,
        participant_count=participant_count,
        processing_state=meeting.processing_state,
        action_item_count=len(items),
        pending_review_count=sum(1 for i in items if i.status == S.VOORGESTELD),
        pending_suggestion_count=len(pending_suggestions),
    )


def project_items(session: Session, project_id: int | None = None) -> list[ActionItem]:
    stmt = select(ActionItem)
    if project_id is not None:
        stmt = stmt.where(ActionItem.project_id == project_id)
    return list(session.exec(stmt).all())


def compute_kpis(items: list[ActionItem], threshold: int, today: date | None = None) -> Kpis:
    today = today or date.today()
    week_start = datetime.combine(today - timedelta(days=today.weekday()), datetime.min.time())
    return Kpis(
        open=sum(1 for i in items if i.status in OPEN_LIKE),
        awaiting_confirmation=sum(1 for i in items if i.status == S.GEMELD_AFGEROND),
        to_review=sum(1 for i in items if i.status == S.VOORGESTELD),
        overdue=sum(1 for i in items if is_overdue(i, today)),
        repeatedly_postponed=sum(
            1 for i in items if i.postpone_count >= threshold and i.status in ACTIVE_STATUSES
        ),
        completed_this_week=sum(
            1 for i in items if i.status == S.AFGEROND and i.completed_at and i.completed_at >= week_start
        ),
    )


def project_progress(items: list[ActionItem]) -> tuple[int, int, float]:
    """(totaal, afgerond, fractie). Voorgestelde en vervallen punten tellen niet mee."""
    relevant = [i for i in items if i.status not in {S.VOORGESTELD, S.VERVALLEN}]
    done = sum(1 for i in relevant if i.status == S.AFGEROND)
    return len(relevant), done, (done / len(relevant) if relevant else 0.0)


def project_meetings(session: Session, project_id: int) -> list[Meeting]:
    return list(
        session.exec(
            select(Meeting).where(Meeting.project_id == project_id).order_by(col(Meeting.date))
        ).all()
    )


def project_participants(session: Session, project_id: int, lk: Lookup) -> list[ParticipantOut]:
    links = session.exec(select(ProjectParticipant).where(ProjectParticipant.project_id == project_id)).all()
    out = [lk.participant_out(link.participant_id) for link in links]
    return [p for p in out if p is not None]


def project_summary_out(project: Project, lk: Lookup) -> ProjectSummaryOut:
    assert project.id is not None
    items = project_items(lk.session, project.id)
    total, done, progress = project_progress(items)
    meetings = project_meetings(lk.session, project.id)
    return ProjectSummaryOut(
        id=project.id,
        name=project.name,
        description=project.description,
        progress=progress,
        total=total,
        done_count=done,
        open_count=sum(1 for i in items if i.status in ACTIVE_STATUSES),
        meeting_count=len(meetings),
        last_meeting_date=meetings[-1].date if meetings else None,
        next_meeting_date=project.next_meeting_date,
        participants=project_participants(lk.session, project.id, lk),
    )


def goals_out(session: Session, project_id: int, items: list[ActionItem]) -> list[GoalOut]:
    goals = session.exec(select(Goal).where(Goal.project_id == project_id).order_by(col(Goal.position))).all()
    out: list[GoalOut] = []
    for g in goals:
        assert g.id is not None
        total, done, progress = project_progress([i for i in items if i.goal_id == g.id])
        out.append(
            GoalOut(id=g.id, title=g.title, description=g.description, position=g.position,
                    total=total, done=done, progress=progress)
        )
    return out


def status_at(changes: list[StatusChange], moment: datetime) -> ActionStatus | None:
    """Status van een actiepunt op een bepaald moment, op basis van doorgevoerde wijzigingen."""
    status: ActionStatus | None = None
    for c in changes:
        if c.state == SuggestionState.ACCEPTED and (c.decided_at or c.created_at) <= moment:
            status = c.to_status
    return status


def progress_per_meeting(session: Session, project_id: int) -> list[MeetingProgressPoint]:
    meetings = [m for m in project_meetings(session, project_id) if m.id is not None]
    items = project_items(session, project_id)
    changes_by_item: dict[int, list[StatusChange]] = {}
    for c in session.exec(
        select(StatusChange)
        .where(col(StatusChange.action_item_id).in_([i.id for i in items]))
        .order_by(col(StatusChange.decided_at), col(StatusChange.created_at))
    ).all():
        changes_by_item.setdefault(c.action_item_id, []).append(c)

    points: list[MeetingProgressPoint] = []
    for m in meetings:
        moment = datetime.combine(m.date.date(), datetime.max.time())  # eind van de vergaderdag
        open_count = done_count = 0
        for i in items:
            st = status_at(changes_by_item.get(i.id or -1, []), moment)
            if st in ACTIVE_STATUSES:
                open_count += 1
            elif st == S.AFGEROND:
                done_count += 1
        assert m.id is not None
        points.append(MeetingProgressPoint(meeting_id=m.id, title=m.title, date=m.date,
                                           open=open_count, done=done_count))
    return points


# --------------------------------------------------------------------------- voorbereiding


def build_project_state(session: Session, project: Project, lk: Lookup) -> ProjectState:
    assert project.id is not None
    items = project_items(session, project.id)
    states: list[ActionItemState] = []
    for i in items:
        if i.status in {S.AFGEROND, S.VERVALLEN} or i.id is None:
            continue
        last_change = session.exec(
            select(StatusChange)
            .where(StatusChange.action_item_id == i.id, col(StatusChange.source_segment_id).is_not(None))
            .order_by(col(StatusChange.created_at).desc())
        ).first()
        owner = lk.participants.get(i.owner_id) if i.owner_id else None
        goal = lk.goals.get(i.goal_id) if i.goal_id else None
        states.append(
            ActionItemState(
                id=i.id,
                title=i.title,
                owner_name=owner.name if owner else None,
                status=i.status,
                deadline=i.deadline,
                postpone_count=i.postpone_count,
                goal_title=goal.title if goal else None,
                last_source_segment_id=(last_change.source_segment_id if last_change else i.source_segment_id),
            )
        )
    goals = session.exec(select(Goal).where(Goal.project_id == project.id).order_by(col(Goal.position))).all()
    return ProjectState(
        project_name=project.name,
        goals=[g.title for g in goals],
        action_items=states,
        postpone_threshold=lk.settings.postpone_threshold,
        today=date.today(),
    )


def preparation_out(session: Session, project: Project, lk: Lookup) -> PreparationOut:
    assert project.id is not None
    questions = session.exec(
        select(PrepQuestion).where(PrepQuestion.project_id == project.id).order_by(col(PrepQuestion.position))
    ).all()
    agenda = session.exec(
        select(AgendaItem).where(AgendaItem.project_id == project.id).order_by(col(AgendaItem.position))
    ).all()
    q_out: list[PrepQuestionOut] = []
    for q in questions:
        assert q.id is not None
        item = session.get(ActionItem, q.action_item_id) if q.action_item_id else None
        q_out.append(
            PrepQuestionOut(
                id=q.id,
                text=q.text,
                reason=q.reason,
                action_item_id=q.action_item_id,
                action_item_title=item.title if item else None,
                action_item_status=item.status if item else None,
                source_segment_id=q.source_segment_id,
                source_meeting_id=lk.segment_meeting(q.source_segment_id),
                included=q.included,
                is_custom=q.is_custom,
                position=q.position,
            )
        )
    return PreparationOut(
        project_id=project.id,
        project_name=project.name,
        next_meeting_date=project.next_meeting_date,
        questions=q_out,
        agenda=[
            AgendaItemOut(id=a.id, title=a.title, duration_minutes=a.duration_minutes, position=a.position)
            for a in agenda
            if a.id is not None
        ],
    )


def pending_ai_suggestions(session: Session, meeting_id: int) -> list[StatusChange]:
    return list(
        session.exec(
            select(StatusChange).where(
                StatusChange.meeting_id == meeting_id,
                StatusChange.origin == ChangeOrigin.AI,
                StatusChange.state == SuggestionState.PENDING,
            )
        ).all()
    )
