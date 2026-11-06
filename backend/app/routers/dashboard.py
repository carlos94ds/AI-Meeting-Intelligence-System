from datetime import date

from fastapi import APIRouter, Depends
from sqlmodel import Session, col, select

from ..db import get_session
from ..models import ACTIVE_STATUSES, ActionStatus, Meeting, Project
from ..schemas import DashboardOut, NextMeetingOut, QuickLinks
from ..services import (
    Lookup,
    action_item_out,
    compute_kpis,
    is_overdue,
    meeting_summary_out,
    preparation_out,
    project_items,
)

router = APIRouter(tags=["Dashboard"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(project_id: int | None = None, session: Session = Depends(get_session)) -> DashboardOut:
    lk = Lookup(session)
    threshold = lk.settings.postpone_threshold
    items = project_items(session, project_id)

    attention = sorted(
        (i for i in items if i.status in ACTIVE_STATUSES and (i.postpone_count >= threshold or is_overdue(i))),
        key=lambda i: (-i.postpone_count, i.deadline or date.max),
    )

    stmt = select(Meeting).order_by(col(Meeting.date).desc())
    if project_id is not None:
        stmt = stmt.where(Meeting.project_id == project_id)
    meetings = [meeting_summary_out(m, lk) for m in session.exec(stmt).all()]

    projects = [lk.projects[project_id]] if project_id in lk.projects else list(lk.projects.values())
    upcoming = sorted(
        (p for p in projects if p.next_meeting_date and p.next_meeting_date >= date.today()),
        key=lambda p: p.next_meeting_date or date.max,
    )
    # Voorkeur: project dat de meeste aandacht vraagt (herhaald uitstel weegt zwaarder), dan de vroegste datum
    next_project: Project | None = None
    if upcoming:
        weight: dict[int, int] = {}
        for i in attention:
            weight[i.project_id] = weight.get(i.project_id, 0) + (2 if i.postpone_count >= threshold else 1)
        next_project = min(upcoming, key=lambda p: (-weight.get(p.id or -1, 0), p.next_meeting_date or date.max))
    next_meeting: NextMeetingOut | None = None
    if next_project is not None and next_project.id is not None:
        prep = preparation_out(session, next_project, lk)
        included = [q for q in prep.questions if q.included]
        next_meeting = NextMeetingOut(project_id=next_project.id, project_name=next_project.name,
                                      date=next_project.next_meeting_date, top_questions=included[:3],
                                      question_count=len(included))

    review = next((m for m in meetings if m.pending_review_count > 0), None)
    compare = next((m for m in meetings if m.pending_suggestion_count > 0), None)
    if compare is None:
        compare = next((m for m in meetings if m.processing_state.value == "done"), None)
    return DashboardOut(
        kpis=compute_kpis(items, threshold),
        attention=[action_item_out(i, lk) for i in attention],
        next_meeting=next_meeting,
        recent_meetings=meetings[:5],
        quick_links=QuickLinks(
            review_meeting_id=review.id if review else None,
            review_count=sum(1 for i in items if i.status == ActionStatus.VOORGESTELD),
            comparison_meeting_id=compare.id if compare else None,
            suggestion_count=sum(m.pending_suggestion_count for m in meetings),
            preparation_project_id=next_meeting.project_id if next_meeting else None,
        ),
    )
