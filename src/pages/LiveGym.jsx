import { useEffect, useState } from 'react'
import {
  Car,
  Clock3,
  DoorOpen,
  Droplets,
  Dumbbell,
  Lock,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Badge, Card, LivePulse, Meter, PageHeader, Ring, SectionTitle, StatCard, Toast } from '../components/ui.jsx'
import { ChartCard, OccupancyBars } from '../components/charts.jsx'
import { equipment, live, occupancyByHour, studio } from '../data/gym.js'

const CURRENT_HOUR = '7p'

function availability(item) {
  const free = item.total - item.inUse
  if (free === 0) return { tone: 'critical', label: 'Full', free }
  if (free <= Math.max(1, Math.floor(item.total * 0.25))) return { tone: 'warn', label: 'Busy', free }
  return { tone: 'good', label: 'Free', free }
}

/** Occupancy drifts a little so the screen feels live during a demo. */
function useDrift(base, spread = 2, ms = 4000) {
  const [n, setN] = useState(base)
  useEffect(() => {
    const t = setInterval(() => {
      setN((v) => {
        const next = v + (Math.random() < 0.5 ? -1 : 1) * Math.ceil(Math.random() * spread)
        return Math.max(base - 6, Math.min(base + 6, next))
      })
    }, ms)
    return () => clearInterval(t)
  }, [base, spread, ms])
  return n
}

