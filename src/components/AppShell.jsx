import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  Bell,
  Blocks,
  CalendarClock,
  Check,
  ChevronDown,
  CreditCard,
  Database,
  Dumbbell,
  FileBarChart,
  Fingerprint,
  Gauge,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from 'lucide-react'
import Logo, { StudioLogo } from './Logo.jsx'
import { live, member, studio } from '../data/gym.js'

const groups = [
  {
    label: 'Experience',
    items: [
      { to: '/live', label: 'Live Gym', icon: Radio, live: true },
      { to: '/demo', label: 'Guided Demo', icon: Sparkles, tag: '10 steps' },
    ],
  },
  {
    label: 'Member',
    items: [
      { to: '/member', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/member/training', label: 'Training & Diet', icon: Dumbbell },
      { to: '/member/progress', label: 'Progress & InBody', icon: Activity },
      { to: '/assistant', label: 'AI Assistant', icon: Sparkles },
      { to: '/pt', label: 'PT Booking', icon: CalendarClock },
      { to: '/smart', label: 'Smart Experience', icon: Trophy },
    ],
  },
  {
    label: 'Staff',
    items: [
      { to: '/trainer', label: 'Trainer Desk', icon: UserRound },
      { to: '/entry', label: 'Entry & Exit', icon: Fingerprint },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/owner', label: 'Owner Dashboard', icon: Gauge },
      { to: '/accountability', label: 'Trainer Accountability', icon: ShieldCheck, tag: 'New' },
      { to: '/yoactiv', label: 'Yoactiv Integration', icon: Database, tag: 'New' },
      { to: '/billing', label: 'Billing & GST', icon: CreditCard },
      { to: '/channels', label: 'WhatsApp & Instagram', icon: MessagesSquare },
      { to: '/reports', label: 'Reports', icon: FileBarChart },
      { to: '/admin', label: 'Admin', icon: Settings2 },
      { to: '/integrations', label: 'Integrations', icon: Blocks },
    ],
  },
]

function NavList({ onNavigate }) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            {g.label}
          </p>
          <nav className="mt-1.5 space-y-0.5">
            {g.items.map(({ to, label, icon: Icon, tag, live: isLive }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  [
                    'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'border border-brand/25 bg-brand/[0.12] text-white'
                      : 'border border-transparent text-zinc-400 hover:bg-white/[0.05] hover:text-white',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`h-[17px] w-[17px] shrink-0 ${isActive ? 'text-brand' : ''}`} />
                    <span className="flex-1 truncate">{label}</span>
                    {isLive && (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-pulsering rounded-full bg-brand" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                      </span>
                    )}
                    {tag && (
                      <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                        {tag}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
    </div>
  )
}

/** Who the demo is currently being shown as. */
const personas = [
  { id: 'member', label: 'Member', name: member.name, sub: member.plan, initials: member.initials, home: '/member', group: 'Member' },
  { id: 'trainer', label: 'Trainer', name: 'Vikas Menon', sub: 'Head Trainer', initials: 'VM', home: '/trainer', group: 'Staff' },
  { id: 'owner', label: 'Owner', name: 'Karan Shetty', sub: 'Owner', initials: 'KS', home: '/owner', group: 'Business' },
]

function PersonaSwitcher() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Infer the active persona from the route, so the header always matches
  // whatever screen you're actually on.
  const active =
    personas.find((p) => groups.find((g) => g.label === p.group)?.items.some((i) => pathname.startsWith(i.to))) ??
    personas[0]

  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-white/20"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full border border-brand/30 bg-brand/15 text-xs font-bold text-white">
          {active.initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-zinc-100">{active.name}</span>
          <span className="block text-[11px] leading-tight text-zinc-500">Viewing as {active.label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-60 animate-fade-up overflow-hidden rounded-xl border border-white/10 bg-matte-900 shadow-lift"
          >
            <p className="border-b border-white/[0.08] px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
              Switch demo view
            </p>
            {personas.map((p) => (
              <button
                key={p.id}
                role="menuitem"
                onClick={() => { setOpen(false); navigate(p.home) }}
                className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                  p.id === active.id ? 'bg-brand/[0.10]' : 'hover:bg-white/[0.05]'
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-bold text-white">
                  {p.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{p.name}</span>
                  <span className="block truncate text-xs text-zinc-500">{p.sub}</span>
                </span>
                {p.id === active.id && <Check className="h-4 w-4 shrink-0 text-brand" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="min-h-screen">
      {/* Ambient ground — a single warm pool behind the whole app. */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(70% 50% at 50% -10%, rgba(239,43,60,.10) 0%, transparent 65%), #08080a',
        }}
      />

      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-white/[0.08] bg-matte-900/85 backdrop-blur-xl',
          'transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Link to="/">
            <Logo />
          </Link>
          <button className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The studio this workspace belongs to. */}
        <div className="mx-4 flex items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
          <StudioLogo size="md" className="h-8" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <NavList onNavigate={() => setOpen(false)} />
        </div>

        <div className="border-t border-white/[0.08] px-4 py-3">
          <div className="flex items-center justify-between rounded-xl border border-brand/25 bg-brand/[0.08] px-3 py-2.5">
            <p className="text-xs font-semibold text-white">
              Gym is open
              <span className="ml-1.5 font-normal text-zinc-400">{live.crowdLevel}</span>
            </p>
            <span className="num text-sm font-bold text-brand-soft">
              {live.inside}/{live.capacity}
            </span>
          </div>
          <Link to="/" className="mt-2 flex items-center gap-2 px-1 text-xs text-zinc-500 hover:text-zinc-300">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to website
          </Link>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}

      <div className="lg:pl-[268px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/[0.08] bg-matte-950/80 px-4 backdrop-blur-xl sm:px-6">
          <button className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{studio.name}</p>
            <p className="truncate text-xs text-zinc-500">
              {studio.area}, {studio.city} · {live.inside} inside now
            </p>
          </div>

          <button className="relative rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Notifications">
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand ring-2 ring-matte-950" />
          </button>

          {/* Persona switcher — flip the demo between the three people who use
              it, and land on that person's home screen. */}
          <PersonaSwitcher />
        </header>

        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
