import { useState } from 'react'
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  History,
  Star,
  Wallet,
} from 'lucide-react'
import Scene from '../components/Scene.jsx'
import { Avatar, Badge, Card, KeyValue, Meter, Modal, PageHeader, SectionTitle, Toast } from '../components/ui.jsx'
import { inr, member, ptHistory, ptToday, trainers } from '../data/gym.js'

const days = ['Today', 'Tomorrow', 'Sat 08', 'Sun 09', 'Mon 10']

function PaymentModal({ open, onClose, booking, onPaid }) {
  const [method, setMethod] = useState('UPI')
  const [stage, setStage] = useState('pay') // pay → processing → done
  const methods = ['UPI', 'Card', 'Net Banking', 'Razorpay']

  const pay = () => {
    setStage('processing')
    setTimeout(() => setStage('done'), 1500)
  }

  const close = () => {
    if (stage === 'done') onPaid()
    setStage('pay')
    onClose()
  }

  if (!booking) return null
  const amount = booking.trainer.rate
  const gst = Math.round(amount - amount / 1.18)

  return (
    <Modal
      open={open}
      onClose={close}
      title={stage === 'done' ? 'Booking confirmed' : 'Confirm and pay'}
      sub={`${booking.trainer.name} · ${booking.day} at ${booking.slot}`}
      footer={
        stage === 'done' ? (
          <button className="btn-primary w-full" onClick={close}>Done</button>
        ) : (
          <button className="btn-primary w-full" onClick={pay} disabled={stage === 'processing'}>
            {stage === 'processing' ? 'Processing…' : `Pay ${inr(amount)}`}
          </button>
        )
      }
    >
      {stage === 'done' ? (
        <div className="text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-brand/30 bg-brand/15">
            <CheckCircle2 className="h-8 w-8 text-brand" />
          </span>
          <p className="mt-4 text-lg font-semibold text-white">Session booked</p>
          <p className="mt-1 text-sm text-zinc-400">
            {booking.trainer.name} · {booking.day} at {booking.slot}
          </p>
          <div className="mt-5 text-left">
            <KeyValue
              rows={[
                ['Invoice', 'SLAM/26-27/1204'],
                ['Amount', inr(amount)],
                ['GST (18%)', inr(gst)],
                ['Paid via', method],
              ]}
            />
          </div>
          <p className="mt-4 rounded-xl border border-brand/25 bg-brand/[0.08] px-3.5 py-2.5 text-xs text-brand-soft">
            GST invoice delivered on WhatsApp · added to your Google Calendar
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <KeyValue
              rows={[
                ['Session fee', inr(Math.round(amount / 1.18))],
                ['GST (18%)', inr(gst)],
                ['Total', inr(amount)],
              ]}
            />
          </div>

          <div>
            <p className="mb-2 text-xs text-zinc-400">Payment method</p>
            <div className="grid grid-cols-2 gap-2">
              {methods.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`rounded-xl border px-3.5 py-3 text-left text-sm transition-colors ${
                    method === m ? 'border-brand/50 bg-brand/10 text-white' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {stage === 'processing' && (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              <p className="text-sm text-zinc-300">Waiting for {method} confirmation…</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default function PTBooking() {
  const [trainerId, setTrainerId] = useState(trainers[0].id)
  const [day, setDay] = useState('Tomorrow')
  const [slot, setSlot] = useState(null)
  const [pay, setPay] = useState(false)
  const [toast, setToast] = useState('')
  const [booked, setBooked] = useState([])
  const [completed, setCompleted] = useState(false)

  const trainer = trainers.find((t) => t.id === trainerId)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Member"
        title="PT Booking"
        sub="Pick a trainer, take a slot, pay online. Sessions from your package cost nothing extra."
        actions={<Badge tone="critical"><Wallet className="h-3.5 w-3.5" />{member.ptRemaining} sessions in package</Badge>}
      />

      {/* Trainer profiles */}
      <div className="grid gap-4 lg:grid-cols-3">
        {trainers.map((t) => {
          const active = t.id === trainerId
          return (
            <Card
              key={t.id}
              className={`cursor-pointer overflow-hidden p-0 transition-all hover:-translate-y-0.5 ${active ? 'ring-1 ring-brand/40' : ''}`}
              onClick={() => { setTrainerId(t.id); setSlot(null) }}
            >
              <Scene
                variant="figure"
                palette={t.palette}
                build={t.build}
                photo={t.photo}
                alt={`${t.name}, ${t.specialty}`}
                ratio="aspect-[16/8]"
              >
                {active && (
                  <span className="absolute right-3 top-3">
                    <Badge tone="critical">Selected</Badge>
                  </span>
                )}
              </Scene>

              <div className="p-5">
              <div className="flex items-start gap-3.5">
                <Avatar initials={t.initials} size="lg" tone={t.accent} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-white">{t.name}</p>
                    <BadgeCheck className="h-4 w-4 shrink-0 text-brand" />
                  </div>
                  <p className="truncate text-xs text-zinc-500">{t.specialty}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                    <span className="num flex items-center gap-1">
                      <Star className="h-3 w-3 fill-brand text-brand" />
                      {t.rating}
                    </span>
                    <span className="num">{t.sessions.toLocaleString('en-IN')} sessions</span>
                    <span>{t.experience}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {t.certs.map((c) => (
                  <span key={c} className="chip-neutral">{c}</span>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3.5">
                <span className="num text-sm font-semibold text-white">{inr(t.rate)}<span className="text-xs font-normal text-zinc-500"> / session</span></span>
                {!active && <span className="text-xs text-zinc-500">Tap to select</span>}
              </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Slots */}
      <Card strong className="p-5">
        <SectionTitle
          icon={CalendarClock}
          title={`Available slots · ${trainer.name}`}
          sub="Slots refresh live as other members book"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {days.map((d) => (
            <button
              key={d}
              onClick={() => { setDay(d); setSlot(null) }}
              className={`chip transition-colors ${
                day === d ? 'border-brand/40 bg-brand/[0.12] text-brand-soft' : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {trainer.slots.map((s, i) => {
            const taken = day === 'Today' && i < 2
            const isBooked = booked.some((b) => b.day === day && b.slot === s && b.trainer.id === trainer.id)
            return (
              <button
                key={s}
                disabled={taken || isBooked}
                onClick={() => setSlot(s)}
                className={`rounded-xl border px-3 py-3.5 text-sm font-medium transition-colors ${
                  isBooked
                    ? 'border-brand/40 bg-brand/[0.12] text-brand-soft'
                    : taken
                      ? 'cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-zinc-600 line-through'
                      : slot === s
                        ? 'border-brand bg-brand text-white'
                        : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:border-brand/40'
                }`}
              >
                {s}
                {isBooked && <span className="mt-0.5 block text-[10px]">Booked</span>}
                {taken && <span className="mt-0.5 block text-[10px]">Full</span>}
              </button>
            )
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
          <p className="text-sm text-zinc-400">
            {slot ? `${trainer.name} · ${day} at ${slot}` : 'Pick a slot to continue'}
          </p>
          <div className="flex gap-2">
            <button
              disabled={!slot}
              onClick={() => {
                setBooked((b) => [...b, { trainer, day, slot, paid: false }])
                setToast(`Session booked from your package — ${member.ptRemaining - 1} sessions left.`)
                setSlot(null)
              }}
              className="btn btn-ghost btn-sm"
            >
              Use package session
            </button>
            <button disabled={!slot} onClick={() => setPay(true)} className="btn-primary btn-sm">
              <CreditCard className="h-3.5 w-3.5" />
              Book &amp; pay {inr(trainer.rate)}
            </button>
          </div>
        </div>
      </Card>

      {/* Today's session — only closed by the trainer at the device */}
      <Card strong className="p-5">
        <SectionTitle
          icon={CheckCircle2}
          title="Session completion"
          sub="A session is only deducted once the trainer closes it at the device — that same record scores their completion rate."
          right={<Badge tone={completed ? 'good' : 'warn'}>{completed ? 'Completed' : 'In progress'}</Badge>}
        />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar initials="VM" tone="#ef2b3c" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{ptToday.focus}</p>
              <p className="num truncate text-xs text-zinc-500">
                {ptToday.trainer} · {ptToday.date} at {ptToday.at}
              </p>
            </div>
          </div>
          <button
            disabled={completed}
            onClick={() => {
              setCompleted(true)
              setToast('Session closed by Coach Vikas at the device. 6 sessions left in your package.')
            }}
            className={completed ? 'btn btn-ghost btn-sm' : 'btn-primary btn-sm'}
          >
            {completed ? 'Closed 7:58 PM' : 'Trainer marks complete'}
          </button>
        </div>
        {completed && (
          <p className="mt-3 animate-fade-up rounded-xl border border-brand/25 bg-brand/[0.07] px-4 py-3 text-sm text-zinc-300">
            <span className="font-semibold text-white">Trainer note · </span>
            “{ptToday.note}”
          </p>
        )}
      </Card>

      {/* Package + history */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <SectionTitle icon={Wallet} title="Remaining package" sub="Elite Annual + PT" />
          <p className="num mt-4 text-4xl font-bold tracking-tightest text-white">
            {member.ptRemaining}
            <span className="text-base font-medium text-zinc-500"> / {member.ptTotal}</span>
          </p>
          <div className="mt-4">
            <Meter value={member.ptTotal - member.ptRemaining} max={member.ptTotal} tone="brand" label={`${member.ptRemaining} left`} />
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Unused sessions carry over when you renew before expiry.
          </p>
          <button onClick={() => setToast('12-session top-up added — ₹14,400 incl. GST. Invoice on WhatsApp.')} className="btn btn-ghost btn-sm mt-4 w-full">
            Top up 12 sessions
          </button>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            icon={History}
            title="Session history"
            sub="Trainer notes are saved against every session"
            right={<Badge tone="neutral">{ptHistory.length} recent</Badge>}
          />
          <div className="mt-4 space-y-2.5">
            {ptHistory.map((h) => (
              <div key={h.date + h.focus} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="num text-xs font-semibold text-brand">{h.date}</span>
                    <p className="text-sm font-medium text-white">{h.focus}</p>
                    {h.completed && (
                      <Badge tone="good" icon={CheckCircle2}>Closed {h.signedAt}</Badge>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    {Array.from({ length: h.rating }, (_, i) => (
                      <Star key={i} className="h-3 w-3 fill-brand text-brand" />
                    ))}
                    <span className="ml-1.5">{h.trainer}</span>
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-400">“{h.note}”</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <PaymentModal
        open={pay}
        onClose={() => setPay(false)}
        booking={slot ? { trainer, day, slot } : null}
        onPaid={() => {
          setBooked((b) => [...b, { trainer, day, slot, paid: true }])
          setToast('Payment received. GST invoice sent on WhatsApp.')
          setSlot(null)
        }}
      />
      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
