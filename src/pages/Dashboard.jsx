import { Link } from 'react-router-dom'
import {
  UserPlus,
  CalendarCheck,
  Users,
  BellRing,
  IndianRupee,
  ArrowRight,
  MessageCircle,
} from 'lucide-react'
import { Instagram } from '../components/icons.jsx'
import StatCard from '../components/StatCard.jsx'
import { GrowthChart, LeadsChart } from '../components/Charts.jsx'
import { activity, currency, leadsThisWeek, membershipGrowth, stats } from '../data/demo.js'

const icons = {
  leads: UserPlus,
  trials: CalendarCheck,
  members: Users,
  renewals: BellRing,
  revenue: IndianRupee,
}

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Here's how your gym is performing this month.
          </p>
        </div>
        <Link to="/leads" className="btn btn-ghost btn-sm">
          View all leads
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <StatCard
            key={s.key}
            label={s.label}
            value={s.money ? currency(s.value) : s.value}
            delta={s.delta}
            trend={s.trend}
            hint={s.hint}
            icon={icons[s.key]}
            accent={s.key === 'revenue'}
          />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <LeadsChart data={leadsThisWeek} />
        <GrowthChart data={membershipGrowth} />
      </div>

      {/* AI activity */}
      <section className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">AI assistant activity</h2>
            <p className="mt-1 text-xs text-slate-500">What GymFlow handled for you today</p>
          </div>
          <Link to="/whatsapp" className="btn btn-ghost btn-sm shrink-0">
            Open bot demo
          </Link>
        </div>

        <ul className="mt-4 divide-y divide-ink-700">
          {activity.map((a) => {
            const Icon = a.channel === 'Instagram' ? Instagram : MessageCircle
            return (
              <li key={a.id} className="flex items-start gap-3 py-3.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-800 text-accent-soft ring-1 ring-ink-700">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-slate-200">{a.text}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {a.channel} · {a.at}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
