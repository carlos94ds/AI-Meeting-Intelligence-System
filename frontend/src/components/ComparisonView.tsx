import { ArrowRight, Bot, Check, CheckCircle2, ChevronDown, CircleDot, Clock4, FileCheck2, GitCompareArrows, Hand, HelpCircle, MinusCircle, Repeat } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EvidenceDialog } from '@/components/EvidenceDialog'
import { OwnerChip } from '@/components/OwnerChip'
import { SourceLink } from '@/components/SourceLink'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDecideSuggestion } from '@/hooks/mutations'
import { useComparison } from '@/hooks/queries'
import { formatDate, formatShortDate } from '@/lib/format'
import { ALLOWED_TRANSITIONS, STATUS_META } from '@/lib/status'
import type { ActionStatus, ComparisonCounts, ComparisonItem } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ComparisonView({ meetingId }: { meetingId: number }) {
  const { data, isPending, isError, error, refetch } = useComparison(meetingId)

  if (isPending) return <CardSkeleton lines={6} />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!data.previous_meeting) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="Eerste vergadering van dit project"
        description="Er is nog geen eerdere vergadering om mee te vergelijken. Vanaf de volgende vergadering zie je hier per actiepunt wat er is veranderd."
      />
    )
  }
  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="Geen eerdere actiepunten"
        description="In de vorige vergaderingen zijn geen actiepunten afgesproken."
      />
    )
  }

  const rank = (i: ComparisonItem) => (i.suggestion?.state === 'pending' ? 0 : i.suggestion ? 1 : 2)
  const items = [...data.items].sort((a, b) => rank(a) - rank(b))

  return (
    <div className="space-y-4">
      <SummaryBar counts={data.counts} previousTitle={data.previous_meeting.title} previousDate={data.previous_meeting.date} previousId={data.previous_meeting.id} />
      <StatusDifferenceHint />
      <ol className="space-y-3">
        {items.map((item) => (
          <li key={item.action_item.id}>
            <ComparisonRow item={item} />
          </li>
        ))}
      </ol>
    </div>
  )
}

// ----------------------------------------------------------------------------- samenvattende balk

function SummaryBar({ counts, previousTitle, previousDate, previousId }: { counts: ComparisonCounts; previousTitle: string; previousDate: string; previousId: number }) {
  const parts = [
    { key: 'afgerond', n: counts.afgerond, label: 'afgerond', icon: CheckCircle2, color: 'bg-status-afgerond', text: 'text-status-afgerond' },
    { key: 'gemeld', n: counts.gemeld, label: 'gemeld (te bevestigen)', icon: Hand, color: 'bg-status-gemeld', text: 'text-status-gemeld' },
    { key: 'uitgesteld', n: counts.uitgesteld, label: 'uitgesteld', icon: Clock4, color: 'bg-status-uitgesteld', text: 'text-status-uitgesteld' },
    { key: 'openstaand', n: counts.openstaand, label: 'openstaand', icon: CircleDot, color: 'bg-status-open', text: 'text-status-open' },
    { key: 'vervallen', n: counts.vervallen, label: 'vervallen', icon: MinusCircle, color: 'bg-status-vervallen', text: 'text-status-vervallen' },
  ].filter((p) => p.n > 0)
  const total = parts.reduce((sum, p) => sum + p.n, 0)

  return (
    <section aria-label="Samenvatting van de vergelijking" className="rounded-xl border border-primary/25 bg-gradient-to-br from-accent/70 to-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <GitCompareArrows className="size-4 text-primary" aria-hidden />
          Wat is er veranderd sinds de vorige vergadering?
        </div>
        <span className="text-xs text-muted-foreground">
          Vergeleken met{' '}
          <Link to={`/vergaderingen/${previousId}`} className="font-medium text-foreground hover:underline">
            {previousTitle}
          </Link>{' '}
          ({formatShortDate(previousDate)})
        </span>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base font-medium">
        {parts.map((p, i) => {
          const Icon = p.icon
          return (
            <span key={p.key} className="inline-flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground" aria-hidden>·</span>}
              <Icon className={cn('size-4', p.text)} aria-hidden />
              <span className="tabular-nums">{p.n}</span> {p.label}
            </span>
          )
        })}
      </p>
      {/* Verhoudingsbalk: segmenten met 2px tussenruimte, kleur + tekst hierboven */}
      <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts.map((p) => (
          <div key={p.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', p.color)} style={{ width: `${(p.n / total) * 100}%` }} />
        ))}
      </div>
      {counts.te_beoordelen > 0 && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
          <Bot className="size-3.5" aria-hidden /> {counts.te_beoordelen} AI-voorstel{counts.te_beoordelen === 1 ? '' : 'len'} wacht
          {counts.te_beoordelen === 1 ? '' : 'en'} op jouw beoordeling
        </p>
      )}
    </section>
  )
}

