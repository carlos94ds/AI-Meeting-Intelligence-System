import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ActionItemFilters } from '@/lib/types'

export const keys = {
  dashboard: (projectId?: number) => ['dashboard', projectId ?? 'all'] as const,
  projects: ['projects'] as const,
  project: (id: number) => ['project', id] as const,
  meetings: (projectId?: number) => ['meetings', projectId ?? 'all'] as const,
  meeting: (id: number) => ['meeting', id] as const,
  comparison: (id: number) => ['comparison', id] as const,
  participants: ['participants'] as const,
  actionItems: (f: ActionItemFilters) => ['action-items', f] as const,
  actionItem: (id: number) => ['action-item', id] as const,
  history: (id: number) => ['history', id] as const,
  settings: ['settings'] as const,
}

export const useDashboard = (projectId?: number) =>
  useQuery({ queryKey: keys.dashboard(projectId), queryFn: () => api.dashboard(projectId) })

export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: api.projects })

export const useProject = (id: number | undefined) =>
  useQuery({ queryKey: keys.project(id ?? -1), queryFn: () => api.project(id!), enabled: id !== undefined })

export const useMeetings = (projectId?: number) =>
  useQuery({ queryKey: keys.meetings(projectId), queryFn: () => api.meetings(projectId) })

export const useMeeting = (id: number) => useQuery({ queryKey: keys.meeting(id), queryFn: () => api.meeting(id) })

export const useParticipants = () => useQuery({ queryKey: keys.participants, queryFn: api.participants })

export const useActionItems = (filters: ActionItemFilters) =>
  useQuery({ queryKey: keys.actionItems(filters), queryFn: () => api.actionItems(filters) })

export const useActionItem = (id: number | undefined) =>
  useQuery({ queryKey: keys.actionItem(id ?? -1), queryFn: () => api.actionItem(id!), enabled: id !== undefined })

export const useHistory = (id: number | undefined) =>
  useQuery({ queryKey: keys.history(id ?? -1), queryFn: () => api.history(id!), enabled: id !== undefined })

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.settings })
