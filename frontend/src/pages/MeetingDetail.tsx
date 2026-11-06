import {
  AlertTriangle,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  Clock,
  Download,
  Flag,
  GitCompareArrows,
  Gavel,
  Handshake,
  Lightbulb,
  ListChecks,
  Loader2,
  MessagesSquare,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ActionItemCard } from '@/components/ActionItemCard'
import { DeadlineLabel } from '@/components/ActionItemMeta'
import { ButtonLink } from '@/components/ButtonLink'
import { Initials, OwnerChip } from '@/components/OwnerChip'
import { SourceLink } from '@/components/SourceLink'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { TranscriptFocusContext, type TranscriptFocus } from '@/components/transcript-focus'
import { TranscriptView, type FocusRequest } from '@/components/TranscriptView'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirmMany } from '@/hooks/mutations'
import { useMeeting } from '@/hooks/queries'
import { api } from '@/lib/api'
import { downloadText, slugify } from '@/lib/download'
import { formatDate, formatDuration, formatTime } from '@/lib/format'
import type { ActionItem, MeetingDetail as Meeting, SummaryKind } from '@/lib/types'

const TABS = ['samenvatting', 'actiepunten', 'vergelijking'] as const
type Tab = (typeof TABS)[number]

export function MeetingDetail() {
  const meetingId = Number(useParams().meetingId)
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'samenvatting'
  const { data, isPending, isError, error, refetch } = useMeeting(meetingId)
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)

  // Deep link ?segment=<id> (bijv. vanuit de historie van een actiepunt)
  const segmentParam = params.get('segment')
  // Een ?segment in de URL is altijd de meest recente actie (klik in-pagina verwijdert hem).
  const activeFocus = segmentParam ? { segmentId: Number(segmentParam), nonce: 0 } : focusRequest

  const focusCtx = useMemo<TranscriptFocus | null>(() => {
    if (!data) return null
    const byId = new Map(data.segments.map((s) => [s.id, s]))
    return {
      meetingId: data.id,
      focus: (segmentId) => {
        setFocusRequest({ segmentId, nonce: Date.now() })
        if (params.has('segment')) {
          const next = new URLSearchParams(params)
          next.delete('segment')
          setParams(next, { replace: true })
        }
      },
      segment: (segmentId) => byId.get(segmentId),
    }
  }, [data, params, setParams])

  const setTab = (value: Tab) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    next.delete('segment')
    setParams(next, { replace: true })
  }

  if (isPending) return <MeetingSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  if (data.processing_state !== 'done') {
    return (
      <>
        <MeetingHeader meeting={data} />
        <EmptyState
          icon={data.processing_state === 'failed' ? AlertTriangle : Loader2}
          title={data.processing_state === 'failed' ? 'Verwerking mislukt' : 'Deze vergadering wordt nog verwerkt'}
          description={
            data.processing_state === 'failed'
              ? 'Er ging iets mis bij het verwerken van de opname. Probeer het opnieuw te uploaden.'
              : 'Transcript, samenvatting en actiepunten verschijnen hier zodra de verwerking klaar is.'
          }
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              Opnieuw controleren
            </Button>
          }
        />
      </>
    )
  }

  const pendingReview = data.action_items.filter((i) => i.status === 'voorgesteld').length

  return (
    <TranscriptFocusContext.Provider value={focusCtx}>
      <MeetingHeader meeting={data} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <TranscriptView
          segments={data.segments}
          focusRequest={activeFocus}
          className="h-[60vh] lg:sticky lg:top-20 lg:order-none lg:h-[calc(100dvh-7rem)]"
        />
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-w-0 gap-4">
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="samenvatting">
              <MessagesSquare /> Samenvatting
            </TabsTrigger>
            <TabsTrigger value="actiepunten">
              <ListChecks /> Actiepunten
              {pendingReview > 0 && (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground tabular-nums">
                  {pendingReview}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="vergelijking">
              <GitCompareArrows /> <span className="hidden sm:inline">Vergelijking</span>
              <span className="sm:hidden">Vergel.</span>
              {data.pending_suggestion_count > 0 && (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground tabular-nums">
                  {data.pending_suggestion_count}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="samenvatting">
            <SummaryTab meeting={data} />
          </TabsContent>
          <TabsContent value="actiepunten">
            <ActionItemsTab meeting={data} />
          </TabsContent>
          <TabsContent value="vergelijking">
            <EmptyState
              icon={GitCompareArrows}
              title="Vergelijking met vorige vergadering"
              description="Hier zie je straks per actiepunt de vorige status → de voorgestelde nieuwe status, met het citaat als bron. Wordt gebouwd in fase 3."
            />
          </TabsContent>
        </Tabs>
      </div>
    </TranscriptFocusContext.Provider>
  )
}

function MeetingHeader({ meeting }: { meeting: Meeting }) {
  const [exporting, setExporting] = useState(false)
  const exportMarkdown = async () => {
    setExporting(true)
    try {
      const text = await api.exportMeeting(meeting.id)
      downloadText(`${slugify(meeting.title)}.md`, text)
      toast.success('Export gedownload')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Exporteren mislukt')
    } finally {
      setExporting(false)
    }
  }
  return (
    <header className="mb-6">
      <nav aria-label="Kruimelpad" className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
        <Link to={`/projecten/${meeting.project_id}`} className="hover:text-foreground hover:underline">
          {meeting.project_name}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <Link to="/vergaderingen" className="hover:text-foreground hover:underline">
          Vergaderingen
        </Link>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden />
              {formatDate(meeting.date)}, {formatTime(meeting.date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              {formatDuration(meeting.duration_minutes)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" aria-hidden />
              <span className="flex -space-x-1.5">
                {meeting.participants.map((p) => (
                  <Tooltip key={p.id}>
                    <TooltipTrigger render={<span tabIndex={0} className="rounded-full ring-2 ring-background" />}>
                      <Initials name={p.name} color={p.color} />
                    </TooltipTrigger>
                    <TooltipContent>
                      {p.name} · {p.role}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </span>
              <span className="sr-only sm:not-sr-only">{meeting.participants.map((p) => p.name).join(', ')}</span>
            </span>
          </div>
        </div>
        <Button variant="outline" onClick={() => void exportMarkdown()} disabled={exporting || meeting.processing_state !== 'done'}>
          <Download /> Exporteren
        </Button>
      </div>
    </header>
  )
}

// ----------------------------------------------------------------------------- samenvatting

const SECTIONS: Array<{ key: SummaryKind | 'besluit'; title: string; icon: LucideIcon }> = [
  { key: 'onderwerp', title: 'Onderwerpen', icon: MessagesSquare },
  { key: 'besluit', title: 'Besluiten', icon: Gavel },
  { key: 'probleem', title: 'Problemen', icon: AlertTriangle },
  { key: 'idee', title: 'Ideeën', icon: Lightbulb },
  { key: 'afspraak', title: 'Afspraken', icon: Handshake },
  { key: 'deadline', title: 'Deadlines', icon: Flag },
]

function SummaryTab({ meeting }: { meeting: Meeting }) {
  const entries = (key: SummaryKind | 'besluit') =>
    key === 'besluit'
      ? meeting.decisions.map((d) => ({ id: `d${d.id}`, text: d.text, source: d.source_segment_id }))
      : meeting.summary_items.filter((i) => i.kind === key).map((i) => ({ id: `s${i.id}`, text: i.text, source: i.source_segment_id }))

  if (meeting.summary_items.length === 0 && meeting.decisions.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="Geen samenvatting"
        description="De AI heeft in dit transcript geen onderwerpen, besluiten of afspraken herkend."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {meeting.decisions.length} besluiten · {meeting.action_item_count} actiepunten ·{' '}
        {meeting.summary_items.filter((i) => i.kind === 'probleem').length} problemen. Klik op{' '}
        <span className="font-medium text-primary">Bron</span> om het fragment in het transcript te zien.
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {SECTIONS.map(({ key, title, icon: Icon }) => {
          const list = entries(key)
          if (list.length === 0) return null
          return (
            <section
              key={key}
              aria-labelledby={`sum-${key}`}
              className={key === 'besluit' ? 'rounded-xl border border-primary/25 bg-accent/40 p-4' : 'rounded-xl border bg-card p-4'}
            >
              <h3 id={`sum-${key}`} className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {title}
                <span className="text-xs font-normal text-muted-foreground">({list.length})</span>
              </h3>
              <ul className="space-y-2.5">
                {list.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 text-sm leading-snug">
                    <span>{e.text}</span>
                    <SourceLink segmentId={e.source} className="-mt-0.5 shrink-0" />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------- actiepunten (review)

function ActionItemsTab({ meeting }: { meeting: Meeting }) {
  const [confirmAllOpen, setConfirmAllOpen] = useState(false)
  const confirmMany = useConfirmMany()
  const pending = meeting.action_items.filter((i) => i.status === 'voorgesteld')
  const processed = meeting.action_items.filter((i) => i.status !== 'voorgesteld')
  const incomplete = pending.filter((i) => !i.owner || !i.deadline)

  if (meeting.action_items.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Geen actiepunten herkend"
        description="In deze vergadering zijn geen nieuwe taken afgesproken. Bekijk de vergelijking voor de voortgang van eerdere actiepunten."
      />
    )
  }

  const confirmAll = () => {
    confirmMany.mutate(pending, { onSettled: () => setConfirmAllOpen(false) })
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="review-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="review-heading" className="text-sm font-semibold">
              Te reviewen <span className="font-normal text-muted-foreground">({pending.length})</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Door de AI voorgesteld. Pas een punt pas toe na jouw bevestiging.
            </p>
          </div>
          {pending.length > 0 && (
            <Button onClick={() => (incomplete.length ? setConfirmAllOpen(true) : confirmAll())} disabled={confirmMany.isPending}>
              <CheckCheck /> Alles bevestigen
            </Button>
          )}
        </div>
        {pending.length === 0 ? (
          <EmptyState
            icon={CheckCheck}
            title="Alles is gereviewd"
            description="Alle voorgestelde actiepunten van deze vergadering zijn bevestigd of verworpen."
            action={
              meeting.pending_suggestion_count > 0 ? (
                <ButtonLink to={`?tab=vergelijking`} variant="outline">
                  <GitCompareArrows /> Naar de vergelijking
                </ButtonLink>
              ) : undefined
            }
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {pending.map((item) => (
              <ActionItemCard key={item.id} item={item} participants={meeting.project_participants} />
            ))}
          </div>
        )}
      </section>

      {processed.length > 0 && (
        <section aria-labelledby="processed-heading" className="space-y-2">
          <h2 id="processed-heading" className="text-sm font-semibold">
            Verwerkt <span className="font-normal text-muted-foreground">({processed.length})</span>
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {processed.map((item) => (
              <ProcessedRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      <Dialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alles bevestigen?</DialogTitle>
            <DialogDescription>
              {incomplete.length === 1 ? '1 actiepunt mist' : `${incomplete.length} actiepunten missen`} nog een eigenaar of deadline.
              Je kunt ze ook eerst aanvullen.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {incomplete.map((i) => (
              <li key={i.id} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-uitgesteld" aria-hidden />
                <span>
                  {i.title}{' '}
                  <span className="text-muted-foreground">
                    ({[!i.owner && 'geen eigenaar', !i.deadline && 'geen deadline'].filter(Boolean).join(', ')})
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAllOpen(false)}>
              Eerst aanvullen
            </Button>
            <Button onClick={confirmAll} disabled={confirmMany.isPending}>
              Toch alles bevestigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProcessedRow({ item }: { item: ActionItem }) {
  const [params] = useSearchParams()
  const next = new URLSearchParams(params)
  next.set('item', String(item.id))
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <Link to={`?${next.toString()}`} className="min-w-0 flex-1 basis-56 text-sm font-medium hover:underline">
        {item.title}
      </Link>
      <OwnerChip owner={item.owner} />
      <DeadlineLabel item={item} />
      <SourceLink segmentId={item.source_segment_id} />
      <StatusBadge status={item.status} postponeCount={item.postpone_count} />
    </li>
  )
}

function MeetingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Vergadering wordt geladen">
      <Skeleton className="mb-2 h-4 w-48" />
      <Skeleton className="mb-3 h-8 w-80" />
      <Skeleton className="mb-6 h-4 w-96" />
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <CardSkeleton lines={10} />
        <div className="space-y-4">
          <Skeleton className="h-8 w-80" />
          <CardSkeleton lines={4} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </div>
  )
}
