import { useEffect, useRef, useState } from 'react'
import {
  MessageCircle,
  CalendarCheck,
  Dumbbell,
  RotateCcw,
  Sparkles,
  Check,
  CheckCheck,
  Phone,
  Video,
} from 'lucide-react'

const OPENING = [
  { id: 1, from: 'customer', text: "What's your monthly fee?", at: '10:42 AM' },
  {
    id: 2,
    from: 'bot',
    text: 'Our monthly plan starts at ₹1,999. Would you like to book a free trial tomorrow?',
    at: '10:42 AM',
    ai: true,
    quickReplies: ['Book Trial', 'Talk to Trainer'],
  },
]

const REPLIES = {
  'Book Trial': {
    text: 'Perfect! Your free trial is booked for tomorrow, 7:00 AM at Iron Peak Fitness, Koramangala. Carry a towel and water bottle — the front desk will have your pass ready. 💪',
    note: 'Trial booking added to the dashboard',
  },
  'Talk to Trainer': {
    text: "Sure — Coach Vikas handles new joiners and is free after 6 PM today. Shall I ask him to call you on this number?",
    note: 'Lead flagged for trainer callback',
  },
}

function Bubble({ msg }) {
  const mine = msg.from === 'bot'
  return (
    <div className={`flex animate-fade-up ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[78%]',
          mine
            ? 'rounded-tr-md bg-accent/15 text-slate-100 ring-1 ring-accent/25'
            : 'rounded-tl-md bg-ink-800 text-slate-200',
        ].join(' ')}
      >
        <p className="whitespace-pre-line">{msg.text}</p>
        <span
          className={`mt-1.5 flex items-center gap-1 text-[10px] ${
            mine ? 'justify-end text-accent-soft/80' : 'text-slate-500'
          }`}
        >
          {msg.ai && (
            <>
              <Sparkles className="h-2.5 w-2.5" />
              <span>AI</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{msg.at}</span>
          {mine && <CheckCheck className="h-3 w-3" />}
        </span>
      </div>
    </div>
  )
}

function Typing() {
  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-1 rounded-2xl rounded-tr-md bg-accent/12 px-4 py-3 ring-1 ring-accent/20">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-blink rounded-full bg-accent-soft"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  )
}

export default function WhatsAppDemo() {
  const [messages, setMessages] = useState(OPENING)
  const [typing, setTyping] = useState(false)
  const [notes, setNotes] = useState([])
  const scrollRef = useRef(null)
  const timers = useRef([])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Uppercase the meridiem so live timestamps match the scripted ones.
  const now = () =>
    new Date()
      .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
      .toUpperCase()

  const choose = (label) => {
    const reply = REPLIES[label]
    // The customer's tap becomes their message; the quick replies are consumed.
    setMessages((prev) => [
      ...prev.map((m) => ({ ...m, quickReplies: undefined })),
      { id: Date.now(), from: 'customer', text: label, at: now() },
    ])
    setTyping(true)
    timers.current.push(
      setTimeout(() => {
        setTyping(false)
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, from: 'bot', text: reply.text, at: now(), ai: true },
        ])
        setNotes((prev) => [...prev, reply.note])
      }, 1400),
    )
  }

  const reset = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setTyping(false)
    setNotes([])
    setMessages(OPENING)
  }

  const quickReplies = messages.find((m) => m.quickReplies)?.quickReplies ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">WhatsApp Bot Demo</h1>
          <p className="mt-1 text-sm text-slate-400">
            A real enquiry, answered by GymFlow AI. Tap a button to continue the conversation.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Restart chat
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Phone */}
        <div className="card mx-auto w-full max-w-[420px] overflow-hidden">
          <div className="flex items-center gap-3 border-b border-ink-700 bg-ink-850 px-4 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/15 ring-1 ring-accent/30">
              <MessageCircle className="h-5 w-5 text-accent" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">Iron Peak Fitness</p>
              <p className="flex items-center gap-1.5 truncate text-[11px] text-accent-soft">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                AI assistant · replies instantly
              </p>
            </div>
            <Video className="h-4 w-4 text-slate-500" />
            <Phone className="h-4 w-4 text-slate-500" />
          </div>

          <div
            ref={scrollRef}
            className="h-[430px] space-y-3 overflow-y-auto px-4 py-4"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          >
            <p className="mx-auto w-fit rounded-full bg-ink-800 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">
              Today
            </p>
            {messages.map((m) => (
              <Bubble key={m.id} msg={m} />
            ))}
            {typing && <Typing />}
          </div>

          {/* Quick reply buttons */}
          <div className="border-t border-ink-700 bg-ink-850 p-3">
            {quickReplies.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {quickReplies.map((label) => (
                  <button
                    key={label}
                    onClick={() => choose(label)}
                    className="btn btn-ghost whitespace-nowrap border-accent/30 bg-accent/10 px-3 py-2.5 text-[13px] text-accent-soft hover:bg-accent/15 sm:text-sm"
                  >
                    {label === 'Book Trial' ? (
                      <CalendarCheck className="h-4 w-4 shrink-0" />
                    ) : (
                      <Dumbbell className="h-4 w-4 shrink-0" />
                    )}
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-slate-500">
                Conversation handled by AI · no staff involved
              </p>
            )}
          </div>
        </div>

        {/* What happens behind the scenes */}
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-base font-semibold text-white">What GymFlow did here</h2>
            <ul className="mt-4 space-y-3.5">
              {[
                ['Answered in 3 seconds', 'Pricing pulled from your plan list — no staff needed.'],
                ['Offered the next step', 'Every reply ends with a trial offer, not a dead end.'],
                ['Captured the lead', 'Name, number and source saved to your Leads page.'],
                ['Handed over cleanly', 'Anything the AI can’t answer is routed to a trainer.'],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 ring-1 ring-accent/25">
                    <Check className="h-3.5 w-3.5 text-accent" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-100">{title}</p>
                    <p className="mt-0.5 text-sm text-slate-400">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-white">Live actions</h2>
            <p className="mt-1 text-xs text-slate-500">Updates the AI pushed to your dashboard</p>
            {notes.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-ink-700 px-4 py-6 text-center text-sm text-slate-500">
                Tap <span className="text-slate-300">Book Trial</span> or{' '}
                <span className="text-slate-300">Talk to Trainer</span> to see this fill up.
              </p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {notes.map((n, i) => (
                  <li
                    key={i}
                    className="flex animate-fade-up items-center gap-2.5 rounded-xl border border-accent/25 bg-accent/[0.07] px-3.5 py-2.5 text-sm text-slate-200"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-accent" />
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
