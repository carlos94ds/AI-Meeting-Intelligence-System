import { AlertTriangle, Check, Pencil, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { ActionItemEditForm } from '@/components/ActionItemEditForm'
import { ActionItemMeta } from '@/components/ActionItemMeta'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirmItem, useRejectItem } from '@/hooks/mutations'
import { percent } from '@/lib/format'
import type { ActionItem, Participant } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ActionItemCardProps {
  item: ActionItem
  participants: Participant[]
  className?: string
}

/** Kaart voor het reviewen van een door AI voorgesteld actiepunt. */
export function ActionItemCard({ item, participants, className }: ActionItemCardProps) {
  const [editing, setEditing] = useState(false)
  const confirm = useConfirmItem()
  const reject = useRejectItem()
  const missing = item.status === 'vervallen' || item.status === 'afgerond' ? [] : [!item.owner && 'eigenaar', !item.deadline && 'deadline'].filter((m): m is string => Boolean(m))
  const busy = confirm.isPending || reject.isPending
  const lowConfidence = item.ai_confidence !== null && item.ai_confidence < 0.7

  return (
    <article
      aria-label={item.title}
      className={cn(
        'rounded-xl border bg-card p-4 transition-shadow',
        item.status === 'voorgesteld' && 'border-dashed border-status-voorgesteld/50',
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="min-w-0 flex-1 basis-60 text-sm leading-snug font-medium">{item.title}</h3>
        <div className="flex items-center gap-2">
          {item.ai_confidence !== null && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
                      lowConfidence ? 'bg-status-uitgesteld-bg text-status-uitgesteld' : 'bg-muted text-muted-foreground',
                    )}
                  />
                }
              >
                <Sparkles className="size-3" aria-hidden /> {percent(item.ai_confidence)}
              </TooltipTrigger>
              <TooltipContent>
                {lowConfidence ? 'Lage zekerheid: controleer dit punt extra goed.' : 'Zekerheid van de AI bij het herkennen.'}
              </TooltipContent>
            </Tooltip>
          )}
          <StatusBadge status={item.status} postponeCount={item.postpone_count} />
        </div>
      </div>

      {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}

      <div className="mt-3">
        {editing ? (
          <ActionItemEditForm item={item} participants={participants} onDone={() => setEditing(false)} />
        ) : (
          <ActionItemMeta item={item} />
        )}
      </div>

      {missing.length > 0 && !editing && (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-lg border border-status-uitgesteld/30 bg-status-uitgesteld-bg px-3 py-2 text-sm text-status-uitgesteld"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Ontbrekende {missing.join(' en ')}.{' '}
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => setEditing(true)}>
              Nu aanvullen
            </button>
          </span>
        </div>
      )}

      {item.status === 'voorgesteld' && !editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => confirm.mutate(item)} disabled={busy}>
            <Check /> Bevestigen
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil /> Aanpassen
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => reject.mutate(item)} disabled={busy}>
            <X /> Verwerpen
          </Button>
        </div>
      )}
    </article>
  )
}
