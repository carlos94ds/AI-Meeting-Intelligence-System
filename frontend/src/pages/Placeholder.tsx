import { Construction } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/States'

export function Placeholder({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={Construction}
        title="Nog in aanbouw"
        description={`Dit scherm wordt gebouwd in fase ${phase} van het prototype.`}
      />
    </>
  )
}
