import { UserX } from 'lucide-react'
import type { Participant } from '@/lib/types'
import { speakerColor } from '@/lib/speakers'
import { cn } from '@/lib/utils'

export function Initials({ name, color, className }: { name: string; color: string; className?: string }) {
  const c = speakerColor(color)
  return (
    <span
      aria-hidden
      className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', c.soft, c.text, className)}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function OwnerChip({ owner, className }: { owner: Participant | null; className?: string }) {
  if (!owner) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm text-muted-foreground', className)}>
        <UserX className="size-4" aria-hidden /> Geen eigenaar
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <Initials name={owner.name} color={owner.color} />
      {owner.name}
    </span>
  )
}
