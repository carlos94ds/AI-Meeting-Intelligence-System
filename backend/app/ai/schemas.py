"""Vaste JSON-schema's voor alle AI-output.

Een echte LLM / Whisper-implementatie MOET exact deze structuren teruggeven.
Bronverwijzingen lopen via `segment_index`: de 0-gebaseerde positie van het
segment in het transcript dat de AI als bron gebruikt.
"""

from datetime import date

from pydantic import BaseModel, Field

from ..models import ActionStatus

# --------------------------------------------------------------------------- transcriptie


class TranscriptionHints(BaseModel):
    """Optionele context voor spraakherkenning (vgl. Whisper `initial_prompt`)."""

    participant_names: list[str] = Field(default_factory=list)
    language: str = "nl"


class TranscriptSegmentData(BaseModel):
    speaker_label: str = Field(description="Diarisatielabel, bijv. 'Spreker 1'")
    start_seconds: float
    end_seconds: float
    text: str


class Transcript(BaseModel):
    language: str = "nl"
    duration_seconds: float
    participant_names: list[str] = Field(
        default_factory=list, description="Bekende deelnemers; helpt bij het herkennen van eigenaren"
    )
    segments: list[TranscriptSegmentData]
    # Context die de pijplijn na het transcriberen invult (niet door spraakherkenning):
    meeting_date: date | None = Field(default=None, description="Datum van de vergadering; basis voor relatieve deadlines")
    project_goals: list[str] = Field(default_factory=list, description="Doelstellingen van het project")


# --------------------------------------------------------------------------- extractie


class SourcedText(BaseModel):
    text: str
    segment_index: int = Field(ge=0)


class ExtractedActionItem(BaseModel):
    title: str
    description: str = ""
    owner_name: str | None = Field(default=None, description="Naam zoals in de deelnemerslijst, of null")
    deadline: date | None = None
    goal_hint: str | None = Field(default=None, description="Titel van de doelstelling waar dit bij hoort")
    segment_index: int = Field(ge=0)
    confidence: float = Field(ge=0, le=1, default=0.8)


class ProgressUpdate(BaseModel):
    """Uitspraak over de voortgang van eerder afgesproken werk."""

    subject_name: str | None = Field(default=None, description="Over wiens taak gaat dit")
    text: str
    kind: str = Field(description="gemeld_afgerond | uitgesteld | bezig | vervallen")
    new_deadline: date | None = None
    segment_index: int = Field(ge=0)


class MeetingAnalysis(BaseModel):
    topics: list[SourcedText] = Field(default_factory=list)
    decisions: list[SourcedText] = Field(default_factory=list)
    problems: list[SourcedText] = Field(default_factory=list)
    ideas: list[SourcedText] = Field(default_factory=list)
    agreements: list[SourcedText] = Field(default_factory=list)
    deadlines: list[SourcedText] = Field(default_factory=list)
    action_items: list[ExtractedActionItem] = Field(default_factory=list)
    progress_updates: list[ProgressUpdate] = Field(default_factory=list)


# --------------------------------------------------------------------------- vergelijken


class OpenActionItemRef(BaseModel):
    id: int
    title: str
    owner_name: str | None
    status: ActionStatus
    deadline: date | None
    postpone_count: int = 0


class StatusSuggestion(BaseModel):
    action_item_id: int
    suggested_status: ActionStatus
    quote: str
    segment_index: int = Field(ge=0)
    rationale: str
    new_deadline: date | None = None
    confidence: float = Field(ge=0, le=1, default=0.8)


# --------------------------------------------------------------------------- voorbereiding


class ActionItemState(BaseModel):
    id: int
    title: str
    owner_name: str | None
    status: ActionStatus
    deadline: date | None
    postpone_count: int
    goal_title: str | None = None
    last_source_segment_id: int | None = None


class ProjectState(BaseModel):
    project_name: str
    goals: list[str]
    action_items: list[ActionItemState]
    postpone_threshold: int = 2
    today: date


class PrepQuestionDraft(BaseModel):
    text: str
    reason: str
    action_item_id: int | None = None
    source_segment_id: int | None = None
    priority: int = Field(default=3, ge=1, le=5, description="1 = hoogste prioriteit")
