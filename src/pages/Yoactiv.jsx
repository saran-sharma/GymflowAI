import { useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  Fingerprint,
  RefreshCw,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { StudioLogo } from '../components/Logo.jsx'
import { Badge, Card, DemoBadge, PageHeader, SectionTitle, Toast } from '../components/ui.jsx'
import { systemFlow, yoactivFlow } from '../data/gym.js'

const flowIcon = {
  yoactiv: Database,
  access: Fingerprint,
  gymflow: Sparkles,
  trainer: UserCheck,
  member: Users,
  owner: Building2,
}

/** What one turnstile scan sets off, end to end. */
const trace = [
  { at: 'Yoactiv', text: 'Holds the member record, the active plan and the payment history.' },
  { at: 'Access Control', text: 'Fingerprint matched at 7:42 PM. Entry event raised with a captured frame.' },
  { at: 'GymFlow AI', text: 'Occupancy moves to 38/90, crowd level Medium, best time recalculated to after 8:30 PM.' },
  { at: 'Trainer', text: "Coach Vikas sees the 8 PM client has arrived; the session is marked started." },
  { at: 'Member', text: 'WhatsApp answers "How crowded is the gym?" with the number that just changed.' },
  { at: 'Owner', text: 'Live Members card ticks up. No alert — this one is normal.' },
]

function Column({ title, sub, items, tone, icon: Icon, badge }) {
  return (
    <Card strong className={`p-5 ${tone === 'brand' ? 'ring-1 ring-brand/25' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${
            tone === 'brand' ? 'border-brand/30 bg-brand/[0.12] text-brand' : 'border-sky-400/25 bg-sky-400/[0.08] text-sky-300'
          }`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-white">{title}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>
          </div>
        </div>
        {badge}
      </div>

      <ul className="mt-5 space-y-2.5">
        {items.map((i) => (
          <li key={i.label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <p className="text-sm font-medium text-white">{i.label}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{i.detail}</p>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function Yoactiv() {
  const [toast, setToast] = useState('')
  const [step, setStep] = useState(2)
  const [syncing, setSyncing] = useState(false)

  const sync = () => {
    setSyncing(true)
    setTimeout(() => {
      setSyncing(false)
      setToast('Pulled 642 members, 6 trainers, 214 attendance events and 38 payments from Yoactiv.')
    }, 1600)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Integrated with Yoactiv"
        sub="Yoactiv stays your system of record. GymFlow AI is the operations and intelligence layer that sits on top of it — nothing gets replaced, nothing gets migrated."
        actions={<DemoBadge>Demo / Integration Ready</DemoBadge>}
      />

      {/* Connection */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="chip border-sky-400/25 bg-sky-400/[0.08] px-3.5 py-2 text-sm font-semibold text-sky-200">
            Yoactiv
          </span>
          <span className="flex items-center gap-1.5 text-zinc-600">
            <span className="h-px w-6 bg-white/15" />
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin text-brand' : ''}`} />
            <span className="h-px w-6 bg-white/15" />
          </span>
          <StudioLogo size="sm" wordmark />
          <span className="text-sm font-semibold text-white">GymFlow AI</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={syncing ? 'warn' : 'good'} icon={syncing ? RefreshCw : CheckCircle2}>
            {syncing ? 'Syncing' : 'Connected'}
          </Badge>
          <span className="text-xs text-zinc-500">Last sync 2 min ago</span>
          <button onClick={sync} disabled={syncing} className="btn btn-ghost btn-sm">
            {syncing ? 'Pulling…' : 'Sync now'}
          </button>
        </div>
      </Card>

      {/* The split */}
      <div className="relative grid gap-4 lg:grid-cols-2">
        <Column
          title="Yoactiv"
          sub="System of record — the source of truth"
          icon={Database}
          items={yoactivFlow.yoactiv}
          badge={<Badge tone="info">Owns the data</Badge>}
        />
        <Column
          title="GymFlow AI"
          sub="Smart operations & intelligence layer"
          icon={Sparkles}
          tone="brand"
          items={yoactivFlow.gymflow}
          badge={<Badge tone="critical">Adds the layer</Badge>}
        />

        {/* Direction of travel, between the two columns on desktop */}
        <span className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:grid">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-brand/30 bg-matte-950 text-brand shadow-redglow">
            <ArrowRight className="h-5 w-5" />
          </span>
        </span>
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:hidden">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-brand/30 bg-matte-950 text-brand">
            <ArrowDown className="h-4 w-4" />
          </span>
        </span>
      </div>

      <Card className="flex flex-wrap items-center gap-3 border-brand/20 bg-brand/[0.06] p-4">
        <Sparkles className="h-4 w-4 shrink-0 text-brand" />
        <p className="min-w-0 flex-1 text-sm text-zinc-300">
          <span className="font-semibold text-white">Nothing is replaced.</span> Members, plans and payments
          continue to live in Yoactiv. GymFlow AI reads them, adds accountability and intelligence, and
          writes nothing back except what you approve.
        </p>
      </Card>

      {/* End-to-end flow */}
      <Card strong className="p-5">
        <SectionTitle
          icon={ArrowRight}
          title="How an event travels"
          sub="Yoactiv → Access Control → GymFlow AI → Trainer → Member → Owner"
          right={<DemoBadge>Mock data</DemoBadge>}
        />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {systemFlow.map((s, i) => {
            const Icon = flowIcon[s.key]
            const active = i === step
            return (
              <div key={s.key} className="flex items-center gap-2">
                <button
                  onClick={() => setStep(i)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                    active
                      ? 'border-brand/50 bg-brand/[0.12] text-white'
                      : i < step
                        ? 'border-white/15 bg-white/[0.05] text-zinc-300'
                        : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand' : ''}`} />
                  <span className="text-xs font-medium">{s.label}</span>
                </button>
                {i < systemFlow.length - 1 && (
                  <ArrowRight className={`hidden h-3.5 w-3.5 shrink-0 sm:block ${i < step ? 'text-brand' : 'text-zinc-700'}`} />
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-5 animate-fade-up rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
          <p className="eyebrow">Step {step + 1} of {systemFlow.length}</p>
          <p className="mt-1.5 text-lg font-semibold text-white">{systemFlow[step].label}</p>
          <p className="mt-1 text-sm text-zinc-400">{systemFlow[step].detail}</p>
          <p className="mt-3.5 rounded-xl border border-brand/20 bg-brand/[0.06] px-4 py-3 text-sm text-zinc-300">
            {trace[step].text}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setStep((s) => (s + 1) % systemFlow.length)}
              className="btn-primary btn-sm"
            >
              Next step
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <Link to="/accountability" className="btn btn-ghost btn-sm">Trainer accountability</Link>
            <Link to="/owner" className="btn btn-ghost btn-sm">Owner dashboard</Link>
          </div>
        </div>
      </Card>

      {/* Integration points */}
      <Card className="p-5">
        <SectionTitle
          icon={Wallet}
          title="Integration points"
          sub="Each one is built against a mock in this demo and ready to be pointed at the live system"
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            { name: 'Yoactiv API', desc: 'Members, plans, payments, attendance', status: 'Demo / Integration Ready' },
            { name: 'Biometric controller', desc: 'Fingerprint and Face ID check-in events', status: 'Demo / Integration Ready' },
            { name: 'QR turnstile', desc: 'Member and trainer QR scans', status: 'Demo / Integration Ready' },
            { name: 'InBody 770', desc: '15-metric body composition scans', status: 'Demo / Integration Ready' },
            { name: 'WhatsApp Business API', desc: 'Member assistant and owner alerts', status: 'Demo / Integration Ready' },
            { name: 'Payment gateway', desc: 'PT payments, renewals and GST invoices', status: 'Demo / Integration Ready' },
          ].map((i) => (
            <div key={i.name} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">{i.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{i.desc}</p>
              <DemoBadge className="mt-3">{i.status}</DemoBadge>
            </div>
          ))}
        </div>
        <button
          onClick={() => setToast('Integration checklist sent to your WhatsApp — one page, no jargon.')}
          className="btn btn-ghost btn-sm mt-5"
        >
          Send me the checklist
        </button>
      </Card>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
