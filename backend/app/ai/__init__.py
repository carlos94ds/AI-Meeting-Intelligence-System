from functools import lru_cache

from ..config import get_settings
from typing import TYPE_CHECKING

from .base import AIProvider
from .errors import AIProviderError

if TYPE_CHECKING:
    from .anthropic_provider import Transcriber


@lru_cache
def get_provider(name: str | None = None) -> AIProvider:
    """Kies de provider via `.env` (AI_PROVIDER=mock)."""
    settings = get_settings()
    choice = (name or settings.ai_provider).lower()
    if choice == "mock":
        from .mock import MockProvider

        return MockProvider(delay_seconds=settings.mock_delay_seconds)
    if choice == "openai":
        from .openai_provider import OpenAIProvider

        return OpenAIProvider(api_key=settings.openai_api_key)
    if choice == "anthropic":
        try:
            from .anthropic_provider import AnthropicProvider
        except ImportError as exc:
            raise AIProviderError("De Anthropic-SDK is niet geïnstalleerd. Voer uit: npm run setup:ai") from exc

        return AnthropicProvider(
            api_key=settings.anthropic_api_key,
            transcriber=get_transcriber(),
            model=settings.anthropic_model,
            effort=settings.anthropic_effort,
        )
    raise AIProviderError(f"Onbekende AI-provider in .env: AI_PROVIDER={choice!r}. Kies mock of anthropic.")


def get_transcriber() -> "Transcriber":
    """Spraakherkenning voor echte providers: lokale Whisper (standaard) of de mock-tekst."""
    settings = get_settings()
    if settings.transcriber.lower() == "mock":
        from .mock import MockProvider

        return MockProvider(delay_seconds=0)
    try:
        from .whisper_provider import WhisperProvider
    except ImportError as exc:  # pragma: no cover
        raise AIProviderError("faster-whisper is niet geïnstalleerd. Voer uit: npm run setup:ai") from exc
    return WhisperProvider(
        model_size=settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )


__all__ = ["AIProvider", "AIProviderError", "get_provider", "get_transcriber"]
