import { Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { NotFound } from '@/pages/NotFound'
import { Placeholder } from '@/pages/Placeholder'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="projecten" element={<Placeholder title="Projecten" phase={2} />} />
        <Route path="projecten/:projectId" element={<Placeholder title="Project" phase={2} />} />
        <Route path="actiepunten" element={<Placeholder title="Actiepunten" phase={2} />} />
        <Route path="vergaderingen" element={<Placeholder title="Vergaderingen" phase={2} />} />
        <Route path="vergaderingen/nieuw" element={<Placeholder title="Vergadering toevoegen" phase={4} />} />
        <Route path="vergaderingen/:meetingId" element={<Placeholder title="Vergadering" phase={2} />} />
        <Route path="instellingen" element={<Placeholder title="Instellingen" phase={4} />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
