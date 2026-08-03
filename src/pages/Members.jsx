import { useMemo, useState } from 'react'
import { Search, RefreshCw, CheckCircle2, AlertTriangle, CalendarDays, Activity } from 'lucide-react'
import Toast from '../components/Toast.jsx'
import { members } from '../data/demo.js'

const filters = ['All', 'Expiring soon', 'Expired']

/** Expiry state — always rendered with a label, never colour alone. */
function expiryState(daysLeft) {
  if (daysLeft < 0) return { label: 'Expired', className: 'border-red-500/30 bg-red-500/10 text-red-300', icon: AlertTriangle }
  if (daysLeft <= 7) return { label: `${daysLeft}d left`, className: 'border-amber-500/30 bg-amber-500/10 text-amber-300', icon: AlertTriangle }
  return { label: `${daysLeft}d left`, className: 'border-ink-700 bg-ink-800 text-slate-400', icon: CalendarDays }
}

function AttendanceMeter({ value }) {
  const low = value < 50
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-700" aria-hidden="true">
        <div
          className={`h-full rounded-full ${low ? 'bg-amber-400' : 'bg-accent'}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`text-sm font-medium tabular-nums ${low ? 'text-amber-300' : 'text-slate-200'}`}>
        {value}%
      </span>
    </div>
  )
}

export default function Members() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [renewed, setRenewed] = useState([])
  const [toast, setToast] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter((m) => {
      const isRenewed = renewed.includes(m.id)
      const days = isRenewed ? m.daysLeft + 30 : m.daysLeft
      const matchesFilter =
        filter === 'All' ||
        (filter === 'Expiring soon' && days >= 0 && days <= 7) ||
        (filter === 'Expired' && days < 0)
      const matchesQuery = !q || m.name.toLowerCase().includes(q) || m.plan.toLowerCase().includes(q)
      return matchesFilter && matchesQuery
    })
  }, [query, filter, renewed])

  const renew = (m) => {
    setRenewed((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]))
    setToast(`${m.name}'s membership renewed — payment link sent on WhatsApp.`)
  }

  const dueCount = members.filter((m) => !renewed.includes(m.id) && m.daysLeft <= 7).length

  const rowState = (m) => {
    const isRenewed = renewed.includes(m.id)
    const days = isRenewed ? m.daysLeft + 30 : m.daysLeft
    const state = expiryState(days)
    const StateIcon = state.icon
    return { isRenewed, days, state, StateIcon }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Members</h1>
          <p className="mt-1 text-sm text-slate-400">
            {members.length} active members ·{' '}
            <span className="text-amber-300">{dueCount} need renewal this week</span>
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setToast(`Renewal reminders sent to ${dueCount} members on WhatsApp.`)}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Send renewal reminders
        </button>
      </div>

      {/* Search member + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="input"
            placeholder="Search member by name or plan"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search member"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                'chip transition-colors',
                filter === f
                  ? 'border-accent/40 bg-accent/12 text-accent-soft'
                  : 'border-ink-700 bg-ink-850 text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <div className="card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-ink-700 bg-ink-850">
              <tr>
                <th className="th">Member</th>
                <th className="th">Plan</th>
                <th className="th">Membership Expiry</th>
                <th className="th">Attendance %</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {rows.map((m) => {
                const { isRenewed, state, StateIcon } = rowState(m)
                return (
                  <tr key={m.id} className="transition-colors hover:bg-ink-800/40">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-bold text-slate-300 ring-1 ring-ink-700">
                          {m.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                        </span>
                        <div>
                          <p className="font-medium text-white">{m.name}</p>
                          <p className="text-xs text-slate-500">{m.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td text-slate-300">{m.plan}</td>
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-300">{isRenewed ? 'Extended +1 month' : m.expiry}</span>
                        <span className={`chip ${state.className}`}>
                          <StateIcon className="h-3 w-3" />
                          {state.label}
                        </span>
                      </div>
                    </td>
                    <td className="td">
                      <AttendanceMeter value={m.attendance} />
                    </td>
                    <td className="td text-right">
                      {isRenewed ? (
                        <span className="chip border-accent/30 bg-accent/10 text-accent-soft">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Renewed
                        </span>
                      ) : (
                        <button onClick={() => renew(m)} className="btn-primary btn-sm">
                          <RefreshCw className="h-3.5 w-3.5" />
                          Renew Membership
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                    No members match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-ink-700 bg-ink-850 px-4 py-3 text-xs text-slate-500">
          Showing {rows.length} of {members.length} members
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((m) => {
          const { isRenewed, state, StateIcon } = rowState(m)
          return (
            <div key={m.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-bold text-slate-300 ring-1 ring-ink-700">
                    {m.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{m.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {m.plan} · {m.phone}
                    </p>
                  </div>
                </div>
                <span className={`chip shrink-0 ${state.className}`}>
                  <StateIcon className="h-3 w-3" />
                  {state.label}
                </span>
              </div>

              <dl className="mt-4 space-y-2.5 border-t border-ink-700 pt-3.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-400">
                    <CalendarDays className="h-4 w-4" /> Expiry
                  </dt>
                  <dd className="text-slate-200">{isRenewed ? 'Extended +1 month' : m.expiry}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-400">
                    <Activity className="h-4 w-4" /> Attendance
                  </dt>
                  <dd>
                    <AttendanceMeter value={m.attendance} />
                  </dd>
                </div>
              </dl>

              {isRenewed ? (
                <span className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 py-2.5 text-sm font-semibold text-accent-soft">
                  <CheckCircle2 className="h-4 w-4" />
                  Renewed
                </span>
              ) : (
                <button onClick={() => renew(m)} className="btn-primary mt-4 w-full">
                  <RefreshCw className="h-4 w-4" />
                  Renew Membership
                </button>
              )}
            </div>
          )
        })}

        {rows.length === 0 && (
          <p className="card px-4 py-12 text-center text-sm text-slate-500">
            No members match this search.
          </p>
        )}
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
