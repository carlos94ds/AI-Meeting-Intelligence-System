import { ArrowRight, Bot, CalendarDays, UserCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SourceLink } from '@/components/SourceLink'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate, formatShortDate, formatTime } from '@/lib/format'

import type { StatusChange } from '@/lib/types'
import { cn } from '@/lib/utils'

function describe(c: StatusChange): string {
  if (c.from_status === null) return 'Door AI herkend in het transcript'
  if (c.origin === 'ai') {
    if (c.state === 'pending') return 'AI-voorstel – wacht op beoordeling'
    if (c.state === 'rejected') return `AI-voorstel afgewezen${c.actor && c.actor !== 'AI' ? ` door ${c.actor}` : ''}`
    return `AI-voorstel, akkoord door ${c.actor ?? 'onbekend'}`
  }
  if (c.to_status === 'afgerond') return `Afronding bevestigd door ${c.actor ?? 'onbekend'}`
  if (c.from_status === 'voorgesteld' && c.to_status === 'open') return `Bevestigd door ${c.actor ?? 'onbekend'}`
  return `Gewijzigd door ${c.actor ?? 'onbekend'}`
}

interface Group {
  key: string
  meetingId: number | null
  title: string
  date: string | null
  changes: StatusChange[]
}

function groupByMeeting(changes: StatusChange[]): Group[] {
  const groups: Group[] = []
  for (const c of changes) {
    const key = c.meeting_id === null ? `los-${c.id}` : `m-${c.meeting_id}`
    const last = groups.at(-1)
    if (last && c.meeting_id !== null && last.meetingId === c.meeting_id) last.changes.push(c)
    else
      groups.push({
        key,
        meetingId: c.meeting_id,
        title: c.meeting_title ?? 'Buiten een vergadering',
        date: c.meeting_date ?? c.created_at,
        changes: [c],
      })
  }
  return groups
}

export function HistoryTimeline({ changes }: { changes: StatusChange[] }) {
  if (changes.length === 0) return <p className="text-sm text-muted-foreground">Nog geen historie.</p>
  return (
    <ol className="space-y-5">
      {groupByMeeting(changes).map((group) => (
        <li key={group.key}>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden />
            {group.meetingId ? (
              <Link to={`/vergaderingen/${group.meetingId}`} className="text-foreground hover:underline">
                {group.title}
              </Link>
            ) : (
              <span>{group.title}</span>
            )}
            {group.date && <span>· {formatShortDate(group.date)}</span>}
          </div>
          <ol className="relative ml-1.5 space-y-4 border-l pl-5">
            {group.changes.map((c) => {
              const Icon = c.origin === 'ai' ? Bot : UserCheck
              const pending = c.state === 'pending'
              const rejected = c.state === 'rejected'
              return (
                <li key={c.id} className={cn('relative', rejected && 'opacity-70')}>
                  <span
                    className={cn(
                      'absolute top-0.5 -left-[29px] flex size-[18px] items-center justify-center rounded-full border bg-background',
                      pending && 'border-dashed border-primary',
                    )}
                    aria-hidden
                  >
                    <Icon className="size-3 text-muted-foreground" />
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.from_status && (
                      <>
                        <StatusBadge status={c.from_status} size="sm" withTooltip={false} />
                        <ArrowRight className="size-3.5 text-muted-foreground" aria-label="naar" />
                      </>
                    )}
                    <StatusBadge status={c.to_status} size="sm" withTooltip={false} />
                    {pending && (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">
                        Te beoordelen
                      </span>
                    )}
                    {rejected && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Afgewezen</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm">
                    {describe(c)}
                    <span className="text-muted-foreground">
                      {' '}
                      · {formatShortDate(c.decided_at ?? c.created_at)} {formatTime(c.decided_at ?? c.created_at)}
                    </span>
                  </p>
                  {c.rationale && c.from_status !== null && <p className="mt-0.5 text-xs text-muted-foreground">{c.rationale}</p>}
                  {c.new_deadline && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Nieuwe deadline: <span className="font-medium text-foreground">{formatDate(c.new_deadline)}</span>
                    </p>
                  )}
                  {c.note && <p className="mt-0.5 text-xs text-muted-foreground">{c.note}</p>}
                  {c.quote && (
                    <blockquote className="mt-2 rounded-md border-l-2 border-primary/40 bg-muted/50 px-3 py-2 text-xs leading-relaxed">
                      “{c.quote}”
                      <div className="mt-1">
                        <SourceLink segmentId={c.source_segment_id} meetingId={c.source_meeting_id} label="Naar fragment" className="-ml-1.5" />
                      </div>
                    </blockquote>
                  )}
                  {!c.quote && c.source_segment_id && (
                    <SourceLink segmentId={c.source_segment_id} meetingId={c.source_meeting_id} className="-ml-1.5 mt-1" />
                  )}
                </li>
              )
            })}
          </ol>
        </li>
      ))}
    </ol>
  )
}

