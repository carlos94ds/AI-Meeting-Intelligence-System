import { Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ActionItems } from '@/pages/ActionItems'
import { Dashboard } from '@/pages/Dashboard'
import { MeetingDetail } from '@/pages/MeetingDetail'
import { Meetings } from '@/pages/Meetings'
import { NotFound } from '@/pages/NotFound'
import { NewMeeting } from '@/pages/NewMeeting'
import { ProjectDetail } from '@/pages/ProjectDetail'
import { Projects } from '@/pages/Projects'
import { Settings } from '@/pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="projecten" element={<Projects />} />
        <Route path="projecten/:projectId" element={<ProjectDetail />} />
        <Route path="actiepunten" element={<ActionItems />} />
        <Route path="vergaderingen" element={<Meetings />} />
        <Route path="vergaderingen/nieuw" element={<NewMeeting />} />
        <Route path="vergaderingen/:meetingId" element={<MeetingDetail />} />
        <Route path="instellingen" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
