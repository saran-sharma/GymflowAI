import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MessageCircle,
  BellRing,
  LayoutDashboard,
  ArrowRight,
  Check,
  Menu,
  X,
  Sparkles,
} from 'lucide-react'
import { Instagram } from '../components/icons.jsx'
import Logo from '../components/Logo.jsx'

const features = [
  {
    icon: MessageCircle,
    title: 'WhatsApp AI Replies',
    body: 'Every enquiry gets an instant, on-brand answer about pricing, timings and trials — even at 11 PM.',
    points: ['Replies in under 5 seconds', 'Books trials into your calendar'],
  },
  {
    icon: Instagram,
    title: 'Instagram DM Automation',
    body: 'Turn story replies and comment DMs into named leads with a phone number, automatically.',
    points: ['Auto-reply to story replies', 'Captures name + number'],
  },
  {
    icon: BellRing,
    title: 'Membership Renewal Reminders',
    body: 'Members get nudged before they lapse, so renewals stop depending on who remembers to call.',
    points: ['7 / 3 / 1 day reminders', 'One-tap renewal link'],
  },
  {
    icon: LayoutDashboard,
    title: 'Lead Dashboard',
    body: 'One screen for leads, trials, renewals and revenue — no more WhatsApp screenshots in a notebook.',
    points: ['Live lead pipeline', 'Revenue and renewal tracking'],
  },
]

const steps = [
  { n: '01', t: 'Connect your channels', d: 'Link your gym WhatsApp number and Instagram account in a few minutes.' },
  { n: '02', t: 'AI answers every lead', d: 'Pricing, timings, trials and offers — answered instantly in your tone.' },
  { n: '03', t: 'You close the sale', d: 'Walk in each morning to booked trials and a clean follow-up list.' },
]

function TopNav() {
  const [open, setOpen] = useState(false)
  const links = [
    ['Features', '#features'],
    ['How it works', '#how'],
    ['Pricing', '#pricing'],
  ]
  return (
    <header className="sticky top-0 z-50 border-b border-ink-700/70 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="text-sm text-slate-400 transition-colors hover:text-white">
              {label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link to="/dashboard" className="btn btn-ghost btn-sm">
            View Demo
          </Link>
          <a href="#cta" className="btn-primary btn-sm">
            Start Free Trial
          </a>
        </div>

        <button
          className="rounded-lg p-2 text-slate-300 hover:bg-ink-800 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-ink-700 bg-ink-900 px-4 py-4 md:hidden">
          <div className="space-y-1">
            {links.map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-ink-800"
              >
                {label}
              </a>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to="/dashboard" className="btn btn-ghost btn-sm">
              View Demo
            </Link>
            <a href="#cta" className="btn-primary btn-sm" onClick={() => setOpen(false)}>
              Start Free Trial
            </a>
          </div>
        </div>
      )}
    </header>
  )
}

/** Small chat mock beside the hero — shows the product doing its job. */
function HeroChat() {
  return (
    <div className="card relative w-full max-w-md p-5 shadow-glow">
      <div className="flex items-center gap-3 border-b border-ink-700 pb-4">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/15 ring-1 ring-accent/30">
          <MessageCircle className="h-5 w-5 text-accent" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Iron Peak Fitness</p>
          <p className="flex items-center gap-1.5 text-[11px] text-accent-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            AI assistant online
          </p>
        </div>
        <span className="chip border-ink-700 bg-ink-800 text-slate-400">WhatsApp</span>
      </div>

      <div className="space-y-3 pt-4">
        <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-ink-800 px-3.5 py-2.5 text-sm text-slate-200">
          Hi, what are your membership charges?
        </div>
        <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-accent/15 px-3.5 py-2.5 text-sm text-slate-100 ring-1 ring-accent/25">
          Our monthly plan starts at ₹1,999. Would you like to book a free trial tomorrow?
          <span className="mt-2 flex items-center gap-1.5 text-[11px] text-accent-soft">
            <Sparkles className="h-3 w-3" /> Replied by AI in 3s
          </span>
        </div>
        <div className="max-w-[70%] rounded-2xl rounded-tl-md bg-ink-800 px-3.5 py-2.5 text-sm text-slate-200">
          Yes please, 7 AM works 👍
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-accent/25 bg-accent/[0.07] px-3.5 py-2.5">
        <span className="text-xs text-slate-300">Trial booked · Tomorrow 7:00 AM</span>
        <Check className="h-4 w-4 text-accent" />
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-ink-950">
      <TopNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              'radial-gradient(60% 55% at 18% 0%, rgba(34,197,94,.16) 0%, transparent 60%), radial-gradient(45% 45% at 90% 10%, rgba(34,197,94,.10) 0%, transparent 65%)',
          }}
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="animate-fade-up">
            <span className="chip border-accent/30 bg-accent/10 text-accent-soft">
              <Sparkles className="h-3.5 w-3.5" />
              Built for Indian gyms &amp; fitness studios
            </span>

            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Convert More Leads into{' '}
              <span className="text-accent">Members with AI</span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
              GymFlow AI replies to every WhatsApp and Instagram enquiry in seconds, books free
              trials, and reminds members before their plan expires — so no lead goes cold while
              you're on the floor.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#cta" className="btn-primary px-6 py-3 text-base">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link to="/dashboard" className="btn btn-ghost px-6 py-3 text-base">
                See the dashboard
              </Link>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-ink-700 pt-6">
              {[
                ['3×', 'faster replies'],
                ['24×7', 'lead capture'],
                ['+38%', 'trial bookings'],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="text-2xl font-bold text-white">{v}</dt>
                  <dd className="mt-0.5 text-xs text-slate-500">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex justify-center lg:justify-end">
            <HeroChat />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Features</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Everything a busy gym owner keeps forgetting to do
          </h2>
          <p className="mt-4 text-slate-400">
            Four things run on autopilot from day one. No new app for your staff to learn.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, body, points }) => (
            <div
              key={title}
              className="card group p-6 transition-colors hover:border-accent/35"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/12 text-accent ring-1 ring-accent/25">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
              <ul className="mt-4 space-y-2">
                {points.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-sm text-slate-300">
                    <Check className="h-4 w-4 shrink-0 text-accent" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-ink-700 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Live in one afternoon
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map(({ n, t, d }) => (
              <div key={n} className="relative rounded-2xl border border-ink-700 bg-ink-900 p-6">
                <span className="text-sm font-bold text-accent">{n}</span>
                <h3 className="mt-3 text-lg font-semibold text-white">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing / CTA */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-20">
        <div id="cta" className="card relative overflow-hidden p-8 text-center sm:p-12">
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                'radial-gradient(50% 70% at 50% 0%, rgba(34,197,94,.18) 0%, transparent 70%)',
            }}
          />
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Stop losing leads to a missed WhatsApp
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Try GymFlow AI free for 14 days. No card, no setup fee — we connect your number for you.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="#cta" className="btn-primary px-7 py-3 text-base">
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link to="/whatsapp" className="btn btn-ghost px-7 py-3 text-base">
              Try the WhatsApp bot
            </Link>
          </div>
          <p className="mt-6 text-xs text-slate-500">
            Plans from ₹2,999/month · Cancel anytime
          </p>
        </div>
      </section>

      <footer className="border-t border-ink-700">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <Logo size="sm" />
          <p className="text-xs text-slate-500">
            Demo build · dummy data only · © {new Date().getFullYear()} GymFlow AI
          </p>
        </div>
      </footer>
    </div>
  )
}
