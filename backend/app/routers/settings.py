from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..db import get_session
from ..schemas import SettingsIn, SettingsOut
from ..services import get_app_settings

router = APIRouter(prefix="/settings", tags=["Instellingen"])

PROVIDERS: list[dict[str, str | bool]] = [
    {"id": "mock", "label": "Mock (demodata, offline)", "available": True},
    {"id": "openai", "label": "OpenAI", "available": False},
    {"id": "anthropic", "label": "Anthropic (Claude)", "available": False},
    {"id": "local", "label": "Lokaal model (Whisper + LLM)", "available": False},
]


def _out(session: Session) -> SettingsOut:
    s = get_app_settings(session)
    return SettingsOut(
        ai_provider=s.ai_provider, available_providers=PROVIDERS, language=s.language,
        audio_retention=s.audio_retention, transcript_retention=s.transcript_retention,
        consent_required=s.consent_required, postpone_threshold=s.postpone_threshold, current_user=s.current_user,
    )


@router.get("", response_model=SettingsOut)
def get_settings_endpoint(session: Session = Depends(get_session)) -> SettingsOut:
    return _out(session)


@router.put("", response_model=SettingsOut)
def put_settings(body: SettingsIn, session: Session = Depends(get_session)) -> SettingsOut:
    s = get_app_settings(session)
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(s, key, value)
    session.add(s)
    session.commit()
    return _out(session)
