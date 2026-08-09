import { useMemo, useState } from 'react'
import {
  Award,
  Cake,
  CalendarClock,
  CheckCircle2,
  Clock,
  Coffee,
  Dumbbell,
  FileText,
  Fingerprint,
  Gift,
  HeartHandshake,
  Medal,
  QrCode,
  RefreshCw,
  ScanLine,
  ShoppingBag,
  Trophy,
  Users,
  Wallet,
  Watch,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Avatar,
  Badge,
  Card,
  DemoBadge,
  Meter,
  PageHeader,
  Segmented,
  SectionTitle,
  Toast,
} from '../components/ui.jsx'
import {
  badges,
  buddies,
  cafeMenu,
  challenges,
  equipment,
  inr,
  leaderboard,
  live,
  member,
  todayWorkout,
  wearables,
} from '../data/gym.js'

const cats = ['All', 'Shakes', 'Cafe', 'Supplements', 'Merch']

/* ------------------------------------------------------- check-in panel */

/** The member's side of the turnstile — QR on the phone, or fingerprint. */
function CheckIn({ onDone }) {
  const [mode, setMode] = useState('QR')
  const [stage, setStage] = useState('idle')

  const run = () => {
    setStage('reading')
    setTimeout(() => {
      setStage('done')
      onDone(`${mode} check-in accepted at 7:42 PM. You're member 39 inside — occupancy now 39/90.`)
    }, 1400)
  }

  return (
    <Card strong className="p-5">
      <SectionTitle
        icon={mode === 'QR' ? QrCode : Fingerprint}
        title="Check in"
        sub="Your pass lives on your phone. Fingerprint works if you left it in the locker."
        right={<DemoBadge>Demo / Integration Ready</DemoBadge>}
      />

      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row">
        <div className="grid h-40 w-40 shrink-0 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
          {stage === 'done' ? (
            <CheckCircle2 className="h-14 w-14 text-emerald-300" />
          ) : mode === 'QR' ? (
            /* A drawn QR stand-in — it never needs to resolve to anything. */
            <svg viewBox="0 0 21 21" className={`h-28 w-28 ${stage === 'reading' ? 'animate-pulse' : ''}`} aria-hidden="true">
              {Array.from({ length: 21 }, (_, y) =>
                Array.from({ length: 21 }, (_, x) => {
                  const corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)
                  const on = corner
                    ? x % 6 === 0 || y % 6 === 0 || (x > 1 && x < 5 && y > 1 && y < 5)
                    : (x * 7 + y * 13 + x * y) % 3 === 0
                  return on ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#ef2b3c" /> : null
                }),
              )}
            </svg>
          ) : (
            <Fingerprint className={`h-20 w-20 text-brand ${stage === 'reading' ? 'animate-pulse' : ''}`} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Segmented options={['QR', 'Fingerprint']} value={mode} onChange={(m) => { setMode(m); setStage('idle') }} />
          <p className="mt-4 text-sm font-semibold text-white">
            {stage === 'idle' && (mode === 'QR' ? 'Show this at the turnstile' : 'Place your finger on the reader')}
            {stage === 'reading' && 'Matching…'}
            {stage === 'done' && `Welcome in, ${member.name.split(' ')[0]}`}
          </p>
          <p className="num mt-1 text-xs text-zinc-500">
            {member.id} · {member.plan} · valid to {member.expiry}
          </p>
          <button onClick={run} disabled={stage === 'reading'} className="btn-primary btn-sm mt-4">
            {stage === 'reading' ? 'Scanning…' : stage === 'done' ? 'Scan again' : `Simulate ${mode} check-in`}
          </button>
        </div>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------- the page */

export default function SmartFeatures() {
  const [cat, setCat] = useState('All')
  const [cart, setCart] = useState([])
  const [toast, setToast] = useState('')
  const [renewed, setRenewed] = useState(false)
  const [paid, setPaid] = useState(false)

  const menu = useMemo(() => (cat === 'All' ? cafeMenu : cafeMenu.filter((m) => m.cat === cat)), [cat])
  const cartTotal = cart.reduce((a, i) => a + i.price, 0)

  const contended = equipment.filter((e) => e.inUse >= e.total)
  const free = equipment.reduce((a, e) => a + (e.total - e.inUse), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member"
        title="Member Smart Experience"
        sub="Everything a member needs before they leave the house and while they're on the floor — the crowd, the machines, their trainer, their plan and their bill."
        actions={<Badge tone="critical"><Users className="h-3.5 w-3.5" />{live.inside} inside now</Badge>}
      />

      {/* 1–3 · Before they leave the house */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle icon={Users} title="Live occupancy" sub="Updated by the turnstile, not by a guess" />
          <p className="num mt-4 text-4xl font-bold tracking-tightest text-white">
            {live.inside}
            <span className="text-base font-medium text-zinc-500"> / {live.capacity}</span>
          </p>
          <div className="mt-3">
            <Meter value={live.inside} max={live.capacity} tone="warn" label={live.crowdLevel} />
          </div>
          <Link to="/live" className="btn btn-ghost btn-sm mt-4 w-full">See the floor</Link>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Dumbbell} title="Equipment availability" sub="Per machine, live" />
          <p className="num mt-4 text-4xl font-bold tracking-tightest text-white">
            {free}
            <span className="text-base font-medium text-zinc-500"> free</span>
          </p>
          <ul className="mt-3 space-y-1.5">
            {contended.map((e) => (
              <li key={e.name} className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">{e.name}</span>
                <Badge tone="warn" icon={Clock}>{e.waitlist} waiting</Badge>
              </li>
            ))}
          </ul>
          <Link to="/live" className="btn btn-ghost btn-sm mt-4 w-full">Join a waitlist</Link>
        </Card>

        <Card className="p-5" strong>
          <SectionTitle icon={Clock} title="Best time to visit" sub="From today's occupancy curve" />
          <p className="mt-4 text-3xl font-bold tracking-tightest text-white">{live.bestTime}</p>
          <p className="mt-2 text-sm text-zinc-400">
            Right now the wait on the squat rack is about {live.waitMinutes} minutes. After 8:30 PM it clears.
          </p>
          <button
            onClick={() => setToast('Reminder set — we\'ll WhatsApp you at 8:20 PM when the floor clears.')}
            className="btn btn-ghost btn-sm mt-4 w-full"
          >
            Remind me then
          </button>
        </Card>
      </div>

      {/* 9 · Check-in */}
      <CheckIn onDone={setToast} />

      {/* 4–8 · What they do from the phone */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle
            icon={CalendarClock}
            title="Book a PT session"
            sub="Live trainer availability, package or paid"
            right={<Badge tone="critical">{member.ptRemaining} in package</Badge>}
          />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {['Tomorrow 7:00 PM', 'Tomorrow 8:30 PM'].map((s) => (
              <div key={s} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
                <p className="text-[11px] text-zinc-500">Coach Vikas</p>
                <p className="num mt-0.5 text-sm font-semibold text-white">{s}</p>
              </div>
            ))}
          </div>
          <Link to="/pt" className="btn-primary btn-sm mt-4 w-full">Pick a slot</Link>
        </Card>

        <Card className="p-5">
          <SectionTitle
            icon={Wallet}
            title="Pay online"
            sub="UPI, card, net banking — from the floor"
            right={<Badge tone={paid ? 'good' : 'warn'}>{paid ? 'Settled' : '1 item due'}</Badge>}
          />
          <div className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">PT session · 03 Aug</p>
              <p className="text-xs text-zinc-500">Incl. 18% GST</p>
            </div>
            <span className="num shrink-0 text-lg font-bold text-white">{inr(1200)}</span>
          </div>
          <button
            disabled={paid}
            onClick={() => { setPaid(true); setToast('₹1,200 paid by UPI. GST invoice on its way to WhatsApp.') }}
            className="btn-primary btn-sm mt-4 w-full"
          >
            {paid ? 'Paid' : 'Pay ₹1,200'}
          </button>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={FileText} title="GST invoice" sub="Every payment, with the CGST/SGST split" />
          <div className="mt-4 space-y-1.5">
            {[
              ['Latest invoice', 'SLAM/26-27/1184'],
              ['Amount', inr(50000)],
              ['CGST 9% + SGST 9%', inr(7628)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-2 last:border-0">
                <span className="text-xs text-zinc-400">{k}</span>
                <span className="num text-xs font-medium text-zinc-100">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setToast('Invoice PDF sent to your WhatsApp.')} className="btn btn-ghost btn-sm flex-1">
              Send PDF
            </button>
            <Link to="/billing" className="btn btn-ghost btn-sm flex-1">All invoices</Link>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Dumbbell} title="Workout & diet plan" sub="Written by your trainer, updated after every InBody scan" />
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
            <p className="text-sm font-semibold text-white">{todayWorkout.title}</p>
            <p className="num mt-0.5 text-xs text-zinc-500">
              {todayWorkout.block} · {todayWorkout.exercises.length} exercises · {todayWorkout.duration}
            </p>
            <div className="mt-3">
              <Meter
                value={todayWorkout.exercises.filter((e) => e.done).length}
                max={todayWorkout.exercises.length}
                tone="brand"
                label={`${todayWorkout.exercises.filter((e) => e.done).length}/${todayWorkout.exercises.length} done`}
                size="sm"
              />
            </div>
          </div>
          <Link to="/member/training" className="btn btn-ghost btn-sm mt-4 w-full">Open today's plan</Link>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            icon={RefreshCw}
            title="Membership renewal"
            sub={`${member.plan} · valid to ${member.expiry}`}
            right={<Badge tone={renewed ? 'good' : 'warn'}>{renewed ? 'Renewed' : `${member.daysLeft} days left`}</Badge>}
          />
          <div className="mt-4">
            <Meter value={365 - member.daysLeft} max={365} tone={renewed ? 'good' : 'warn'} label={`${member.daysLeft} days`} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={renewed}
              onClick={() => { setRenewed(true); setToast('Renewal confirmed for another year. Unused PT sessions carried over.') }}
              className="btn-primary btn-sm"
            >
              {renewed ? 'Renewed for a year' : 'Renew now'}
            </button>
            <button onClick={() => setToast('Freeze request raised — 15 days available on your plan.')} className="btn btn-ghost btn-sm">
              Freeze instead
            </button>
          </div>
        </Card>
      </div>

      {/* Everything below is engagement, not core operations. */}
      <div className="pt-2">
        <SectionTitle
          icon={Trophy}
          title="Also in the member app"
          sub="Engagement features that keep members coming back — secondary to the operations above"
        />
      </div>

      {/* Challenges + leaderboard */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle icon={Trophy} title="Fitness challenges" sub="Running now at the studio" />
          <div className="mt-4 space-y-3">
            {challenges.map((c) => (
              <div key={c.name} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    <p className="num mt-0.5 text-xs text-zinc-500">{c.joined} joined · {c.days} days · prize: {c.prize}</p>
                  </div>
                  <button onClick={() => setToast(`Joined ${c.name}. Good luck.`)} className="btn btn-ghost btn-sm">
                    Join
                  </button>
                </div>
                <div className="mt-3">
                  <Meter value={c.progress} tone="brand" label={`${c.progress}%`} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Medal} title="Leaderboard" sub="This month · points" />
          <div className="mt-4 space-y-2">
            {leaderboard.map((l) => (
              <div
                key={l.rank}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
                  l.you ? 'border-brand/35 bg-brand/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'
                }`}
              >
                <span className={`num w-5 shrink-0 text-sm font-bold ${l.rank <= 3 ? 'text-brand' : 'text-zinc-500'}`}>
                  {l.rank}
                </span>
                <Avatar initials={l.name.split(' ').map((p) => p[0]).join('')} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {l.name}{l.you && <span className="ml-1.5 text-xs text-brand">you</span>}
                  </p>
                  <p className="num text-[11px] text-zinc-500">{l.streak}-day streak · {l.badge}</p>
                </div>
                <span className="num shrink-0 text-sm font-semibold text-white">{l.points.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Buddies + badges */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon={HeartHandshake} title="Workout buddy matching" sub="Members who train like you, at the same time" />
          <div className="mt-4 space-y-3">
            {buddies.map((b) => (
              <div key={b.name} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar initials={b.initials} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{b.name}</p>
                    <p className="truncate text-xs text-zinc-500">{b.why}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="critical">{b.match}% match</Badge>
                  <button onClick={() => setToast(`Request sent to ${b.name}.`)} className="btn btn-ghost btn-sm">Connect</button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Award} title="Achievement badges" sub="Earned across your membership" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {badges.map((b) => (
              <div
                key={b.name}
                className={`rounded-xl border p-4 ${
                  b.earned ? 'border-brand/25 bg-brand/[0.07]' : 'border-white/[0.08] bg-white/[0.02] opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Award className={`h-5 w-5 ${b.earned ? 'text-brand' : 'text-zinc-600'}`} />
                  {b.earned && <Badge tone="good">Earned</Badge>}
                </div>
                <p className="mt-2.5 text-sm font-semibold text-white">{b.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{b.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Ordering */}
      <Card className="p-5">
        <SectionTitle
          icon={Coffee}
          title="Cafe, supplements & merch"
          sub="Order from the floor — charged to your tab or paid on pickup"
          right={<Segmented options={cats} value={cat} onChange={setCat} />}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {menu.map((m) => {
            const inCart = cart.filter((c) => c.name === m.name).length
            return (
              <div key={m.name} className="flex flex-col rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-brand">
                    {m.cat === 'Merch' ? <ShoppingBag className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
                  </span>
                  {inCart > 0 && <Badge tone="critical">{inCart} in cart</Badge>}
                </div>
                <p className="mt-3 flex-1 text-sm font-semibold text-white">{m.name}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{m.tag}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="num text-sm font-bold text-white">{inr(m.price)}</span>
                  <button onClick={() => setCart((c) => [...c, m])} className="btn btn-ghost btn-sm">Add</button>
                </div>
              </div>
            )
          })}
        </div>

        {cart.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand/[0.08] px-4 py-3.5">
            <p className="num text-sm text-zinc-200">
              {cart.length} item{cart.length > 1 ? 's' : ''} · <span className="font-bold text-white">{inr(cartTotal)}</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setCart([])} className="btn btn-ghost btn-sm">Clear</button>
              <button
                onClick={() => { setToast(`Order placed — ${inr(cartTotal)}. Ready at the counter in 6 minutes.`); setCart([]) }}
                className="btn-primary btn-sm"
              >
                Place order
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Wearables + rewards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle icon={Watch} title="Wearable integration" sub="Steps, heart rate and sleep flow into your plan" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {wearables.map((w) => (
              <div key={w.name} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{w.name}</p>
                  <p className="truncate text-xs text-zinc-500">{w.detail}</p>
                </div>
                {w.status === 'Connected' ? (
                  <Badge tone="good">Connected</Badge>
                ) : (
                  <button onClick={() => setToast(`${w.name} connected.`)} className="btn btn-ghost btn-sm shrink-0">
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Gift} title="Rewards & occasions" />
          <div className="mt-4 space-y-2.5">
            {[
              ['Attendance rewards', '50 pts per visit', ScanLine],
              ['Referral rewards', '₹500 both sides', HeartHandshake],
              ['Birthday wishes', 'Free shake on the day', Cake],
            ].map(([k, v, Icon]) => (
              <div key={k} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
                <Icon className="h-4 w-4 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{k}</p>
                  <p className="truncate text-xs text-zinc-500">{v}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setToast('2,450 points redeemed for ₹1,225 in store credit.')} className="btn-primary btn-sm mt-4 w-full">
            Redeem 2,450 points
          </button>
        </Card>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
