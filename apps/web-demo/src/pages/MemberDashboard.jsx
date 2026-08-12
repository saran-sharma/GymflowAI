import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  Droplets,
  Flame,
  Gift,
  Minus,
  Percent,
  Plus,
  QrCode,
  RefreshCw,
  Scale,
  Snowflake,
  Ticket,
  Users,
  Zap,
} from 'lucide-react'
import { Badge, Card, KeyValue, Meter, Modal, PageHeader, Ring, SectionTitle, StatCard, Toast } from '../components/ui.jsx'
import { inr, member, todayDiet, todayWorkout, vitals } from '../data/gym.js'

/** Deterministic 8-week attendance grid — same shape every render. */
const weeks = Array.from({ length: 8 }, (_, w) =>
  Array.from({ length: 7 }, (_, d) => {
    const seed = (w * 7 + d) % 11
    return seed !== 3 && seed !== 8 && !(d === 6 && w % 2 === 0)
  }),
)

function QrModal({ open, onClose, onDone }) {
  // A blocky QR-like mark, drawn deterministically. Not a scannable code.
  const cells = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21
    const y = Math.floor(i / 21)
    const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)
    if (finder) {
      const lx = x % 14
      const ly = y % 14
      const inRing = lx === 0 || lx === 6 || ly === 0 || ly === 6
      const inCore = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4
      return inRing || inCore
    }
    return (x * 7 + y * 13 + ((x * y) % 5)) % 3 === 0
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="QR check-in"
      sub="Hold this up to the turnstile scanner"
      footer={
        <button className="btn-primary w-full" onClick={() => { onDone('Checked in at 7:44 PM. Occupancy updated to 39.'); onClose() }}>
          Simulate scan
        </button>
      }
    >
      <div className="flex flex-col items-center">
        <div className="rounded-2xl bg-white p-4">
          <div className="grid gap-0" style={{ gridTemplateColumns: 'repeat(21, 8px)' }}>
            {cells.map((on, i) => (
              <span key={i} style={{ width: 8, height: 8, background: on ? '#08080a' : 'transparent' }} />
            ))}
          </div>
        </div>
        <p className="num mt-4 text-sm font-semibold text-white">{member.id}</p>
        <p className="text-xs text-zinc-500">{member.name} · {member.plan}</p>
        <p className="mt-3 text-center text-xs text-zinc-500">
          Code refreshes every 60 seconds. Face and fingerprint also work at the main entrance.
        </p>
      </div>
    </Modal>
  )
}

