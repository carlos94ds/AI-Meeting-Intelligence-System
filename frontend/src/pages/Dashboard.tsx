import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock4,
  GitCompareArrows,
  Hand,
  ListChecks,
  NotebookPen,
  Repeat,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ButtonLink } from '@/components/ButtonLink'
import { MeetingList } from '@/components/MeetingList'
import { OwnerChip } from '@/components/OwnerChip'
import { PageHeader } from '@/components/PageHeader'
import { useProjectScope } from '@/components/project-scope'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboard, useSettings } from '@/hooks/queries'
import { capitalize, formatDate, formatShortDate, formatWeekday, relativeDays } from '@/lib/format'
import type { ActionItem, Dashboard as DashboardData, MeetingSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 12) return 'Goedemorgen'
  if (h < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

export function Dashboard() {
  const { projectId } = useProjectScope()
  const { data, isPending, isError, error, refetch } = useDashboard(projectId)
  const { data: settings } = useSettings()
  const [now] = useState(() => new Date())

  return (
    <>
      <PageHeader
        title={`${greeting(now)}${settings ? `, ${settings.current_user}` : ''}`}
        description={`${capitalize(formatWeekday(now))}. Wat vraagt vandaag om een beslissing?`}
      />
      {isPending ? (
        <DashboardSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <DashboardContent data={data} />
      )}
    </>
  )
}

function DashboardContent({ data }: { data: DashboardData }) {
  const { kpis, quick_links: q } = data
  return (
    <div className="space-y-8">
      {/* De drie kernfuncties: binnen één klik bereikbaar */}
      <section aria-label="Snel naar" className="grid gap-3 xl:grid-cols-3">
        <QuickAction
          to={q.review_meeting_id ? `/vergaderingen/${q.review_meeting_id}?tab=actiepunten` : '/vergaderingen'}
          icon={ListChecks}
          title="Actiepunten reviewen"
          detail={q.review_count ? `${q.review_count} voorgesteld door AI` : 'Niets te reviewen'}
          highlight={q.review_count > 0}
        />
        <QuickAction
          to={q.comparison_meeting_id ? `/vergaderingen/${q.comparison_meeting_id}?tab=vergelijking` : '/vergaderingen'}
          icon={GitCompareArrows}
          title="Vergelijking met vorige vergadering"
          detail={q.suggestion_count ? `${q.suggestion_count} statuswijziging(en) te beoordelen` : 'Alles beoordeeld'}
          highlight={q.suggestion_count > 0}
        />
        <QuickAction
          to={q.preparation_project_id ? `/projecten/${q.preparation_project_id}?tab=voorbereiding` : '/projecten'}
          icon={NotebookPen}
          title="Volgende vergadering voorbereiden"
          detail={
            data.next_meeting?.date
              ? `${formatShortDate(data.next_meeting.date)} · ${data.next_meeting.question_count} vragen klaar`
              : 'Geen vergadering gepland'
          }
        />
      </section>

      <section aria-label="Kerncijfers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Open actiepunten" value={kpis.open} icon={CircleDot} tone="text-status-open" to="/actiepunten?status=open&status=uitgesteld" />
        <KpiCard
          label="Wacht op bevestiging"
          value={kpis.awaiting_confirmation}
          icon={Hand}
          tone="text-status-gemeld"
          hint={kpis.to_review ? `+ ${kpis.to_review} voorgesteld` : undefined}
          to="/actiepunten?status=gemeld_afgerond"
        />
        <KpiCard label="Achterstallig" value={kpis.overdue} icon={AlertTriangle} tone="text-destructive" to="/actiepunten?achterstallig=1" />
        <KpiCard label="Herhaald uitgesteld" value={kpis.repeatedly_postponed} icon={Repeat} tone="text-status-uitgesteld" to="/actiepunten?status=uitgesteld" />
        <KpiCard label="Afgerond deze week" value={kpis.completed_this_week} icon={CheckCircle2} tone="text-status-afgerond" to="/actiepunten?status=afgerond" />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <AttentionCard items={data.attention} />
        <NextMeetingCard data={data} />
      </div>

      <RecentMeetings meetings={data.recent_meetings} />
    </div>
  )
}

function QuickAction(props: { to: string; icon: LucideIcon; title: string; detail: string; highlight?: boolean }) {
  const Icon = props.icon
  return (
    <Link
      to={props.to}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{props.title}</span>
        <span className={cn('block truncate text-xs', props.highlight ? 'font-medium text-primary' : 'text-muted-foreground')}>
          {props.detail}
        </span>
      </span>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

function KpiCard(props: { label: string; value: number; icon: LucideIcon; tone: string; hint?: string; to: string }) {
  const Icon = props.icon
  return (
    <Link
      to={props.to}
      className="rounded-xl border bg-card p-4 transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{props.label}</span>
        <Icon className={cn('size-4', props.tone)} aria-hidden />
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{props.value}</div>
      <div className="mt-0.5 h-4 text-xs text-muted-foreground">{props.hint}</div>
    </Link>
  )
}

function SectionCard({ title, icon: Icon, action, children, className }: {
  title: string
  icon: LucideIcon
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function AttentionCard({ items }: { items: ActionItem[] }) {
  return (
    <SectionCard title="Vraagt aandacht" icon={AlertTriangle} className="xl:col-span-2">
      {items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Niets dat aandacht vraagt"
          description="Geen actiepunten die herhaald zijn uitgesteld of over de deadline zijn."
          className="py-8"
        />
      ) : (
        <ul className="-mx-2 divide-y">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`?item=${item.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-3 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{item.project_name}</span>
                    {item.deadline && (
                      <>
                        <span aria-hidden>·</span>
                        <span className={cn(item.is_overdue && 'font-medium text-destructive')}>
                          {item.is_overdue ? 'Deadline verstreken: ' : 'Deadline: '}
                          {formatDate(item.deadline)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <OwnerChip owner={item.owner} />
                <div className="flex items-center gap-2">
                  {item.is_overdue && (
                    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 text-xs font-medium text-destructive">
                      <Clock4 className="size-3.5" aria-hidden /> Te laat
                    </span>
                  )}
                  <StatusBadge status={item.status} postponeCount={item.postpone_count} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function NextMeetingCard({ data }: { data: DashboardData }) {
  const next = data.next_meeting
  return (
    <SectionCard title="Volgende vergadering" icon={CalendarClock}>
      {!next || !next.date ? (
        <EmptyState
          icon={CalendarDays}
          title="Geen vergadering gepland"
          description="Plan de volgende vergadering in de voorbereiding van een project."
          className="py-8"
        />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-lg font-semibold">{capitalize(formatWeekday(next.date))}</div>
            <div className="text-sm text-muted-foreground">
              {next.project_name} · {relativeDays(next.date)}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Belangrijkste vragen</div>
            {next.top_questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen voorgestelde vragen.</p>
            ) : (
              <ol className="space-y-3">
                {next.top_questions.map((q, i) => (
                  <li key={q.id} className="flex gap-2.5 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="leading-snug">{q.text}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{q.reason}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <ButtonLink to={`/projecten/${next.project_id}?tab=voorbereiding`} className="w-full" size="lg">
            Voorbereiding openen <ArrowRight />
          </ButtonLink>
        </div>
      )}
    </SectionCard>
  )
}

function RecentMeetings({ meetings }: { meetings: MeetingSummary[] }) {
  return (
    <SectionCard
      title="Recente vergaderingen"
      icon={CalendarDays}
      action={
        <Link to="/vergaderingen" className="text-sm font-medium text-primary hover:underline">
          Alle vergaderingen
        </Link>
      }
    >
      {meetings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nog geen vergaderingen"
          description="Voeg een opname toe; de AI maakt er een samenvatting en actiepunten van."
          action={<ButtonLink to="/vergaderingen/nieuw">Vergadering toevoegen</ButtonLink>}
          className="py-8"
        />
      ) : (
        <MeetingList meetings={meetings} />
      )}
    </SectionCard>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Dashboard wordt geladen">
      <div className="grid gap-3 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[106px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <CardSkeleton lines={5} className="xl:col-span-2" />
        <CardSkeleton lines={5} />
      </div>
    </div>
  )
}
