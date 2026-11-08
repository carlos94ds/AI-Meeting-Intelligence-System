from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from ..ai.errors import AIProviderError
from ..db import get_session
from ..models import ACTIVE_STATUSES, AgendaItem, Goal, PrepQuestion, Project, ProjectParticipant
from ..processing import regenerate_preparation
from ..schemas import (
    MeetingSummaryOut,
    PreparationIn,
    PreparationOut,
    ProjectDetailOut,
    ProjectIn,
    ProjectSummaryOut,
)
from ..services import (
    Lookup,
    action_item_out,
    compute_kpis,
    goals_out,
    meeting_summary_out,
    preparation_out,
    progress_per_meeting,
    project_items,
    project_meetings,
    project_summary_out,
)

router = APIRouter(prefix="/projects", tags=["Projecten"])


def _get_project(session: Session, project_id: int) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project niet gevonden.")
    return project


@router.get("", response_model=list[ProjectSummaryOut])
def list_projects(session: Session = Depends(get_session)) -> list[ProjectSummaryOut]:
    lk = Lookup(session)
    projects = session.exec(select(Project).order_by(col(Project.created_at))).all()
    return [project_summary_out(p, lk) for p in projects]


@router.post("", response_model=ProjectSummaryOut, status_code=201)
def create_project(body: ProjectIn, session: Session = Depends(get_session)) -> ProjectSummaryOut:
    project = Project(name=body.name, description=body.description)
    session.add(project)
    session.flush()
    for pos, title in enumerate(body.goals):
        session.add(Goal(project_id=project.id, title=title, position=pos))  # type: ignore[arg-type]
    for pid in body.participant_ids:
        session.add(ProjectParticipant(project_id=project.id, participant_id=pid))  # type: ignore[arg-type]
    session.commit()
    session.refresh(project)
    return project_summary_out(project, Lookup(session))


@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: int, session: Session = Depends(get_session)) -> ProjectDetailOut:
    project = _get_project(session, project_id)
    lk = Lookup(session)
    items = project_items(session, project_id)
    threshold = lk.settings.postpone_threshold
    summary = project_summary_out(project, lk)
    postponed = sorted(
        (i for i in items if i.postpone_count >= threshold and i.status in ACTIVE_STATUSES),
        key=lambda i: -i.postpone_count,
    )
    return ProjectDetailOut(
        **summary.model_dump(),
        goals=goals_out(session, project_id, items),
        kpis=compute_kpis(items, threshold),
        meetings=[meeting_summary_out(m, lk) for m in reversed(project_meetings(session, project_id))],
        progress_per_meeting=progress_per_meeting(session, project_id),
        repeatedly_postponed=[action_item_out(i, lk) for i in postponed],
    )


@router.get("/{project_id}/meetings", response_model=list[MeetingSummaryOut])
def list_project_meetings(project_id: int, session: Session = Depends(get_session)) -> list[MeetingSummaryOut]:
    _get_project(session, project_id)
    lk = Lookup(session)
    return [meeting_summary_out(m, lk) for m in reversed(project_meetings(session, project_id))]


@router.get("/{project_id}/preparation", response_model=PreparationOut)
def get_preparation(project_id: int, session: Session = Depends(get_session)) -> PreparationOut:
    return preparation_out(session, _get_project(session, project_id), Lookup(session))


@router.put("/{project_id}/preparation", response_model=PreparationOut)
def put_preparation(project_id: int, body: PreparationIn, session: Session = Depends(get_session)) -> PreparationOut:
    project = _get_project(session, project_id)
    project.next_meeting_date = body.next_meeting_date
    for q in session.exec(select(PrepQuestion).where(PrepQuestion.project_id == project_id)).all():
        session.delete(q)
    for a in session.exec(select(AgendaItem).where(AgendaItem.project_id == project_id)).all():
        session.delete(a)
    for pos, q_in in enumerate(body.questions):
        session.add(PrepQuestion(project_id=project_id, position=pos, **q_in.model_dump()))
    for pos, a_in in enumerate(body.agenda):
        session.add(AgendaItem(project_id=project_id, position=pos, **a_in.model_dump()))
    session.add(project)
    session.commit()
    return preparation_out(session, project, Lookup(session))


@router.post("/{project_id}/preparation/regenerate", response_model=PreparationOut)
async def regenerate(project_id: int, session: Session = Depends(get_session)) -> PreparationOut:
    project = _get_project(session, project_id)
    try:
        await regenerate_preparation(session, project_id)
    except AIProviderError as exc:
        raise HTTPException(502, str(exc)) from exc
    return preparation_out(session, project, Lookup(session))
