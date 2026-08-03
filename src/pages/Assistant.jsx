import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Send, Sparkles, Zap } from 'lucide-react'
import { Badge, Card, PageHeader, SectionTitle } from '../components/ui.jsx'
import { assistantPrompts, live, member, todayDiet, todayWorkout, trainers } from '../data/gym.js'

/** Scripted answers. Each returns bubble content plus an optional action strip. */
const answers = {
  'How crowded is the gym?': {
    text: `There are ${live.inside} members inside right now — that's ${Math.round((live.inside / live.capacity) * 100)}% of capacity, so a medium crowd.`,
    facts: [
      ['Crowd level', live.crowdLevel],
      ['Squat racks', 'All 4 in use'],
      ['Est. wait', `${live.waitMinutes} min`],
    ],
    chips: ['Show me the quiet hours', 'Remind me when it clears'],
  },
  'Book PT tomorrow at 7 PM.': {
    text: `Coach ${trainers[0].name} has 7:00 PM free tomorrow. You have ${member.ptRemaining} sessions left in your package, so there's nothing to pay.`,
    facts: [
      ['Trainer', trainers[0].name],
      ['Slot', 'Tomorrow 7:00 PM'],
      ['Sessions left', `${member.ptRemaining} of ${member.ptTotal}`],
    ],
    action: 'Session booked · added to your calendar',
    chips: ['Book the whole week', 'Change trainer'],
  },
  "Generate today's workout.": {
    text: `Today is ${todayWorkout.title} — week 6 of your hypertrophy block. Six exercises, about ${todayWorkout.duration}. I've kept pressing off the behind-neck pattern because of your shoulder note.`,
    list: todayWorkout.exercises.slice(0, 4).map((e) => `${e.name} — ${e.sets} @ ${e.load}`),
    action: 'Workout pushed to your app',
    chips: ['Swap an exercise', 'Make it 40 minutes'],
  },
  "Generate today's diet.": {
    text: `Target is ${todayDiet.target} kcal with ${todayDiet.macros.protein.target}g protein. You're at ${todayDiet.consumed} kcal so far, so there's room for a post-workout shake and dinner.`,
    list: todayDiet.meals.slice(-2).map((m) => `${m.meal} — ${m.items} (${m.kcal} kcal)`),
    action: 'Diet plan updated',
    chips: ['Make dinner vegetarian', 'Order the shake'],
  },
  'Show my attendance.': {
    text: `You've trained ${member.visitsThisMonth} times this month and you're on a ${member.streak}-day streak. Attendance sits at ${member.attendancePct}% against your 5-day-a-week goal.`,
    facts: [
      ['This month', `${member.visitsThisMonth} visits`],
      ['Streak', `${member.streak} days`],
      ['Best ever', `${member.bestStreak} days`],
    ],
    chips: ['Compare to last month', 'Show the leaderboard'],
  },
  'Renew my membership.': {
    text: `Your ${member.plan} runs out on ${member.expiry}. Renewing now locks this year's rate at ₹50,000 including GST and carries over your ${member.ptRemaining} unused PT sessions.`,
    facts: [
      ['Plan', member.plan],
      ['Amount', '₹50,000 incl. GST'],
      ['New expiry', '19 Nov 2027'],
    ],
    action: 'Payment link sent on WhatsApp',
    chips: ['Pay by UPI', 'Show me cheaper plans'],
  },
  'Freeze my membership.': {
    text: `You have ${member.freezeDaysLeft} freeze days left this year. Freezing pauses your expiry and your PT package — nothing is lost, and your rate stays locked.`,
    facts: [
      ['Freeze days left', `${member.freezeDaysLeft}`],
      ['Fee', '₹1,000'],
      ['New expiry', '04 Dec 2026'],
    ],
    action: 'Freeze request ready to confirm',
    chips: ['Freeze for 15 days', 'What happens to my PT?'],
  },
  'When is my trainer available?': {
    text: `Coach ${trainers[0].name} is on the floor until 9 PM today. Tomorrow he has ${trainers[0].slots.length} open slots.`,
    facts: trainers[0].slots.slice(0, 3).map((s) => ['Tomorrow', s]),
    chips: ['Book the 7 PM slot', 'Show other trainers'],
  },
  'Suggest the least crowded time today.': {
    text: `Go after ${live.bestTime.replace('After ', '')}. Occupancy drops below 30, every rack frees up and the wait falls under two minutes. The 6–8 PM window is the one to avoid.`,
    facts: [
      ['Quietest', '8:30–10 PM'],
      ['Busiest', '7–8 PM'],
      ['Right now', `${live.inside} inside`],
    ],
    action: 'Reminder set for 8:20 PM',
    chips: ['Remind me', 'Book a locker for then'],
  },
}

