import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'

const ActionItems = lazy(() => import('@/pages/ActionItems').then((m) => ({ default: m.ActionItems })))
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const MeetingDetail = lazy(() => import('@/pages/MeetingDetail').then((m) => ({ default: m.MeetingDetail })))
const Meetings = lazy(() => import('@/pages/Meetings').then((m) => ({ default: m.Meetings })))
const NewMeeting = lazy(() => import('@/pages/NewMeeting').then((m) => ({ default: m.NewMeeting })))
const NotFound = lazy(() => import('@/pages/NotFound').then((m) => ({ default: m.NotFound })))
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail').then((m) => ({ default: m.ProjectDetail })))
const Projects = lazy(() => import('@/pages/Projects').then((m) => ({ default: m.Projects })))
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })))

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
