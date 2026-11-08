"""Tests van de Anthropic-provider met een nagebootste client: geen netwerk, geen kosten."""

import asyncio
from datetime import date
from types import SimpleNamespace
from typing import Any

import anthropic
import httpx
import pytest

from app.ai.anthropic_provider import AnthropicProvider, format_transcript
from app.ai.errors import AIProviderError
from app.ai.mock import MockProvider
from app.ai.schemas import (
    ActionItemState,
    ExtractedActionItem,
    MeetingAnalysis,
    OpenActionItemRef,
    PrepQuestionDraft,
    ProjectState,
    SourcedText,
    StatusSuggestion,
    Transcript,
    TranscriptSegmentData,
)
from app.ai.validation import sanitize_analysis, sanitize_prep, sanitize_suggestions
from app.models import ActionStatus


class FakeMessages:
    def __init__(self, output: Any, stop_reason: str = "end_turn", error: Exception | None = None) -> None:
        self.output, self.stop_reason, self.error = output, stop_reason, error
        self.calls: list[dict[str, Any]] = []

    async def parse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(
            parsed_output=self.output, stop_reason=self.stop_reason, model=kwargs["model"],
            usage=SimpleNamespace(input_tokens=10, output_tokens=5),
        )


def provider_with(messages: FakeMessages) -> AnthropicProvider:
    client = SimpleNamespace(beta=SimpleNamespace(messages=messages))
    return AnthropicProvider(api_key="test", transcriber=MockProvider(0), client=client)


TRANSCRIPT = Transcript(
    duration_seconds=30, participant_names=["Mark", "Lisa"], meeting_date=date(2026, 11, 5),
    project_goals=["Budget goedgekeurd"],
    segments=[
        TranscriptSegmentData(speaker_label="Spreker 1", start_seconds=0, end_seconds=5, text="Mark, kun jij het budget controleren?"),
        TranscriptSegmentData(speaker_label="Spreker 2", start_seconds=65, end_seconds=70, text="Ja, dat doe ik."),
    ],
)


def test_extract_stuurt_model_schema_fallback_en_context() -> None:
    analysis = MeetingAnalysis(decisions=[SourcedText(text="Akkoord", segment_index=1)])
    fake = FakeMessages(analysis)
    result = asyncio.run(provider_with(fake).extract(TRANSCRIPT))
    assert result == analysis
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["output_format"] is MeetingAnalysis
    assert call["fallbacks"] == "default" and call["betas"] == ["server-side-fallback-2026-07-01"]
    assert call["output_config"] == {"effort": "high"}
    user = call["messages"][0]["content"]
    assert "2026-11-05" in user and "Mark, Lisa" in user and "Budget goedgekeurd" in user
    assert "[1] Spreker 2 (01:05): Ja, dat doe ik." in user


def test_format_transcript_nummert_segmenten() -> None:
    assert format_transcript(TRANSCRIPT).splitlines()[0] == "[0] Spreker 1 (00:00): Mark, kun jij het budget controleren?"


@pytest.mark.parametrize("stop_reason, fragment", [("refusal", "geweigerd"), ("max_tokens", "afgebroken")])
def test_stop_reasons_geven_nederlandse_fout(stop_reason: str, fragment: str) -> None:
    with pytest.raises(AIProviderError, match=fragment):
        asyncio.run(provider_with(FakeMessages(MeetingAnalysis(), stop_reason)).extract(TRANSCRIPT))


def test_ongeldige_sleutel_geeft_nederlandse_fout() -> None:
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    error = anthropic.AuthenticationError("unauthorized", response=httpx.Response(401, request=request), body=None)
    with pytest.raises(AIProviderError, match="ongeldig"):
        asyncio.run(provider_with(FakeMessages(None, error=error)).extract(TRANSCRIPT))


def test_zonder_sleutel_duidelijke_melding() -> None:
    provider = AnthropicProvider(api_key=None, transcriber=MockProvider(0))
    with pytest.raises(AIProviderError, match="ANTHROPIC_API_KEY"):
        asyncio.run(provider.extract(TRANSCRIPT))


def test_match_slaat_aanroep_over_zonder_voortgang() -> None:
    fake = FakeMessages(None)
    assert asyncio.run(provider_with(fake).match(MeetingAnalysis(), [])) == []
    assert fake.calls == []


# --------------------------------------------------------------------------- validatie


def test_sanitize_analysis_verwijdert_ongeldige_verwijzingen_en_namen() -> None:
    analysis = MeetingAnalysis(
        decisions=[SourcedText(text="Goed", segment_index=1), SourcedText(text="Spook", segment_index=99)],
        action_items=[
            ExtractedActionItem(title="Budget controleren", owner_name="mark", goal_hint="budget goedgekeurd", segment_index=0),
            ExtractedActionItem(title="budget controleren", owner_name="Mark", segment_index=0),  # dubbel
            ExtractedActionItem(title="Iets", owner_name="Pieter", segment_index=1),
        ],
    )
    clean = sanitize_analysis(analysis, TRANSCRIPT)
    assert [d.text for d in clean.decisions] == ["Goed"]
    assert [(a.title, a.owner_name, a.goal_hint) for a in clean.action_items] == [
        ("Budget controleren", "Mark", "Budget goedgekeurd"),
        ("Iets", None, None),
    ]


def test_sanitize_suggestions_rondt_nooit_direct_af() -> None:
    refs = [
        OpenActionItemRef(id=1, title="A", owner_name="Mark", status=ActionStatus.OPEN, deadline=None),
        OpenActionItemRef(id=2, title="B", owner_name="Lisa", status=ActionStatus.GEMELD_AFGEROND, deadline=None),
        OpenActionItemRef(id=3, title="C", owner_name="Lisa", status=ActionStatus.OPEN, deadline=None),
    ]
    sugg = [
        StatusSuggestion(action_item_id=1, suggested_status=ActionStatus.AFGEROND, quote="klaar", segment_index=0, rationale="x"),
        StatusSuggestion(action_item_id=2, suggested_status=ActionStatus.AFGEROND, quote="bewijs", segment_index=1, rationale="x"),
        StatusSuggestion(action_item_id=3, suggested_status=ActionStatus.OPEN, quote="-", segment_index=1, rationale="geen wijziging"),
        StatusSuggestion(action_item_id=42, suggested_status=ActionStatus.VERVALLEN, quote="-", segment_index=0, rationale="onbekend id"),
    ]
    clean = {s.action_item_id: s.suggested_status for s in sanitize_suggestions(sugg, refs, n_segments=2)}
    assert clean == {1: ActionStatus.GEMELD_AFGEROND, 2: ActionStatus.AFGEROND}


def test_sanitize_prep_neemt_bron_over_van_actiepunt() -> None:
    state = ProjectState(project_name="P", goals=[], today=date(2026, 11, 8), action_items=[
        ActionItemState(id=7, title="T", owner_name="Mark", status=ActionStatus.UITGESTELD, deadline=None, postpone_count=2, last_source_segment_id=55),
    ])
    drafts = [
        PrepQuestionDraft(text="Later", reason="r", priority=4),
        PrepQuestionDraft(text="Eerst", reason="r", action_item_id=7, source_segment_id=999, priority=1),
        PrepQuestionDraft(text="Verzonnen id", reason="r", action_item_id=123, priority=2),
    ]
    clean = sanitize_prep(drafts, state)
    assert [d.text for d in clean] == ["Eerst", "Verzonnen id", "Later"]
    assert clean[0].source_segment_id == 55 and clean[1].action_item_id is None
