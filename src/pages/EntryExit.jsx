import { useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Fingerprint,
  QrCode,
  ScanFace,
  Users,
} from 'lucide-react'
import { Badge, Card, LivePulse, Meter, PageHeader, Ring, SectionTitle, StatCard, Toast } from '../components/ui.jsx'
import { entryFeed, live } from '../data/gym.js'

const methods = [
  { name: 'Fingerprint', icon: Fingerprint, detail: '2 turnstiles · 0.4s match', who: 'Members, staff' },
  { name: 'Face Recognition', icon: ScanFace, detail: 'Main entrance · 0.2s match', who: 'Members' },
  { name: 'QR Code', icon: QrCode, detail: 'Rotating code · 60s expiry', who: 'Members, guests' },
  { name: 'RFID Card', icon: CreditCard, detail: 'Tap reader · staff wing', who: 'Trainers, employees' },
]

const typeTone = { Member: 'neutral', Trainer: 'info', Guest: 'warn', Employee: 'good' }

export default function EntryExit() {
  const [feed, setFeed] = useState(entryFeed)
  const [inside, setInside] = useState(live.inside)
  const [scanning, setScanning] = useState(null)
  const [toast, setToast] = useState('')

  const simulate = (methodName) => {
    setScanning(methodName)
    setTimeout(() => {
      const now = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()
      setFeed((f) => [
        { id: Date.now(), name: 'Aditya Rao', type: 'Member', method: methodName, dir: 'in', at: now, fresh: true },
        ...f,
      ])
      setInside((n) => n + 1)
      setScanning(null)
      setToast(`${methodName} accepted — Aditya Rao checked in. Occupancy now ${inside + 1}.`)
    }, 1400)
  }

  const pct = Math.round((inside / live.capacity) * 100)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Staff"
        title="Live Entry & Exit"
        sub="Every door event, from every device, updating attendance and occupancy in the same second."
        actions={<LivePulse label="Devices online" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Inside now" value={inside} delta={`${pct}% full`} trend="flat" hint={`of ${live.capacity}`} icon={Users} featured />
        <StatCard label="Entries today" value={live.entriesToday + (inside - live.inside)} delta="+12%" trend="up" hint="vs yesterday" icon={ArrowDownLeft} />
        <StatCard label="Exits today" value={live.exitsToday} delta="—" trend="flat" hint="since 5 AM" icon={ArrowUpRight} />
        <StatCard label="Staff on floor" value={live.trainersOnFloor} delta="All present" trend="up" hint="trainers" icon={Users} />
      </div>

      {/* Devices */}
      <Card strong className="p-5">
        <SectionTitle
          icon={Fingerprint}
          title="Entry devices"
          sub="Tap any device to simulate a check-in"
          right={<Badge tone="good">4 devices online</Badge>}
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {methods.map(({ name, icon: Icon, detail, who }) => {
            const busy = scanning === name
            return (
              <button
                key={name}
                onClick={() => simulate(name)}
                disabled={!!scanning}
                className={`relative overflow-hidden rounded-xl border p-5 text-left transition-all ${
                  busy ? 'border-brand/50 bg-brand/10' : 'border-white/10 bg-white/[0.03] hover:-translate-y-0.5 hover:border-brand/30'
                } disabled:opacity-60`}
              >
                {busy && (
                  <span className="absolute inset-x-0 top-0 h-0.5 bg-brand">
                    <span className="block h-full w-1/3 animate-pulse bg-white/60" />
                  </span>
                )}
                <span className={`grid h-12 w-12 place-items-center rounded-xl border ${
                  busy ? 'border-brand/40 bg-brand/20 text-brand' : 'border-white/10 bg-white/[0.05] text-brand'
                }`}>
                  <Icon className={`h-6 w-6 ${busy ? 'animate-pulse' : ''}`} />
                </span>
                <p className="mt-4 text-sm font-semibold text-white">{name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{detail}</p>
                <p className="mt-2.5 text-[11px] text-zinc-600">{who}</p>
                <p className="mt-3 text-xs font-medium text-brand">
                  {busy ? 'Reading…' : 'Simulate scan'}
                </p>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Feed + occupancy */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            icon={Users}
            title="Real-time attendance feed"
            sub="Members, guests, trainers and employees"
            right={<Badge tone="neutral">{feed.length} events</Badge>}
          />
          <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {feed.map((e) => (
              <div
                key={e.id}
                className={`flex items-center gap-3.5 rounded-xl border px-4 py-3 ${
                  e.fresh ? 'animate-fade-up border-brand/35 bg-brand/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'
                }`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${
                  e.dir === 'in' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.05] text-zinc-400'
                }`}>
                  {e.dir === 'in' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{e.name}</p>
                  <p className="text-xs text-zinc-500">
                    {e.dir === 'in' ? 'Entered' : 'Exited'} via {e.method}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={typeTone[e.type]}>{e.type}</Badge>
                  <span className="num w-16 text-right text-xs text-zinc-500">{e.at}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle icon={Users} title="Occupancy" sub="Live headcount vs capacity" />
            <div className="mt-4 flex justify-center">
              <Ring value={inside} max={live.capacity} size={148} stroke={12} label={`${inside}`} sub={`of ${live.capacity}`} />
            </div>
            <p className="mt-4 text-center text-sm text-zinc-400">
              {pct}% full · {live.capacity - inside} spaces left
            </p>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={Users} title="Who's inside" sub="By category" />
            <div className="mt-4 space-y-4">
              {[
                ['Members', 31, 90],
                ['Trainers', 5, 8],
                ['Guests', 2, 10],
                ['Employees', 4, 6],
              ].map(([label, n, max]) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm text-zinc-300">{label}</span>
                    <span className="num text-sm font-semibold text-white">{n}</span>
                  </div>
                  <Meter value={n} max={max} tone="brand" showValue={false} size="sm" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
