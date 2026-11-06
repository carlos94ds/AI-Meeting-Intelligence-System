"""Anthropic-provider (Claude) (nog niet aangesloten). Zie docs/LLM_INTEGRATIE.md."""

from .base import AIProvider
from .schemas import (
    MeetingAnalysis,
    OpenActionItemRef,
    PrepQuestionDraft,
    ProjectState,
    StatusSuggestion,
    Transcript,
    TranscriptionHints,
)


class AnthropicProvider(AIProvider):
    name = "anthropic"

    def __init__(self, api_key: str | None) -> None:
        self.api_key = api_key

    async def transcribe(self, audio: bytes, hints: TranscriptionHints | None = None) -> Transcript:
        # TODO: Claude transcribeert geen audio; delegeer naar WhisperProvider.
        raise NotImplementedError("AnthropicProvider.transcribe is nog niet geïmplementeerd")

    async def extract(self, transcript: Transcript) -> MeetingAnalysis:
        # TODO: Messages API met een tool/structured output volgens het MeetingAnalysis-schema,
        #       daarna MeetingAnalysis.model_validate_json(...).
        raise NotImplementedError("AnthropicProvider.extract is nog niet geïmplementeerd")

    async def match(
        self, new_analysis: MeetingAnalysis, open_action_items: list[OpenActionItemRef]
    ) -> list[StatusSuggestion]:
        # TODO: geef open actiepunten + progress_updates mee; verwacht list[StatusSuggestion].
        raise NotImplementedError("AnthropicProvider.match is nog niet geïmplementeerd")

    async def prepare_next(self, project_state: ProjectState) -> list[PrepQuestionDraft]:
        # TODO: geef ProjectState mee; verwacht list[PrepQuestionDraft].
        raise NotImplementedError("AnthropicProvider.prepare_next is nog niet geïmplementeerd")
