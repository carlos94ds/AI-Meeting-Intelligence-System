import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Initials } from '@/components/OwnerChip'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCreateProject } from '@/hooks/mutations'
import { useParticipants } from '@/hooks/queries'

export function NewProjectDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [goals, setGoals] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const { data: participants } = useParticipants()
  const create = useCreateProject()
  const navigate = useNavigate()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        goals: goals.split('\n').map((g) => g.trim()).filter(Boolean),
        participant_ids: selected,
      },
      {
        onSuccess: (p) => {
          setOpen(false)
          setName('')
          setDescription('')
          setGoals('')
          setSelected([])
          navigate(`/projecten/${p.id}`)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus /> Nieuw project
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Nieuw project</DialogTitle>
            <DialogDescription>Doelstellingen helpen de AI om actiepunten aan het juiste doel te koppelen.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="np-name">Naam</Label>
            <Input id="np-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="np-desc">Omschrijving</Label>
            <Textarea id="np-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="np-goals">Doelstellingen (één per regel)</Label>
            <Textarea id="np-goals" rows={3} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder={'Nieuw ontwerp opgeleverd\nBudget goedgekeurd'} />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Deelnemers</legend>
            <div className="grid grid-cols-2 gap-2">
              {participants?.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted">
                  <Checkbox
                    checked={selected.includes(p.id)}
                    onCheckedChange={(v) => setSelected((s) => (v ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                  />
                  <Initials name={p.name} color={p.color} />
                  <span className="min-w-0 truncate">
                    {p.name} <span className="text-muted-foreground">· {p.role}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              Project aanmaken
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
