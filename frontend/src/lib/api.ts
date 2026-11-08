import type {
  ActionItem,
  ActionItemFilters,
  ActionItemPatch,
  AppSettings,
  AppSettingsInput,
  Comparison,
  Dashboard,
  MeetingDetail,
  MeetingSummary,
  Participant,
  Preparation,
  PreparationInput,
  ProcessingStatus,
  ProjectDetail,
  ProjectInput,
  ProjectSummary,
  StatusChange,
  SuggestionDecision,
} from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const BASE = '/api'

function messageFor(status: number, detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) return 'Controleer de ingevulde gegevens.'
  if (status === 404) return 'Niet gevonden.'
  if (status >= 500) return 'Er ging iets mis op de server. Probeer het later opnieuw.'
  return 'Er ging iets mis. Probeer het opnieuw.'
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(BASE + path, init)
  } catch {
    throw new ApiError(0, 'Geen verbinding met de server. Draait de backend?')
  }
  if (!response.ok) {
    let detail: unknown
    try {
      detail = ((await response.json()) as { detail?: unknown }).detail
    } catch {
      detail = undefined
    }
    throw new ApiError(response.status, messageFor(response.status, detail))
  }
  const type = response.headers.get('content-type') ?? ''
  return (type.includes('application/json') ? response.json() : response.text()) as Promise<T>
}

function json<T>(method: string, path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function query(params: Record<string, string | number | string[] | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => search.append(key, v))
    else search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

export const api = {
  dashboard: (projectId?: number) => request<Dashboard>(`/dashboard${query({ project_id: projectId })}`),

  projects: () => request<ProjectSummary[]>('/projects'),
  createProject: (body: ProjectInput) => json<ProjectSummary>('POST', '/projects', body),
  project: (id: number) => request<ProjectDetail>(`/projects/${id}`),
  projectMeetings: (id: number) => request<MeetingSummary[]>(`/projects/${id}/meetings`),
  preparation: (projectId: number) => request<Preparation>(`/projects/${projectId}/preparation`),
  savePreparation: (projectId: number, body: PreparationInput) =>
    json<Preparation>('PUT', `/projects/${projectId}/preparation`, body),
  regeneratePreparation: (projectId: number) =>
    request<Preparation>(`/projects/${projectId}/preparation/regenerate`, { method: 'POST' }),

  participants: () => request<Participant[]>('/participants'),

  meetings: (projectId?: number) => request<MeetingSummary[]>(`/meetings${query({ project_id: projectId })}`),
  meeting: (id: number) => request<MeetingDetail>(`/meetings/${id}`),
  createMeeting: (form: FormData) => request<MeetingSummary>('/meetings', { method: 'POST', body: form }),
  processingStatus: (id: number) => request<ProcessingStatus>(`/meetings/${id}/processing-status`),
  mapSpeakers: (id: number, mapping: Record<string, number | null>) =>
    json<MeetingDetail>('PUT', `/meetings/${id}/speakers`, { mapping }),
  comparison: (id: number) => request<Comparison>(`/meetings/${id}/comparison`),
  exportMeeting: (id: number) => request<string>(`/meetings/${id}/export`),

  actionItems: (filters: ActionItemFilters = {}) =>
    request<ActionItem[]>(
      `/action-items${query({
        project_id: filters.project_id,
        meeting_id: filters.meeting_id,
        owner_id: filters.owner_id,
        goal_id: filters.goal_id,
        status: filters.status,
        q: filters.q,
      })}`,
    ),
  actionItem: (id: number) => request<ActionItem>(`/action-items/${id}`),
  patchActionItem: (id: number, patch: ActionItemPatch) => json<ActionItem>('PATCH', `/action-items/${id}`, patch),
  confirmActionItem: (id: number) => request<ActionItem>(`/action-items/${id}/confirm`, { method: 'POST' }),
  rejectActionItem: (id: number) => request<ActionItem>(`/action-items/${id}/reject`, { method: 'POST' }),
  addEvidence: (id: number, form: FormData) =>
    request<ActionItem>(`/action-items/${id}/evidence`, { method: 'POST', body: form }),
  history: (id: number) => request<StatusChange[]>(`/action-items/${id}/history`),
  decideSuggestion: (id: number, body: SuggestionDecision) =>
    json<StatusChange>('POST', `/suggestions/${id}/decision`, body),

  settings: () => request<AppSettings>('/settings'),
  saveSettings: (body: AppSettingsInput) => json<AppSettings>('PUT', '/settings', body),
}
