import {
  ArrowDown,
  ArrowUp,
  Bot,
  CalendarClock,
  ClipboardCopy,
  Download,
  GripVertical,
  ListOrdered,
  MessageCircleQuestion,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPen,
} from 'lucide-react'
import { useMemo, useState, type DragEvent, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { SourceLink } from '@/components/SourceLink'
import { CardSkeleton, EmptyState, ErrorState } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRegeneratePreparation, useSavePreparation } from '@/hooks/mutations'
import { usePreparation } from '@/hooks/queries'
import { downloadText, slugify } from '@/lib/download'
import { formatWeekday } from '@/lib/format'
import type { Preparation, PreparationInput, PrepQuestion } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DraftQuestion extends Omit<PrepQuestion, 'id' | 'position'> {
  key: string
}
interface DraftAgendaItem {
  key: string
  title: string
  duration_minutes: number
}
interface Draft {
  next_meeting_date: string | null
  questions: DraftQuestion[]
  agenda: DraftAgendaItem[]
}

let keySeq = 0
const newKey = () => `n${++keySeq}`

function toDraft(p: Preparation): Draft {
  return {
    next_meeting_date: p.next_meeting_date,
    questions: p.questions.map(({ id, position: _position, ...q }) => ({ ...q, key: `q${id}` })),
    agenda: p.agenda.map((a) => ({ key: `a${a.id}`, title: a.title, duration_minutes: a.duration_minutes })),
  }
}

function toInput(d: Draft): PreparationInput {
  return {
    next_meeting_date: d.next_meeting_date || null,
    questions: d.questions.map((q) => ({
      text: q.text,
      reason: q.reason,
      action_item_id: q.action_item_id,
      source_segment_id: q.source_segment_id,
      included: q.included,
      is_custom: q.is_custom,
    })),
    agenda: d.agenda.map((a) => ({ title: a.title, duration_minutes: a.duration_minutes })),
  }
}

function asMarkdown(projectName: string, d: Draft): string {
  const date = d.next_meeting_date ? formatWeekday(d.next_meeting_date) : 'datum nog niet bepaald'
  const lines = [`# Voorbereiding – ${projectName}`, '', `Volgende vergadering: ${date}`, '', '## Conceptagenda']
  d.agenda.forEach((a, i) => lines.push(`${i + 1}. ${a.title} (${a.duration_minutes} min)`))
  lines.push('', '## Vragen')
  for (const q of d.questions.filter((x) => x.included)) lines.push(`- ${q.text}${q.reason ? `  \n  _${q.reason}_` : ''}`)
  return lines.join('\n') + '\n'
}

export function PreparationPanel({ projectId }: { projectId: number }) {
  const { data, isPending, isError, error, refetch, dataUpdatedAt } = usePreparation(projectId)
  if (isPending) return <CardSkeleton lines={8} />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  // Nieuwe serverdata (na opslaan of opnieuw genereren) → concept opnieuw opbouwen
  return <PreparationEditor key={dataUpdatedAt} projectId={projectId} initial={data} />
}

