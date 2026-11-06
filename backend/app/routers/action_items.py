from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlmodel import Session, col, select

from ..db import get_session
from ..models import ActionItem, ActionStatus, ChangeOrigin, Participant, StatusChange, SuggestionState
from ..schemas import ActionItemOut, ActionItemPatch, ParticipantOut, StatusChangeOut, SuggestionDecisionIn
from ..services import Lookup, action_item_out, get_app_settings, status_change_out
from ..status import StatusTransitionError, TransitionVia, apply_transition

router = APIRouter(tags=["Actiepunten"])

S = ActionStatus


def _get_item(session: Session, item_id: int) -> ActionItem:
    item = session.get(ActionItem, item_id)
    if item is None:
        raise HTTPException(404, "Actiepunt niet gevonden.")
    return item


def _transition(session: Session, item: ActionItem, target: ActionStatus, via: TransitionVia, **kwargs: object) -> None:
    try:
        change = apply_transition(item, target, via, actor=get_app_settings(session).current_user, **kwargs)  # type: ignore[arg-type]
    except StatusTransitionError as exc:
        raise HTTPException(409, str(exc)) from exc
    session.add(change)
    session.add(item)


@router.get("/participants", response_model=list[ParticipantOut], tags=["Deelnemers"])
def list_participants(session: Session = Depends(get_session)) -> list[ParticipantOut]:
    return [ParticipantOut(id=p.id, name=p.name, role=p.role, color=p.color)  # type: ignore[arg-type]
            for p in session.exec(select(Participant).order_by(col(Participant.name))).all()]


@router.get("/action-items", response_model=list[ActionItemOut])
def list_action_items(
    project_id: int | None = None,
    meeting_id: int | None = None,
    owner_id: int | None = None,
    goal_id: int | None = None,
    status: list[ActionStatus] | None = Query(default=None),
    q: str | None = None,
    session: Session = Depends(get_session),
) -> list[ActionItemOut]:
    stmt = select(ActionItem)
    if project_id is not None:
        stmt = stmt.where(ActionItem.project_id == project_id)
    if meeting_id is not None:
        stmt = stmt.where(ActionItem.meeting_id == meeting_id)
    if owner_id is not None:
        stmt = stmt.where(ActionItem.owner_id == owner_id)
    if goal_id is not None:
        stmt = stmt.where(ActionItem.goal_id == goal_id)
    if status:
        stmt = stmt.where(col(ActionItem.status).in_(status))
    if q:
        stmt = stmt.where(col(ActionItem.title).ilike(f"%{q}%"))
    stmt = stmt.order_by(col(ActionItem.deadline).is_(None), col(ActionItem.deadline), col(ActionItem.id))
    lk = Lookup(session)
    return [action_item_out(i, lk) for i in session.exec(stmt).all()]


@router.get("/action-items/{item_id}", response_model=ActionItemOut)
def get_action_item(item_id: int, session: Session = Depends(get_session)) -> ActionItemOut:
    return action_item_out(_get_item(session, item_id), Lookup(session))


@router.patch("/action-items/{item_id}", response_model=ActionItemOut)
def patch_action_item(item_id: int, body: ActionItemPatch, session: Session = Depends(get_session)) -> ActionItemOut:
    item = _get_item(session, item_id)
    if body.title is not None:
        item.title = body.title
    if body.description is not None:
        item.description = body.description
    if body.owner_id is not None:
        if session.get(Participant, body.owner_id) is None:
            raise HTTPException(422, "Onbekende eigenaar.")
        item.owner_id = body.owner_id
    if body.clear_owner:
        item.owner_id = None
    if body.goal_id is not None:
        item.goal_id = body.goal_id
    if body.clear_deadline:
        item.deadline = None
    deadline_changed = body.deadline is not None and body.deadline != item.deadline
    if body.status is not None and body.status != item.status:
        _transition(session, item, body.status, TransitionVia.EDIT,
                    new_deadline=body.deadline if deadline_changed else None, note=body.note)
    elif deadline_changed:
        if item.status in (S.OPEN, S.UITGESTELD) and item.deadline and body.deadline and body.deadline > item.deadline:
            # Een latere deadline voor een lopende taak = uitstel (wordt meegeteld).
            _transition(session, item, S.UITGESTELD, TransitionVia.EDIT, new_deadline=body.deadline, note=body.note)
        else:
            item.deadline = body.deadline
            if item.original_deadline is None:
                item.original_deadline = body.deadline
    item.updated_at = datetime.now()
    session.add(item)
    session.commit()
    session.refresh(item)
    return action_item_out(item, Lookup(session))


@router.post("/action-items/{item_id}/confirm", response_model=ActionItemOut)
def confirm_action_item(item_id: int, session: Session = Depends(get_session)) -> ActionItemOut:
    """Bevestigen: Voorgesteld → Open, of Gemeld als afgerond → Afgerond."""
    item = _get_item(session, item_id)
    if item.status == S.VOORGESTELD:
        _transition(session, item, S.OPEN, TransitionVia.CONFIRM, meeting_id=item.meeting_id,
                    note="Bevestigd tijdens review")
    elif item.status == S.GEMELD_AFGEROND:
        _transition(session, item, S.AFGEROND, TransitionVia.CONFIRM, note="Afronding bevestigd")
    else:
        raise HTTPException(409, "Alleen voorgestelde of als afgerond gemelde actiepunten kunnen worden bevestigd.")
    # Openstaande AI-voorstellen voor dit punt zijn hiermee beantwoord
    for c in session.exec(select(StatusChange).where(
            StatusChange.action_item_id == item_id, StatusChange.state == SuggestionState.PENDING)).all():
        if c.to_status == item.status:
            c.state, c.decided_at = SuggestionState.ACCEPTED, datetime.now()
            c.actor = get_app_settings(session).current_user
            session.add(c)
    session.commit()
    session.refresh(item)
    return action_item_out(item, Lookup(session))


