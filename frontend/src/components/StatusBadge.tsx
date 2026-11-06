import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STATUS_META } from '@/lib/status'
import type { ActionStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: ActionStatus
  postponeCount?: number
  size?: 'sm' | 'md'
  className?: string
  /** Toon uitleg in een tooltip (standaard aan). */
  withTooltip?: boolean
}

/** Status is nooit alleen kleur: altijd icoon + tekst, plus uitleg in een tooltip. */
export function StatusBadge({ status, postponeCount = 0, size = 'md', className, withTooltip = true }: StatusBadgeProps) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  const badge = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs',
        meta.className,
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />
      <span className={status === 'vervallen' ? 'line-through' : undefined}>{meta.label}</span>
      {status === 'uitgesteld' && postponeCount > 0 && (
        <span className="ml-0.5 rounded-full bg-status-uitgesteld/15 px-1 tabular-nums">{postponeCount}×</span>
      )}
    </span>
  )
  if (!withTooltip) return badge
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className="inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-ring" />}>
        {badge}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {meta.description}
        {status === 'uitgesteld' && postponeCount > 0 && ` ${postponeCount}× uitgesteld.`}
      </TooltipContent>
    </Tooltip>
  )
}
