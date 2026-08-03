import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import Landing from './pages/Landing.jsx'
import GuidedDemo from './pages/GuidedDemo.jsx'
import LiveGym from './pages/LiveGym.jsx'
import MemberDashboard from './pages/MemberDashboard.jsx'
import MemberTraining from './pages/MemberTraining.jsx'
import MemberProgress from './pages/MemberProgress.jsx'
import Assistant from './pages/Assistant.jsx'
import PTBooking from './pages/PTBooking.jsx'
import SmartFeatures from './pages/SmartFeatures.jsx'
import TrainerDesk from './pages/TrainerDesk.jsx'
import EntryExit from './pages/EntryExit.jsx'
import OwnerDashboard from './pages/OwnerDashboard.jsx'
import Billing from './pages/Billing.jsx'
import Channels from './pages/Channels.jsx'
import Reports from './pages/Reports.jsx'
import Admin from './pages/Admin.jsx'
import Integrations from './pages/Integrations.jsx'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<AppShell />}>
          <Route path="/demo" element={<GuidedDemo />} />
          <Route path="/live" element={<LiveGym />} />
          <Route path="/member" element={<MemberDashboard />} />
          <Route path="/member/training" element={<MemberTraining />} />
          <Route path="/member/progress" element={<MemberProgress />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/pt" element={<PTBooking />} />
          <Route path="/smart" element={<SmartFeatures />} />
          <Route path="/trainer" element={<TrainerDesk />} />
          <Route path="/entry" element={<EntryExit />} />
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/channels" element={<Channels />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/integrations" element={<Integrations />} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
    </>
  )
}
