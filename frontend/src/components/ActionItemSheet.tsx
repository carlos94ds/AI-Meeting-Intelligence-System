import { CalendarClock, Check, ExternalLink, FileCheck2, FolderKanban, Info, Paperclip, Pencil, Target, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ActionItemEditForm } from '@/components/ActionItemEditForm'
import { DeadlineLabel } from '@/components/ActionItemMeta'
import { EvidenceDialog } from '@/components/EvidenceDialog'
import { HistoryTimeline } from '@/components/HistoryTimeline'
import { OwnerChip } from '@/components/OwnerChip'
import { SourceLink } from '@/components/SourceLink'
import { ErrorState } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirmItem, usePatchItem, useRejectItem } from '@/hooks/mutations'
import { useActionItem, useHistory, useProject } from '@/hooks/queries'
import { formatDate } from '@/lib/format'
import { manualTargets, STATUS_META } from '@/lib/status'
import type { ActionItem, ActionStatus } from '@/lib/types'

/**
 * Zijpaneel met details en volledige historie van een actiepunt.
 * Wordt geopend via `?item=<id>` in de URL, vanaf elke pagina.
 */
export function ActionItemSheetHost() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('item')
  const id = raw ? Number(raw) : undefined
  const close = () => {
    const next = new URLSearchParams(params)
    next.delete('item')
    setParams(next, { replace: true })
  }
  return (
    <Sheet open={id !== undefined} onOpenChange={(open) => !open && close()}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-xl">
        {id !== undefined && <SheetBody id={id} />}
      </SheetContent>
    </Sheet>
  )
}

