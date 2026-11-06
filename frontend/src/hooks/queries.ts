import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ActionItemFilters } from '@/lib/types'

export const keys = {
  dashboard: (projectId?: number) => ['dashboard', projectId ?? 'all'] as const,
  projects: ['projects'] as const,
  project: (id: number) => ['project', id] as const,
  meetings: (projectId?: number) => ['meetings', projectId ?? 'all'] as const,
  meeting: (id: number) => ['meeting', id] as const,
  participants: ['participants'] as const,
  actionItems: (f: ActionItemFilters) => ['action-items', f] as const,
  settings: ['settings'] as const,
}

export const useDashboard = (projectId?: number) =>
  useQuery({ queryKey: keys.dashboard(projectId), queryFn: () => api.dashboard(projectId) })

export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: api.projects })

export const useProject = (id: number) => useQuery({ queryKey: keys.project(id), queryFn: () => api.project(id) })

export const useMeetings = (projectId?: number) =>
  useQuery({ queryKey: keys.meetings(projectId), queryFn: () => api.meetings(projectId) })

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.settings })
