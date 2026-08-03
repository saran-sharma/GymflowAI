import { useState } from 'react'
import {
  Apple,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  IndianRupee,
  NotebookPen,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Avatar, Badge, Card, Meter, PageHeader, SectionTitle, StatCard, Toast } from '../components/ui.jsx'
import { inr, trainerClients, trainerToday, trainers } from '../data/gym.js'

const hours = ['6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM']
const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Deterministic booking grid for the week view.
const booked = new Set(['Mon-6 AM', 'Mon-7 AM', 'Mon-5 PM', 'Mon-7 PM', 'Tue-6 AM', 'Tue-7 PM', 'Tue-8 PM', 'Wed-7 AM', 'Wed-5 PM', 'Wed-6 PM', 'Thu-6 AM', 'Thu-7 PM', 'Fri-7 AM', 'Fri-5 PM', 'Fri-8 PM', 'Sat-9 AM', 'Sat-10 AM'])

const statusTone = { Done: 'good', Now: 'critical', Upcoming: 'neutral' }

export default function TrainerDesk() {
  const [toast, setToast] = useState('')
  const me = trainers[0]

  const pendingPayments = trainerClients.filter((c) => !c.paid)
  const monthRevenue = 186000
  const pendingAmount = 28800

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Staff"
        title="Trainer Desk"
        sub={`${me.name} · ${me.specialty}. Your day, your clients and what you've earned this month.`}
        actions={
          <button onClick={() => setToast('Availability published for next week.')} className="btn-primary btn-sm">
            <CalendarDays className="h-3.5 w-3.5" />
            Publish availability
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sessions today" value={trainerToday.length} delta="2 done" trend="up" hint="3 remaining" icon={Dumbbell} featured />
        <StatCard label="Active clients" value={trainerClients.length} delta="+1" trend="up" hint="this month" icon={Users} />
        <StatCard label="Revenue (Aug)" value={inr(monthRevenue)} delta="+14%" trend="up" hint="your share" icon={IndianRupee} />
        <StatCard label="Pending payments" value={inr(pendingAmount)} delta={`${pendingPayments.length} clients`} trend="down" hint="follow up" icon={ClipboardCheck} />
      </div>

      {/* Today + calendar */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle
            icon={CalendarDays}
            title="Today's sessions"
            sub="Saturday, 03 August"
            right={<Badge tone="critical">1 in progress</Badge>}
          />
          <div className="mt-4 space-y-2.5">
            {trainerToday.map((s) => (
              <div
                key={s.time}
                className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 ${
                  s.status === 'Now' ? 'border-brand/35 bg-brand/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'
                }`}
              >
                <span className={`num w-16 shrink-0 text-sm font-semibold ${s.status === 'Now' ? 'text-brand' : 'text-zinc-400'}`}>
                  {s.time}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{s.client}</p>
                  <p className="truncate text-xs text-zinc-500">{s.focus}</p>
                </div>
                <Badge tone={statusTone[s.status]}>{s.status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={CalendarDays} title="This week" sub="Filled slots against your published availability" />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[440px] border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="w-14" />
                  {weekDays.map((d) => (
                    <th key={d} className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hours.map((h) => (
                  <tr key={h}>
                    <td className="num pr-1 text-right text-[10px] text-zinc-600">{h}</td>
                    {weekDays.map((d) => {
                      const on = booked.has(`${d}-${h}`)
                      return (
                        <td key={d}>
                          <span
                            title={`${d} ${h} · ${on ? 'booked' : 'free'}`}
                            className={`block h-5 rounded ${on ? 'bg-brand/80' : 'bg-white/[0.05]'}`}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand/80 align-middle" />
            Booked ·
            <span className="mx-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-white/[0.05] align-middle" />
            Free · 17 of 66 slots filled
          </p>
        </Card>
      </div>

      {/* Clients */}
      <Card className="p-5">
        <SectionTitle
          icon={Users}
          title="Clients"
          sub="Progress, remaining sessions, payment state and your notes"
          right={
            <button onClick={() => setToast('Payment reminders sent to 2 clients on WhatsApp.')} className="btn btn-ghost btn-sm">
              Chase payments
            </button>
          }
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-white/[0.08]">
              <tr>
                <th className="th">Client</th>
                <th className="th">Plan</th>
                <th className="th">Progress to goal</th>
                <th className="th">Sessions left</th>
                <th className="th">Payment</th>
                <th className="th">Note</th>
                <th className="th text-right">Assign</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {trainerClients.map((c) => (
                <tr key={c.name} className="transition-colors hover:bg-white/[0.03]">
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <Avatar initials={c.name.split(' ').map((p) => p[0]).join('')} size="sm" />
                      <span className="font-medium text-white">{c.name}</span>
                    </div>
                  </td>
                  <td className="td text-zinc-400">{c.plan}</td>
                  <td className="td w-52">
                    <Meter value={c.progress} tone={c.progress > 70 ? 'good' : 'warn'} label={`${c.progress}%`} size="sm" />
                  </td>
                  <td className="td num text-zinc-300">{c.left}</td>
                  <td className="td">
                    <Badge tone={c.paid ? 'good' : 'warn'}>{c.paid ? 'Paid' : 'Pending'}</Badge>
                  </td>
                  <td className="td max-w-[220px] truncate text-zinc-400">{c.note}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setToast(`Workout plan assigned to ${c.name}.`)} className="btn btn-ghost btn-sm" title="Assign workout">
                        <Dumbbell className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setToast(`Diet plan assigned to ${c.name}.`)} className="btn btn-ghost btn-sm" title="Assign diet">
                        <Apple className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setToast(`Note saved against ${c.name}'s file.`)} className="btn btn-ghost btn-sm" title="Add note">
                        <NotebookPen className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Progress reports + earnings */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle icon={TrendingUp} title="Progress reports" sub="Client body composition, last 90 days" />
          <div className="mt-4 space-y-3">
            {[
              ['Aditya Rao', '-4.6 kg fat, +2.1 kg muscle', 'On track', 'good'],
              ['Kavya Nair', '-3.1 kg fat, +0.8 kg muscle', 'On track', 'good'],
              ['Arjun Mehta', '+1.2 kg lean mass', 'Meet prep', 'info'],
              ['Isha Patel', 'No scan in 6 weeks', 'Needs InBody', 'warn'],
              ['Sameer Khan', '-0.4 kg fat', 'Below target', 'warn'],
            ].map(([name, delta, status, tone]) => (
              <div key={name} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{name}</p>
                  <p className="num text-xs text-zinc-500">{delta}</p>
                </div>
                <Badge tone={tone}>{status}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={IndianRupee} title="Earnings" sub="August" />
          <div className="mt-4 space-y-3.5">
            {[
              ['Sessions delivered', '124'],
              ['Payment received', inr(monthRevenue)],
              ['Pending', inr(pendingAmount)],
              ['Avg rating', '4.9 ★'],
              ['Client retention', '84%'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">{k}</span>
                <span className="num text-sm font-semibold text-white">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-brand/25 bg-brand/[0.08] p-3.5">
            <p className="text-xs text-brand-soft">
              Afternoon slots are 62% idle. Opening 2–4 PM could add about {inr(28000)} a month.
            </p>
          </div>
        </Card>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
