"""Domeinmodel (SQLModel-tabellen).

Entiteiten uit de blueprint: Project, Doelstelling (Goal), Deelnemer (Participant),
Vergadering (Meeting), TranscriptSegment, Besluit (Decision), Actiepunt (ActionItem),
Statuswijziging (StatusChange) en Voorbereidingsvraag (PrepQuestion).

Bewuste keuze (AVG / AI Act): het systeem volgt taken en projecten, geen personen.
Er worden daarom geen persoonsscores of ranglijsten opgeslagen of berekend.
"""

from datetime import date, datetime
from enum import Enum

from pydantic import NaiveDatetime
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now()


class ActionStatus(str, Enum):
    VOORGESTELD = "voorgesteld"  # Door AI herkend, nog niet bevestigd
    OPEN = "open"  # Bevestigde taak
    UITGESTELD = "uitgesteld"  # Deadline verschoven
    GEMELD_AFGEROND = "gemeld_afgerond"  # Iemand zegt dat het klaar is, nog niet bevestigd
    AFGEROND = "afgerond"  # Bevestigd door eigenaar of met bewijs
    VERVALLEN = "vervallen"  # Niet meer relevant


ACTIVE_STATUSES: frozenset[ActionStatus] = frozenset(
    {ActionStatus.OPEN, ActionStatus.UITGESTELD, ActionStatus.GEMELD_AFGEROND}
)


class ProcessingState(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class SummaryKind(str, Enum):
    ONDERWERP = "onderwerp"
    PROBLEEM = "probleem"
    IDEE = "idee"
    AFSPRAAK = "afspraak"
    DEADLINE = "deadline"


class ChangeOrigin(str, Enum):
    AI = "ai"  # Voorstel van de AI (moet door een gebruiker beoordeeld worden)
    GEBRUIKER = "gebruiker"  # Handmatige wijziging door een gebruiker


class SuggestionState(str, Enum):
    PENDING = "pending"  # AI-voorstel, nog niet beoordeeld
    ACCEPTED = "accepted"  # Doorgevoerd
    REJECTED = "rejected"  # Afgewezen / vervangen door een andere keuze


# --------------------------------------------------------------------------- koppeltabellen


class ProjectParticipant(SQLModel, table=True):
    project_id: int = Field(foreign_key="project.id", primary_key=True, ondelete="CASCADE")
    participant_id: int = Field(foreign_key="participant.id", primary_key=True, ondelete="CASCADE")


class MeetingParticipant(SQLModel, table=True):
    meeting_id: int = Field(foreign_key="meeting.id", primary_key=True, ondelete="CASCADE")
    participant_id: int = Field(foreign_key="participant.id", primary_key=True, ondelete="CASCADE")


# --------------------------------------------------------------------------- entiteiten


class Project(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: str = ""
    next_meeting_date: date | None = None
    created_at: NaiveDatetime = Field(default_factory=utcnow)


class Goal(SQLModel, table=True):
    """Doelstelling van een project."""

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True, ondelete="CASCADE")
    title: str
    description: str = ""
    position: int = 0


class Participant(SQLModel, table=True):
    """Deelnemer. Bevat alleen wat nodig is om taken toe te wijzen."""

    id: int | None = Field(default=None, primary_key=True)
    name: str
    role: str = ""
    color: str = "slate"  # sprekerkleur in het transcript


class Meeting(SQLModel, table=True):
    """Vergadering."""

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True, ondelete="CASCADE")
    title: str
    date: NaiveDatetime
    duration_minutes: int = 0
    audio_filename: str | None = None
    consent_confirmed: bool = False
    processing_state: ProcessingState = ProcessingState.DONE
    processing_step: int = 0  # 0..5, zie PROCESSING_STEPS
    processing_error: str | None = None
    created_at: NaiveDatetime = Field(default_factory=utcnow)


