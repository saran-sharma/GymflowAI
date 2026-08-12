import { useEffect, useRef, useState } from 'react'
import {
  CheckCheck,
  MessageCircle,
  Phone,
  RotateCcw,
  Sparkles,
  UserPlus,
  Video,
} from 'lucide-react'
import { Instagram } from '../components/icons.jsx'
import { Badge, Card, PageHeader, Segmented, SectionTitle, Toast } from '../components/ui.jsx'
import { igLeads, igTopics, live, waConversation, waQuickReplies, waReplies } from '../data/gym.js'

/* ------------------------------------------------------------- WhatsApp */

function WaBubble({ msg }) {
  const bot = msg.from === 'bot'
  return (
    <div className={`flex animate-fade-up ${bot ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          bot ? 'rounded-br-md bg-brand/15 text-zinc-100 ring-1 ring-brand/25' : 'rounded-bl-md bg-white/[0.06] text-zinc-200'
        }`}
      >
        <p className="whitespace-pre-line">{msg.text}</p>

        {msg.cards && (
          <div className="mt-2.5 space-y-1.5">
            {msg.cards.map((c) => (
              <div key={c.label} className="flex items-center justify-between gap-4 rounded-lg bg-black/25 px-2.5 py-1.5">
                <span className="text-[11px] text-zinc-400">{c.label}</span>
                <span className="num text-xs font-semibold text-white">{c.value}</span>
              </div>
            ))}
          </div>
        )}

        <span className={`mt-1.5 flex items-center gap-1 text-[10px] ${bot ? 'justify-end text-brand-soft/80' : 'text-zinc-500'}`}>
          {bot && (
            <>
              <Sparkles className="h-2.5 w-2.5" />
              <span>AI</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{msg.at}</span>
          {bot && <CheckCheck className="h-3 w-3" />}
        </span>
      </div>
    </div>
  )
}

function WhatsAppPanel({ onNote }) {
  const [messages, setMessages] = useState(waConversation.map((m, i) => ({ ...m, id: i })))
  const [typing, setTyping] = useState(false)
  const [used, setUsed] = useState([])
  const scroll = useRef(null)
  const timers = useRef([])

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const now = () =>
    new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()

  const tap = (label) => {
    const reply = waReplies[label]
    setMessages((m) => [...m, { id: Date.now(), from: 'member', text: label, at: now() }])
    setUsed((u) => [...u, label])
    setTyping(true)
    timers.current.push(
      setTimeout(() => {
        setTyping(false)
        setMessages((m) => [...m, { id: Date.now() + 1, from: 'bot', text: reply.text, at: now() }])
        onNote(reply.note)
      }, 1300),
    )
  }

  const reset = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setTyping(false)
    setUsed([])
    setMessages(waConversation.map((m, i) => ({ ...m, id: i })))
  }

  return (
    <Card strong className="flex h-[620px] flex-col overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <span className="grid h-10 w-10 place-items-center rounded-full border border-brand/30 bg-brand/15">
          <MessageCircle className="h-5 w-5 text-brand" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">SLAM Fitness Studio</p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-brand-soft">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            AI assistant · replies instantly
          </p>
        </div>
        <Video className="h-4 w-4 text-zinc-600" />
        <Phone className="h-4 w-4 text-zinc-600" />
        <button onClick={reset} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label="Restart chat">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={scroll}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
      >
        <p className="mx-auto w-fit rounded-full bg-white/[0.06] px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
          Today
        </p>
        {messages.map((m) => (
          <WaBubble key={m.id} msg={m} />
        ))}
        {typing && (
          <div className="flex justify-end">
            <div className="flex items-center gap-1 rounded-2xl rounded-br-md bg-brand/[0.12] px-4 py-3 ring-1 ring-brand/20">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-blink rounded-full bg-brand-soft" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.08] bg-white/[0.03] p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {waQuickReplies.map((label) => (
            <button
              key={label}
              onClick={() => tap(label)}
              disabled={used.includes(label)}
              className="btn btn-ghost whitespace-nowrap border-brand/25 bg-brand/[0.08] px-2.5 py-2.5 text-[12px] text-brand-soft hover:bg-brand/15 disabled:opacity-35"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------ Instagram */

function InstagramPanel({ onNote }) {
  const [openTopic, setOpenTopic] = useState(igTopics[0].q)
  return (
    <div className="space-y-4">
      <Card strong className="p-5">
        <SectionTitle
          icon={Instagram}
          title="Instagram DM automation"
          sub="Answers DMs and story replies, then captures the lead"
          right={<Badge tone="good">Connected</Badge>}
        />

        <div className="mt-5 space-y-2">
          {igTopics.map((t) => {
            const open = openTopic === t.q
            return (
              <div key={t.q} className={`rounded-xl border transition-colors ${open ? 'border-brand/30 bg-brand/[0.06]' : 'border-white/[0.08] bg-white/[0.03]'}`}>
                <button onClick={() => setOpenTopic(open ? null : t.q)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                  <span className="text-sm font-medium text-white">{t.q}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{open ? 'Hide' : 'Show reply'}</span>
                </button>
                {open && (
                  <div className="animate-fade-up border-t border-white/[0.08] px-4 py-3">
                    <p className="flex gap-2.5 text-sm leading-relaxed text-zinc-300">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      {t.a}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button onClick={() => onNote('Auto-reply templates updated for Instagram DMs.')} className="btn btn-ghost btn-sm mt-4 w-full">
          Edit auto-replies
        </button>
      </Card>

      <Card className="p-5">
        <SectionTitle icon={UserPlus} title="Leads captured today" sub="From DMs and story replies" right={<Badge tone="neutral">{igLeads.length} today</Badge>} />
        <div className="mt-4 space-y-2.5">
          {igLeads.map((l) => (
            <div key={l.handle} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {l.name} <span className="font-normal text-zinc-500">{l.handle}</span>
                </p>
                <p className="text-xs text-zinc-500">Asked about {l.asked.toLowerCase()}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={l.phone === 'captured' ? 'good' : 'warn'}>
                  {l.phone === 'captured' ? 'Number captured' : 'No number yet'}
                </Badge>
                <Badge tone="info">{l.status}</Badge>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => onNote('All Instagram leads pushed to the leads pipeline.')} className="btn-primary btn-sm mt-4 w-full">
          Push to pipeline
        </button>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function Channels() {
  const [tab, setTab] = useState('WhatsApp')
  const [notes, setNotes] = useState([])
  const [toast, setToast] = useState('')

  const addNote = (n) => {
    setNotes((prev) => [...prev, n])
    setToast(n)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="WhatsApp & Instagram AI"
        sub="Every enquiry answered in seconds, on the channel the member already uses."
        actions={<Segmented options={['WhatsApp', 'Instagram']} value={tab} onChange={setTab} />}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        {tab === 'WhatsApp' ? (
          <>
            <WhatsAppPanel onNote={addNote} />
            <div className="space-y-4">
              <Card className="p-5">
                <SectionTitle icon={Sparkles} title="What the bot just did" sub="Actions pushed into the system" />
                {notes.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-white/[0.12] px-4 py-8 text-center text-sm text-zinc-500">
                    Tap a quick reply in the chat — Book PT, Pay, Invoice, Workout — and the
                    actions land here.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2.5">
                    {notes.map((n, i) => (
                      <li key={i} className="flex animate-fade-up items-center gap-2.5 rounded-xl border border-brand/25 bg-brand/[0.07] px-3.5 py-2.5 text-sm text-zinc-200">
                        <Sparkles className="h-4 w-4 shrink-0 text-brand" />
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <SectionTitle icon={MessageCircle} title="Live context the bot reads" sub="Why the crowd answer is accurate" />
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    ['Inside now', live.inside],
                    ['Crowd', live.crowdLevel],
                    ['Best time', live.bestTime],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
                      <p className="text-[11px] text-zinc-500">{k}</p>
                      <p className="num mt-0.5 text-sm font-semibold text-white">{v}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-zinc-500">
                  The bot answers from the same live occupancy feed the floor devices write to — not
                  from a canned script.
                </p>
              </Card>

              <Card className="p-5">
                <SectionTitle icon={MessageCircle} title="This month on WhatsApp" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ['Messages handled', '4,120'],
                    ['Handled without staff', '91%'],
                    ['Median reply time', '3 s'],
                    ['Trials booked', '68'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
                      <p className="text-[11px] text-zinc-500">{k}</p>
                      <p className="num mt-0.5 text-lg font-bold tracking-tightest text-white">{v}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        ) : (
          <>
            <Card strong className="flex h-[620px] flex-col overflow-hidden p-0">
              <div className="flex items-center gap-3 border-b border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-brand/30 bg-brand/15">
                  <Instagram className="h-5 w-5 text-brand" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">@slamfitnessstudio</p>
                  <p className="truncate text-[11px] text-brand-soft">DM automation active</p>
                </div>
                <Badge tone="good">Live</Badge>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {[
                  { from: 'them', text: 'Hi! Saw your reel. What are the membership charges?', at: '6:12 PM' },
                  { from: 'us', text: 'Hey! Monthly ₹4,500 · Quarterly ₹12,000 · Annual ₹38,000. Elite adds PT and monthly InBody scans.', at: '6:12 PM', ai: true },
                  { from: 'us', text: 'August offer: annual plans get 2 months free. Want me to hold a free trial for you?', at: '6:12 PM', ai: true },
                  { from: 'them', text: 'Yes please! Tomorrow evening works', at: '6:14 PM' },
                  { from: 'us', text: 'Done — 7 PM tomorrow with Coach Vikas. Can I get your number to send the confirmation?', at: '6:14 PM', ai: true },
                  { from: 'them', text: '98765 43210', at: '6:15 PM' },
                  { from: 'us', text: 'Got it. Confirmation is on its way over WhatsApp. See you at 7!', at: '6:15 PM', ai: true },
                ].map((m, i) => (
                  <div key={i} className={`flex ${m.from === 'us' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.from === 'us' ? 'rounded-br-md bg-brand/15 text-zinc-100 ring-1 ring-brand/25' : 'rounded-bl-md bg-white/[0.06] text-zinc-200'
                    }`}>
                      <p>{m.text}</p>
                      <span className={`mt-1.5 flex items-center gap-1 text-[10px] ${m.from === 'us' ? 'justify-end text-brand-soft/80' : 'text-zinc-500'}`}>
                        {m.ai && (<><Sparkles className="h-2.5 w-2.5" /><span>AI</span><span aria-hidden="true">·</span></>)}
                        <span>{m.at}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <p className="flex items-center gap-2 text-xs text-brand-soft">
                  <UserPlus className="h-3.5 w-3.5" />
                  Lead captured · trial booked · pushed to the pipeline
                </p>
              </div>
            </Card>

            <InstagramPanel onNote={addNote} />
          </>
        )}
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
