import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Blocks,
  Check,
  CreditCard,
  Fingerprint,
  Menu,
  MessagesSquare,
  Play,
  Quote,
  Radio,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react'
import Logo, { StudioLogo } from '../components/Logo.jsx'
import Scene from '../components/Scene.jsx'
import { Badge, Card, Modal, Toast } from '../components/ui.jsx'
import { live, pricingPlans, studio, testimonials } from '../data/gym.js'

const features = [
  {
    icon: Radio,
    title: 'Live Gym Experience',
    photo: 'featureLiveGym',
    body: 'Members see the crowd, equipment and wait times before they leave home. Evening congestion drops without adding a square foot.',
    points: ['Live occupancy and best-time-to-visit', 'Per-machine availability and waitlists'],
    hero: true,
    scene: 'rack',
  },
  {
    icon: Sparkles,
    title: 'AI Member Assistant',
    photo: 'featureAssistant',
    body: 'Books PT, generates workouts and diets, renews memberships and answers the crowd question — in chat, day or night.',
    points: ['Handles the top 9 member requests', 'Escalates cleanly to a trainer'],
    scene: 'kettlebells',
    palette: 'ember',
  },
  {
    icon: Activity,
    title: 'InBody, Synced',
    photo: 'featureInbody',
    body: 'Scans land in the member app and the trainer desk the moment the member steps off the machine. No clipboards, no re-typing.',
    points: ['15 metrics with monthly comparison', 'AI reads the trend, trainer confirms it'],
    scene: 'figure',
    palette: 'slate',
  },
  {
    icon: Fingerprint,
    title: 'Frictionless Entry',
    photo: 'featureEntry',
    body: 'Fingerprint, face, QR or RFID — every entry and exit updates attendance and occupancy in the same second.',
    points: ['Members, guests, trainers and staff', 'Real-time headcount for the owner'],
    scene: 'dumbbells',
  },
  {
    icon: CreditCard,
    title: 'Billing That Files Itself',
    photo: 'featureBilling',
    body: 'GST invoices generated on payment and delivered on WhatsApp. EMI, promo codes, refunds and outstanding tracking included.',
    points: ['UPI, cards, net banking, cash, Razorpay', 'GSTR-1 ready reports'],
    scene: 'cardio',
    palette: 'slate',
  },
  {
    icon: MessagesSquare,
    title: 'WhatsApp & Instagram AI',
    photo: 'featureChannels',
    body: 'Every enquiry answered in seconds, with pricing, timings and offers — and the lead captured with a phone number.',
    points: ['Instagram DM and story-reply automation', 'Free trials booked straight into the calendar'],
    scene: 'rack',
    palette: 'ember',
  },
]

const stats = [
  ['642', 'active members'],
  ['+18%', 'revenue in 4 months'],
  ['3 min', 'avg equipment wait'],
  ['34%', 'lead conversion'],
]

function TopNav({ onTrial }) {
  const [open, setOpen] = useState(false)
  const links = [
    ['Features', '#features'],
    ['Demo', '#video'],
    ['Customers', '#testimonials'],
    ['Plans', '#pricing'],
  ]
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-matte-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/"><Logo /></Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="text-sm text-zinc-400 transition-colors hover:text-white">
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link to="/live" className="btn btn-ghost btn-sm">Open live demo</Link>
          <button onClick={onTrial} className="btn-primary btn-sm">Book Free Trial</button>
        </div>

        <button className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/[0.08] bg-matte-900 px-4 py-4 md:hidden">
          {links.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.06]">
              {label}
            </a>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to="/live" className="btn btn-ghost btn-sm">Live demo</Link>
            <button onClick={() => { setOpen(false); onTrial() }} className="btn-primary btn-sm">Book Free Trial</button>
          </div>
        </div>
      )}
    </header>
  )
}

