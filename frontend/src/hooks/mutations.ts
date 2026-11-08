import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ActionItem, ActionItemPatch, PreparationInput, ProjectInput, SuggestionDecision } from '@/lib/types'

/** Na elke wijziging: alle afgeleide gegevens (KPI's, lijsten, historie) opnieuw ophalen. */
const AFFECTED = ['dashboard', 'projects', 'project', 'meetings', 'meeting', 'comparison', 'action-items', 'action-item', 'history']

function useRefresh() {
  const qc = useQueryClient()
  return () => Promise.all(AFFECTED.map((key) => qc.invalidateQueries({ queryKey: [key] })))
}

const onError = (error: Error) => toast.error(error.message)

export function useConfirmItem() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (item: ActionItem) => api.confirmActionItem(item.id),
    onSuccess: (updated, item) => {
      toast.success(item.status === 'gemeld_afgerond' ? 'Afronding bevestigd' : 'Actiepunt bevestigd', {
        description: updated.title,
      })
      return refresh()
    },
    onError,
  })
}

export function useConfirmMany() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (items: ActionItem[]) => {
      for (const item of items) await api.confirmActionItem(item.id)
      return items.length
    },
    onSuccess: (count) => {
      toast.success(count === 1 ? '1 actiepunt bevestigd' : `${count} actiepunten bevestigd`)
      return refresh()
    },
    onError: (error: Error) => {
      toast.error(error.message)
      return refresh()
    },
  })
}

export function useRejectItem() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (item: ActionItem) => api.rejectActionItem(item.id),
    onSuccess: (updated) => {
      toast('Actiepunt verworpen', { description: updated.title })
      return refresh()
    },
    onError,
  })
}

export function usePatchItem(successMessage = 'Actiepunt bijgewerkt') {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ActionItemPatch }) => api.patchActionItem(id, patch),
    onSuccess: (updated) => {
      toast.success(successMessage, { description: updated.title })
      return refresh()
    },
    onError,
  })
}

export function useAddEvidence() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, form }: { id: number; form: FormData }) => api.addEvidence(id, form),
    onSuccess: (updated) => {
      toast.success('Bewijs toegevoegd – actiepunt afgerond', { description: updated.title })
      return refresh()
    },
    onError,
  })
}

export function useDecideSuggestion() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: SuggestionDecision }) => api.decideSuggestion(id, body),
    onSuccess: (_result, { body }) => {
      if (body.decision === 'reject') toast('Voorstel afgewezen – status blijft ongewijzigd')
      else if (body.decision === 'override') toast.success('Andere status doorgevoerd')
      else toast.success('Statuswijziging doorgevoerd')
      return refresh()
    },
    onError,
  })
}

export function useSavePreparation(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PreparationInput) => api.savePreparation(projectId, body),
    onSuccess: (data) => {
      qc.setQueryData(['preparation', projectId], data)
      toast.success('Voorbereiding opgeslagen')
      return Promise.all(['dashboard', 'project', 'projects'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
    },
    onError,
  })
}

export function useRegeneratePreparation(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.regeneratePreparation(projectId),
    onSuccess: (data) => {
      qc.setQueryData(['preparation', projectId], data)
      toast.success('Nieuwe vragen voorgesteld', { description: 'Zelf toegevoegde vragen zijn behouden.' })
      return qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError,
  })
}

export function useCreateProject() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (body: ProjectInput) => api.createProject(body),
    onSuccess: (p) => {
      toast.success('Project aangemaakt', { description: p.name })
      return refresh()
    },
    onError,
  })
}
