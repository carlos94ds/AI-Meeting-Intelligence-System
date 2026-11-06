import pytest

from app.models import ActionItem, ActionStatus
from app.status import StatusTransitionError, TransitionVia, apply_transition, check_transition

S = ActionStatus


def make_item(status: ActionStatus) -> ActionItem:
    return ActionItem(id=1, project_id=1, title="Test", status=status)


@pytest.mark.parametrize("via", [TransitionVia.EDIT, TransitionVia.AI])
def test_gemeld_naar_afgerond_zonder_expliciete_actie_is_verboden(via: TransitionVia) -> None:
    item = make_item(S.GEMELD_AFGEROND)
    with pytest.raises(StatusTransitionError):
        apply_transition(item, S.AFGEROND, via, actor="Sanne")
    assert item.status == S.GEMELD_AFGEROND
    assert item.completed_at is None


@pytest.mark.parametrize("via", [TransitionVia.CONFIRM, TransitionVia.EVIDENCE])
def test_gemeld_naar_afgerond_via_bevestigen_of_bewijs(via: TransitionVia) -> None:
    item = make_item(S.GEMELD_AFGEROND)
    change = apply_transition(item, S.AFGEROND, via, actor="Sanne")
    assert item.status == S.AFGEROND
    assert item.confirmed_by == "Sanne"
    assert item.completed_at is not None
    assert change.from_status == S.GEMELD_AFGEROND and change.to_status == S.AFGEROND


def test_ai_mag_nooit_afronden() -> None:
    for start in (S.OPEN, S.UITGESTELD, S.GEMELD_AFGEROND):
        with pytest.raises(StatusTransitionError):
            check_transition(start, S.AFGEROND, TransitionVia.AI)


def test_uitstellen_verhoogt_teller_en_verschuift_deadline() -> None:
    from datetime import date

    item = make_item(S.OPEN)
    apply_transition(item, S.UITGESTELD, TransitionVia.EDIT, actor="Sanne", new_deadline=date(2026, 11, 17))
    apply_transition(item, S.UITGESTELD, TransitionVia.EDIT, actor="Sanne", new_deadline=date(2026, 11, 24))
    assert item.postpone_count == 2
    assert item.deadline == date(2026, 11, 24)


def test_voorgesteld_kan_niet_direct_afgerond() -> None:
    with pytest.raises(StatusTransitionError):
        check_transition(S.VOORGESTELD, S.AFGEROND, TransitionVia.CONFIRM)


def test_heropenen_wist_afronding() -> None:
    item = make_item(S.GEMELD_AFGEROND)
    apply_transition(item, S.AFGEROND, TransitionVia.CONFIRM, actor="Sanne")
    apply_transition(item, S.OPEN, TransitionVia.EDIT, actor="Sanne")
    assert item.completed_at is None and item.confirmed_by is None


def test_api_patch_gemeld_naar_afgerond_geeft_409(client) -> None:  # type: ignore[no-untyped-def]
    items = client.get("/api/action-items", params={"status": "gemeld_afgerond"}).json()
    assert items, "seed bevat een actiepunt dat gemeld is als afgerond"
    item_id = items[0]["id"]
    r = client.patch(f"/api/action-items/{item_id}", json={"status": "afgerond"})
    assert r.status_code == 409
    assert "Bevestigen" in r.json()["detail"]

    r = client.post(f"/api/action-items/{item_id}/confirm")
    assert r.status_code == 200
    assert r.json()["status"] == "afgerond"


def test_api_bewijs_rondt_af(client) -> None:  # type: ignore[no-untyped-def]
    item_id = client.get("/api/action-items", params={"status": "gemeld_afgerond"}).json()[0]["id"]
    r = client.post(f"/api/action-items/{item_id}/evidence", data={"url": "https://voorbeeld.nl/ontwerp"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "afgerond" and body["evidence_url"] == "https://voorbeeld.nl/ontwerp"
    history = client.get(f"/api/action-items/{item_id}/history").json()
    assert history[-1]["to_status"] == "afgerond"
