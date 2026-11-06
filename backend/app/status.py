"""Statusmodel van actiepunten.

Kernregel: een actiepunt kan NOOIT direct van "Gemeld als afgerond" naar "Afgerond"
zonder een expliciete gebruikersactie ("Bevestigen" of "Bewijs toevoegen").
De AI mag nooit zelfstandig iets op "Afgerond" zetten.
"""

from datetime import date, datetime
from enum import Enum

from .models import ActionItem, ActionStatus, ChangeOrigin, StatusChange, SuggestionState

S = ActionStatus

ALLOWED_TRANSITIONS: dict[ActionStatus, frozenset[ActionStatus]] = {
    S.VOORGESTELD: frozenset({S.OPEN, S.VERVALLEN}),
    S.OPEN: frozenset({S.UITGESTELD, S.GEMELD_AFGEROND, S.AFGEROND, S.VERVALLEN}),
    S.UITGESTELD: frozenset({S.UITGESTELD, S.OPEN, S.GEMELD_AFGEROND, S.AFGEROND, S.VERVALLEN}),
    S.GEMELD_AFGEROND: frozenset({S.OPEN, S.UITGESTELD, S.AFGEROND, S.VERVALLEN}),
    S.AFGEROND: frozenset({S.OPEN}),
    S.VERVALLEN: frozenset({S.OPEN}),
}

STATUS_LABELS: dict[ActionStatus, str] = {
    S.VOORGESTELD: "Voorgesteld",
    S.OPEN: "Open",
    S.UITGESTELD: "Uitgesteld",
    S.GEMELD_AFGEROND: "Gemeld als afgerond",
    S.AFGEROND: "Afgerond",
    S.VERVALLEN: "Vervallen",
}


class TransitionVia(str, Enum):
    EDIT = "edit"  # handmatige wijziging (PATCH)
    AI = "ai"  # automatisch door AI
    CONFIRM = "confirm"  # expliciete knop "Bevestigen" / "Akkoord" op voorstel
    EVIDENCE = "evidence"  # expliciete knop "Bewijs toevoegen"


EXPLICIT_COMPLETION = frozenset({TransitionVia.CONFIRM, TransitionVia.EVIDENCE})


class StatusTransitionError(ValueError):
    """Ongeldige statusovergang. De melding is in het Nederlands, geschikt voor de UI."""


def check_transition(current: ActionStatus, target: ActionStatus, via: TransitionVia) -> None:
    if target == current and target != S.UITGESTELD:
        raise StatusTransitionError(f"Het actiepunt heeft al de status '{STATUS_LABELS[current]}'.")
    if target not in ALLOWED_TRANSITIONS[current]:
        raise StatusTransitionError(
            f"Van '{STATUS_LABELS[current]}' naar '{STATUS_LABELS[target]}' is geen geldige statuswijziging."
        )
    if target == S.AFGEROND and via == TransitionVia.AI:
        raise StatusTransitionError("De AI mag een actiepunt nooit zelf op 'Afgerond' zetten.")
    if current == S.GEMELD_AFGEROND and target == S.AFGEROND and via not in EXPLICIT_COMPLETION:
        raise StatusTransitionError(
            "Een actiepunt dat gemeld is als afgerond kan alleen worden afgerond via "
            "'Bevestigen' of 'Bewijs toevoegen'."
        )


def apply_transition(
    item: ActionItem,
    target: ActionStatus,
    via: TransitionVia,
    *,
    actor: str | None,
    meeting_id: int | None = None,
    source_segment_id: int | None = None,
    quote: str | None = None,
    new_deadline: date | None = None,
    note: str | None = None,
    at: datetime | None = None,
) -> StatusChange:
    """Voert een statusovergang door op `item` en geeft de bijbehorende Statuswijziging terug.

    De aanroeper is verantwoordelijk voor het opslaan van beide objecten.
    """
    check_transition(item.status, target, via)
    now = at or datetime.now()
    previous = item.status

    if target == S.UITGESTELD:
        item.postpone_count += 1
    if new_deadline is not None:
        item.deadline = new_deadline
    if target == S.AFGEROND:
        item.completed_at = now
        item.confirmed_by = actor
    elif previous == S.AFGEROND:
        item.completed_at = None
        item.confirmed_by = None

    item.status = target
    item.updated_at = now

    return StatusChange(
        action_item_id=item.id,  # type: ignore[arg-type]
        meeting_id=meeting_id,
        from_status=previous,
        to_status=target,
        origin=ChangeOrigin.AI if via == TransitionVia.AI else ChangeOrigin.GEBRUIKER,
        state=SuggestionState.ACCEPTED,
        source_segment_id=source_segment_id,
        quote=quote,
        new_deadline=new_deadline,
        actor=actor,
        note=note,
        created_at=now,
        decided_at=now,
    )
