import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  FileAudio,
  Loader2,
  Mic,
  ShieldCheck,
  Upload,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Initials } from '@/components/OwnerChip'
import { PageHeader } from '@/components/PageHeader'
import { useProjectScope } from '@/components/project-scope'
import { ProgressBar } from '@/components/ProgressBar'
import { speakerColor } from '@/lib/speakers'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useMeeting, useProject, useProjects, useSettings } from '@/hooks/queries'
import { api } from '@/lib/api'
import { formatTimestamp } from '@/lib/format'
import type { ProcessingStep } from '@/lib/types'
import { cn } from '@/lib/utils'

const STEPS = ['Gegevens', 'Opname', 'Verwerking', 'Sprekers'] as const
const ACCEPTED = ['.mp3', '.m4a', '.wav', '.ogg', '.webm', '.mp4', '.aac', '.flac']
const MAX_BYTES = 200 * 1024 * 1024

const RETENTION_TEXT: Record<string, string> = {
  direct: 'De audio wordt direct na verwerking verwijderd.',
  '30d': 'De audio wordt na 30 dagen verwijderd.',
  '90d': 'De audio wordt na 90 dagen verwijderd.',
}

function localDateTimeValue(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function NewMeeting() {
  const { projectId: scopedProject } = useProjectScope()
  const { data: projects } = useProjects()
  const { data: settings } = useSettings()
  const [step, setStep] = useState(0)

  // Stap 1
  const [projectId, setProjectId] = useState<number | undefined>(scopedProject)
  const effectiveProjectId = projectId ?? projects?.[0]?.id
  const { data: project } = useProject(effectiveProjectId)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(localDateTimeValue)
  const [participantIds, setParticipantIds] = useState<number[] | null>(null)
  const selectedParticipants = participantIds ?? project?.participants.map((p) => p.id) ?? []

  // Stap 2
  const [file, setFile] = useState<File | null>(null)
  const [consent, setConsent] = useState(false)

  // Stap 3/4
  const [meetingId, setMeetingId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const goToSpeakers = useCallback(() => setStep(3), [])
  const restartUpload = useCallback(() => {
    setMeetingId(null)
    setStep(1)
  }, [])

  const consentRequired = settings?.consent_required ?? true
  const step1Valid = effectiveProjectId !== undefined && title.trim() !== '' && date !== '' && selectedParticipants.length > 0
  const step2Valid = file !== null && (consent || !consentRequired)

  const start = async () => {
    if (!file || effectiveProjectId === undefined) return
    setSubmitting(true)
    const form = new FormData()
    form.set('project_id', String(effectiveProjectId))
    form.set('title', title.trim())
    form.set('date', date)
    form.set('participant_ids', selectedParticipants.join(','))
    form.set('consent', String(consent))
    form.set('audio', file)
    try {
      const meeting = await api.createMeeting(form)
      setMeetingId(meeting.id)
      setStep(2)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Uploaden mislukt')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader title="Vergadering toevoegen" description="Upload een opname; de AI maakt er een transcript, samenvatting en voorgestelde actiepunten van." />
      <Stepper current={step} />
      <div className="mx-auto mt-6 max-w-3xl">
        {step === 0 && (
          <StepDetails
            projects={projects?.map((p) => ({ id: p.id, name: p.name })) ?? []}
            projectId={effectiveProjectId}
            onProject={(id) => {
              setProjectId(id)
              setParticipantIds(null)
            }}
            participants={project?.participants ?? []}
            selected={selectedParticipants}
            onSelected={setParticipantIds}
            title={title}
            onTitle={setTitle}
            date={date}
            onDate={setDate}
            valid={step1Valid}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <StepUpload
            file={file}
            onFile={setFile}
            consent={consent}
            onConsent={setConsent}
            consentRequired={consentRequired}
            retention={settings ? RETENTION_TEXT[settings.audio_retention] : undefined}
            valid={step2Valid}
            submitting={submitting}
            onBack={() => setStep(0)}
            onStart={() => void start()}
          />
        )}
        {step === 2 && meetingId !== null && <StepProcessing meetingId={meetingId} onDone={goToSpeakers} onRestart={restartUpload} />}
        {step === 3 && meetingId !== null && <StepSpeakers meetingId={meetingId} />}
      </div>
    </>
  )
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="mx-auto flex max-w-3xl items-center gap-2" aria-label="Stappen">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-primary bg-primary text-primary-foreground',
                active && 'border-primary text-primary ring-4 ring-primary/15',
                !done && !active && 'text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn('hidden text-sm sm:inline', active ? 'font-semibold' : 'text-muted-foreground')}>
              {label}
              {done && <span className="sr-only"> (klaar)</span>}
            </span>
            {i < STEPS.length - 1 && <span className={cn('h-px flex-1', done ? 'bg-primary' : 'bg-border')} aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

// ----------------------------------------------------------------------------- stap 1

interface StepDetailsProps {
  projects: Array<{ id: number; name: string }>
  projectId: number | undefined
  onProject: (id: number) => void
  participants: Array<{ id: number; name: string; role: string; color: string }>
  selected: number[]
  onSelected: (ids: number[]) => void
  title: string
  onTitle: (v: string) => void
  date: string
  onDate: (v: string) => void
  valid: boolean
  onNext: () => void
}

function StepDetails(p: StepDetailsProps) {
  const items = Object.fromEntries(p.projects.map((x) => [String(x.id), x.name]))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (p.valid) p.onNext()
  }
  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-6">
      <div className="grid gap-1.5">
        <Label htmlFor="nm-project">Project</Label>
        <Select items={items} value={p.projectId === undefined ? null : String(p.projectId)} onValueChange={(v) => v && p.onProject(Number(v))}>
          <SelectTrigger id="nm-project" className="w-full">
            <SelectValue placeholder="Kies een project" />
          </SelectTrigger>
          <SelectContent>
            {p.projects.map((x) => (
              <SelectItem key={x.id} value={String(x.id)}>
                {x.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="nm-title">Titel</Label>
          <Input id="nm-title" required value={p.title} onChange={(e) => p.onTitle(e.target.value)} placeholder="Bijv. Voortgangsoverleg 3" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nm-date">Datum en tijd</Label>
          <Input id="nm-date" type="datetime-local" required value={p.date} onChange={(e) => p.onDate(e.target.value)} />
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Deelnemers</legend>
        {p.participants.length === 0 ? (
          <Skeleton className="h-10" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {p.participants.map((pp) => (
              <label key={pp.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                <Checkbox
                  checked={p.selected.includes(pp.id)}
                  onCheckedChange={(v) => p.onSelected(v ? [...p.selected, pp.id] : p.selected.filter((x) => x !== pp.id))}
                />
                <Initials name={pp.name} color={pp.color} />
                <span>
                  {pp.name} <span className="text-muted-foreground">· {pp.role}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {p.participants.length > 0 && p.selected.length === 0 && <p className="mt-2 text-xs text-destructive">Selecteer minstens één deelnemer.</p>}
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" disabled={!p.valid}>
          Volgende <ArrowRight />
        </Button>
      </div>
    </form>
  )
}

// ----------------------------------------------------------------------------- stap 2

interface StepUploadProps {
  file: File | null
  onFile: (f: File | null) => void
  consent: boolean
  onConsent: (v: boolean) => void
  consentRequired: boolean
  retention?: string
  valid: boolean
  submitting: boolean
  onBack: () => void
  onStart: () => void
}

function StepUpload(p: StepUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = (f: File | undefined) => {
    if (!f) return
    const ext = f.name.includes('.') ? `.${f.name.split('.').pop()!.toLowerCase()}` : ''
    if (!ACCEPTED.includes(ext)) return setError(`Dit bestandstype wordt niet ondersteund. Gebruik ${ACCEPTED.join(', ')}.`)
    if (f.size > MAX_BYTES) return setError('Het bestand is te groot (maximaal 200 MB).')
    setError(null)
    p.onFile(f)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    accept(e.dataTransfer.files[0])
  }
  const useSample = () => p.onFile(new File([new Uint8Array(2048)], 'voorbeeldopname.m4a', { type: 'audio/mp4' }))

  return (
    <div className="space-y-5 rounded-xl border bg-card p-6">
      {p.file ? (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileAudio className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{p.file.name}</div>
            <div className="text-xs text-muted-foreground">{formatSize(p.file.size)}</div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => p.onFile(null)} aria-label="Bestand verwijderen">
            <X />
          </Button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-describedby="dropzone-help"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inputRef.current?.click())}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dragging ? 'border-primary bg-accent/50' : 'hover:border-primary/50 hover:bg-muted/40',
          )}
        >
          <Upload className="mb-3 size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Sleep een audiobestand hierheen of klik om te kiezen</p>
          <p id="dropzone-help" className="mt-1 text-xs text-muted-foreground">
            {ACCEPTED.join(', ')} · maximaal 200 MB
          </p>
          <input ref={inputRef} type="file" accept={`audio/*,${ACCEPTED.join(',')}`} className="sr-only" tabIndex={-1} onChange={(e) => accept(e.target.files?.[0])} />
        </div>
      )}
      {!p.file && (
        <p className="text-center text-xs text-muted-foreground">
          Geen opname bij de hand?{' '}
          <button type="button" onClick={useSample} className="font-medium text-primary hover:underline">
            Gebruik een voorbeeldopname
          </button>{' '}
          (de mock-AI gebruikt altijd demodata).
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-primary/25 bg-accent/40 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox checked={p.consent} onCheckedChange={(v) => p.onConsent(v === true)} className="mt-0.5" aria-required={p.consentRequired} />
          <span className="text-sm">
            <span className="font-medium">Alle deelnemers zijn geïnformeerd over de opname</span>
            {p.consentRequired && <span className="text-destructive"> *</span>}
            <span className="mt-1 block text-xs text-muted-foreground">
              <ShieldCheck className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
              Verplicht volgens de privacy-instellingen. {p.retention} Het systeem volgt taken, geen personen.
            </span>
          </span>
        </label>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={p.onBack}>
          <ArrowLeft /> Vorige
        </Button>
        <Button onClick={p.onStart} disabled={!p.valid || p.submitting}>
          {p.submitting ? <Loader2 className="animate-spin" /> : <Mic />} Verwerking starten
        </Button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------- stap 3

function StepIcon({ state }: { state: ProcessingStep['state'] }) {
  if (state === 'klaar') return <CheckCircle2 className="size-5 text-status-afgerond" aria-hidden />
  if (state === 'bezig') return <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
  if (state === 'fout') return <AlertTriangle className="size-5 text-destructive" aria-hidden />
  return <Circle className="size-5 text-muted-foreground/50" aria-hidden />
}

const STATE_LABEL: Record<ProcessingStep['state'], string> = { klaar: 'klaar', bezig: 'bezig', fout: 'mislukt', wachten: 'wacht' }

function StepProcessing({ meetingId, onDone, onRestart }: { meetingId: number; onDone: () => void; onRestart: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['processing', meetingId],
    queryFn: () => api.processingStatus(meetingId),
    refetchInterval: (q) => (q.state.data && (q.state.data.state === 'done' || q.state.data.state === 'failed') ? false : 700),
  })

  useEffect(() => {
    if (data?.state !== 'done') return
    void Promise.all(['dashboard', 'meetings', 'projects', 'project', 'action-items', 'preparation'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    toast.success('Vergadering verwerkt')
    const t = window.setTimeout(onDone, 900)
    return () => window.clearTimeout(t)
  }, [data?.state, onDone, qc])

  const steps = data?.steps ?? []
  const doneCount = steps.filter((s) => s.state === 'klaar').length
  const progress = steps.length ? (doneCount + (data?.state === 'processing' ? 0.5 : 0)) / steps.length : 0

  return (
    <div className="space-y-5 rounded-xl border bg-card p-6" aria-live="polite">
      <div>
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium">{data?.state === 'done' ? 'Klaar!' : data?.state === 'failed' ? 'Verwerking mislukt' : 'Bezig met verwerken…'}</span>
          <span className="text-muted-foreground tabular-nums">{Math.round(progress * 100)}%</span>
        </div>
        <ProgressBar value={progress} label="Voortgang van de verwerking" />
      </div>
      <ol className="space-y-1">
        {(steps.length ? steps : Array.from({ length: 5 }, (_, i) => ({ key: String(i), label: '…', state: 'wachten' as const }))).map((s, i) => (
          <li key={s.key} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5', s.state === 'bezig' && 'bg-accent/50')}>
            <StepIcon state={s.state} />
            <span className={cn('text-sm', s.state === 'wachten' ? 'text-muted-foreground' : 'font-medium')}>
              {i + 1}. {s.label}
            </span>
            <span className="sr-only">: {STATE_LABEL[s.state]}</span>
          </li>
        ))}
      </ol>
      {data?.state === 'failed' && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span>{data.error ?? 'Er ging iets mis bij het verwerken.'}</span>
          <Button variant="outline" size="sm" onClick={onRestart}>
            Opnieuw proberen
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Dit is een simulatie met de MockProvider; met een echte AI duurt dit langer.</p>
    </div>
  )
}

// ----------------------------------------------------------------------------- stap 4

const NONE = 'geen'

function StepSpeakers({ meetingId }: { meetingId: number }) {
  const { data, isPending } = useMeeting(meetingId)
  const navigate = useNavigate()
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const samples = useMemo(() => {
    const out = new Map<string, Array<{ text: string; start: number }>>()
    for (const s of data?.segments ?? []) {
      const list = out.get(s.speaker_label) ?? []
      if (list.length < 2) list.push({ text: s.text, start: s.start_seconds })
      out.set(s.speaker_label, list)
    }
    return out
  }, [data])

  if (isPending || !data) return <Skeleton className="h-80 rounded-xl" />

  const items: Record<string, string> = { [NONE]: 'Nog niet koppelen' }
  for (const p of data.participants) items[String(p.id)] = p.name
  const used = new Set(Object.values(mapping).filter((v) => v !== NONE))

  const save = async () => {
    setSaving(true)
    try {
      const body = Object.fromEntries(data.speaker_labels.map((l) => [l, mapping[l] && mapping[l] !== NONE ? Number(mapping[l]) : null]))
      await api.mapSpeakers(meetingId, body)
      toast.success('Sprekers gekoppeld')
      navigate(`/vergaderingen/${meetingId}?tab=actiepunten`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 rounded-xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <UserRoundCheck className="mt-0.5 size-5 text-primary" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold">Sprekers koppelen</h2>
          <p className="text-sm text-muted-foreground">
            De AI herkende {data.speaker_labels.length} stemmen. Koppel elke stem aan een deelnemer, zodat het transcript en de actiepunten de juiste namen tonen.
          </p>
        </div>
      </div>
      <ul className="space-y-3">
        {data.speaker_labels.map((label, i) => {
          const c = speakerColor(['sky', 'amber', 'violet', 'emerald', 'rose', 'teal'][i % 6])
          return (
            <li key={label} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_14rem] sm:items-center">
              <div className="min-w-0">
                <div className={cn('mb-1 inline-flex items-center gap-1.5 text-sm font-semibold', c.text)}>
                  <span className={cn('size-2 rounded-full', c.dot)} aria-hidden /> {label}
                </div>
                {samples.get(label)?.map((s) => (
                  <p key={s.start} className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{formatTimestamp(s.start)}</span> “{s.text}”
                  </p>
                ))}
              </div>
              <Select items={items} value={mapping[label] ?? NONE} onValueChange={(v) => setMapping((m) => ({ ...m, [label]: v ?? NONE }))}>
                <SelectTrigger aria-label={`Deelnemer voor ${label}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(items).map(([value, text]) => (
                    <SelectItem key={value} value={value} disabled={value !== NONE && used.has(value) && mapping[label] !== value}>
                      {value !== NONE && (() => {
                        const p = data.participants.find((x) => String(x.id) === value)
                        return p ? <Initials name={p.name} color={p.color} className="size-5 text-[10px]" /> : null
                      })()}
                      {text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(`/vergaderingen/${meetingId}?tab=actiepunten`)}>
          Later koppelen
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          Opslaan en actiepunten reviewen <ArrowRight />
        </Button>
      </div>
    </div>
  )
}
