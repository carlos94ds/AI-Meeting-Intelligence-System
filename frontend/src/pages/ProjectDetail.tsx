import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Hand,
  LayoutGrid,
  LineChart,
  ListChecks,
  NotebookPen,
  Repeat,
  Target,
} from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { MeetingList } from '@/components/MeetingList'
import { OwnerChip } from '@/components/OwnerChip'
import { PreparationPanel } from '@/components/PreparationPanel'
import { ProgressBar } from '@/components/ProgressBar'
import { ProgressChart } from '@/components/ProgressChart'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useProject } from '@/hooks/queries'
import { formatDate, formatShortDate, formatWeekday, percent, relativeDays } from '@/lib/format'
import type { ProjectDetail as Project } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ActionItemsBrowser } from './ActionItems'

const TABS = ['overzicht', 'vergaderingen', 'actiepunten', 'voortgang', 'voorbereiding'] as const
type Tab = (typeof TABS)[number]

export function ProjectDetail() {
  const projectId = Number(useParams().projectId)
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'overzicht'
  const { data, isPending, isError, error, refetch } = useProject(projectId)

  // Bij wisselen van tab alleen de tab bewaren (filters horen bij één tab)
  const setTab = (value: Tab) => setParams(value === 'overzicht' ? {} : { tab: value }, { replace: true })

  if (isPending) {
    return (
      <div aria-busy="true">
        <Skeleton className="mb-2 h-4 w-24" />
        <Skeleton className="mb-6 h-8 w-96" />
        <CardSkeleton lines={6} />
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  return (
    <>
      <header className="mb-6">
        <nav aria-label="Kruimelpad" className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/projecten" className="hover:text-foreground hover:underline">
            Projecten
          </Link>
          <ChevronRight className="size-3.5" aria-hidden />
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{data.description}</p>
          </div>
          <div className="w-full max-w-64">
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-muted-foreground">Afgerond</span>
              <span className="font-semibold tabular-nums">
                {percent(data.progress)} <span className="text-xs font-normal text-muted-foreground">({data.done_count}/{data.total})</span>
              </span>
            </div>
            <ProgressBar value={data.progress} label={`${percent(data.progress)} afgerond`} />
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-5">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList>
            <TabsTrigger value="overzicht">
              <LayoutGrid /> Overzicht
            </TabsTrigger>
            <TabsTrigger value="vergaderingen">
              <CalendarDays /> Vergaderingen
            </TabsTrigger>
            <TabsTrigger value="actiepunten">
              <ListChecks /> Actiepunten
            </TabsTrigger>
            <TabsTrigger value="voortgang">
              <LineChart /> Voortgang
            </TabsTrigger>
            <TabsTrigger value="voorbereiding">
              <NotebookPen /> Voorbereiding
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overzicht">
          <OverviewTab project={data} />
        </TabsContent>
        <TabsContent value="vergaderingen">
          {data.meetings.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nog geen vergaderingen" description="Voeg een vergadering toe om te beginnen." />
          ) : (
            <div className="rounded-xl border bg-card px-4 py-2">
              <MeetingList meetings={data.meetings} showProject={false} />
            </div>
          )}
        </TabsContent>
        <TabsContent value="actiepunten">
          <ActionItemsBrowser projectId={projectId} />
        </TabsContent>
        <TabsContent value="voortgang">
          <ProgressTab project={data} />
        </TabsContent>
        <TabsContent value="voorbereiding">
          <PreparationPanel projectId={projectId} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function OverviewTab({ project }: { project: Project }) {
  const k = project.kpis
  const stats = [
    { label: 'Open', value: k.open, icon: CircleDot, tone: 'text-status-open' },
    { label: 'Wacht op bevestiging', value: k.awaiting_confirmation, icon: Hand, tone: 'text-status-gemeld' },
    { label: 'Achterstallig', value: k.overdue, icon: AlertTriangle, tone: 'text-destructive' },
    { label: 'Herhaald uitgesteld', value: k.repeatedly_postponed, icon: Repeat, tone: 'text-status-uitgesteld' },
  ]
  const timeline = [...project.meetings].reverse()

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <dt className="flex items-center justify-between text-xs text-muted-foreground">
              {label} <Icon className={cn('size-4', tone)} aria-hidden />
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="goals" className="rounded-xl border bg-card p-5">
          <h2 id="goals" className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Target className="size-4 text-muted-foreground" aria-hidden /> Doelstellingen
          </h2>
          {project.goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen doelstellingen.</p>
          ) : (
            <ul className="space-y-5">
              {project.goals.map((g) => (
                <li key={g.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <Link to={`?tab=actiepunten&doel=${g.id}`} className="text-sm font-medium hover:underline">
                      {g.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {g.total === 0 ? 'geen punten' : `${g.done} van ${g.total} afgerond`}
                    </span>
                  </div>
                  <ProgressBar value={g.progress} label={`${g.title}: ${percent(g.progress)} afgerond`} />
                  {g.description && <p className="mt-1.5 text-xs text-muted-foreground">{g.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="timeline" className="rounded-xl border bg-card p-5">
          <h2 id="timeline" className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Tijdlijn
          </h2>
          <ol className="relative ml-2 space-y-5 border-l pl-6">
            {timeline.map((m) => (
              <li key={m.id} className="relative">
                <span className="absolute top-1 -left-[31px] size-2.5 rounded-full bg-primary ring-4 ring-card" aria-hidden />
                <Link to={`/vergaderingen/${m.id}`} className="text-sm font-medium hover:underline">
                  {m.title}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {formatDate(m.date)} · {m.action_item_count} actiepunten
                  {m.pending_review_count + m.pending_suggestion_count > 0 && (
                    <span className="ml-1 font-medium text-primary">· {m.pending_review_count + m.pending_suggestion_count} te beoordelen</span>
                  )}
                </div>
              </li>
            ))}
            {project.next_meeting_date && (
              <li className="relative">
                <span className="absolute top-1 -left-[31px] size-2.5 rounded-full border-2 border-dashed border-primary bg-card ring-4 ring-card" aria-hidden />
                <Link to="?tab=voorbereiding" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  <CalendarClock className="size-4" aria-hidden /> Volgende vergadering
                </Link>
                <div className="text-xs text-muted-foreground">
                  {formatWeekday(project.next_meeting_date)} · {relativeDays(project.next_meeting_date)}
                </div>
              </li>
            )}
          </ol>
        </section>
      </div>
    </div>
  )
}

function ProgressTab({ project }: { project: Project }) {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {project.progress_per_meeting.length === 0 ? (
        <EmptyState icon={LineChart} title="Nog geen voortgang" description="Na de eerste vergadering verschijnt hier de grafiek." />
      ) : (
        <ProgressChart points={project.progress_per_meeting} />
      )}
      <section aria-labelledby="postponed" className="rounded-xl border bg-card p-4">
        <h2 id="postponed" className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Repeat className="size-4 text-status-uitgesteld" aria-hidden /> Herhaald uitgesteld
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">Taken die vaker dan de ingestelde grens zijn uitgesteld. Dit volgt de taak, niet de persoon.</p>
        {project.repeatedly_postponed.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-4 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-status-afgerond" aria-hidden /> Geen taken die herhaald zijn uitgesteld.
          </div>
        ) : (
          <ul className="divide-y">
            {project.repeatedly_postponed.map((item) => (
              <li key={item.id} className="py-3">
                <Link to={`?tab=voortgang&item=${item.id}`} className="text-sm font-medium hover:underline">
                  {item.title}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  <OwnerChip owner={item.owner} className="text-xs" />
                  {item.original_deadline && item.deadline && (
                    <span>
                      {formatShortDate(item.original_deadline)} → <span className="font-medium text-foreground">{formatShortDate(item.deadline)}</span>
                    </span>
                  )}
                  <StatusBadge status={item.status} postponeCount={item.postpone_count} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
