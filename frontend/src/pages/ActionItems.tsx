import { AlertTriangle, ArrowDown, ArrowUp, Columns3, FilterX, ListChecks, Repeat, Rows3, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DeadlineLabel } from '@/components/ActionItemMeta'
import { Initials, OwnerChip } from '@/components/OwnerChip'
import { PageHeader } from '@/components/PageHeader'
import { useProjectScope } from '@/components/project-scope'
import { SourceLink } from '@/components/SourceLink'
import { EmptyState, ErrorState } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useActionItems, useParticipants, useProject, useProjects } from '@/hooks/queries'
import { formatShortDate } from '@/lib/format'
import { STATUS_META, STATUS_ORDER } from '@/lib/status'
import type { ActionItem, ActionStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const ALL = 'alle'
type View = 'tabel' | 'kanban'
type SortKey = 'deadline' | 'status' | 'titel'

export function ActionItems() {
  const [params, setParams] = useSearchParams()
  const { projectId, setProjectId } = useProjectScope()
  const { data: projects } = useProjects()
  const { data: project } = useProject(projectId)
  const { data: participants } = useParticipants()
  const { data, isPending, isError, error, refetch } = useActionItems({ project_id: projectId })

  const view: View = params.get('weergave') === 'kanban' ? 'kanban' : 'tabel'
  const statusKey = params.getAll('status').join(',')
  const statuses = useMemo(() => (statusKey ? (statusKey.split(',') as ActionStatus[]) : []), [statusKey])
  const owner = params.get('eigenaar') ?? ALL
  const goal = params.get('doel') ?? ALL
  const overdueOnly = params.get('achterstallig') === '1'
  const q = params.get('q') ?? ''
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'deadline', dir: 1 })

  const update = (changes: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      next.delete(k)
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x))
      else if (v !== null && v !== '' && v !== ALL) next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  const toggleStatus = (s: ActionStatus) =>
    update({ status: statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s] })

  const openItem = (id: number) => update({ item: String(id) })

  // Alle filters behalve status, zodat de tellers per status kloppen
  const baseFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data ?? []).filter(
      (i) =>
        (owner === ALL || String(i.owner?.id ?? 'geen') === owner) &&
        (goal === ALL || String(i.goal_id) === goal) &&
        (!overdueOnly || i.is_overdue) &&
        (!needle || i.title.toLowerCase().includes(needle) || i.project_name.toLowerCase().includes(needle)),
    )
  }, [data, owner, goal, overdueOnly, q])

  const filtered = useMemo(() => {
    const list = statuses.length ? baseFiltered.filter((i) => statuses.includes(i.status)) : baseFiltered
    const cmp = (a: ActionItem, b: ActionItem): number => {
      if (sort.key === 'titel') return a.title.localeCompare(b.title, 'nl')
      if (sort.key === 'status') return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')
    }
    return [...list].sort((a, b) => cmp(a, b) * sort.dir)
  }, [baseFiltered, statuses, sort])

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ActionStatus, number>
    for (const i of baseFiltered) c[i.status] += 1
    return c
  }, [baseFiltered])

  const hasFilters = statuses.length > 0 || owner !== ALL || goal !== ALL || overdueOnly || q !== ''
  const clearFilters = () => update({ status: [], eigenaar: null, doel: null, achterstallig: null, q: null })

  const projectItems: Record<string, string> = { [ALL]: 'Alle projecten' }
  for (const p of projects ?? []) projectItems[String(p.id)] = p.name
  const ownerItems: Record<string, string> = { [ALL]: 'Alle eigenaren', geen: 'Geen eigenaar' }
  for (const p of (project?.participants ?? participants) ?? []) ownerItems[String(p.id)] = p.name
  const goalItems: Record<string, string> = { [ALL]: 'Alle doelen' }
  for (const g of project?.goals ?? []) goalItems[String(g.id)] = g.title

  return (
    <>
      <PageHeader
        title="Actiepunten"
        description="Alle taken over alle projecten. Klik op een actiepunt voor de volledige historie."
        actions={
          <div role="group" aria-label="Weergave" className="inline-flex rounded-lg border p-0.5">
            <Button variant={view === 'tabel' ? 'secondary' : 'ghost'} size="sm" aria-pressed={view === 'tabel'} onClick={() => update({ weergave: null })}>
              <Rows3 /> Tabel
            </Button>
            <Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="sm" aria-pressed={view === 'kanban'} onClick={() => update({ weergave: 'kanban' })}>
              <Columns3 /> Kanban
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => update({ q: e.target.value })} placeholder="Zoeken…" aria-label="Zoek in actiepunten" className="pl-8" />
        </div>
        <FilterSelect label="Project" items={projectItems} value={projectId === undefined ? ALL : String(projectId)} onChange={(v) => { setProjectId(v === ALL ? undefined : Number(v)); update({ doel: null, eigenaar: null }) }} />
        <FilterSelect label="Eigenaar" items={ownerItems} value={owner} onChange={(v) => update({ eigenaar: v })} />
        {projectId !== undefined && <FilterSelect label="Doel" items={goalItems} value={goal} onChange={(v) => update({ doel: v })} />}
        <Button variant={overdueOnly ? 'secondary' : 'outline'} aria-pressed={overdueOnly} onClick={() => update({ achterstallig: overdueOnly ? null : '1' })}>
          <AlertTriangle /> Achterstallig
        </Button>
        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            <FilterX /> Filters wissen
          </Button>
        )}
      </div>

      <div role="group" aria-label="Filter op status" className="mb-5 flex flex-wrap gap-1.5">
        {STATUS_ORDER.map((s) => {
          const active = statuses.includes(s)
          const Icon = STATUS_META[s].icon
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => toggleStatus(s)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? STATUS_META[s].className.replace('line-through', '') : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {STATUS_META[s].label}
              <span className="tabular-nums opacity-70">{counts[s]}</span>
            </button>
          )
        })}
      </div>

      {isPending ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtered.length === 0 && view === 'tabel' ? (
        <EmptyState
          icon={ListChecks}
          title={hasFilters ? 'Geen actiepunten gevonden' : 'Nog geen actiepunten'}
          description={
            hasFilters
              ? 'Er zijn geen actiepunten die aan deze filters voldoen.'
              : 'Actiepunten ontstaan automatisch uit vergaderingen. Voeg een vergadering toe om te beginnen.'
          }
          action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Filters wissen</Button> : undefined}
        />
      ) : view === 'tabel' ? (
        <ActionTable items={filtered} sort={sort} onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))} onOpen={openItem} />
      ) : (
        <Kanban items={filtered} visible={statuses.length ? statuses : STATUS_ORDER} onOpen={openItem} />
      )}
    </>
  )
}