export default function LiveGym() {
  const inside = useDrift(live.inside)
  const [toast, setToast] = useState('')
  const pct = Math.round((inside / live.capacity) * 100)
  const crowd = pct > 70 ? 'High' : pct > 40 ? 'Medium' : 'Low'
  const crowdTone = pct > 70 ? 'critical' : pct > 40 ? 'warn' : 'good'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Hero feature"
        title="Live Gym Experience"
        sub={`What's happening on the floor at ${studio.name} right now — crowd, equipment, lockers and parking.`}
        actions={<LivePulse label="Updating live" />}
      />

      {/* Headline occupancy */}
      <Card strong className="overflow-hidden p-0">
        <div className="grid gap-6 p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="flex justify-center lg:justify-start">
            <Ring
              value={inside}
              max={live.capacity}
              size={148}
              stroke={12}
              label={`${inside}`}
              sub={`of ${live.capacity} capacity`}
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">
                {crowd} crowd · {pct}% full
              </h2>
              <Badge tone={crowdTone}>{crowd}</Badge>
            </div>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              {live.trainersOnFloor} trainers on the floor. Entry queue is clear, average wait to
              start your first set is about {live.waitMinutes} minutes.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ['Entries today', live.entriesToday, DoorOpen],
                ['Exits today', live.exitsToday, DoorOpen],
                ['Est. wait', `${live.waitMinutes} min`, Clock3],
              ].map(([k, v, Icon]) => (
                <div key={k} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                  <div>
                    <p className="text-[11px] text-zinc-500">{k}</p>
                    <p className="num text-sm font-semibold text-white">{v}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-brand/25 bg-brand/[0.08] p-5 lg:w-64">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
              <Sparkles className="h-3.5 w-3.5" />
              Best time to visit
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tightest text-white">{live.bestTime}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              Occupancy drops below 30 and every rack frees up. Wait time falls under 2 minutes.
            </p>
            <button
              onClick={() => setToast('Reminder set — we’ll ping you on WhatsApp at 8:20 PM.')}
              className="btn btn-ghost btn-sm mt-4 w-full"
            >
              Remind me at 8:20 PM
            </button>
          </div>
        </div>
      </Card>

      {/* Facility availability */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Members inside" value={inside} delta={`${pct}% full`} trend="flat" hint="live headcount" icon={Users} featured />
        <StatCard label="Free lockers" value={`${live.lockers.free}/${live.lockers.total}`} delta="Reservable" trend="up" hint="smart lockers" icon={Lock} />
        <StatCard label="Showers free" value={`${live.showers.free}/${live.showers.total}`} delta="No queue" trend="up" hint="men + women" icon={Droplets} />
        <StatCard label="Parking free" value={`${live.parking.free}/${live.parking.total}`} delta="Filling up" trend="down" hint="covered bays" icon={Car} />
      </div>

      {/* Peak hours */}
      <ChartCard
        title="Occupancy through the day"
        sub="Today's headcount by hour · the highlighted bar is the current hour"
        data={occupancyByHour}
        columns={[
          { key: 'hour', label: 'Hour' },
          { key: 'people', label: 'Members inside' },
        ]}
        height={260}
        right={<Badge tone="warn"><TrendingUp className="h-3.5 w-3.5" />Peak 7–8 PM</Badge>}
      >
        <OccupancyBars data={occupancyByHour} currentHour={CURRENT_HOUR} capacity={live.capacity} />
      </ChartCard>

      {/* Equipment */}
      <Card className="p-5">
        <SectionTitle
          icon={Dumbbell}
          title="Equipment availability"
          sub="Live from floor sensors · tap to join a waitlist"
          right={<Badge tone="neutral">{equipment.reduce((a, e) => a + (e.total - e.inUse), 0)} stations free</Badge>}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {equipment.map((e) => {
            const a = availability(e)
            return (
              <div key={e.name} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{e.name}</p>
                  <Badge tone={a.tone}>{a.label}</Badge>
                </div>

                <p className="num mt-3 text-2xl font-bold tracking-tightest text-white">
                  {a.free}
                  <span className="text-sm font-medium text-zinc-500"> / {e.total} free</span>
                </p>

                <div className="mt-3">
                  <Meter value={e.inUse} max={e.total} tone={a.tone === 'critical' ? 'critical' : a.tone === 'warn' ? 'warn' : 'good'} label={`${e.inUse} in use`} size="sm" />
                </div>

                {a.free === 0 ? (
                  <button
                    onClick={() => setToast(`You're #${e.waitlist + 1} on the ${e.name} waitlist. We'll notify you.`)}
                    className="btn btn-ghost btn-sm mt-3 w-full"
                  >
                    Join waitlist {e.waitlist > 0 && `· ${e.waitlist} ahead`}
                  </button>
                ) : (
                  <p className="mt-3 text-center text-[11px] text-zinc-500">
                    {e.waitlist > 0 ? `${e.waitlist} waiting` : 'Walk straight up'}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Facilities detail */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle icon={Lock} title="Smart lockers" sub="Reserve before you arrive" />
          {/* Occupied is the accent — a taken locker is the thing you can't have.
              Count matches the live figure above. */}
          <div className="mt-4 grid grid-cols-10 gap-1.5">
            {Array.from({ length: live.lockers.total }, (_, i) => {
              const taken = (i * 17) % live.lockers.total < live.lockers.total - live.lockers.free
              return (
                <span
                  key={i}
                  title={`Locker ${i + 1} · ${taken ? 'occupied' : 'free'}`}
                  className={`aspect-square rounded ${taken ? 'bg-brand/70' : 'bg-white/20'}`}
                />
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-white/20 align-middle" />
              Free ·
              <span className="mx-1.5 inline-block h-2 w-2 rounded-sm bg-brand/70 align-middle" />
              Occupied
            </p>
            <button onClick={() => setToast('Locker 14 reserved for the next 3 hours.')} className="btn btn-ghost btn-sm">
              Reserve
            </button>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Droplets} title="Showers" sub="Live cubicle status" />
          <div className="mt-4 space-y-2.5">
            {['Men · Cubicle 1', 'Men · Cubicle 2', 'Men · Cubicle 3', 'Women · Cubicle 1', 'Women · Cubicle 2'].map((s, i) => (
              <div key={s} className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                <span className="text-sm text-zinc-300">{s}</span>
                <Badge tone={i % 2 === 0 ? 'good' : 'warn'}>{i % 2 === 0 ? 'Free' : 'In use'}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Car} title="Parking" sub="Covered bays, members only" />
          <div className="mt-4 flex items-center justify-center py-2">
            <Ring value={live.parking.free} max={live.parking.total} size={132} label={`${live.parking.free}`} sub="bays free" />
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500">
            Two-wheeler parking always available on the ground level.
          </p>
          <button onClick={() => setToast('Bay B-07 held for 20 minutes.')} className="btn btn-ghost btn-sm mt-4 w-full">
            Hold a bay
          </button>
        </Card>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
