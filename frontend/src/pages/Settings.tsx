import { Bot, KeyRound, Languages, Lock, Repeat, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { CardSkeleton, ErrorState } from '@/components/States'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { keys, useSettings } from '@/hooks/queries'
import { api } from '@/lib/api'
import type { AppSettings, AppSettingsInput } from '@/lib/types'
import { cn } from '@/lib/utils'

const AUDIO_RETENTION = { direct: 'Direct verwijderen na verwerking', '30d': '30 dagen bewaren', '90d': '90 dagen bewaren' }
const TRANSCRIPT_RETENTION = { '90d': '90 dagen', '365d': '1 jaar', onbeperkt: 'Onbeperkt (tot het project wordt verwijderd)' }
const LANGUAGES = { nl: 'Nederlands', en: 'Engels' }

function Section({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-6 last:border-b-0 md:grid-cols-[16rem_1fr] md:gap-8">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function SimpleSelect({ id, items, value, onChange, className }: { id: string; items: Record<string, string>; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger id={id} className={cn('w-full max-w-sm', className)}>
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

export function Settings() {
  const { data, isPending, isError, error, refetch } = useSettings()
  return (
    <>
      <PageHeader title="Instellingen" description="Wijzigingen worden direct opgeslagen." />
      {isPending ? <CardSkeleton lines={8} /> : isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : <SettingsForm settings={data} />}
    </>
  )
}

function SettingsForm({ settings }: { settings: AppSettings }) {
  const qc = useQueryClient()
  const [threshold, setThreshold] = useState(String(settings.postpone_threshold))
  const save = useMutation({
    mutationFn: (body: AppSettingsInput) => api.saveSettings(body),
    onSuccess: (data) => {
      qc.setQueryData(keys.settings, data)
      toast.success('Instelling opgeslagen')
      return Promise.all(['dashboard', 'project', 'action-items'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveThreshold = () => {
    const n = Number(threshold)
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      toast.error('Kies een getal tussen 1 en 10.')
      setThreshold(String(settings.postpone_threshold))
      return
    }
    if (n !== settings.postpone_threshold) save.mutate({ postpone_threshold: n })
  }

  return (
    <div className="rounded-xl border bg-card px-6">
      <Section icon={Bot} title="AI-provider" description="Welke dienst transcribeert en analyseert de vergaderingen.">
        <fieldset>
          <legend className="sr-only">AI-provider</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {settings.available_providers.map((p) => {
              const active = p.id === settings.ai_provider
              return (
                <label
                  key={p.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm',
                    active ? 'border-primary bg-accent/50' : 'cursor-not-allowed opacity-60',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="provider" checked={active} disabled={!p.available} readOnly className="accent-[var(--primary)]" />
                    {p.label}
                  </span>
                  {active ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Actief</span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Binnenkort</span>
                  )}
                </label>
              )
            })}
          </div>
        </fieldset>
        <div className="grid gap-1.5">
          <Label htmlFor="api-key" className="inline-flex items-center gap-1.5">
            <KeyRound className="size-3.5" aria-hidden /> API-sleutel
          </Label>
          <Input id="api-key" type="password" disabled placeholder="Niet nodig voor de mock-provider" className="max-w-sm" />
          <p className="text-xs text-muted-foreground">Sleutels worden later via <code className="rounded bg-muted px-1">.env</code> op de server ingesteld, nooit in de browser.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="language" className="inline-flex items-center gap-1.5">
            <Languages className="size-3.5" aria-hidden /> Taal van transcriptie en samenvattingen
          </Label>
          <SimpleSelect id="language" items={LANGUAGES} value={settings.language} onChange={(v) => save.mutate({ language: v as AppSettings['language'] })} />
        </div>
      </Section>

      <Section icon={Lock} title="Privacy" description="Bewaartermijnen en toestemming. Het systeem volgt taken en projecten, geen personen.">
        <div className="grid gap-1.5">
          <Label htmlFor="audio-retention">Bewaartermijn audio</Label>
          <SimpleSelect id="audio-retention" items={AUDIO_RETENTION} value={settings.audio_retention} onChange={(v) => save.mutate({ audio_retention: v as AppSettings['audio_retention'] })} />
          <p className="text-xs text-muted-foreground">In dit prototype wordt audio nooit op schijf bewaard.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="transcript-retention">Bewaartermijn transcript</Label>
          <SimpleSelect id="transcript-retention" items={TRANSCRIPT_RETENTION} value={settings.transcript_retention} onChange={(v) => save.mutate({ transcript_retention: v as AppSettings['transcript_retention'] })} />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="consent" className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" aria-hidden /> Opnamemelding verplicht
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">Bij uploaden moet bevestigd worden dat alle deelnemers over de opname zijn geïnformeerd.</p>
          </div>
          <Switch id="consent" checked={settings.consent_required} onCheckedChange={(v) => save.mutate({ consent_required: v })} />
        </div>
      </Section>

      <Section icon={Repeat} title="Signalering" description="Wanneer een actiepunt als ‘herhaald uitgesteld’ op het dashboard verschijnt.">
        <div className="grid gap-1.5">
          <Label htmlFor="threshold">Grens “herhaald uitgesteld”</Label>
          <div className="flex items-center gap-2">
            <Input
              id="threshold"
              type="number"
              min={1}
              max={10}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              onBlur={saveThreshold}
              onKeyDown={(e) => e.key === 'Enter' && saveThreshold()}
              className="w-20 tabular-nums"
            />
            <span className="text-sm text-muted-foreground">× uitgesteld of vaker (standaard 2)</span>
          </div>
        </div>
      </Section>
    </div>
  )
}
