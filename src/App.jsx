import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
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
import TrainerAccountability from './pages/TrainerAccountability.jsx'
import Yoactiv from './pages/Yoactiv.jsx'
import EntryExit from './pages/EntryExit.jsx'
import OwnerDashboard from './pages/OwnerDashboard.jsx'
import Billing from './pages/Billing.jsx'
import Channels from './pages/Channels.jsx'
import Reports from './pages/Reports.jsx'
import Admin from './pages/Admin.jsx'
import Integrations from './pages/Integrations.jsx'

/**
 * Jump to the top on every route change — instantly, never smoothly. With
 * `scroll-behavior: smooth` a route change animates the scroll while the new
 * (often much shorter) page is already rendered, which can leave a phone
 * viewport parked in empty space below the content until you reload.
 */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    // Safari ignores behavior:'instant' on some versions — belt and braces.
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [pathname])
  return null
}

export default function App() {
  return (
    <ErrorBoundary>
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
          <Route path="/accountability" element={<TrainerAccountability />} />
          <Route path="/yoactiv" element={<Yoactiv />} />
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
    </ErrorBoundary>
  )
}