function StatusDifferenceHint() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Let op het verschil:</span>
      <StatusBadge status="gemeld_afgerond" size="sm" />
      <span>≠</span>
      <StatusBadge status="afgerond" size="sm" />
      <Tooltip>
        <TooltipTrigger
          render={
            <button type="button" className="inline-flex items-center gap-1 rounded text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" />
          }
        >
          <HelpCircle className="size-3.5" aria-hidden /> Waarom?
        </TooltipTrigger>
        <TooltipContent className="max-w-80">
          “Gemeld als afgerond” betekent alleen dat iemand in de vergadering zei dat het klaar is. Pas na een expliciete bevestiging of met
          bewijs (link of bestand) wordt het “Afgerond”. Zo voorkom je dat taken onterecht als klaar worden afgevinkt.
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

// ----------------------------------------------------------------------------- per actiepunt

function ComparisonRow({ item }: { item: ComparisonItem }) {
  const { action_item: ai, suggestion: sug, previous_status: prev } = item
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [params] = useSearchParams()
  const decide = useDecideSuggestion()
  const pending = sug?.state === 'pending'
  const proposed: ActionStatus = sug ? sug.to_status : ai.status
  // Opnieuw uitstellen (uitgesteld → uitgesteld) is ook een wijziging: de teller loopt op.
  const changed = sug !== null && (sug.to_status !== prev || sug.to_status === 'uitgesteld')
  const accepted = sug?.state === 'accepted'
  const prevCount = prev === 'uitgesteld' ? Math.max(1, accepted && proposed === 'uitgesteld' ? ai.postpone_count - 1 : ai.postpone_count) : 0
  const nextCount = proposed === 'uitgesteld' ? (pending ? ai.postpone_count + 1 : ai.postpone_count) : 0
  const detailHref = (() => {
    const next = new URLSearchParams(params)
    next.set('item', String(ai.id))
    return `?${next.toString()}`
  })()

  const acceptLabel = sug?.to_status === 'afgerond' ? 'Akkoord – afronding bevestigen' : 'Akkoord'

  return (
    <article
      aria-label={ai.title}
      className={cn(
        'rounded-xl border bg-card p-4',
        pending && 'border-primary/40 shadow-[0_0_0_3px] shadow-primary/8',
        !sug && 'bg-muted/30',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <Link to={detailHref} className="text-sm leading-snug font-medium hover:underline">
            {ai.title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <OwnerChip owner={ai.owner} className="text-xs" />
            {ai.deadline && <span>Deadline {formatDate(ai.deadline)}</span>}
            {ai.postpone_count >= 2 && (
              <span className="inline-flex items-center gap-1 font-medium text-status-uitgesteld">
                <Repeat className="size-3" aria-hidden /> {ai.postpone_count}× uitgesteld
              </span>
            )}
          </div>
        </div>
        {/* Vorige status → voorgestelde status */}
        <div className="flex items-center gap-2" aria-label={`Van ${STATUS_META[prev].label} naar ${STATUS_META[proposed].label}`}>
          <StatusBadge status={prev} postponeCount={prevCount} />
          <ArrowRight className={cn('size-5', changed ? 'text-primary' : 'text-muted-foreground/50')} aria-hidden />
          {changed ? (
            <StatusBadge status={proposed} postponeCount={nextCount} className={pending ? 'ring-2 ring-primary/30' : undefined} />
          ) : (
            <span className="text-xs text-muted-foreground">ongewijzigd</span>
          )}
        </div>
      </div>

      {sug ? (
        <>
          {sug.quote && (
            <blockquote className="mt-3 rounded-lg border-l-2 border-primary/50 bg-muted/50 px-3 py-2 text-sm leading-relaxed">
              <span className="text-muted-foreground">“</span>
              {sug.quote}
              <span className="text-muted-foreground">”</span>
              <SourceLink segmentId={sug.source_segment_id} meetingId={sug.source_meeting_id} className="ml-1 align-baseline" />
            </blockquote>
          )}
          {sug.rationale && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Bot className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                {sug.rationale}
                {sug.new_deadline && <span className="font-medium text-foreground"> Nieuwe deadline: {formatDate(sug.new_deadline)}.</span>}
              </span>
            </p>
          )}

          {pending ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => decide.mutate({ id: sug.id, body: { decision: 'accept' } })} disabled={decide.isPending}>
                <Check /> {acceptLabel}
              </Button>
              <OtherStatusPopover from={sug.from_status ?? ai.status} suggestionId={sug.id} currentDeadline={ai.deadline} />
              {['open', 'uitgesteld', 'gemeld_afgerond'].includes(ai.status) && (
                <Button size="sm" variant="outline" onClick={() => setEvidenceOpen(true)}>
                  <FileCheck2 /> Bewijs toevoegen
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {sug.state === 'accepted' ? (
                <span className="inline-flex items-center gap-1">
                  <Check className="size-3.5 text-status-afgerond" aria-hidden /> Akkoord door {sug.actor ?? 'onbekend'}
                </span>
              ) : (
                <span>Afgewezen{sug.actor && sug.actor !== 'AI' ? ` door ${sug.actor}` : ''}{sug.note ? ` – ${sug.note}` : ''}</span>
              )}
              {ai.status !== sug.to_status && (
                <span>
                  {' '}
                  · huidige status: <StatusBadge status={ai.status} size="sm" postponeCount={ai.postpone_count} />
                </span>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Niet besproken in deze vergadering – status ongewijzigd.</p>
      )}
      <EvidenceDialog item={ai} open={evidenceOpen} onOpenChange={setEvidenceOpen} />
    </article>
  )
}

function OtherStatusPopover({ from, suggestionId, currentDeadline }: { from: ActionStatus; suggestionId: number; currentDeadline: string | null }) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<ActionStatus | 'ongewijzigd' | null>(null)
  const [deadline, setDeadline] = useState('')
  const decide = useDecideSuggestion()
  const options = ALLOWED_TRANSITIONS[from].filter((s) => s !== from || s === 'uitgesteld')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!target) return
    const body =
      target === 'ongewijzigd'
        ? ({ decision: 'reject', note: 'Status blijft ongewijzigd' } as const)
        : ({ decision: 'override', target_status: target, new_deadline: target === 'uitgesteld' ? deadline : undefined } as const)
    decide.mutate({ id: suggestionId, body }, { onSuccess: () => setOpen(false) })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="sm" variant="outline" />}>
        Anders <ChevronDown />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form onSubmit={submit} className="grid gap-3">
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-sm font-medium">Kies de juiste status</legend>
            {[...options, 'ongewijzigd' as const].map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
                <input type="radio" name={`other-${suggestionId}`} value={s} checked={target === s} onChange={() => setTarget(s)} className="accent-[var(--primary)]" />
                {s === 'ongewijzigd' ? <span className="text-sm">Status ongewijzigd laten</span> : <StatusBadge status={s} size="sm" withTooltip={false} />}
              </label>
            ))}
          </fieldset>
          {target === 'uitgesteld' && (
            <div className="grid gap-1">
              <Label htmlFor={`other-deadline-${suggestionId}`}>Nieuwe deadline</Label>
              <Input id={`other-deadline-${suggestionId}`} type="date" required min={currentDeadline ?? undefined} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          )}
          <Button type="submit" size="sm" disabled={!target || (target === 'uitgesteld' && !deadline) || decide.isPending}>
            Doorvoeren
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