function FilterSelect({ label, items, value, onChange }: { label: string; items: Record<string, string>; value: string; onChange: (v: string) => void }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(v ?? ALL)}>
      <SelectTrigger aria-label={label} className="min-w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SortHeader({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k
  return (
    <TableHead aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={className}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        {label}
        {active && (sort.dir === 1 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />)}
      </button>
    </TableHead>
  )
}

function ActionTable({ items, sort, onSort, onOpen }: { items: ActionItem[]; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; onOpen: (id: number) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortHeader label="Actiepunt" k="titel" sort={sort} onSort={onSort} className="pl-4" />
            <TableHead className="hidden md:table-cell">Eigenaar</TableHead>
            <SortHeader label="Deadline" k="deadline" sort={sort} onSort={onSort} />
            <SortHeader label="Status" k="status" sort={sort} onSort={onSort} />
            <TableHead className="hidden pr-4 lg:table-cell">Bron</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className="cursor-pointer" onClick={() => onOpen(item.id)}>
              <TableCell className="max-w-0 min-w-56 pl-4 whitespace-normal">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(item.id)
                  }}
                  className={cn('text-left font-medium outline-none hover:underline focus-visible:underline', item.status === 'vervallen' && 'text-muted-foreground line-through')}
                >
                  {item.title}
                </button>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.project_name}
                  {item.goal_title && ` · ${item.goal_title}`}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <OwnerChip owner={item.owner} />
              </TableCell>
              <TableCell>
                <DeadlineLabel item={item} />
              </TableCell>
              <TableCell>
                <StatusBadge status={item.status} postponeCount={item.postpone_count} />
              </TableCell>
              <TableCell className="hidden pr-4 lg:table-cell" onClick={(e) => e.stopPropagation()}>
                <SourceLink segmentId={item.source_segment_id} meetingId={item.source_meeting_id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Kanban({ items, visible, onOpen }: { items: ActionItem[]; visible: ActionStatus[]; onOpen: (id: number) => void }) {
  const columns = STATUS_ORDER.filter((s) => visible.includes(s))
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
      <div className="grid min-w-max auto-cols-[minmax(13.5rem,1fr)] grid-flow-col gap-3">
        {columns.map((status) => {
          const meta = STATUS_META[status]
          const Icon = meta.icon
          const list = items.filter((i) => i.status === status)
          return (
            <section key={status} aria-label={`${meta.label}: ${list.length}`} className="flex flex-col rounded-xl bg-muted/50 p-2">
              <header className="flex items-center justify-between px-1.5 pt-1 pb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                  <Icon className={cn('size-3.5', meta.className.split(' ').find((c) => c.startsWith('text-')))} aria-hidden />
                  {meta.label}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{list.length}</span>
              </header>
              <ul className="space-y-2">
                {list.length === 0 && <li className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Leeg</li>}
                {list.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(item.id)}
                      className={cn(
                        'w-full rounded-lg border bg-card p-3 text-left shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring',
                        status === 'voorgesteld' && 'border-dashed',
                      )}
                    >
                      <div className={cn('text-sm leading-snug font-medium', status === 'vervallen' && 'text-muted-foreground line-through')}>{item.title}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{item.project_name}</div>
                      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                        {item.owner ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Initials name={item.owner.name} color={item.owner.color} className="size-5 text-[10px]" />
                            {item.owner.name}
                          </span>
                        ) : (
                          <span className="text-status-uitgesteld">Geen eigenaar</span>
                        )}
                        <span className={cn('tabular-nums', item.is_overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                          {item.deadline ? formatShortDate(item.deadline) : 'geen deadline'}
                        </span>
                      </div>
                      {item.postpone_count > 0 && status !== 'afgerond' && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-status-uitgesteld-bg px-1.5 py-0.5 text-[11px] font-medium text-status-uitgesteld">
                          <Repeat className="size-3" aria-hidden /> {item.postpone_count}× uitgesteld
                        </div>
                      )}
                    </button>
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
