from functools import lru_cache

from ..config import get_settings
from .base import AIProvider


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
        from .anthropic_provider import AnthropicProvider

        return AnthropicProvider(api_key=settings.anthropic_api_key)
    raise ValueError(f"Onbekende AI-provider: {choice!r}")


__all__ = ["AIProvider", "get_provider"]
