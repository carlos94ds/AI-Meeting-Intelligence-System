import {
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock4,
  Hand,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { ActionStatus } from './types'

export interface StatusMeta {
  label: string
  /** Korte uitleg, gebruikt in tooltips. */
  description: string
  icon: LucideIcon
  className: string
}

export const STATUS_ORDER: ActionStatus[] = [
  'voorgesteld',
  'open',
  'uitgesteld',
  'gemeld_afgerond',
  'afgerond',
  'vervallen',
]

export const STATUS_META: Record<ActionStatus, StatusMeta> = {
  voorgesteld: {
    label: 'Voorgesteld',
    description: 'Door de AI herkend, nog niet bevestigd.',
    icon: CircleDashed,
    className: 'border-dashed border-status-voorgesteld/60 bg-status-voorgesteld-bg text-status-voorgesteld',
  },
  open: {
    label: 'Open',
    description: 'Bevestigde taak.',
    icon: CircleDot,
    className: 'border-status-open/30 bg-status-open-bg text-status-open',
  },
  uitgesteld: {
    label: 'Uitgesteld',
    description: 'De deadline is verschoven.',
    icon: Clock4,
    className: 'border-status-uitgesteld/35 bg-status-uitgesteld-bg text-status-uitgesteld',
  },
  gemeld_afgerond: {
    label: 'Gemeld als afgerond',
    description:
      'Iemand meldt dat het klaar is, maar dat is nog niet bevestigd. Pas na "Bevestigen" of "Bewijs toevoegen" wordt het Afgerond.',
    icon: Hand,
    className: 'border-status-gemeld/40 bg-status-gemeld-bg text-status-gemeld',
  },
  afgerond: {
    label: 'Afgerond',
    description: 'Bevestigd door de eigenaar of met bewijs.',
    icon: CheckCircle2,
    className: 'border-status-afgerond/35 bg-status-afgerond-bg text-status-afgerond',
  },
  vervallen: {
    label: 'Vervallen',
    description: 'Niet meer relevant.',
    icon: XCircle,
    className: 'border-status-vervallen/30 bg-status-vervallen-bg text-status-vervallen line-through',
  },
}

export const ACTIVE_STATUSES: ActionStatus[] = ['open', 'uitgesteld', 'gemeld_afgerond']

/** Spiegel van ALLOWED_TRANSITIONS in backend/app/status.py. */
export const ALLOWED_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  voorgesteld: ['open', 'vervallen'],
  open: ['uitgesteld', 'gemeld_afgerond', 'afgerond', 'vervallen'],
  uitgesteld: ['uitgesteld', 'open', 'gemeld_afgerond', 'afgerond', 'vervallen'],
  gemeld_afgerond: ['open', 'uitgesteld', 'afgerond', 'vervallen'],
  afgerond: ['open'],
  vervallen: ['open'],
}

/**
 * Statussen die via "Status wijzigen" gekozen mogen worden.
 * "Gemeld als afgerond" → "Afgerond" kan alleen via Bevestigen of Bewijs toevoegen.
 */
export function manualTargets(current: ActionStatus): ActionStatus[] {
  return ALLOWED_TRANSITIONS[current].filter(
    (s) => !(current === 'gemeld_afgerond' && s === 'afgerond') && !(current === 'voorgesteld' && s === 'open'),
  )
}
