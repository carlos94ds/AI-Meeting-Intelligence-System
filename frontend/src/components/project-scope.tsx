import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/** Globale projectkiezer in de bovenbalk. `undefined` = alle projecten. */
interface ProjectScope {
  projectId: number | undefined
  setProjectId: (id: number | undefined) => void
}

const ProjectScopeContext = createContext<ProjectScope | null>(null)
const KEY = 'ami-project'

function readStored(): number | undefined {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? Number(raw) || undefined : undefined
  } catch {
    return undefined
  }
}

export function ProjectScopeProvider({ children }: { children: ReactNode }) {
  const [projectId, setState] = useState<number | undefined>(readStored)
  const value = useMemo<ProjectScope>(
    () => ({
      projectId,
      setProjectId: (id) => {
        setState(id)
        try {
          if (id === undefined) localStorage.removeItem(KEY)
          else localStorage.setItem(KEY, String(id))
        } catch {
          /* opslag niet beschikbaar */
        }
      },
    }),
    [projectId],
  )
  return <ProjectScopeContext.Provider value={value}>{children}</ProjectScopeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProjectScope(): ProjectScope {
  const ctx = useContext(ProjectScopeContext)
  if (!ctx) throw new Error('useProjectScope moet binnen ProjectScopeProvider gebruikt worden')
  return ctx
}
