import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { CardSkeleton } from '@/components/States'
import { Skeleton } from '@/components/ui/skeleton'
import { ActionItemSheetHost } from '@/components/ActionItemSheet'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#inhoud"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Naar de inhoud
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="inhoud" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">
          <Suspense
            fallback={
              <div aria-busy="true" aria-label="Pagina wordt geladen" className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <CardSkeleton lines={5} />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      <ActionItemSheetHost />
    </div>
  )
}
