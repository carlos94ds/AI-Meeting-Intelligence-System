"""Abstracte AI-laag. De UI en API praten alleen met deze interface."""

from abc import ABC, abstractmethod

from .schemas import (
    MeetingAnalysis,
    OpenActionItemRef,
    PrepQuestionDraft,
    ProjectState,
    StatusSuggestion,
    Transcript,
    TranscriptionHints,
)


class AIProvider(ABC):
    name: str = "abstract"

    @abstractmethod
    async def transcribe(self, audio: bytes, hints: TranscriptionHints | None = None) -> Transcript:
        """Spraak → transcript met sprekerlabels en tijdstempels."""

    @abstractmethod
    async def extract(self, transcript: Transcript) -> MeetingAnalysis:
        """Transcript → samenvatting, besluiten, actiepunten en voortgangsuitspraken."""

    @abstractmethod
    async def match(
        self, new_analysis: MeetingAnalysis, open_action_items: list[OpenActionItemRef]
    ) -> list[StatusSuggestion]:
        """Koppel uitspraken in de nieuwe vergadering aan openstaande actiepunten."""

    @abstractmethod
    async def prepare_next(self, project_state: ProjectState) -> list[PrepQuestionDraft]:
        """Stel vragen voor de volgende vergadering voor."""
