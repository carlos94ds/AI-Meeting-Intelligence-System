import { Quote } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranscriptFocus } from '@/components/transcript-focus'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'

interface SourceLinkProps {
  segmentId: number | null
  /** Vergadering waar het segment bij hoort (nodig buiten het vergaderdetail). */
  meetingId?: number | null
  label?: string
  className?: string
}

const linkClass =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring'

/**
 * "Bron": binnen dezelfde vergadering scrolt het transcript naar het fragment en markeert het;
 * daarbuiten opent de vergadering op dat fragment.
 */
export function SourceLink({ segmentId, meetingId, label = 'Bron', className }: SourceLinkProps) {
  const focus = useTranscriptFocus()
  if (segmentId === null) return null

  const sameMeeting = focus !== null && (meetingId == null || meetingId === focus.meetingId)
  if (sameMeeting) {
    const seg = focus.segment(segmentId)
    const button = (
      <button type="button" onClick={() => focus.focus(segmentId)} className={cn(linkClass, className)}>
        <Quote className="size-3" aria-hidden />
        {label}
        {seg && <span className="sr-only">: fragment van {seg.speaker_name} op {formatTimestamp(seg.start_seconds)}</span>}
      </button>
    )
    if (!seg) return button
    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent className="max-w-80">
          <span className="font-semibold">
            {seg.speaker_name} · {formatTimestamp(seg.start_seconds)}
          </span>
          <br />“{seg.text}”
        </TooltipContent>
      </Tooltip>
    )
  }
  if (meetingId == null) return null
  return (
    <Link to={`/vergaderingen/${meetingId}?segment=${segmentId}`} className={cn(linkClass, className)}>
      <Quote className="size-3" aria-hidden />
      {label}
    </Link>
  )
}
