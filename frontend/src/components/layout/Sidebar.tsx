import { CalendarDays, FolderKanban, LayoutDashboard, ListChecks, Settings, Sparkles } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projecten', label: 'Projecten', icon: FolderKanban },
  { to: '/actiepunten', label: 'Actiepunten', icon: ListChecks },
  { to: '/vergaderingen', label: 'Vergaderingen', icon: CalendarDays },
  { to: '/instellingen', label: 'Instellingen', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:w-60">
      <div className="flex h-14 items-center gap-2.5 px-4 lg:px-5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <div className="hidden min-w-0 lg:block">
          <div className="truncate text-sm font-semibold leading-tight">Meeting Intelligence</div>
          <div className="truncate text-[11px] text-muted-foreground">Van vergaderingen naar resultaten</div>
        </div>
      </div>
      <nav aria-label="Hoofdnavigatie" className="flex flex-1 flex-col gap-0.5 px-2.5 py-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <Tooltip key={to}>
            <TooltipTrigger
              render={
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex h-9 items-center justify-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring lg:justify-start',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                    )
                  }
                />
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="sr-only lg:not-sr-only">{label}</span>
            </TooltipTrigger>
            <TooltipContent side="right" className="lg:hidden">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </nav>
      <div className="hidden border-t p-4 text-[11px] leading-relaxed text-muted-foreground lg:block">
        Volgt taken en projecten, geen personen.
        <br />
        AI-modus: <span className="font-medium text-foreground">Mock (demo)</span>
      </div>
    </aside>
  )
}
