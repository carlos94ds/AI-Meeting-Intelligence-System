"""Request/response-schema's van de REST-API."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from .models import ActionStatus, ChangeOrigin, ProcessingState, SuggestionState, SummaryKind


class ParticipantOut(BaseModel):
    id: int
    name: str
    role: str
    color: str


class GoalOut(BaseModel):
    id: int
    title: str
    description: str
    position: int
    total: int
    done: int
    progress: float  # 0..1


class ActionItemOut(BaseModel):
    id: int
    project_id: int
    project_name: str
    meeting_id: int | None
    meeting_title: str | None
    goal_id: int | None
    goal_title: str | None
    title: str
    description: str
    owner: ParticipantOut | None
    deadline: date | None
    original_deadline: date | None
    status: ActionStatus
    postpone_count: int
    is_overdue: bool
    source_segment_id: int | None
    source_meeting_id: int | None
    ai_confidence: float | None
    evidence_url: str | None
    evidence_filename: str | None
    evidence_note: str | None
    confirmed_by: str | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    warnings: list[str]


class ActionItemPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    owner_id: int | None = None
    deadline: date | None = None
    goal_id: int | None = None
    status: ActionStatus | None = None
    note: str | None = None
    # Velden die expliciet op null gezet mogen worden
    clear_owner: bool = False
    clear_deadline: bool = False


class StatusChangeOut(BaseModel):
    id: int
    action_item_id: int
    meeting_id: int | None
    meeting_title: str | None
    meeting_date: datetime | None
    from_status: ActionStatus | None
    to_status: ActionStatus
    origin: ChangeOrigin
    state: SuggestionState
    source_segment_id: int | None
    source_meeting_id: int | None
    quote: str | None
    rationale: str | None
    new_deadline: date | None
    actor: str | None
    note: str | None
    created_at: datetime
    decided_at: datetime | None


class SegmentOut(BaseModel):
    id: int
    position: int
    speaker_label: str
    participant_id: int | None
    speaker_name: str
    color: str
    start_seconds: float
    end_seconds: float
    text: str


class SummaryItemOut(BaseModel):
    id: int
    kind: SummaryKind
    text: str
    source_segment_id: int | None


class DecisionOut(BaseModel):
    id: int
    text: str
    source_segment_id: int | None


class MeetingSummaryOut(BaseModel):
    id: int
    project_id: int
    project_name: str
    title: str
    date: datetime
    duration_minutes: int
    participant_count: int
    processing_state: ProcessingState
    processing_error: str | None = None
    action_item_count: int
    pending_review_count: int
    pending_suggestion_count: int


class MeetingDetailOut(MeetingSummaryOut):
    participants: list[ParticipantOut]
    project_participants: list[ParticipantOut]
    speaker_labels: list[str]
    segments: list[SegmentOut]
    summary_items: list[SummaryItemOut]
    decisions: list[DecisionOut]
    action_items: list[ActionItemOut]
    previous_meeting_id: int | None


class ProcessingStepOut(BaseModel):
    key: str
    label: str
    state: Literal["wachten", "bezig", "klaar", "fout"]


class ProcessingStatusOut(BaseModel):
    meeting_id: int
    state: ProcessingState
    step: int
    steps: list[ProcessingStepOut]
    error: str | None


class SpeakerMappingIn(BaseModel):
    mapping: dict[str, int | None]  # "Spreker 1" -> participant_id


class ComparisonItemOut(BaseModel):
    action_item: ActionItemOut
    previous_status: ActionStatus
    suggestion: StatusChangeOut | None


class ComparisonCounts(BaseModel):
    afgerond: int = 0
    gemeld: int = 0
    uitgesteld: int = 0
    openstaand: int = 0
    vervallen: int = 0
    te_beoordelen: int = 0


class ComparisonOut(BaseModel):
    meeting_id: int
    previous_meeting: MeetingSummaryOut | None
    items: list[ComparisonItemOut]
    counts: ComparisonCounts


class SuggestionDecisionIn(BaseModel):
    decision: Literal["accept", "reject", "override"]
    target_status: ActionStatus | None = None  # verplicht bij "override"
    new_deadline: date | None = None
    note: str | None = None


class Kpis(BaseModel):
    open: int
    awaiting_confirmation: int
    to_review: int
    overdue: int
    repeatedly_postponed: int
    completed_this_week: int


class MeetingProgressPoint(BaseModel):
    meeting_id: int
    title: str
    date: datetime
    open: int
    done: int


class ProjectSummaryOut(BaseModel):
    id: int
    name: str
    description: str
    progress: float
    total: int
    done_count: int
    open_count: int
    meeting_count: int
    last_meeting_date: datetime | None
    next_meeting_date: date | None
    participants: list[ParticipantOut]


class ProjectDetailOut(ProjectSummaryOut):
    goals: list[GoalOut]
    kpis: Kpis
    meetings: list[MeetingSummaryOut]
    progress_per_meeting: list[MeetingProgressPoint]
    repeatedly_postponed: list[ActionItemOut]


class ProjectIn(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    goals: list[str] = Field(default_factory=list)
    participant_ids: list[int] = Field(default_factory=list)


class PrepQuestionOut(BaseModel):
    id: int
    text: str
    reason: str
    action_item_id: int | None
    action_item_title: str | None
    action_item_status: ActionStatus | None
    source_segment_id: int | None
    source_meeting_id: int | None
    included: bool
    is_custom: bool
    position: int


class AgendaItemOut(BaseModel):
    id: int
    title: str
    duration_minutes: int
    position: int


class PreparationOut(BaseModel):
    project_id: int
    project_name: str
    next_meeting_date: date | None
    questions: list[PrepQuestionOut]
    agenda: list[AgendaItemOut]


class PrepQuestionIn(BaseModel):
    text: str = Field(min_length=1)
    reason: str = ""
    action_item_id: int | None = None
    source_segment_id: int | None = None
    included: bool = True
    is_custom: bool = False


class AgendaItemIn(BaseModel):
    title: str = Field(min_length=1)
    duration_minutes: int = Field(default=10, ge=1, le=240)


class PreparationIn(BaseModel):
    next_meeting_date: date | None = None
    questions: list[PrepQuestionIn]
    agenda: list[AgendaItemIn]


class NextMeetingOut(BaseModel):
    project_id: int
    project_name: str
    date: date | None
    top_questions: list[PrepQuestionOut]
    question_count: int


class QuickLinks(BaseModel):
    review_meeting_id: int | None
    review_count: int
    comparison_meeting_id: int | None
    suggestion_count: int
    preparation_project_id: int | None


class DashboardOut(BaseModel):
    kpis: Kpis
    attention: list[ActionItemOut]
    next_meeting: NextMeetingOut | None
    recent_meetings: list[MeetingSummaryOut]
    quick_links: QuickLinks


class SettingsOut(BaseModel):
    ai_provider: str
    ai_model: str
    transcriber: str
    whisper_model: str
    api_key_configured: bool
    available_providers: list[dict[str, str | bool]]
    language: str
    audio_retention: str
    transcript_retention: str
    consent_required: bool
    postpone_threshold: int
    current_user: str


class SettingsIn(BaseModel):
    language: Literal["nl", "en"] | None = None
    audio_retention: Literal["direct", "30d", "90d"] | None = None
    transcript_retention: Literal["90d", "365d", "onbeperkt"] | None = None
    consent_required: bool | None = None
    postpone_threshold: int | None = Field(default=None, ge=1, le=10)
