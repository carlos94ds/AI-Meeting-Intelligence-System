"""Applicatieconfiguratie, gelezen uit omgevingsvariabelen / `.env`."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Welke AI-provider actief is: mock | openai | anthropic | local
    ai_provider: str = "mock"
    # Kunstmatige vertraging per mock-stap (seconden), zodat de UI laadtoestanden toont.
    mock_delay_seconds: float = 1.5

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'meetings.db').as_posix()}"
    upload_dir: Path = BACKEND_DIR / "data" / "uploads"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Echte AI (AI_PROVIDER=anthropic). Sleutels alleen via .env, nooit in code.
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    # low | medium | high | xhigh | max (Claude Opus 5.5 gebruikt standaard 'medium'; extractie vraagt nauwkeurigheid)
    anthropic_effort: str = "high"
    openai_api_key: str | None = None

    # --- Transcriptie: whisper (lokaal, faster-whisper) | mock (vaste demotekst, handig om alleen de LLM te testen)
    transcriber: str = "whisper"
    whisper_model: str = "small"  # tiny | base | small | medium | large-v3 (groter = nauwkeuriger, trager)
    whisper_device: str = "auto"  # auto | cpu | cuda
    whisper_compute_type: str = "int8"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
