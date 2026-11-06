import { Compass } from 'lucide-react'
import { ButtonLink } from '@/components/ButtonLink'
import { EmptyState } from '@/components/States'

export function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Pagina niet gevonden"
      description="Deze pagina bestaat niet (meer). Ga terug naar het dashboard."
      action={<ButtonLink to="/">Naar het dashboard</ButtonLink>}
    />
  )
}
