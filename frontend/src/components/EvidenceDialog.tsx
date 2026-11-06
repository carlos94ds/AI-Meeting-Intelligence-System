import { Link2, Paperclip } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAddEvidence } from '@/hooks/mutations'
import type { ActionItem } from '@/lib/types'

interface EvidenceDialogProps {
  item: ActionItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}

export function EvidenceDialog({ item, open, onOpenChange, onDone }: EvidenceDialogProps) {
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mutation = useAddEvidence()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const link = url.trim()
    if (!link && !file) return setError('Voeg een link of een bestand toe.')
    if (link && !/^https?:\/\//.test(link)) return setError('De link moet beginnen met http:// of https://.')
    setError(null)
    const form = new FormData()
    if (link) form.set('url', link)
    if (file) form.set('file', file)
    if (note.trim()) form.set('note', note.trim())
    mutation.mutate(
      { id: item.id, form },
      {
        onSuccess: () => {
          onOpenChange(false)
          setUrl('')
          setFile(null)
          setNote('')
          onDone?.()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Bewijs toevoegen</DialogTitle>
            <DialogDescription>
              Met bewijs wordt <span className="font-medium text-foreground">“{item.title}”</span> bevestigd als afgerond.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="evidence-url">
              <Link2 className="size-3.5" aria-hidden /> Link
            </Label>
            <Input
              id="evidence-url"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="evidence-file">
              <Paperclip className="size-3.5" aria-hidden /> Of een bestand
            </Label>
            <Input id="evidence-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">In het prototype wordt alleen de bestandsnaam opgeslagen.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="evidence-note">Toelichting (optioneel)</Label>
            <Textarea id="evidence-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Bezig…' : 'Bewijs toevoegen en afronden'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
