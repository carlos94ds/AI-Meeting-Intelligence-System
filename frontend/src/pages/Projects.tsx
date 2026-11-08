import { CalendarClock, CalendarDays, FolderKanban, ListChecks } from 'lucide-react'
import { Link } from 'react-router-dom'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import { Initials } from '@/components/OwnerChip'
import { PageHeader } from '@/components/PageHeader'
import { ProgressBar } from '@/components/ProgressBar'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/States'
import { useProjects } from '@/hooks/queries'
import { formatDate, percent, relativeDays } from '@/lib/format'

export function Projects() {
  const { data, isPending, isError, error, refetch } = useProjects()
  return (
    <>
      <PageHeader title="Projecten" description="Voortgang per project, op basis van bevestigde actiepunten." actions={<NewProjectDialog />} />
      {isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={4} />
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Nog geen projecten" description="Maak een project aan om vergaderingen en actiepunten te bundelen." action={<NewProjectDialog />} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projecten/${p.id}`}
                className="flex h-full flex-col rounded-xl border bg-card p-5 transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <h2 className="font-semibold">{p.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                <div className="mt-5">
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">Afgerond</span>
                    <span className="font-semibold tabular-nums">
                      {percent(p.progress)}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({p.done_count} van {p.total})
                      </span>
                    </span>
                  </div>
                  <ProgressBar value={p.progress} label={`${p.name}: ${percent(p.progress)} afgerond`} />
                </div>
                <dl className="mt-5 mb-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ListChecks className="size-3.5" aria-hidden /> Open punten
                    </dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{p.open_count}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="size-3.5" aria-hidden /> Laatste vergadering
                    </dt>
                    <dd className="mt-0.5 font-medium">{p.last_meeting_date ? formatDate(p.last_meeting_date) : '—'}</dd>
                  </div>
                </dl>
                <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                  <span className="flex -space-x-1.5">
                    {p.participants.map((pp) => (
                      <Initials key={pp.id} name={pp.name} color={pp.color} className="ring-2 ring-card" />
                    ))}
                  </span>
                  {p.next_meeting_date && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3.5" aria-hidden /> Volgende: {relativeDays(p.next_meeting_date)}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
