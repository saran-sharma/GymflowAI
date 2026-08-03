import { useEffect, useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  UserPlus,
  MessageSquareText,
  Users,
  Menu,
  X,
  Bell,
  ArrowLeft,
} from 'lucide-react'
import Logo from './Logo.jsx'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: UserPlus, badge: '18' },
  { to: '/whatsapp', label: 'WhatsApp Bot', icon: MessageSquareText },
  { to: '/members', label: 'Members', icon: Users },
]

function NavItems({ onNavigate }) {
  return (
    <nav className="space-y-1">
      {nav.map(({ to, label, icon: Icon, badge }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent/12 text-white ring-1 ring-accent/30'
                : 'text-slate-400 hover:bg-ink-800 hover:text-slate-100',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-accent' : ''}`} />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent-soft">
                  {badge}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Sidebar — fixed on desktop, slide-over drawer on mobile */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 w-[264px] border-r border-ink-700 bg-ink-900 px-4 py-5',
          'transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between">
          <Link to="/">
            <Logo />
          </Link>
          <button
            className="rounded-lg p-2 text-slate-400 hover:bg-ink-800 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Workspace
        </p>
        <div className="mt-2">
          <NavItems onNavigate={() => setOpen(false)} />
        </div>

        <div className="absolute inset-x-4 bottom-5 space-y-3">
          <div className="rounded-xl border border-accent/25 bg-accent/[0.07] p-3.5">
            <p className="text-sm font-semibold text-white">AI Assistant is live</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Replying on WhatsApp &amp; Instagram, 24×7.
            </p>
            <span className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Connected
            </span>
          </div>
          <Link to="/" className="flex items-center gap-2 px-3 text-xs text-slate-500 hover:text-slate-300">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to website
          </Link>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="lg:pl-[264px]">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-700 bg-ink-950/85 px-4 backdrop-blur sm:px-6">
          <button
            className="rounded-lg p-2 text-slate-300 hover:bg-ink-800 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">Iron Peak Fitness</p>
            <p className="truncate text-xs text-slate-500">Koramangala, Bengaluru</p>
          </div>

          <button
            className="relative rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
            aria-label="Notifications"
          >
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-ink-950" />
          </button>

          <div className="flex items-center gap-2.5 pl-1">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/15 text-sm font-bold text-accent-soft ring-1 ring-accent/30">
              SK
            </span>
            <div className="hidden sm:block">
              <p className="text-sm font-medium leading-tight text-slate-100">Suresh K.</p>
              <p className="text-xs leading-tight text-slate-500">Owner</p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
