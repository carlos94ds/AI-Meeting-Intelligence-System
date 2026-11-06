import { Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ActionItems } from '@/pages/ActionItems'
import { Dashboard } from '@/pages/Dashboard'
import { MeetingDetail } from '@/pages/MeetingDetail'
import { Meetings } from '@/pages/Meetings'
import { NotFound } from '@/pages/NotFound'
import { Placeholder } from '@/pages/Placeholder'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="projecten" element={<Placeholder title="Projecten" phase={3} />} />
        <Route path="projecten/:projectId" element={<Placeholder title="Project" phase={3} />} />
        <Route path="actiepunten" element={<ActionItems />} />
        <Route path="vergaderingen" element={<Meetings />} />
        <Route path="vergaderingen/nieuw" element={<Placeholder title="Vergadering toevoegen" phase={4} />} />
        <Route path="vergaderingen/:meetingId" element={<MeetingDetail />} />
        <Route path="instellingen" element={<Placeholder title="Instellingen" phase={4} />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
