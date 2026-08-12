import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  CreditCard,
  Database,
  Dumbbell,
  Fingerprint,
  Gauge,
  MessageCircle,
  Radio,
  RotateCcw,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Badge, Card, LivePulse, Meter, PageHeader, SectionTitle, Toast } from '../components/ui.jsx'
import { inr, live, member, trainers } from '../data/gym.js'

/**
 * The showcase journey, in the order the systems actually fire: Yoactiv hands
 * over the records, the turnstile raises an event, GymFlow AI scores it, and it
 * lands on the trainer, the member and the owner. Each step names the system it
 * touches and the state it changes, so the demo shows cause and effect rather
 * than a slideshow of screens.
 */
const steps = [
  {
    icon: Database,
    title: 'Yoactiv hands over the records',
    who: 'Yoactiv',
    detail: 'Members, memberships, trainers, payments and raw attendance sync across. Yoactiv keeps owning them — GymFlow AI only reads.',
    effect: '642 members · 6 trainers · 38 payments synced',
    link: '/yoactiv',
    linkLabel: 'Open Yoactiv Integration',
  },
  {
    icon: Fingerprint,
    title: 'A trainer clocks in late',
    who: 'Trainer',
    detail: 'Rahul Deshpande scans at 5:26 PM against a 5:00 PM shift — 26 minutes past the 10-minute grace. Photo and timestamp captured at the device.',
    effect: 'Late mark 7 this month · punctuality 71%',
    link: '/accountability',
    linkLabel: 'Open Trainer Accountability',
  },
  {
    icon: BellRing,
    title: 'The owner is told, not asked',
    who: 'Owner',
    detail: 'A WhatsApp alert goes out immediately. Rahul drops out of incentive eligibility for the cycle, and the floor punctuality average falls to 86%.',
    effect: 'Owner alerted · incentive eligibility revoked',
    link: '/owner',
    linkLabel: 'Open Owner Dashboard',
  },
  {
    icon: Radio,
    title: 'Checks the live gym crowd',
    who: 'Member',
    detail: `Aditya opens the app at 6:40 PM. ${live.inside} members inside, medium crowd, squat racks all busy. The AI suggests going after 8:30 PM — or booking a trainer now.`,
    effect: 'Read live occupancy',
    link: '/live',
    linkLabel: 'Open Live Gym',
  },
  {
    icon: Dumbbell,
    title: 'Books a PT session',
    who: 'Member',
    detail: `Coach ${trainers[0].name} has 7:00 PM free tomorrow. Aditya takes the slot straight from the assistant.`,
    effect: 'Slot held · trainer calendar updated',
    link: '/pt',
    linkLabel: 'Open PT Booking',
  },
  {
    icon: CreditCard,
    title: 'Pays online',
    who: 'Member',
    detail: `${inr(1200)} on UPI, confirmed in about a second. His package still has ${member.ptRemaining} sessions, so this one is an extra.`,
    effect: 'Payment captured via Razorpay',
    link: '/billing',
    linkLabel: 'Open Billing',
  },
  {
    icon: MessageCircle,
    title: 'Gets a GST invoice on WhatsApp',
    who: 'System',
    detail: 'Invoice SLAM/26-27/1204 generated with CGST and SGST split, PDF delivered to his WhatsApp before he closes the app.',
    effect: 'Invoice issued · ledger updated',
    link: '/channels',
    linkLabel: 'Open WhatsApp AI',
  },
  {
    icon: Fingerprint,
    title: 'Checks in with fingerprint',
    who: 'Member',
    detail: 'Next evening he taps the turnstile. Match in 0.4 seconds — no card, no front desk queue.',
    effect: 'Occupancy 38 → 39 · attendance logged',
    link: '/entry',
    linkLabel: 'Open Entry & Exit',
  },
  {
    icon: Activity,
    title: 'InBody report syncs itself',
    who: 'Hardware',
    detail: 'He steps off the InBody 770. Fifteen metrics land in his app and on the trainer desk before he reaches the floor.',
    effect: '15 metrics synced · trend recalculated',
    link: '/member/progress',
    linkLabel: 'Open Progress & InBody',
  },
  {
    icon: BellRing,
    title: 'Trainer gets the arrival ping',
    who: 'Trainer',
    detail: `Coach ${trainers[0].name} sees "Aditya has arrived — body fat down 0.6% since last scan" and walks over already knowing what changed.`,
    effect: 'Trainer notified with context',
    link: '/trainer',
    linkLabel: 'Open Trainer Desk',
  },
  {
    icon: Dumbbell,
    title: "Today's workout appears",
    who: 'System',
    detail: 'Push · Chest & Shoulders, week 6, adjusted around his shoulder note. No paper, no asking.',
    effect: 'Workout served to the member app',
    link: '/member',
    linkLabel: 'Open Member Dashboard',
  },
  {
    icon: TrendingUp,
    title: 'Progress updates after the workout',
    who: 'Member',
    detail: 'Volume logged at 11,480 kg — a best for this block. The streak goes to 15 days and the leaderboard reshuffles.',
    effect: 'Volume, streak and points updated',
    link: '/smart',
    linkLabel: 'Open Smart Experience',
  },
  {
    icon: Gauge,
    title: 'Owner dashboard moves in real time',
    who: 'Owner',
    detail: 'Occupancy, PT revenue and today\'s entries all tick up on the owner\'s screen — no report to run, no one to ask.',
    effect: 'Revenue +₹1,200 · occupancy +1',
    link: '/owner',
    linkLabel: 'Open Owner Dashboard',
  },
]

