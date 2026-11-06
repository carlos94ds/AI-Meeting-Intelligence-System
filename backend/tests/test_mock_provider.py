import asyncio
import time
from datetime import date

from app.ai import get_provider
from app.ai.mock import MockProvider
from app.ai.schemas import ActionItemState, OpenActionItemRef, ProjectState, TranscriptionHints
from app.models import ActionStatus

TODAY = date(2026, 11, 6)
NAMES = ["Mark", "Lisa", "Thomas", "Sanne"]


def run(coro):  # type: ignore[no-untyped-def]
    return asyncio.run(coro)


def test_factory_kiest_mock() -> None:
    assert get_provider().name == "mock"


def test_transcript_heeft_sprekers_tijdstempels_en_namen() -> None:
    t = run(MockProvider(0, TODAY).transcribe(b"", TranscriptionHints(participant_names=NAMES)))
    assert 20 <= len(t.segments) <= 40
    assert {s.speaker_label for s in t.segments} == {"Spreker 1", "Spreker 2", "Spreker 3", "Spreker 4"}
    starts = [s.start_seconds for s in t.segments]
    assert starts == sorted(starts)
    assert any("Lisa" in s.text for s in t.segments)


def test_extract_geeft_bronverwijzingen_en_waarschuwingswaardige_punten() -> None:
    p = MockProvider(0, TODAY)
    t = run(p.transcribe(b"", TranscriptionHints(participant_names=NAMES)))
    a = run(p.extract(t))
    assert a.decisions and a.problems and a.ideas and a.agreements and a.topics
    for entry in [*a.decisions, *a.problems, *a.action_items]:
        assert 0 <= entry.segment_index < len(t.segments)
    owners = [i.owner_name for i in a.action_items]
    assert "Thomas" in owners
    assert None in owners  # punt zonder eigenaar → waarschuwing in de UI
    assert any(i.deadline == date(2026, 11, 13) for i in a.action_items)


def test_match_stelt_nooit_afgerond_voor() -> None:
    p = MockProvider(0, TODAY)
    a = run(p.extract(run(p.transcribe(b"", TranscriptionHints(participant_names=NAMES)))))
    refs = [
        OpenActionItemRef(id=1, title="Budget", owner_name="Mark", status=ActionStatus.OPEN, deadline=TODAY),
        OpenActionItemRef(id=2, title="Ontwerp", owner_name="Lisa", status=ActionStatus.OPEN, deadline=TODAY),
        OpenActionItemRef(id=3, title="Onbekend", owner_name="Pieter", status=ActionStatus.OPEN, deadline=None),
    ]
    by_id = {s.action_item_id: s for s in run(p.match(a, refs))}
    assert by_id[1].suggested_status == ActionStatus.GEMELD_AFGEROND
    assert by_id[2].suggested_status == ActionStatus.UITGESTELD and by_id[2].new_deadline == date(2026, 11, 20)
    assert 3 not in by_id
    assert all(s.suggested_status != ActionStatus.AFGEROND for s in by_id.values())


def test_prepare_next_signaleert_herhaald_uitstel_eerst() -> None:
    state = ProjectState(
        project_name="Demo", goals=["Doel"], postpone_threshold=2, today=TODAY,
        action_items=[
            ActionItemState(id=1, title="Ontwerp", owner_name="Lisa", status=ActionStatus.GEMELD_AFGEROND,
                            deadline=None, postpone_count=0),
            ActionItemState(id=2, title="Technisch onderzoek", owner_name="Thomas",
                            status=ActionStatus.UITGESTELD, deadline=TODAY, postpone_count=2),
        ],
    )
    drafts = run(MockProvider(0, TODAY).prepare_next(state))
    assert drafts[0].action_item_id == 2
    assert "2× uitgesteld" in drafts[0].reason


def test_mock_heeft_kunstmatige_vertraging() -> None:
    start = time.perf_counter()
    run(MockProvider(0.2, TODAY).extract(run(MockProvider(0, TODAY).transcribe(b""))))
    assert time.perf_counter() - start >= 0.2


def test_upload_flow_end_to_end(client) -> None:  # type: ignore[no-untyped-def]
    r = client.post(
        "/api/meetings",
        data={"project_id": "1", "title": "Testoverleg", "date": "2026-11-06T10:00:00",
              "participant_ids": "1,2,3,4", "consent": "true"},
        files={"audio": ("opname.m4a", b"fake-audio", "audio/mp4")},
    )
    assert r.status_code == 202, r.text
    meeting_id = r.json()["id"]
    status = client.get(f"/api/meetings/{meeting_id}/processing-status").json()
    assert status["state"] == "done" and all(s["state"] == "klaar" for s in status["steps"])
    detail = client.get(f"/api/meetings/{meeting_id}").json()
    assert detail["segments"] and detail["action_items"]
    assert all(i["status"] == "voorgesteld" for i in detail["action_items"])


def test_upload_zonder_toestemming_wordt_geweigerd(client) -> None:  # type: ignore[no-untyped-def]
    r = client.post(
        "/api/meetings",
        data={"project_id": "1", "title": "X", "date": "2026-11-06T10:00:00", "consent": "false"},
        files={"audio": ("opname.m4a", b"x", "audio/mp4")},
    )
    assert r.status_code == 422
