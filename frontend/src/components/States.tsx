import { AlertTriangle, Compass, RotateCw, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ButtonLink'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center', className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={Compass}
        title="Niet gevonden"
        description={`${error.message} Mogelijk is het verwijderd of klopt de link niet.`}
        action={<ButtonLink to="/">Naar het dashboard</ButtonLink>}
      />
    )
  }
  const message = error instanceof Error ? error.message : 'Er ging iets mis bij het laden.'
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="mb-2 size-6 text-destructive" aria-hidden />
      <h3 className="text-sm font-semibold">Laden mislukt</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw /> Opnieuw proberen
        </Button>
      )}
    </div>
  )
}

export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 rounded-xl border bg-card p-5', className)} aria-hidden>
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}
