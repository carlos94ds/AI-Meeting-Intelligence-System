"""Anthropic-provider: Claude voor extractie, vergelijking en voorbereiding.

Transcriptie wordt gedelegeerd aan een aparte `Transcriber` (lokale Whisper of de mock), want Claude
verwerkt geen audio. Alle uitvoer gaat via structured outputs (`messages.parse` met een Pydantic-model),
zodat de API exact de schema's uit schemas.py teruggeeft.
"""

import json
import logging
from typing import Any, Protocol, TypeVar

import anthropic
from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field, ValidationError

from .base import AIProvider
from .errors import AIProviderError
from .prompts import EXTRACT_SYSTEM, MATCH_SYSTEM, PREPARE_SYSTEM
from .schemas import (
    MeetingAnalysis,
    OpenActionItemRef,
    PrepQuestionDraft,
    ProjectState,
    StatusSuggestion,
    Transcript,
    TranscriptionHints,
)

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Server-side fallback: bij een weigering door de veiligheidsfilters probeert de API automatisch een ander model.
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class Transcriber(Protocol):
    async def transcribe(self, audio: bytes, hints: TranscriptionHints | None = None) -> Transcript: ...


class _Suggestions(BaseModel):
    suggestions: list[StatusSuggestion] = Field(default_factory=list)


class _PrepQuestions(BaseModel):
    questions: list[PrepQuestionDraft] = Field(default_factory=list)


def format_transcript(t: Transcript) -> str:
    lines = []
    for i, s in enumerate(t.segments):
        m, sec = divmod(int(s.start_seconds), 60)
        lines.append(f"[{i}] {s.speaker_label} ({m:02d}:{sec:02d}): {s.text}")
    return "\n".join(lines)


class AnthropicProvider(AIProvider):
    name = "anthropic"

    def __init__(
        self,
        api_key: str | None,
        transcriber: Transcriber,
        model: str = "claude-opus-5-5",
        effort: str = "high",
        client: Any | None = None,
    ) -> None:
        self.model = model
        self.effort = effort
        self.transcriber = transcriber
        self._api_key = api_key
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            if not self._api_key:
                raise AIProviderError(
                    "Er is geen ANTHROPIC_API_KEY ingesteld. Zet de sleutel in .env en herstart de backend."
                )
            self._client = AsyncAnthropic(api_key=self._api_key)
        return self._client

    # ----------------------------------------------------------------------------- gedeelde aanroep

    async def _parse(self, system: str, user: str, output: type[T], task: str) -> T:
        try:
            response = await self.client.beta.messages.parse(
                model=self.model,
                max_tokens=16000,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_format=output,
                output_config={"effort": self.effort},
                betas=[FALLBACK_BETA],
                fallbacks="default",
            )
        except anthropic.AuthenticationError as exc:
            raise AIProviderError("De Anthropic-API-sleutel is ongeldig. Controleer ANTHROPIC_API_KEY in .env.") from exc
        except anthropic.PermissionDeniedError as exc:
            raise AIProviderError("Deze API-sleutel heeft geen toegang tot het gekozen model.") from exc
        except anthropic.RateLimitError as exc:
            raise AIProviderError("De Anthropic-API is tijdelijk overbelast of de limiet is bereikt. Probeer het zo opnieuw.") from exc
        except anthropic.BadRequestError as exc:
            raise AIProviderError(f"De Anthropic-API weigerde het verzoek ({task}): {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise AIProviderError("Geen verbinding met de Anthropic-API. Controleer de internetverbinding.") from exc
        except anthropic.APIStatusError as exc:
            raise AIProviderError(f"De Anthropic-API gaf een fout ({exc.status_code}) bij {task}. Probeer het opnieuw.") from exc
        except ValidationError as exc:
            raise AIProviderError(f"Het antwoord van de AI voldeed niet aan het verwachte formaat ({task}).") from exc

        usage = getattr(response, "usage", None)
        log.info(
            "Claude %s: model=%s stop=%s input=%s output=%s",
            task, getattr(response, "model", self.model), response.stop_reason,
            getattr(usage, "input_tokens", "?"), getattr(usage, "output_tokens", "?"),
        )
        if response.stop_reason == "refusal":
            raise AIProviderError(f"De AI heeft {task} geweigerd. Controleer de inhoud van de opname.")
        if response.stop_reason == "max_tokens":
            raise AIProviderError(f"Het antwoord van de AI werd afgebroken ({task}): de vergadering is te lang voor één aanvraag.")
        if response.parsed_output is None:
            raise AIProviderError(f"De AI gaf geen bruikbaar antwoord ({task}).")
        return response.parsed_output

    # ----------------------------------------------------------------------------- AIProvider

    async def transcribe(self, audio: bytes, hints: TranscriptionHints | None = None) -> Transcript:
        return await self.transcriber.transcribe(audio, hints)

    async def extract(self, transcript: Transcript) -> MeetingAnalysis:
        header = [
            f"Vergaderdatum: {transcript.meeting_date.isoformat() if transcript.meeting_date else 'onbekend'}",
            f"Deelnemers: {', '.join(transcript.participant_names) or 'onbekend'}",
            f"Projectdoelstellingen: {'; '.join(transcript.project_goals) or 'geen'}",
            "",
            "Transcript:",
            format_transcript(transcript),
        ]
        return await self._parse(EXTRACT_SYSTEM, "\n".join(header), MeetingAnalysis, "het analyseren van de vergadering")

    async def match(
        self, new_analysis: MeetingAnalysis, open_action_items: list[OpenActionItemRef]
    ) -> list[StatusSuggestion]:
        if not open_action_items or not new_analysis.progress_updates:
            return []
        user = (
            "Openstaande actiepunten:\n"
            + json.dumps([i.model_dump(mode="json") for i in open_action_items], ensure_ascii=False, indent=1)
            + "\n\nVoortgangsuitspraken uit de nieuwe vergadering:\n"
            + json.dumps([u.model_dump(mode="json") for u in new_analysis.progress_updates], ensure_ascii=False, indent=1)
        )
        result = await self._parse(MATCH_SYSTEM, user, _Suggestions, "het vergelijken met eerdere actiepunten")
        return result.suggestions

    async def prepare_next(self, project_state: ProjectState) -> list[PrepQuestionDraft]:
        user = "Stand van het project:\n" + json.dumps(project_state.model_dump(mode="json"), ensure_ascii=False, indent=1)
        result = await self._parse(PREPARE_SYSTEM, user, _PrepQuestions, "het voorbereiden van de volgende vergadering")
        return result.questions