const GREETING = {
  id: 0,
  from: 'ai',
  text: `Hi ${member.name.split(' ')[0]} — I can check the crowd, book PT, write your workout or diet, and handle renewals and freezes. What do you need?`,
}

function Bubble({ msg }) {
  const mine = msg.from === 'me'
  return (
    <div className={`flex animate-fade-up ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[88%] sm:max-w-[76%] ${mine ? '' : 'w-full'}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            mine
              ? 'rounded-br-md bg-brand text-white'
              : 'rounded-bl-md border border-white/10 bg-white/[0.05] text-zinc-200'
          }`}
        >
          {!mine && (
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
              <Sparkles className="h-3 w-3" />
              GymFlow AI
            </p>
          )}
          <p className="whitespace-pre-line">{msg.text}</p>

          {msg.facts && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {msg.facts.map(([k, v], i) => (
                <div key={`${k}-${i}`} className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</p>
                  <p className="num mt-0.5 text-sm font-semibold text-white">{v}</p>
                </div>
              ))}
            </div>
          )}

          {msg.list && (
            <ul className="mt-3 space-y-1.5">
              {msg.list.map((l) => (
                <li key={l} className="flex gap-2 text-sm text-zinc-300">
                  <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                  {l}
                </li>
              ))}
            </ul>
          )}

          {msg.action && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-2.5 py-1.5 text-xs text-brand-soft">
              <Sparkles className="h-3 w-3" />
              {msg.action}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Typing() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.05] px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 animate-blink rounded-full bg-brand" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
  )
}

export default function Assistant() {
  const [messages, setMessages] = useState([GREETING])
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const scroll = useRef(null)
  const timers = useRef([])

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const ask = (prompt) => {
    const known = answers[prompt]
    setMessages((m) => [...m, { id: Date.now(), from: 'me', text: prompt }])
    setDraft('')
    setTyping(true)
    timers.current.push(
      setTimeout(() => {
        setTyping(false)
        setMessages((m) => [
          ...m,
          known
            ? { id: Date.now() + 1, from: 'ai', ...known }
            : {
                id: Date.now() + 1,
                from: 'ai',
                text: 'This demo answers a fixed set of questions. Try one of the suggestions below — crowd levels, PT booking, workouts, diets, attendance, renewals or freezes.',
              },
        ])
      }, 1100),
    )
  }

  const reset = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setTyping(false)
    setMessages([GREETING])
  }

  const asked = new Set(messages.filter((m) => m.from === 'me').map((m) => m.text))
  const suggestions = assistantPrompts.filter((p) => !asked.has(p))

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member"
        title="AI Assistant"
        sub="Ask anything about your training, your membership or the floor. Every answer here is scripted for the demo."
        actions={
          <button onClick={reset} className="btn btn-ghost btn-sm">
            <RotateCcw className="h-3.5 w-3.5" />
            Restart
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card strong className="flex h-[640px] flex-col overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-brand/30 bg-brand/15 text-brand">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">GymFlow AI</p>
              <p className="truncate text-xs text-zinc-500">Knows your plan, your trainer and the floor</p>
            </div>
            <Badge tone="good">Online</Badge>
          </div>

          <div ref={scroll} className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-5">
            {messages.map((m) => (
              <Bubble key={m.id} msg={m} />
            ))}
            {typing && <Typing />}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) ask(draft.trim())
            }}
            className="flex items-center gap-2 border-t border-white/[0.08] p-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about crowd, PT, workout, diet, renewal…"
              className="input"
              aria-label="Message the assistant"
            />
            <button type="submit" className="btn-primary shrink-0" aria-label="Send" disabled={!draft.trim()}>
              <Send className="h-4 w-4" />
            </button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle icon={Sparkles} title="Try asking" sub="Tap to run a scripted question" />
            <div className="mt-4 space-y-2">
              {(suggestions.length ? suggestions : assistantPrompts).map((p) => (
                <button
                  key={p}
                  onClick={() => ask(p)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:border-brand/30 hover:bg-brand/[0.07] hover:text-white"
                >
                  {p}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={Zap} title="What it can act on" />
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-400">
              {[
                'Book, move or cancel PT sessions',
                'Write and adjust workouts and diets',
                'Renew, freeze or upgrade membership',
                'Read live occupancy and equipment',
                'Send invoices and payment links',
              ].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                  {t}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
