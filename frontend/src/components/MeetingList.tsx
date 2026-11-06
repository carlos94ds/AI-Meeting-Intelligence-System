import { CalendarDays, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDate, formatDuration } from '@/lib/format'
import type { MeetingSummary } from '@/lib/types'

export function MeetingList({ meetings, showProject = true }: { meetings: MeetingSummary[]; showProject?: boolean }) {
  return (
    <ul className="-mx-2 divide-y">
      {meetings.map((m) => (
        <li key={m.id}>
          <Link
            to={`/vergaderingen/${m.id}${m.pending_review_count > 0 ? '?tab=actiepunten' : ''}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarDays className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
            <div className="min-w-0 flex-1 basis-56">
              <div className="truncate text-sm font-medium">{m.title}</div>
              <div className="text-xs text-muted-foreground">
                {showProject && `${m.project_name} · `}
                {formatDate(m.date)} · {formatDuration(m.duration_minutes)} · {m.participant_count} deelnemers
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {m.processing_state === 'processing' || m.processing_state === 'pending' ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Wordt verwerkt…
                </span>
              ) : m.processing_state === 'failed' ? (
                <span className="text-destructive">Verwerking mislukt</span>
              ) : (
                <>
                  <span className="text-muted-foreground">{m.action_item_count} actiepunten</span>
                  {m.pending_review_count > 0 && (
                    <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
                      {m.pending_review_count} te reviewen
                    </span>
                  )}
                  {m.pending_suggestion_count > 0 && (
                    <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
                      {m.pending_suggestion_count} statusvoorstellen
                    </span>
                  )}
                </>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
