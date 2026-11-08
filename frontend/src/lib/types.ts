// Spiegelt de Pydantic-schema's in backend/app/schemas.py.

export type ActionStatus =
  | 'voorgesteld'
  | 'open'
  | 'uitgesteld'
  | 'gemeld_afgerond'
  | 'afgerond'
  | 'vervallen'

export type ProcessingState = 'pending' | 'processing' | 'done' | 'failed'
export type SummaryKind = 'onderwerp' | 'probleem' | 'idee' | 'afspraak' | 'deadline'
export type ChangeOrigin = 'ai' | 'gebruiker'
export type SuggestionState = 'pending' | 'accepted' | 'rejected'

export interface Participant {
  id: number
  name: string
  role: string
  color: string
}

export interface Goal {
  id: number
  title: string
  description: string
  position: number
  total: number
  done: number
  progress: number
}

export interface ActionItem {
  id: number
  project_id: number
  project_name: string
  meeting_id: number | null
  meeting_title: string | null
  goal_id: number | null
  goal_title: string | null
  title: string
  description: string
  owner: Participant | null
  deadline: string | null
  original_deadline: string | null
  status: ActionStatus
  postpone_count: number
  is_overdue: boolean
  source_segment_id: number | null
  source_meeting_id: number | null
  ai_confidence: number | null
  evidence_url: string | null
  evidence_filename: string | null
  evidence_note: string | null
  confirmed_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  warnings: string[]
}

export interface ActionItemPatch {
  title?: string
  description?: string
  owner_id?: number
  deadline?: string
  goal_id?: number
  status?: ActionStatus
  note?: string
  clear_owner?: boolean
  clear_deadline?: boolean
}

export interface StatusChange {
  id: number
  action_item_id: number
  meeting_id: number | null
  meeting_title: string | null
  meeting_date: string | null
  from_status: ActionStatus | null
  to_status: ActionStatus
  origin: ChangeOrigin
  state: SuggestionState
  source_segment_id: number | null
  source_meeting_id: number | null
  quote: string | null
  rationale: string | null
  new_deadline: string | null
  actor: string | null
  note: string | null
  created_at: string
  decided_at: string | null
}

export interface Segment {
  id: number
  position: number
  speaker_label: string
  participant_id: number | null
  speaker_name: string
  color: string
  start_seconds: number
  end_seconds: number
  text: string
}

export interface SummaryItem {
  id: number
  kind: SummaryKind
  text: string
  source_segment_id: number | null
}

export interface Decision {
  id: number
  text: string
  source_segment_id: number | null
}

export interface MeetingSummary {
  id: number
  project_id: number
  project_name: string
  title: string
  date: string
  duration_minutes: number
  participant_count: number
  processing_state: ProcessingState
  processing_error: string | null
  action_item_count: number
  pending_review_count: number
  pending_suggestion_count: number
}

export interface MeetingDetail extends MeetingSummary {
  participants: Participant[]
  project_participants: Participant[]
  speaker_labels: string[]
  segments: Segment[]
  summary_items: SummaryItem[]
  decisions: Decision[]
  action_items: ActionItem[]
  previous_meeting_id: number | null
}

export interface ProcessingStep {
  key: string
  label: string
  state: 'wachten' | 'bezig' | 'klaar' | 'fout'
}

export interface ProcessingStatus {
  meeting_id: number
  state: ProcessingState
  step: number
  steps: ProcessingStep[]
  error: string | null
}

export interface ComparisonItem {
  action_item: ActionItem
  previous_status: ActionStatus
  suggestion: StatusChange | null
}

export interface ComparisonCounts {
  afgerond: number
  gemeld: number
  uitgesteld: number
  openstaand: number
  vervallen: number
  te_beoordelen: number
}

export interface Comparison {
  meeting_id: number
  previous_meeting: MeetingSummary | null
  items: ComparisonItem[]
  counts: ComparisonCounts
}

export interface SuggestionDecision {
  decision: 'accept' | 'reject' | 'override'
  target_status?: ActionStatus
  new_deadline?: string
  note?: string
}

export interface Kpis {
  open: number
  awaiting_confirmation: number
  to_review: number
  overdue: number
  repeatedly_postponed: number
  completed_this_week: number
}

export interface MeetingProgressPoint {
  meeting_id: number
  title: string
  date: string
  open: number
  done: number
}

export interface ProjectSummary {
  id: number
  name: string
  description: string
  progress: number
  total: number
  done_count: number
  open_count: number
  meeting_count: number
  last_meeting_date: string | null
  next_meeting_date: string | null
  participants: Participant[]
}

export interface ProjectDetail extends ProjectSummary {
  goals: Goal[]
  kpis: Kpis
  meetings: MeetingSummary[]
  progress_per_meeting: MeetingProgressPoint[]
  repeatedly_postponed: ActionItem[]
}

export interface PrepQuestion {
  id: number
  text: string
  reason: string
  action_item_id: number | null
  action_item_title: string | null
  action_item_status: ActionStatus | null
  source_segment_id: number | null
  source_meeting_id: number | null
  included: boolean
  is_custom: boolean
  position: number
}

export interface AgendaItem {
  id: number
  title: string
  duration_minutes: number
  position: number
}

export interface Preparation {
  project_id: number
  project_name: string
  next_meeting_date: string | null
  questions: PrepQuestion[]
  agenda: AgendaItem[]
}

export interface PreparationInput {
  next_meeting_date: string | null
  questions: Array<{
    text: string
    reason: string
    action_item_id: number | null
    source_segment_id: number | null
    included: boolean
    is_custom: boolean
  }>
  agenda: Array<{ title: string; duration_minutes: number }>
}

export interface NextMeeting {
  project_id: number
  project_name: string
  date: string | null
  top_questions: PrepQuestion[]
  question_count: number
}

export interface QuickLinks {
  review_meeting_id: number | null
  review_count: number
  comparison_meeting_id: number | null
  suggestion_count: number
  preparation_project_id: number | null
}

export interface Dashboard {
  kpis: Kpis
  attention: ActionItem[]
  next_meeting: NextMeeting | null
  recent_meetings: MeetingSummary[]
  quick_links: QuickLinks
}

export interface ProviderOption {
  id: string
  label: string
  available: boolean
}

export interface AppSettings {
  /** Actieve provider uit .env (AI_PROVIDER) */
  ai_provider: string
  ai_model: string
  /** whisper | mock */
  transcriber: string
  whisper_model: string
  api_key_configured: boolean
  available_providers: ProviderOption[]
  language: 'nl' | 'en'
  audio_retention: 'direct' | '30d' | '90d'
  transcript_retention: '90d' | '365d' | 'onbeperkt'
  consent_required: boolean
  postpone_threshold: number
  current_user: string
}

export type AppSettingsInput = Partial<
  Pick<AppSettings, 'language' | 'audio_retention' | 'transcript_retention' | 'consent_required' | 'postpone_threshold'>
>

export interface ActionItemFilters {
  project_id?: number
  meeting_id?: number
  owner_id?: number
  goal_id?: number
  status?: ActionStatus[]
  q?: string
}

export interface ProjectInput {
  name: string
  description: string
  goals: string[]
  participant_ids: number[]
}
