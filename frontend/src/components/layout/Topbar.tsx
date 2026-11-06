import { Monitor, Moon, Plus, Search, Sun } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ButtonLink } from '@/components/ButtonLink'
import { useProjectScope } from '@/components/project-scope'
import { useTheme, type Theme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProjects } from '@/hooks/queries'

const ALL = 'alle'

export function Topbar() {
  const { data: projects } = useProjects()
  const { projectId, setProjectId } = useProjectScope()
  const { theme, resolved, setTheme } = useTheme()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const items: Record<string, string> = { [ALL]: 'Alle projecten' }
  for (const p of projects ?? []) items[String(p.id)] = p.name

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    const q = search.trim()
    navigate(q ? `/actiepunten?q=${encodeURIComponent(q)}` : '/actiepunten')
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-6">
      <Select
        items={items}
        value={projectId === undefined ? ALL : String(projectId)}
        onValueChange={(value) => setProjectId(!value || value === ALL ? undefined : Number(value))}
      >
        <SelectTrigger aria-label="Project kiezen" className="w-44 md:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(items).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <form onSubmit={onSearch} role="search" className="relative hidden max-w-sm flex-1 md:block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek actiepunten…"
          aria-label="Zoek actiepunten"
          className="pl-8"
        />
      </form>

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Thema wijzigen" />}>
            {resolved === 'dark' ? <Moon /> : <Sun />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <DropdownMenuRadioItem value="light">
                <Sun /> Licht
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> Donker
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> Systeem
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <ButtonLink to="/vergaderingen/nieuw" size="lg" className="px-3">
          <Plus /> <span className="hidden sm:inline">Vergadering toevoegen</span>
        </ButtonLink>
      </div>
    </header>
  )
}
