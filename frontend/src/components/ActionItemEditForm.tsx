import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePatchItem } from '@/hooks/mutations'
import type { ActionItem, ActionItemPatch, Participant } from '@/lib/types'

const NONE = 'geen'

interface Props {
  item: ActionItem
  participants: Participant[]
  onDone: () => void
}

/** Inline aanpassen van titel, eigenaar en deadline. */
export function ActionItemEditForm({ item, participants, onDone }: Props) {
  const [title, setTitle] = useState(item.title)
  const [owner, setOwner] = useState(item.owner ? String(item.owner.id) : NONE)
  const [deadline, setDeadline] = useState(item.deadline ?? '')
  const patch = usePatchItem('Wijzigingen opgeslagen')

  const ownerItems: Record<string, string> = { [NONE]: 'Geen eigenaar' }
  for (const p of participants) ownerItems[String(p.id)] = `${p.name}${p.role ? ` · ${p.role}` : ''}`

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body: ActionItemPatch = {}
    if (title.trim() && title.trim() !== item.title) body.title = title.trim()
    if (owner === NONE && item.owner) body.clear_owner = true
    if (owner !== NONE && Number(owner) !== item.owner?.id) body.owner_id = Number(owner)
    if (!deadline && item.deadline) body.clear_deadline = true
    if (deadline && deadline !== item.deadline) body.deadline = deadline
    if (Object.keys(body).length === 0) return onDone()
    patch.mutate({ id: item.id, patch: body }, { onSuccess: onDone })
  }

  const idBase = `edit-${item.id}`
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border bg-muted/40 p-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idBase}-title`}>Omschrijving</Label>
        <Input id={`${idBase}-title`} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idBase}-owner`}>Eigenaar</Label>
          <Select items={ownerItems} value={owner} onValueChange={(v) => setOwner(v ?? NONE)}>
            <SelectTrigger id={`${idBase}-owner`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ownerItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idBase}-deadline`}>Deadline</Label>
          <Input id={`${idBase}-deadline`} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Annuleren
        </Button>
        <Button type="submit" size="sm" disabled={patch.isPending}>
          Opslaan
        </Button>
      </div>
    </form>
  )
}
