"""Lokale Whisper-transcriptie (nog niet aangesloten). Zie docs/LLM_INTEGRATIE.md."""

from .schemas import Transcript, TranscriptionHints


class WhisperProvider:
    """Alleen spraakherkenning; combineer met een LLM-provider voor extract/match/prepare."""

    name = "whisper"

    def __init__(self, model_size: str = "medium") -> None:
        self.model_size = model_size

    async def transcribe(self, audio: bytes, hints: TranscriptionHints | None = None) -> Transcript:
        # TODO: bijv. faster-whisper + pyannote voor sprekerherkenning (diarisatie).
        #       Map elk segment naar TranscriptSegmentData(speaker_label="Spreker N", ...).
        raise NotImplementedError("WhisperProvider.transcribe is nog niet geïmplementeerd")
