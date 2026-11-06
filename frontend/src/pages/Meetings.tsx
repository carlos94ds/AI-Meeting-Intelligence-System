import { CalendarDays, Plus } from 'lucide-react'
import { ButtonLink } from '@/components/ButtonLink'
import { MeetingList } from '@/components/MeetingList'
import { PageHeader } from '@/components/PageHeader'
import { useProjectScope } from '@/components/project-scope'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/States'
import { useMeetings } from '@/hooks/queries'
import type { MeetingSummary } from '@/lib/types'

const monthFmt = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' })

function groupByMonth(meetings: MeetingSummary[]): Array<[string, MeetingSummary[]]> {
  const groups = new Map<string, MeetingSummary[]>()
  for (const m of meetings) {
    const label = monthFmt.format(new Date(m.date))
    groups.set(label, [...(groups.get(label) ?? []), m])
  }
  return [...groups.entries()]
}

export function Meetings() {
  const { projectId } = useProjectScope()
  const { data, isPending, isError, error, refetch } = useMeetings(projectId)

  return (
    <>
      <PageHeader
        title="Vergaderingen"
        description="Alle vergaderingen met transcript, samenvatting en actiepunten."
        actions={
          <ButtonLink to="/vergaderingen/nieuw">
            <Plus /> Vergadering toevoegen
          </ButtonLink>
        }
      />
      {isPending ? (
        <CardSkeleton lines={6} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nog geen vergaderingen"
          description="Upload een opname. De AI maakt er een transcript, samenvatting en voorgestelde actiepunten van."
          action={<ButtonLink to="/vergaderingen/nieuw">Vergadering toevoegen</ButtonLink>}
        />
      ) : (
        <div className="space-y-6">
          {groupByMonth(data).map(([month, list]) => (
            <section key={month} aria-label={month} className="rounded-xl border bg-card px-4 py-3">
              <h2 className="mb-1 px-0 pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{month}</h2>
              <MeetingList meetings={list} showProject={projectId === undefined} />
            </section>
          ))}
        </div>
      )}
    </>
  )
}