function SheetBody({ id }: { id: number }) {
  const { data: item, isPending, isError, error, refetch } = useActionItem(id)
  const history = useHistory(id)

  if (isPending) {
    return (
      <div className="space-y-4 p-6" aria-busy="true">
        <SheetTitle className="sr-only">Actiepunt wordt geladen</SheetTitle>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="p-6">
        <SheetTitle className="sr-only">Fout</SheetTitle>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    )
  }
  return (
    <>
      <SheetHeader className="gap-2 border-b p-6 pr-12">
        <div>
          <StatusBadge status={item.status} postponeCount={item.postpone_count} />
        </div>
        <SheetTitle className="text-lg leading-snug">{item.title}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <FolderKanban className="size-3.5" aria-hidden />
            <Link to={`/projecten/${item.project_id}`} className="hover:underline">
              {item.project_name}
            </Link>
          </span>
          {item.goal_title && (
            <span className="inline-flex items-center gap-1">
              <Target className="size-3.5" aria-hidden /> {item.goal_title}
            </span>
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 p-6">
        <ItemDetails item={item} />
        <ItemActions item={item} />
        <Separator />
        <section aria-labelledby="historie">
          <h3 id="historie" className="mb-4 text-sm font-semibold">
            Historie
          </h3>
          {history.isPending ? (
            <Skeleton className="h-32" />
          ) : history.isError ? (
            <ErrorState error={history.error} onRetry={() => void history.refetch()} />
          ) : (
            <HistoryTimeline changes={history.data} />
          )}
        </section>
      </div>
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  )
}

function ItemDetails({ item }: { item: ActionItem }) {
  const { data: project } = useProject(item.project_id)
  const [editing, setEditing] = useState(false)
  const deadlineMoved = item.original_deadline && item.deadline && item.original_deadline !== item.deadline

  return (
    <section aria-label="Gegevens" className="space-y-4">
      {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
      {editing ? (
        <ActionItemEditForm item={item} participants={project?.participants ?? []} onDone={() => setEditing(false)} />
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Fact label="Eigenaar">
            <OwnerChip owner={item.owner} />
          </Fact>
          <Fact label="Deadline">
            <DeadlineLabel item={item} />
            {deadlineMoved && (
              <div className="mt-0.5 text-xs text-muted-foreground">oorspronkelijk {formatDate(item.original_deadline!)}</div>
            )}
          </Fact>
          <Fact label="Herkomst">
            {item.meeting_id ? (
              <span className="flex flex-wrap items-center gap-1">
                <Link to={`/vergaderingen/${item.meeting_id}`} className="hover:underline">
                  {item.meeting_title}
                </Link>
                <SourceLink segmentId={item.source_segment_id} meetingId={item.source_meeting_id} />
              </span>
            ) : (
              'Handmatig toegevoegd'
            )}
          </Fact>
          <Fact label={item.status === 'afgerond' ? 'Bevestigd door' : 'Uitgesteld'}>
            {item.status === 'afgerond' ? (
              (item.confirmed_by ?? '—')
            ) : item.postpone_count > 0 ? (
              `${item.postpone_count}×`
            ) : (
              <span className="text-muted-foreground">Nee</span>
            )}
          </Fact>
          {(item.evidence_url || item.evidence_filename || item.evidence_note) && (
            <div className="col-span-2">
              <Fact label="Bewijs">
                <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
                  {item.evidence_url && (
                    <a
                      href={item.evidence_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 break-all text-primary hover:underline"
                    >
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden /> {item.evidence_url}
                    </a>
                  )}
                  {item.evidence_filename && (
                    <div className="inline-flex items-center gap-1.5">
                      <Paperclip className="size-3.5" aria-hidden /> {item.evidence_filename}
                    </div>
                  )}
                  {item.evidence_note && <p className="text-xs text-muted-foreground">{item.evidence_note}</p>}
                </div>
              </Fact>
            </div>
          )}
        </dl>
      )}
      {!editing && item.status !== 'afgerond' && item.status !== 'vervallen' && (
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil /> Eigenaar of deadline aanpassen
        </Button>
      )}
    </section>
  )
}

function ItemActions({ item }: { item: ActionItem }) {
  const confirm = useConfirmItem()
  const reject = useRejectItem()
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const canEvidence = ['open', 'uitgesteld', 'gemeld_afgerond'].includes(item.status)

  return (
    <section aria-label="Acties" className="space-y-4">
      {item.status === 'gemeld_afgerond' && (
        <div className="flex gap-2 rounded-lg border border-status-gemeld/40 bg-status-gemeld-bg p-3 text-sm text-status-gemeld">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Gemeld, nog niet bevestigd.</span> Iemand heeft gezegd dat dit klaar is. Het wordt pas
            “Afgerond” na een expliciete bevestiging of met bewijs.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {item.status === 'voorgesteld' && (
          <>
            <Button onClick={() => confirm.mutate(item)} disabled={confirm.isPending}>
              <Check /> Bevestigen
            </Button>
            <Button variant="outline" onClick={() => reject.mutate(item)} disabled={reject.isPending}>
              <X /> Verwerpen
            </Button>
          </>
        )}
        {item.status === 'gemeld_afgerond' && (
          <Button onClick={() => confirm.mutate(item)} disabled={confirm.isPending}>
            <Check /> Afronding bevestigen
          </Button>
        )}
        {canEvidence && (
          <Button variant={item.status === 'gemeld_afgerond' ? 'outline' : 'default'} onClick={() => setEvidenceOpen(true)}>
            <FileCheck2 /> Bewijs toevoegen
          </Button>
        )}
      </div>
      {item.status !== 'voorgesteld' && <StatusChangeForm item={item} />}
      <EvidenceDialog item={item} open={evidenceOpen} onOpenChange={setEvidenceOpen} />
    </section>
  )
}

function StatusChangeForm({ item }: { item: ActionItem }) {
  const targets = manualTargets(item.status)
  const [target, setTarget] = useState<ActionStatus | null>(null)
  const [deadline, setDeadline] = useState('')
  const [note, setNote] = useState('')
  const patch = usePatchItem('Status gewijzigd')
  if (targets.length === 0) return null

  const items = Object.fromEntries(targets.map((s) => [s, STATUS_META[s].label]))
  const needsDeadline = target === 'uitgesteld'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!target) return
    patch.mutate(
      {
        id: item.id,
        patch: { status: target, deadline: needsDeadline ? deadline : undefined, note: note.trim() || undefined },
      },
      {
        onSuccess: () => {
          setTarget(null)
          setDeadline('')
          setNote('')
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Status wijzigen
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select items={items} value={target} onValueChange={(v) => setTarget(v as ActionStatus | null)}>
          <SelectTrigger aria-label="Nieuwe status" className="w-52">
            <SelectValue placeholder="Kies een status" />
          </SelectTrigger>
          <SelectContent>
            {targets.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {needsDeadline && (
          <div className="grid gap-1">
            <Label htmlFor={`new-deadline-${item.id}`} className="text-xs">
              Nieuwe deadline
            </Label>
            <Input
              id={`new-deadline-${item.id}`}
              type="date"
              required
              min={item.deadline ?? undefined}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-40"
            />
          </div>
        )}
        <Button type="submit" variant="secondary" disabled={!target || (needsDeadline && !deadline) || patch.isPending}>
          Wijzigen
        </Button>
      </div>
      {target && (
        <Input placeholder="Toelichting (optioneel)" aria-label="Toelichting" value={note} onChange={(e) => setNote(e.target.value)} />
      )}
      {item.status === 'gemeld_afgerond' && (
        <p className="text-xs text-muted-foreground">“Afgerond” kan hier niet gekozen worden: gebruik Bevestigen of Bewijs toevoegen.</p>
      )}
    </form>
  )
}