/** Product shot: a live-occupancy panel, the thing the product is actually about. */
function HeroPanel() {
  const pct = Math.round((live.inside / live.capacity) * 100)
  return (
    <div className="relative w-full max-w-md">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-brand/10 blur-3xl" />
      <Card strong className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulsering rounded-full bg-brand" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
            </span>
            <p className="text-sm font-semibold text-white">Live now</p>
          </div>
          <span className="text-xs text-zinc-500">{studio.area}</span>
        </div>

        <div className="px-5 py-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="num text-5xl font-bold leading-none tracking-tightest text-white">{live.inside}</p>
              <p className="mt-1.5 text-sm text-zinc-400">members inside · {pct}% full</p>
            </div>
            <Badge tone="warn">{live.crowdLevel} crowd</Badge>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              ['Best time today', live.bestTime],
              ['Squat rack wait', '~9 min'],
              ['Free lockers', `${live.lockers.free}/${live.lockers.total}`],
              ['Parking', `${live.parking.free} free`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                <p className="text-[11px] text-zinc-500">{k}</p>
                <p className="num mt-0.5 text-sm font-semibold text-white">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/[0.08] bg-white/[0.02] px-5 py-3.5">
          <p className="flex items-center gap-2 text-xs text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            AI: “Go after 8:30 PM — racks free up and the wait drops to under 2 minutes.”
          </p>
        </div>
      </Card>
    </div>
  )
}

/** Demo "video": a scripted, animated product tour rather than a real file. */
function DemoVideo() {
  const [playing, setPlaying] = useState(false)
  const frames = [
    { t: '0:04', title: 'Member checks the crowd', body: '38 inside, medium crowd, best after 8:30 PM.' },
    { t: '0:21', title: 'Books PT and pays', body: 'Coach Vikas, 7 PM tomorrow. UPI in two taps.' },
    { t: '0:38', title: 'GST invoice on WhatsApp', body: '₹1,200 incl. ₹183 GST. PDF delivered instantly.' },
    { t: '0:52', title: 'Fingerprint check-in', body: 'Occupancy and attendance update in the same second.' },
    { t: '1:14', title: 'InBody syncs itself', body: '15 metrics land in the app and on the trainer desk.' },
    { t: '1:36', title: 'Owner dashboard moves', body: 'Occupancy, revenue and PT bookings, live.' },
  ]
  return (
    <Card strong className="overflow-hidden p-0">
      <div className="relative aspect-video w-full overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 70% at 20% 20%, rgba(239,43,60,.22) 0%, transparent 60%), radial-gradient(50% 60% at 85% 80%, rgba(57,135,229,.14) 0%, transparent 65%), #0e0e11',
          }}
        />
        {/* Abstract floor-plan motif rather than a stock photo. */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.13]" aria-hidden="true">
          <defs>
            <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M44 0H0v44" fill="none" stroke="#fff" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {!playing ? (
          <button
            onClick={() => setPlaying(true)}
            className="absolute inset-0 grid place-items-center"
            aria-label="Play product tour"
          >
            <span className="grid h-20 w-20 place-items-center rounded-full border border-white/20 bg-white/10 backdrop-blur transition-transform hover:scale-105">
              <Play className="ml-1 h-8 w-8 fill-white text-white" />
            </span>
          </button>
        ) : (
          <div className="absolute inset-0 overflow-y-auto p-5 sm:p-8">
            <div className="mx-auto max-w-lg space-y-2.5">
              {frames.map((f, i) => (
                <div
                  key={f.t}
                  className="flex animate-fade-up items-start gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur"
                  style={{ animationDelay: `${i * 320}ms` }}
                >
                  <span className="num mt-0.5 shrink-0 text-xs font-semibold text-brand">{f.t}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="text-xs text-zinc-400">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-3 border-t border-white/10 bg-black/50 px-4 py-3 backdrop-blur">
          <p className="text-xs text-zinc-300">
            {playing ? 'Playing product tour' : 'Product tour · 1 min 48 s'}
          </p>
          <div className="flex items-center gap-2">
            {playing && (
              <button onClick={() => setPlaying(false)} className="btn btn-ghost btn-sm">Reset</button>
            )}
            <Link to="/demo" className="btn-primary btn-sm">
              Try it yourself
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}

function TrialModal({ open, onClose, onDone }) {
  const [slot, setSlot] = useState('Tomorrow 7:00 AM')
  const slots = ['Today 8:30 PM', 'Tomorrow 6:00 AM', 'Tomorrow 7:00 AM', 'Tomorrow 6:00 PM', 'Saturday 9:00 AM']
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book a free trial"
      sub={`${studio.name} · ${studio.area}, ${studio.city}`}
      footer={
        <button
          className="btn-primary w-full"
          onClick={() => { onDone(`Free trial confirmed for ${slot}. Details sent on WhatsApp.`); onClose() }}
        >
          Confirm free trial
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-400">Your name</span>
            <input className="input" defaultValue="Aditya Rao" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-400">WhatsApp number</span>
            <input className="input" defaultValue="+91 98765 44120" />
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs text-zinc-400">Pick a slot</p>
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button
                key={s}
                onClick={() => setSlot(s)}
                className={`chip transition-colors ${
                  slot === s ? 'border-brand/40 bg-brand/[0.12] text-brand-soft' : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-xs text-zinc-400">
          Your trial includes a full-body InBody scan and one session with a trainer. Bring a towel —
          lockers and showers are free for trial guests.
        </div>
      </div>
    </Modal>
  )
}

export default function Landing() {
  const [trial, setTrial] = useState(false)
  const [toast, setToast] = useState('')

  // Smooth scrolling is scoped to this page, where the anchor links live —
  // enabling it globally makes route changes animate and can leave a phone
  // viewport in empty space.
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth'
    return () => {
      document.documentElement.style.scrollBehavior = ''
    }
  }, [])

  return (
    <div className="min-h-screen bg-matte-950">
      <TopNav onTrial={() => setTrial(true)} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(65% 55% at 15% -5%, rgba(239,43,60,.20) 0%, transparent 62%), radial-gradient(45% 45% at 92% 8%, rgba(239,43,60,.10) 0%, transparent 65%)',
          }}
        />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="animate-fade-up">
            <div className="flex flex-wrap items-center gap-3">
              <span className="chip-brand">
                <Sparkles className="h-3.5 w-3.5" />
                Built for premium studios
              </span>
              <span className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pl-3.5 pr-4">
                <span className="text-[11px] text-zinc-500">Configured for</span>
                <StudioLogo size="xs" wordmark />
              </span>
            </div>

            <h1 className="mt-6 text-[2.6rem] font-bold leading-[1.03] tracking-tightest text-white sm:text-6xl">
              The Smart Operating System for{' '}
              <span className="text-brand">Modern Gyms</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
              GymFlow AI runs the floor, the front desk and the back office — live occupancy,
              AI-booked PT, biometric entry, InBody sync and GST billing, in one system your members
              actually enjoy using.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => setTrial(true)} className="btn-primary btn-lg">
                Book Free Trial
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link to="/demo" className="btn btn-ghost btn-lg">
                <Play className="h-4 w-4" />
                Walk the 10-step demo
              </Link>
            </div>

            <dl className="mt-12 grid max-w-xl grid-cols-2 gap-6 border-t border-white/[0.08] pt-7 sm:grid-cols-4">
              {stats.map(([v, l]) => (
                <div key={l}>
                  <dt className="num text-2xl font-bold tracking-tightest text-white">{v}</dt>
                  <dd className="mt-0.5 text-[11px] leading-snug text-zinc-500">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex justify-center lg:justify-end">
            <HeroPanel />
          </div>
        </div>
      </section>

      {/* Floor strip — gives the page a visual beat between hero and features */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['rack', 'red', 'Strength floor', '4 racks · 2 platforms', 'strengthFloor'],
            ['cardio', 'slate', 'Cardio zone', '12 treadmills · 8 cycles', 'cardioZone'],
            ['dumbbells', 'ember', 'Studio', 'Functional · classes', 'studio'],
          ].map(([variant, palette, title, sub, photo]) => (
            <div key={title} className="glass overflow-hidden p-0">
              <Scene variant={variant} palette={palette} photo={photo} alt={title} ratio="aspect-[16/9]">
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="num text-xs text-zinc-400">{sub}</p>
                </div>
              </Scene>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">Platform</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tightest text-white sm:text-[2.5rem]">
            One system instead of six spreadsheets
          </h2>
          <p className="mt-4 text-zinc-400">
            Every part of the gym — floor, trainers, billing, marketing — reading from the same live data.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body, points, hero, scene, palette, photo }) => (
            <Card
              key={title}
              className={`group overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:border-white/15 ${
                hero ? 'ring-1 ring-brand/25 md:col-span-2 lg:col-span-1' : ''
              }`}
            >
              <Scene variant={scene} palette={palette} photo={photo} alt={title} ratio="aspect-[16/7]">
                <span className="absolute left-4 top-4 grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-black/45 text-white backdrop-blur">
                  <Icon className="h-5 w-5" />
                </span>
                {hero && (
                  <span className="absolute right-4 top-4">
                    <Badge tone="critical">Hero feature</Badge>
                  </span>
                )}
              </Scene>

              <div className="p-6">
                <h3 className="text-lg font-semibold tracking-tight text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
                <ul className="mt-4 space-y-2">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-zinc-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Demo video */}
      <section id="video" className="scroll-mt-20 border-y border-white/[0.08] bg-white/[0.015]">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="mb-10 max-w-2xl">
            <p className="eyebrow">See it run</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tightest text-white sm:text-[2.5rem]">
              A member's whole visit, in under two minutes
            </h2>
          </div>
          <DemoVideo />
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
        <p className="eyebrow">Customers</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tightest text-white sm:text-[2.5rem]">
          The people who run the floor
        </h2>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {testimonials.map((t) => (
            <Card key={t.name} className="flex flex-col p-6">
              <Quote className="h-6 w-6 text-brand/60" />
              <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-300">“{t.quote}”</p>
              <div className="mt-6 border-t border-white/[0.08] pt-4">
                <p className="text-sm font-semibold text-white">{t.name}</p>
                <p className="text-xs text-zinc-500">{t.role}</p>
                <p className="num mt-2.5 text-xs font-semibold text-brand-soft">{t.stat}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4">
          <span className="flex items-center gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="h-4 w-4 fill-brand text-brand" />
            ))}
          </span>
          <p className="text-sm text-zinc-300">
            <span className="num font-semibold text-white">4.8</span> from 612 Google reviews
          </p>
          <span className="hidden h-4 w-px bg-white/10 sm:block" />
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <Users className="h-4 w-4" /> 1,554 members across 3 branches
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow">Plans</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tightest text-white sm:text-[2.5rem]">
              Built around the size of your floor
            </h2>
            <p className="mt-4 text-zinc-400">
              Priced per gym, not per member — no per-seat maths and no surprise overages. We'll walk
              you through what fits once you've seen it running.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {pricingPlans.map((p) => (
              <Card
                key={p.name}
                strong={p.featured}
                className={`relative flex flex-col p-6 ${p.featured ? 'ring-1 ring-brand/40' : ''}`}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                <p className="mt-1 text-xs text-zinc-500">{p.tagline}</p>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => setTrial(true)}
                  className={`mt-7 w-full ${p.featured ? 'btn-primary' : 'btn btn-ghost'}`}
                >
                  Book a walkthrough
                </button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <Card strong className="relative overflow-hidden p-8 text-center sm:p-14">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{ background: 'radial-gradient(55% 80% at 50% 0%, rgba(239,43,60,.22) 0%, transparent 70%)' }}
          />
          <h2 className="text-3xl font-bold tracking-tightest text-white sm:text-[2.75rem]">
            Run your gym like it's 2026
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-zinc-400">
            We migrate your members, connect your WhatsApp number and biometric devices, and train
            your front desk. Most studios are live in a week.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <button onClick={() => setTrial(true)} className="btn-primary btn-lg">
              Book Free Trial
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link to="/owner" className="btn btn-ghost btn-lg">
              <Blocks className="h-4 w-4" />
              See the owner dashboard
            </Link>
          </div>
          <p className="mt-7 text-xs text-zinc-500">
            No card required · Free migration · Cancel any time
          </p>
        </Card>
      </section>

      <footer className="border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-4 py-9 sm:flex-row sm:px-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Logo size="sm" />
            <span className="hidden h-6 w-px bg-white/10 sm:block" />
            <StudioLogo size="sm" wordmark />
          </div>
          <p className="text-center text-xs text-zinc-600">
            Demo build · fictional data · © {new Date().getFullYear()} GymFlow AI
          </p>
        </div>
      </footer>

      <TrialModal open={trial} onClose={() => setTrial(false)} onDone={setToast} />
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