/** Live counters that move as the journey progresses. */
function stateAt(step) {
  return {
    punctuality: step >= 2 ? 86 : 90,
    occupancy: live.inside + (step >= 8 ? 1 : 0),
    revenue: 1842000 + (step >= 6 ? 1200 : 0),
    ptToday: 5 + (step >= 5 ? 1 : 0),
  }
}

export default function GuidedDemo() {
  const [done, setDone] = useState(0) // number of completed steps
  const [toast, setToast] = useState('')
  const s = stateAt(done)
  const complete = done >= steps.length

  const advance = () => {
    if (complete) return
    const next = done + 1
    setDone(next)
    setToast(steps[done].effect)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Special demo experience"
        title="One day at SLAM, end to end"
        sub="Yoactiv → Access Control → GymFlow AI → Trainer → Member → Owner. Run the steps in order and watch the numbers at the top move as you go."
        actions={
          <>
            <LivePulse label={complete ? 'Journey complete' : `Step ${done + 1} of ${steps.length}`} />
            {done > 0 && (
              <button onClick={() => { setDone(0); setToast('Demo reset.') }} className="btn btn-ghost btn-sm">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
          </>
        }
      />

      {/* Live state strip */}
      <Card strong className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Trainer punctuality', `${s.punctuality}%`, Timer, done >= 2],
            ['Occupancy', `${s.occupancy}/${live.capacity}`, Users, done >= 8],
            ['Revenue today', inr(s.revenue - 1842000 + 124800), CreditCard, done >= 6],
            ['PT sessions today', s.ptToday, Dumbbell, done >= 5],
          ].map(([label, value, Icon, moved]) => (
            <div
              key={label}
              className={`rounded-xl border px-4 py-3.5 transition-colors ${
                moved ? 'border-brand/35 bg-brand/[0.09]' : 'border-white/[0.08] bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
                <Icon className={`h-4 w-4 ${moved ? 'text-brand' : 'text-zinc-600'}`} />
              </div>
              <p className="num mt-1.5 text-2xl font-bold tracking-tightest text-white">{value}</p>
              {moved && <p className="mt-0.5 text-[11px] text-brand-soft">updated by this journey</p>}
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-zinc-400">Journey progress</span>
            <span className="num font-semibold text-white">{done} of {steps.length}</span>
          </div>
          <Meter value={done} max={steps.length} tone="brand" showValue={false} size="lg" />
        </div>
      </Card>

      {/* Steps */}
      <div className="grid gap-3">
        {steps.map((st, i) => {
          const Icon = st.icon
          const isDone = i < done
          const isNext = i === done
          return (
            <Card
              key={st.title}
              className={`group p-5 transition-all hover:opacity-100 ${
                isNext ? 'ring-1 ring-brand/40' : isDone ? 'opacity-80' : 'opacity-55'
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {/* Any step is reachable directly — run them in order for the
                    full story, or jump straight to the one you want to show. */}
                <button
                  onClick={() => setDone(i + 1)}
                  title={`Jump to step ${i + 1}`}
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border transition-transform hover:scale-105 ${
                    isDone
                      ? 'border-brand/30 bg-brand/15 text-brand'
                      : isNext
                        ? 'border-brand/50 bg-brand text-white'
                        : 'border-white/10 bg-white/[0.04] text-zinc-500'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-xs font-bold text-brand">{String(i + 1).padStart(2, '0')}</span>
                    <h3 className="text-base font-semibold text-white">{st.title}</h3>
                    <Badge tone={st.who === 'Member' ? 'neutral' : st.who === 'Owner' ? 'critical' : 'info'}>{st.who}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{st.detail}</p>

                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    {isDone && (
                      <span className="chip border-brand/30 bg-brand/10 text-brand-soft">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {st.effect}
                      </span>
                    )}
                    <Link to={st.link} className="btn btn-ghost btn-sm">
                      {st.linkLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>

                {isNext ? (
                  <button onClick={advance} className="btn-primary shrink-0 self-start">
                    Run this step
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => setDone(i + 1)}
                    className="btn btn-ghost btn-sm shrink-0 self-start opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    Jump here
                  </button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {complete && (
        <Card strong className="animate-fade-up p-8 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-brand/30 bg-brand/15">
            <CheckCircle2 className="h-8 w-8 text-brand" />
          </span>
          <h2 className="mt-5 text-2xl font-bold tracking-tightest text-white">
            That was one member, one evening
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
            Six systems moved without a single staff member typing anything: live occupancy, PT
            booking, payments, GST invoicing, biometric entry, InBody, the trainer's queue and the
            owner's revenue line. Multiply it by 642 members.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/owner" className="btn-primary btn-lg">
              See the owner's view
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button onClick={() => setDone(0)} className="btn btn-ghost btn-lg">
              <RotateCcw className="h-4 w-4" />
              Run it again
            </button>
          </div>
        </Card>
      )}

      {!complete && (
        <Card className="p-5">
          <SectionTitle
            icon={Gauge}
            title="Why this matters"
            sub="What the gym owner is actually buying"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ['Member experience', 'No queues, no paperwork, no asking the desk anything.'],
              ['Trainer productivity', 'Walks into every session already knowing what changed.'],
              ['Business growth', 'Revenue, churn and occupancy visible before month end.'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">{k}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{v}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
