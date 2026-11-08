"""Lokale spraakherkenning met faster-whisper.

- Draait volledig op de eigen machine: audio verlaat de computer niet.
- Het model (standaard 'small') wordt bij het eerste gebruik eenmalig gedownload en daarna hergebruikt.
- Audio staat alleen tijdens het transcriberen in een tijdelijk bestand en wordt daarna direct verwijderd.
- Sprekerherkenning (diarisatie) zit hier nog niet in: alle tekst krijgt het label "Spreker 1".
  Zie docs/LLM_INTEGRATIE.md voor de uitbreiding met pyannote.audio.
"""

import asyncio
import logging
import os
import tempfile
from functools import lru_cache
from typing import Any

from .errors import AIProviderError
from .schemas import Transcript, TranscriptionHints, TranscriptSegmentData

log = logging.getLogger(__name__)

SPEAKER_LABEL = "Spreker 1"


@lru_cache(maxsize=2)
def _load_model(size: str, device: str, compute_type: str) -> Any:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:  # pragma: no cover - afhankelijk van installatie
        raise AIProviderError(
            "faster-whisper is niet geïnstalleerd. Voer uit: npm run setup:ai"
        ) from exc
    log.info("Whisper-model '%s' laden (%s, %s)…", size, device, compute_type)
    return WhisperModel(size, device=device, compute_type=compute_type)


class WhisperProvider:
    """Alleen spraakherkenning; combineer met een LLM-provider voor extract/match/prepare."""

    name = "whisper"

    def __init__(self, model_size: str = "small", device: str = "auto", compute_type: str = "int8") -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type

    def _transcribe_sync(self, audio: bytes, hints: TranscriptionHints) -> Transcript:
        model = _load_model(self.model_size, self.device, self.compute_type)
        fd, path = tempfile.mkstemp(prefix="ami-audio-")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(audio)
            # Namen in de initial prompt helpen Whisper ze goed te spellen.
            prompt = f"Vergadering met {', '.join(hints.participant_names)}." if hints.participant_names else None
            try:
                segments, info = model.transcribe(
                    path,
                    language=hints.language or None,
                    initial_prompt=prompt,
                    vad_filter=True,
                    beam_size=5,
                )
                data = [
                    TranscriptSegmentData(
                        speaker_label=SPEAKER_LABEL,
                        start_seconds=round(s.start, 1),
                        end_seconds=round(s.end, 1),
                        text=s.text.strip(),
                    )
                    for s in segments  # generator: hier wordt het echte werk gedaan
                    if s.text.strip()
                ]
            except Exception as exc:
                raise AIProviderError(
                    "Het audiobestand kon niet worden gelezen. Controleer of het een geldige opname is."
                ) from exc
        finally:
            try:
                os.remove(path)  # bewaartermijn audio: direct verwijderen
            except OSError:
                pass

        if not data:
            raise AIProviderError("Er is geen spraak gevonden in de opname.")
        return Transcript(
            language=info.language or hints.language,
            duration_seconds=round(info.duration, 1),
            participant_names=hints.participant_names,
            segments=data,
        )

    async def transcribe(self, audio: bytes, hints: TranscriptionHints | None = None) -> Transcript:
        # CPU-zwaar: in een aparte thread, zodat de API bereikbaar blijft (voortgangsweergave).
        return await asyncio.to_thread(self._transcribe_sync, audio, hints or TranscriptionHints())