@router.post("/action-items/{item_id}/reject", response_model=ActionItemOut)
def reject_action_item(item_id: int, session: Session = Depends(get_session)) -> ActionItemOut:
    """Verwerpen van een door AI voorgesteld actiepunt (→ Vervallen)."""
    item = _get_item(session, item_id)
    if item.status != S.VOORGESTELD:
        raise HTTPException(409, "Alleen voorgestelde actiepunten kunnen worden verworpen.")
    _transition(session, item, S.VERVALLEN, TransitionVia.EDIT, meeting_id=item.meeting_id,
                note="Verworpen tijdens review")
    session.commit()
    session.refresh(item)
    return action_item_out(item, Lookup(session))


@router.post("/action-items/{item_id}/evidence", response_model=ActionItemOut)
async def add_evidence(
    item_id: int,
    url: str | None = Form(default=None),
    note: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    session: Session = Depends(get_session),
) -> ActionItemOut:
    """Bewijs toevoegen (link of bestand). Rondt het actiepunt af."""
    item = _get_item(session, item_id)
    if not url and file is None:
        raise HTTPException(422, "Voeg een link of een bestand toe als bewijs.")
    if url and not url.startswith(("http://", "https://")):
        raise HTTPException(422, "De link moet beginnen met http:// of https://.")
    item.evidence_url = url or item.evidence_url
    item.evidence_filename = file.filename if file else item.evidence_filename
    item.evidence_note = note or item.evidence_note
    if item.status != S.AFGEROND:
        _transition(session, item, S.AFGEROND, TransitionVia.EVIDENCE,
                    note=f"Bewijs toegevoegd: {url or (file.filename if file else '')}")
    for c in session.exec(select(StatusChange).where(
            StatusChange.action_item_id == item_id, StatusChange.state == SuggestionState.PENDING)).all():
        c.state, c.decided_at = (
            SuggestionState.ACCEPTED if c.to_status == S.AFGEROND else SuggestionState.REJECTED), datetime.now()
        session.add(c)
    session.add(item)
    session.commit()
    session.refresh(item)
    return action_item_out(item, Lookup(session))


@router.get("/action-items/{item_id}/history", response_model=list[StatusChangeOut])
def history(item_id: int, session: Session = Depends(get_session)) -> list[StatusChangeOut]:
    _get_item(session, item_id)
    lk = Lookup(session)
    changes = session.exec(
        select(StatusChange).where(StatusChange.action_item_id == item_id)
        .order_by(col(StatusChange.created_at), col(StatusChange.id))
    ).all()
    return [status_change_out(c, lk) for c in changes]


@router.post("/suggestions/{suggestion_id}/decision", response_model=StatusChangeOut, tags=["Vergelijking"])
def decide_suggestion(
    suggestion_id: int, body: SuggestionDecisionIn, session: Session = Depends(get_session)
) -> StatusChangeOut:
    """Akkoord / Anders / Afwijzen op een AI-statusvoorstel uit de vergelijkingsweergave."""
    suggestion = session.get(StatusChange, suggestion_id)
    if suggestion is None or suggestion.origin != ChangeOrigin.AI:
        raise HTTPException(404, "Voorstel niet gevonden.")
    if suggestion.state != SuggestionState.PENDING:
        raise HTTPException(409, "Over dit voorstel is al besloten.")
    item = _get_item(session, suggestion.action_item_id)
    actor = get_app_settings(session).current_user
    now = datetime.now()

    if body.decision == "reject":
        suggestion.state, suggestion.decided_at, suggestion.actor = SuggestionState.REJECTED, now, actor
        suggestion.note = body.note or "Voorstel afgewezen"
    else:
        target = suggestion.to_status if body.decision == "accept" else body.target_status
        if target is None:
            raise HTTPException(422, "Kies een nieuwe status.")
        deadline = body.new_deadline or (suggestion.new_deadline if body.decision == "accept" else None)
        # "Akkoord" van een gebruiker is een expliciete bevestiging.
        via = TransitionVia.CONFIRM
        if target == item.status and target != S.UITGESTELD:
            pass  # status blijft gelijk; voorstel wordt alleen afgehandeld
        else:
            try:
                applied = apply_transition(item, target, via, actor=actor, meeting_id=suggestion.meeting_id,
                                           source_segment_id=suggestion.source_segment_id, quote=suggestion.quote,
                                           new_deadline=deadline, note=body.note, at=now)
            except StatusTransitionError as exc:
                raise HTTPException(409, str(exc)) from exc
            if body.decision == "override":
                applied.note = body.note or "Andere status gekozen dan voorgesteld"
                session.add(applied)
        if body.decision == "accept":
            suggestion.state, suggestion.decided_at, suggestion.actor = SuggestionState.ACCEPTED, now, actor
        else:
            suggestion.state, suggestion.decided_at, suggestion.actor = SuggestionState.REJECTED, now, actor
            suggestion.note = "Vervangen door een andere keuze"
        session.add(item)
    session.add(suggestion)
    session.commit()
    session.refresh(suggestion)
    return status_change_out(suggestion, Lookup(session))