class TranscriptSegment(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    meeting_id: int = Field(foreign_key="meeting.id", index=True, ondelete="CASCADE")
    position: int
    speaker_label: str  # bijv. "Spreker 1" (ruwe diarisatie)
    participant_id: int | None = Field(default=None, foreign_key="participant.id")
    start_seconds: float
    end_seconds: float
    text: str


class SummaryItem(SQLModel, table=True):
    """Samenvattingsitem (onderwerp, probleem, idee, afspraak, deadline) met bron."""

    id: int | None = Field(default=None, primary_key=True)
    meeting_id: int = Field(foreign_key="meeting.id", index=True, ondelete="CASCADE")
    kind: SummaryKind
    text: str
    source_segment_id: int | None = Field(default=None, foreign_key="transcriptsegment.id")


class Decision(SQLModel, table=True):
    """Besluit."""

    id: int | None = Field(default=None, primary_key=True)
    meeting_id: int = Field(foreign_key="meeting.id", index=True, ondelete="CASCADE")
    text: str
    source_segment_id: int | None = Field(default=None, foreign_key="transcriptsegment.id")


class ActionItem(SQLModel, table=True):
    """Actiepunt."""

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True, ondelete="CASCADE")
    meeting_id: int | None = Field(default=None, foreign_key="meeting.id")  # vergadering van herkomst
    goal_id: int | None = Field(default=None, foreign_key="goal.id")
    title: str
    description: str = ""
    owner_id: int | None = Field(default=None, foreign_key="participant.id")
    deadline: date | None = None
    original_deadline: date | None = None
    status: ActionStatus = ActionStatus.VOORGESTELD
    postpone_count: int = 0
    source_segment_id: int | None = Field(default=None, foreign_key="transcriptsegment.id")
    ai_confidence: float | None = None
    evidence_url: str | None = None
    evidence_filename: str | None = None
    evidence_note: str | None = None
    confirmed_by: str | None = None
    completed_at: NaiveDatetime | None = None
    created_at: NaiveDatetime = Field(default_factory=utcnow)
    updated_at: NaiveDatetime = Field(default_factory=utcnow)


class StatusChange(SQLModel, table=True):
    """Statuswijziging. Ook AI-voorstellen worden hier opgeslagen (state = pending)."""

    id: int | None = Field(default=None, primary_key=True)
    action_item_id: int = Field(foreign_key="actionitem.id", index=True, ondelete="CASCADE")
    meeting_id: int | None = Field(default=None, foreign_key="meeting.id")
    from_status: ActionStatus | None = None
    to_status: ActionStatus
    origin: ChangeOrigin = ChangeOrigin.GEBRUIKER
    state: SuggestionState = SuggestionState.ACCEPTED
    source_segment_id: int | None = Field(default=None, foreign_key="transcriptsegment.id")
    quote: str | None = None
    rationale: str | None = None
    new_deadline: date | None = None
    actor: str | None = None  # wie bevestigde / wijzigde
    note: str | None = None
    created_at: NaiveDatetime = Field(default_factory=utcnow)
    decided_at: NaiveDatetime | None = None


class PrepQuestion(SQLModel, table=True):
    """Voorbereidingsvraag voor de volgende vergadering."""

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True, ondelete="CASCADE")
    text: str
    reason: str = ""
    action_item_id: int | None = Field(default=None, foreign_key="actionitem.id")
    source_segment_id: int | None = Field(default=None, foreign_key="transcriptsegment.id")
    included: bool = True
    is_custom: bool = False
    position: int = 0


class AgendaItem(SQLModel, table=True):
    """Punt op de conceptagenda van de volgende vergadering."""

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True, ondelete="CASCADE")
    title: str
    duration_minutes: int = 10
    position: int = 0


class AppSettings(SQLModel, table=True):
    """Instellingen (één rij, id = 1)."""

    id: int | None = Field(default=1, primary_key=True)
    ai_provider: str = "mock"
    language: str = "nl"
    audio_retention: str = "direct"  # direct | 30d | 90d
    transcript_retention: str = "365d"  # 90d | 365d | onbeperkt
    consent_required: bool = True
    postpone_threshold: int = 2
    current_user: str = "Sanne"