function RenewModal({ open, onClose, onDone }) {
  const [plan, setPlan] = useState('Elite Annual')
  const plans = [
    { name: 'Elite Annual', price: 50000, note: 'Includes 12 PT sessions + monthly InBody', best: true },
    { name: 'Elite Half-Yearly', price: 28000, note: 'Includes 6 PT sessions' },
    { name: 'Elite Quarterly', price: 15000, note: 'Includes 3 PT sessions' },
  ]
  const chosen = plans.find((p) => p.name === plan)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Renew membership"
      sub={`Current plan ends ${member.expiry}`}
      footer={
        <button className="btn-primary w-full" onClick={() => { onDone(`${plan} renewed — ${inr(chosen.price)} paid. GST invoice sent on WhatsApp.`); onClose() }}>
          Pay {inr(chosen.price)} · UPI
        </button>
      }
    >
      <div className="space-y-2.5">
        {plans.map((p) => (
          <button
            key={p.name}
            onClick={() => setPlan(p.name)}
            className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors ${
              plan === p.name ? 'border-brand/50 bg-brand/10' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
            }`}
          >
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                {p.name}
                {p.best && <Badge tone="critical">Best value</Badge>}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">{p.note}</p>
            </div>
            <span className="num shrink-0 text-sm font-bold text-white">{inr(p.price)}</span>
          </button>
        ))}
        <p className="pt-2 text-xs text-zinc-500">
          Renewing before expiry keeps this year's rate and carries over your unused PT sessions.
        </p>
      </div>
    </Modal>
  )
}

function FreezeModal({ open, onClose, onDone }) {
  const [days, setDays] = useState(15)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Freeze membership"
      sub={`${member.freezeDaysLeft} freeze days left this year`}
      footer={
        <button className="btn-primary w-full" onClick={() => { onDone(`Membership frozen for ${days} days. Expiry moves to 04 Dec 2026.`); onClose() }}>
          Freeze for {days} days
        </button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
          <button onClick={() => setDays((d) => Math.max(5, d - 5))} className="btn btn-ghost btn-sm" aria-label="Fewer days">
            <Minus className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="num text-3xl font-bold tracking-tightest text-white">{days}</p>
            <p className="text-xs text-zinc-500">days</p>
          </div>
          <button onClick={() => setDays((d) => Math.min(member.freezeDaysLeft, d + 5))} className="btn btn-ghost btn-sm" aria-label="More days">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <KeyValue
          rows={[
            ['Freeze fee', inr(1000)],
            ['New expiry date', '04 Dec 2026'],
            ['PT sessions', 'Paused, not lost'],
          ]}
        />
        <p className="text-xs text-zinc-500">
          Travel, injury or work — freezing keeps your rate locked. Unfreeze any time from the app.
        </p>
      </div>
    </Modal>
  )
}

export default function MemberDashboard() {
  const [toast, setToast] = useState('')
  const [qr, setQr] = useState(false)
  const [renew, setRenew] = useState(false)
  const [freeze, setFreeze] = useState(false)
  const [water, setWater] = useState(vitals.water.value)

  const done = todayWorkout.exercises.filter((e) => e.done).length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Member · ${member.id}`}
        title={`Evening, ${member.name.split(' ')[0]}`}
        sub={`${member.plan} · member since ${member.since}. You're on a ${member.streak}-day streak.`}
        actions={
          <>
            <button onClick={() => setQr(true)} className="btn btn-ghost btn-sm">
              <QrCode className="h-3.5 w-3.5" />
              QR check-in
            </button>
            <button onClick={() => setRenew(true)} className="btn-primary btn-sm">
              <RefreshCw className="h-3.5 w-3.5" />
              Renew
            </button>
          </>
        }
      />

      {/* Membership status */}
      <Card strong className="p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{member.plan}</h2>
              <Badge tone="good">Active</Badge>
            </div>
            <p className="mt-1.5 text-sm text-zinc-400">
              Expires {member.expiry} · {member.daysLeft} days left
            </p>

            <div className="mt-4 max-w-md">
              <Meter value={365 - member.daysLeft} max={365} tone="brand" label={`${member.daysLeft}d left`} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => setRenew(true)} className="btn-primary btn-sm">
                <RefreshCw className="h-3.5 w-3.5" />
                Renew membership
              </button>
              <button onClick={() => setFreeze(true)} className="btn btn-ghost btn-sm">
                <Snowflake className="h-3.5 w-3.5" />
                Freeze ({member.freezeDaysLeft}d left)
              </button>
              <button onClick={() => setToast('Guest pass sent to your WhatsApp. Valid for 7 days.')} className="btn btn-ghost btn-sm">
                <Ticket className="h-3.5 w-3.5" />
                Guest pass ({member.guestPasses})
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-5">
            <Ring value={member.attendancePct} label={`${member.attendancePct}%`} sub="attendance" size={116} stroke={9} />
            <div className="space-y-3">
              {[
                ['Streak', `${member.streak} days`, Flame],
                ['This month', `${member.visitsThisMonth} visits`, CalendarClock],
                ['Best streak', `${member.bestStreak} days`, Zap],
              ].map(([k, v, Icon]) => (
                <div key={k} className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-brand" />
                  <div>
                    <p className="text-[11px] text-zinc-500">{k}</p>
                    <p className="num text-sm font-semibold text-white">{v}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Body metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Body weight" value={`${vitals.weight.value} kg`} delta={`${vitals.weight.delta} kg`} trend="up" hint={`target ${vitals.weight.target} kg`} icon={Scale} />
        <StatCard label="Body fat" value={`${vitals.bodyFat.value}%`} delta={`${vitals.bodyFat.delta} pp`} trend="up" hint={`target ${vitals.bodyFat.target}%`} icon={Percent} featured />
        <StatCard label="Muscle mass" value={`${vitals.muscle.value} kg`} delta={`+${vitals.muscle.delta} kg`} trend="up" hint={`target ${vitals.muscle.target} kg`} icon={Zap} />
        <StatCard label="Today's calories" value={`${todayDiet.consumed}`} delta={`${todayDiet.target - todayDiet.consumed} left`} trend="flat" hint={`of ${todayDiet.target} kcal`} icon={Flame} />
      </div>

      {/* Today */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Workout */}
        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            icon={Zap}
            title="Today's workout"
            sub={`${todayWorkout.title} · ${todayWorkout.block} · ${todayWorkout.duration}`}
            right={<Badge tone="neutral">{done}/{todayWorkout.exercises.length} done</Badge>}
          />
          <div className="mt-4 space-y-2">
            {todayWorkout.exercises.map((e) => (
              <div
                key={e.name}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  e.done ? 'border-white/[0.08] bg-white/[0.02]' : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${
                    e.done ? 'border-brand/40 bg-brand/20 text-brand-soft' : 'border-white/15 text-zinc-500'
                  }`}>
                    {e.done ? '✓' : ''}
                  </span>
                  <p className={`truncate text-sm ${e.done ? 'text-zinc-500 line-through' : 'font-medium text-white'}`}>
                    {e.name}
                  </p>
                </div>
                <div className="num flex shrink-0 items-center gap-3 text-xs text-zinc-400">
                  <span>{e.sets}</span>
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-semibold text-zinc-200">{e.load}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setToast('Workout logged. Volume 11,480 kg — a personal best for this block.')} className="btn-primary btn-sm">
              Finish workout
            </button>
            <Link to="/member/training" className="btn btn-ghost btn-sm">
              Full plan
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Card>

        {/* Water + PT */}
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle icon={Droplets} title="Water intake" sub={`Target ${vitals.water.target} L`} />
            <p className="num mt-4 text-3xl font-bold tracking-tightest text-white">
              {water.toFixed(1)}
              <span className="text-base font-medium text-zinc-500"> / {vitals.water.target} L</span>
            </p>
            <div className="mt-3">
              <Meter value={water} max={vitals.water.target} tone="brand" showValue={false} />
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setWater((w) => Math.min(vitals.water.target, +(w + 0.25).toFixed(2)))} className="btn btn-ghost btn-sm flex-1">
                <Plus className="h-3.5 w-3.5" />
                250 ml
              </button>
              <button onClick={() => setWater((w) => Math.max(0, +(w - 0.25).toFixed(2)))} className="btn btn-ghost btn-sm" aria-label="Remove 250 ml">
                <Minus className="h-3.5 w-3.5" />
              </button>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={CalendarClock} title="Next PT session" sub="Coach Vikas Menon" />
            <p className="mt-4 text-lg font-bold tracking-tight text-white">Tomorrow · 7:00 PM</p>
            <p className="mt-1 text-sm text-zinc-400">Pull · Back &amp; Biceps</p>
            <div className="mt-4">
              <Meter value={member.ptTotal - member.ptRemaining} max={member.ptTotal} tone="brand" label={`${member.ptRemaining} left`} />
            </div>
            <div className="mt-4 flex gap-2">
              <Link to="/pt" className="btn btn-ghost btn-sm flex-1">Reschedule</Link>
              <Link to="/pt" className="btn-primary btn-sm flex-1">Book more</Link>
            </div>
          </Card>
        </div>
      </div>

      {/* Attendance grid + rewards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            icon={Flame}
            title="Attendance"
            sub="Last 8 weeks · each square is a day"
            right={<Badge tone="critical"><Flame className="h-3.5 w-3.5" />{member.streak}-day streak</Badge>}
          />
          <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1.5">
                {week.map((on, di) => (
                  <span
                    key={di}
                    title={on ? 'Checked in' : 'Rest day'}
                    className={`h-4 w-4 rounded-[3px] ${on ? 'bg-brand' : 'bg-white/[0.07]'}`}
                    style={{ opacity: on ? 0.45 + (wi / weeks.length) * 0.55 : 1 }}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand align-middle" />
            Checked in ·
            <span className="mx-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-white/[0.07] align-middle" />
            Rest day · {member.visitsThisMonth} visits this month
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Gift} title="Rewards" sub="Referrals and points" />
          <p className="num mt-4 text-3xl font-bold tracking-tightest text-white">
            {member.rewardPoints.toLocaleString('en-IN')}
            <span className="text-sm font-medium text-zinc-500"> pts</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">Worth {inr(Math.round(member.rewardPoints / 2))} at the cafe or store</p>

          <div className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-zinc-300">
                <Users className="h-4 w-4 text-brand" />
                Referrals
              </span>
              <span className="num text-sm font-semibold text-white">{member.referrals}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-zinc-300">
                <Ticket className="h-4 w-4 text-brand" />
                Guest passes
              </span>
              <span className="num text-sm font-semibold text-white">{member.guestPasses}</span>
            </div>
          </div>

          <button onClick={() => setToast('Referral link copied. Both of you get ₹500 off.')} className="btn btn-ghost btn-sm mt-4 w-full">
            Share referral link
          </button>
        </Card>
      </div>

      <QrModal open={qr} onClose={() => setQr(false)} onDone={setToast} />
      <RenewModal open={renew} onClose={() => setRenew(false)} onDone={setToast} />
      <FreezeModal open={freeze} onClose={() => setFreeze(false)} onDone={setToast} />
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
