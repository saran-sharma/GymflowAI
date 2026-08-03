import { Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import AppShell from './components/AppShell.jsx'
import Landing from './pages/Landing.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Leads from './pages/Leads.jsx'
import WhatsAppDemo from './pages/WhatsAppDemo.jsx'
import Members from './pages/Members.jsx'

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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/whatsapp" element={<WhatsAppDemo />} />
          <Route path="/members" element={<Members />} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
    </>
  )
}