function PreparationEditor({ projectId, initial }: { projectId: number; initial: Preparation }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const save = useSavePreparation(projectId)
  const regenerate = useRegeneratePreparation(projectId)
  const dirty = useMemo(() => JSON.stringify(toInput(draft)) !== JSON.stringify(toInput(toDraft(initial))), [draft, initial])

  const update = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d))
  const included = draft.questions.filter((q) => q.included).length
  const totalMinutes = draft.agenda.reduce((sum, a) => sum + a.duration_minutes, 0)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asMarkdown(initial.project_name, draft))
      toast.success('Voorbereiding gekopieerd naar het klembord')
    } catch {
      toast.error('Kopiëren is niet gelukt. Gebruik Exporteren.')
    }
  }

  return (
    <div className="space-y-5 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="next-meeting-date" className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Volgende vergadering
          </Label>
          <div className="flex items-center gap-3">
            <Input
              id="next-meeting-date"
              type="date"
              className="w-44"
              value={draft.next_meeting_date ?? ''}
              onChange={(e) => update((d) => ({ ...d, next_meeting_date: e.target.value || null }))}
            />
            {draft.next_meeting_date && <span className="text-sm text-muted-foreground">{formatWeekday(draft.next_meeting_date)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => regenerate.mutate()} disabled={regenerate.isPending || dirty} title={dirty ? 'Sla eerst je wijzigingen op' : undefined}>
            <RefreshCw className={cn(regenerate.isPending && 'animate-spin')} /> Opnieuw voorstellen
          </Button>
          <Button variant="outline" onClick={() => void copy()}>
            <ClipboardCopy /> Kopiëren
          </Button>
          <Button variant="outline" onClick={() => downloadText(`voorbereiding-${slugify(initial.project_name)}.md`, asMarkdown(initial.project_name, draft))}>
            <Download /> Exporteren
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <QuestionsSection draft={draft} update={update} included={included} />
        <AgendaSection draft={draft} update={update} totalMinutes={totalMinutes} />
      </div>

      {dirty && (
        <div role="status" className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border bg-popover px-4 py-3 shadow-lg">
          <span className="text-sm">Je hebt niet-opgeslagen wijzigingen.</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(initial))}>
              Annuleren
            </Button>
            <Button size="sm" onClick={() => save.mutate(toInput(draft))} disabled={save.isPending}>
              Opslaan
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------- vragen

function QuestionsSection({ draft, update, included }: { draft: Draft; update: (fn: (d: Draft) => Draft) => void; included: number }) {
  const [newText, setNewText] = useState('')
  const add = (e: FormEvent) => {
    e.preventDefault()
    const text = newText.trim()
    if (!text) return
    update((d) => ({
      ...d,
      questions: [
        ...d.questions,
        {
          key: newKey(),
          text,
          reason: 'Zelf toegevoegd',
          action_item_id: null,
          action_item_title: null,
          action_item_status: null,
          source_segment_id: null,
          source_meeting_id: null,
          included: true,
          is_custom: true,
        },
      ],
    }))
    setNewText('')
  }
  const patch = (key: string, changes: Partial<DraftQuestion>) =>
    update((d) => ({ ...d, questions: d.questions.map((q) => (q.key === key ? { ...q, ...changes } : q)) }))
  const remove = (key: string) => update((d) => ({ ...d, questions: d.questions.filter((q) => q.key !== key) }))

  return (
    <section aria-labelledby="prep-questions" className="rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id="prep-questions" className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircleQuestion className="size-4 text-muted-foreground" aria-hidden /> Voorgestelde vragen
        </h2>
        <span className="text-xs text-muted-foreground">
          {included} van {draft.questions.length} geselecteerd
        </span>
      </header>
      {draft.questions.length === 0 ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title="Geen vragen"
          description="Er zijn geen openstaande punten die om een vraag vragen. Voeg zelf een vraag toe of laat de AI opnieuw voorstellen."
          className="m-4 py-8"
        />
      ) : (
        <ul className="divide-y">
          {draft.questions.map((q) => (
            <QuestionRow key={q.key} q={q} onPatch={(c) => patch(q.key, c)} onRemove={() => remove(q.key)} />
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2 border-t p-4">
        <Input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder="Eigen vraag toevoegen…" aria-label="Nieuwe vraag" />
        <Button type="submit" variant="secondary" disabled={!newText.trim()}>
          <Plus /> Toevoegen
        </Button>
      </form>
    </section>
  )
}

function QuestionRow({ q, onPatch, onRemove }: { q: DraftQuestion; onPatch: (c: Partial<DraftQuestion>) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(q.text)
  const [params] = useSearchParams()
  const id = `q-${q.key}`
  const itemHref = (() => {
    const next = new URLSearchParams(params)
    if (q.action_item_id) next.set('item', String(q.action_item_id))
    return `?${next.toString()}`
  })()

  return (
    <li className={cn('flex gap-3 px-4 py-3.5', !q.included && 'opacity-60')}>
      <Checkbox id={id} checked={q.included} onCheckedChange={(v) => onPatch({ included: v === true })} className="mt-0.5" aria-label="Vraag meenemen" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="grid gap-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Vraag bewerken" autoFocus />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (text.trim()) onPatch({ text: text.trim() })
                  setEditing(false)
                }}
              >
                Klaar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setText(q.text); setEditing(false) }}>
                Annuleren
              </Button>
            </div>
          </div>
        ) : (
          <label htmlFor={id} className="block cursor-pointer text-sm leading-snug">
            {q.text}
          </label>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {q.is_custom ? <UserPen className="size-3.5" aria-hidden /> : <Bot className="size-3.5" aria-hidden />}
            <span>
              <span className="sr-only">Reden: </span>
              {q.reason}
            </span>
          </span>
          {q.action_item_id && q.action_item_title && (
            <Link to={itemHref} className="inline-flex max-w-full items-center gap-1.5 rounded-md hover:underline">
              {q.action_item_status && <StatusBadge status={q.action_item_status} size="sm" withTooltip={false} />}
              <span className="truncate">{q.action_item_title}</span>
            </Link>
          )}
          <SourceLink segmentId={q.source_segment_id} meetingId={q.source_meeting_id} className="-ml-1" />
        </div>
      </div>
      {!editing && (
        <div className="flex shrink-0 items-start gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label="Vraag bewerken">
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Vraag verwijderen" className="hover:text-destructive">
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  )
}

// ----------------------------------------------------------------------------- agenda

function AgendaSection({ draft, update, totalMinutes }: { draft: Draft; update: (fn: (d: Draft) => Draft) => void; totalMinutes: number }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')

  const move = (from: number, to: number) =>
    update((d) => {
      if (to < 0 || to >= d.agenda.length || from === to) return d
      const agenda = [...d.agenda]
      const [moved] = agenda.splice(from, 1)
      agenda.splice(to, 0, moved)
      return { ...d, agenda }
    })
  const patch = (key: string, changes: Partial<DraftAgendaItem>) =>
    update((d) => ({ ...d, agenda: d.agenda.map((a) => (a.key === key ? { ...a, ...changes } : a)) }))

  const onDrop = (e: DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex !== null) move(dragIndex, index)
    setDragIndex(null)
    setOverIndex(null)
  }

  const add = (e: FormEvent) => {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    update((d) => ({ ...d, agenda: [...d.agenda, { key: newKey(), title, duration_minutes: 10 }] }))
    setNewTitle('')
  }

  return (
    <section aria-labelledby="prep-agenda" className="rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id="prep-agenda" className="flex items-center gap-2 text-sm font-semibold">
          <ListOrdered className="size-4 text-muted-foreground" aria-hidden /> Conceptagenda
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">{totalMinutes} min totaal</span>
      </header>
      {draft.agenda.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nog geen agendapunten. Voeg er hieronder een toe.</p>
      ) : (
        <ol className="space-y-1 p-2" aria-describedby="agenda-help">
          {draft.agenda.map((a, i) => (
            <li
              key={a.key}
              draggable
              onDragStart={(e) => {
                setDragIndex(i)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setOverIndex(i)
              }}
              onDragLeave={() => setOverIndex((o) => (o === i ? null : o))}
              onDrop={(e) => onDrop(e, i)}
              onDragEnd={() => {
                setDragIndex(null)
                setOverIndex(null)
              }}
              className={cn(
                'group flex items-start gap-2 rounded-lg border border-transparent bg-background px-2 py-2',
                dragIndex === i && 'opacity-40',
                overIndex === i && dragIndex !== i && 'border-primary/50 bg-accent/50',
              )}
            >
              <GripVertical className="mt-2 size-4 shrink-0 cursor-grab self-start text-muted-foreground active:cursor-grabbing" aria-hidden />
              <span className="mt-2 w-5 shrink-0 self-start text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <Input
                  value={a.title}
                  onChange={(e) => patch(a.key, { title: e.target.value })}
                  aria-label={`Agendapunt ${i + 1}`}
                  className="h-8 border-transparent bg-transparent px-1.5 shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
                />
                <div className="mt-1 flex items-center gap-1 pl-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={240}
                    value={a.duration_minutes}
                    onChange={(e) => patch(a.key, { duration_minutes: Math.max(1, Number(e.target.value) || 1) })}
                    aria-label={`Duur van agendapunt ${i + 1} in minuten`}
                    className="h-7 w-16 px-2 text-right text-xs tabular-nums"
                  />
                  <span className="mr-auto text-xs text-muted-foreground">min</span>
                  <Button variant="ghost" size="icon-xs" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Agendapunt ${i + 1} omhoog`}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => move(i, i + 1)} disabled={i === draft.agenda.length - 1} aria-label={`Agendapunt ${i + 1} omlaag`}>
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => update((d) => ({ ...d, agenda: d.agenda.filter((x) => x.key !== a.key) }))} aria-label={`Agendapunt ${i + 1} verwijderen`} className="hover:text-destructive">
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p id="agenda-help" className="px-4 pb-1 text-xs text-muted-foreground">
        Sleep om de volgorde te wijzigen, of gebruik de pijltjes.
      </p>
      <form onSubmit={add} className="flex gap-2 border-t p-4">
        <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Agendapunt toevoegen…" aria-label="Nieuw agendapunt" />
        <Button type="submit" variant="secondary" disabled={!newTitle.trim()}>
          <Plus /> Toevoegen
        </Button>
      </form>
    </section>
  )
}
