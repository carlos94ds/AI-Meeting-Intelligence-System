import { CalendarDays, Target } from 'lucide-react'
import { OwnerChip } from '@/components/OwnerChip'
import { SourceLink } from '@/components/SourceLink'
import { formatDate } from '@/lib/format'
import type { ActionItem } from '@/lib/types'
import { cn } from '@/lib/utils'

export function DeadlineLabel({ item, className }: { item: ActionItem; className?: string }) {
  if (!item.deadline) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm text-muted-foreground', className)}>
        <CalendarDays className="size-4" aria-hidden /> Geen deadline
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', item.is_overdue && 'font-medium text-destructive', className)}>
      <CalendarDays className="size-4" aria-hidden />
      {formatDate(item.deadline)}
      {item.is_overdue && <span className="sr-only">(deadline verstreken)</span>}
    </span>
  )
}

/** Eigenaar · deadline · doel · bron, op één regel. */
export function ActionItemMeta({ item, showGoal = true }: { item: ActionItem; showGoal?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <OwnerChip owner={item.owner} />
      <DeadlineLabel item={item} />
      {showGoal && item.goal_title && (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Target className="size-4" aria-hidden /> {item.goal_title}
        </span>
      )}
      <SourceLink segmentId={item.source_segment_id} meetingId={item.source_meeting_id} />
    </div>
  )
}
