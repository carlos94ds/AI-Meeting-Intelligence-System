import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ActionItem, ActionItemPatch } from '@/lib/types'

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
