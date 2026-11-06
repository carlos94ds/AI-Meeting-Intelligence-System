import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatTimestamp } from '@/lib/format'
import { speakerColor } from '@/lib/speakers'
import type { Segment } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface FocusRequest {
  segmentId: number
  /** Verandert bij elke klik, zodat dezelfde bron opnieuw kan oplichten. */
  nonce: number
}

interface TranscriptViewProps {
  segments: Segment[]
  focusRequest: FocusRequest | null
  className?: string
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-amber-200/80 px-0.5 text-foreground dark:bg-amber-400/30">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

export function TranscriptView({ segments, focusRequest, className }: TranscriptViewProps) {
  const [query, setQuery] = useState('')
  const [activeMatch, setActiveMatch] = useState(0)
  const listRef = useRef<HTMLOListElement>(null)

  const q = query.trim()
  const matches = useMemo(
    () =>
      q
        ? segments
            .filter((s) => s.text.toLowerCase().includes(q.toLowerCase()) || s.speaker_name.toLowerCase().includes(q.toLowerCase()))
            .map((s) => s.id)
        : [],
    [segments, q],
  )

  const speakers = useMemo(() => {
    const seen = new Map<string, Segment>()
    for (const s of segments) if (!seen.has(s.speaker_name)) seen.set(s.speaker_name, s)
    return [...seen.values()]
  }, [segments])

  const scrollTo = (segmentId: number, behavior: ScrollBehavior = 'smooth') => {
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>(`[data-segment-id="${segmentId}"]`)
    if (!list || !el) return
    // Alleen de transcriptlijst scrollen; daarna (op smalle schermen) de lijst zelf in beeld brengen.
    list.scrollTo({ top: el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2, behavior })
    const section = list.closest('section')
    const rect = section?.getBoundingClientRect()
    if (section && rect && (rect.top < 0 || rect.top > window.innerHeight * 0.6)) {
      section.scrollIntoView({ block: 'start', behavior })
    }
    el.focus({ preventScroll: true })
  }

  // Bronlink aangeklikt → naar het fragment scrollen en het markeren
  useEffect(() => {
    if (!focusRequest) return
    const t = window.setTimeout(() => scrollTo(focusRequest.segmentId, focusRequest.nonce === 0 ? 'auto' : 'smooth'), 30)
    return () => window.clearTimeout(t)
  }, [focusRequest])

  const goToMatch = (index: number) => {
    if (matches.length === 0) return
    const next = (index + matches.length) % matches.length
    setActiveMatch(next)
    scrollTo(matches[next])
  }

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      goToMatch(e.shiftKey ? activeMatch - 1 : activeMatch + 1)
    }
    if (e.key === 'Escape') setQuery('')
  }

  return (
    <section aria-label="Transcript" className={cn('flex min-h-0 flex-col rounded-xl border bg-card', className)}>
      <div className="space-y-3 border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Transcript</h2>
          <span className="text-xs text-muted-foreground">{segments.length} fragmenten</span>
        </div>
        <div className="relative flex items-center gap-1">
          <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveMatch(0)
            }}
            onKeyDown={onSearchKey}
            placeholder="Zoek in transcript…"
            aria-label="Zoek in transcript"
            className="pr-24 pl-8"
          />
          {q && (
            <div className="absolute right-1 flex items-center gap-0.5">
              <span className="px-1 text-xs text-muted-foreground tabular-nums" aria-live="polite">
                {matches.length ? `${activeMatch + 1}/${matches.length}` : '0'}
              </span>
              <Button variant="ghost" size="icon-xs" onClick={() => goToMatch(activeMatch - 1)} aria-label="Vorig resultaat">
                <ChevronUp />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => goToMatch(activeMatch + 1)} aria-label="Volgend resultaat">
                <ChevronDown />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => setQuery('')} aria-label="Zoekopdracht wissen">
                <X />
              </Button>
            </div>
          )}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Sprekers">
          {speakers.map((s) => (
            <li key={s.speaker_name} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-2 rounded-full', speakerColor(s.color).dot)} aria-hidden />
              {s.speaker_name}
            </li>
          ))}
        </ul>
      </div>

      <ol ref={listRef} className="relative min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {segments.map((s, i) => {
          const c = speakerColor(s.color)
          const sameSpeaker = i > 0 && segments[i - 1].speaker_name === s.speaker_name
          const isFlash = focusRequest?.segmentId === s.id
          const isActiveMatch = q && matches[activeMatch] === s.id
          return (
            <li
              key={isFlash ? `${s.id}-${focusRequest.nonce}` : s.id}
              data-segment-id={s.id}
              id={`segment-${s.id}`}
              tabIndex={-1}
              className={cn(
                'scroll-my-4 rounded-lg px-3 py-2 outline-none',
                sameSpeaker && 'pt-0.5',
                isFlash && 'source-highlight',
                isActiveMatch && 'ring-1 ring-amber-400/70',
              )}
            >
              {!sameSpeaker && (
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className={cn('text-xs font-semibold', c.text)}>{s.speaker_name}</span>
                  {s.participant_id === null && <span className="text-[11px] text-muted-foreground">(niet gekoppeld)</span>}
                </div>
              )}
              <div className="flex gap-3">
                <time className="w-10 shrink-0 pt-px font-mono text-[11px] text-muted-foreground tabular-nums">
                  {formatTimestamp(s.start_seconds)}
                </time>
                <p className={cn('border-l-2 pl-3 text-sm leading-relaxed text-foreground', c.border)}>{highlight(s.text, q)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
