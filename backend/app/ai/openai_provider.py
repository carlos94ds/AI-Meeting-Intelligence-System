"""OpenAI-provider (nog niet aangesloten). Zie docs/LLM_INTEGRATIE.md."""

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


class OpenAIProvider(AIProvider):
    name = "openai"

    def __init__(self, api_key: str | None) -> None:
        self.api_key = api_key

    async def transcribe(self, audio: bytes, hints: TranscriptionHints | None = None) -> Transcript:
        # TODO: delegeer naar WhisperProvider of de OpenAI audio-API (model 'whisper-1').
        raise NotImplementedError("OpenAIProvider.transcribe is nog niet geïmplementeerd")

    async def extract(self, transcript: Transcript) -> MeetingAnalysis:
        # TODO: chat-completion met response_format = JSON-schema van MeetingAnalysis,
        #       daarna MeetingAnalysis.model_validate_json(...).
        raise NotImplementedError("OpenAIProvider.extract is nog niet geïmplementeerd")

    async def match(
        self, new_analysis: MeetingAnalysis, open_action_items: list[OpenActionItemRef]
    ) -> list[StatusSuggestion]:
        # TODO: geef open actiepunten + progress_updates mee; verwacht list[StatusSuggestion].
        raise NotImplementedError("OpenAIProvider.match is nog niet geïmplementeerd")

    async def prepare_next(self, project_state: ProjectState) -> list[PrepQuestionDraft]:
        # TODO: geef ProjectState mee; verwacht list[PrepQuestionDraft].
        raise NotImplementedError("OpenAIProvider.prepare_next is nog niet geïmplementeerd")
