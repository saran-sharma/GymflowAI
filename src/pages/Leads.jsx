import { useMemo, useState } from 'react'
import {
  Search,
  MessageCircle,
  Footprints,
  Sparkles,
  Clock3,
  CalendarCheck,
  Send,
  Eye,
  MessageSquare,
  Download,
} from 'lucide-react'
import { Instagram } from '../components/icons.jsx'
import Toast from '../components/Toast.jsx'
import { leads } from '../data/demo.js'

const sourceMeta = {
  Instagram: { icon: Instagram, className: 'border-ink-700 bg-ink-800 text-slate-300' },
  WhatsApp: { icon: MessageCircle, className: 'border-ink-700 bg-ink-800 text-slate-300' },
  'Walk-in': { icon: Footprints, className: 'border-ink-700 bg-ink-800 text-slate-300' },
}

// Status carries an icon as well as colour, so state is never colour-alone.
const statusMeta = {
  Interested: { icon: Sparkles, className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
  'Trial Booked': { icon: CalendarCheck, className: 'border-accent/30 bg-accent/10 text-accent-soft' },
  'Follow-up': { icon: Clock3, className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
}

const actionMeta = {
  'Send WhatsApp': { icon: Send, primary: true },
  View: { icon: Eye, primary: false },
  Message: { icon: MessageSquare, primary: false },
}

const filters = ['All', 'Interested', 'Trial Booked', 'Follow-up']

const actionMessage = (lead) => {
  if (lead.action === 'Send WhatsApp') return `WhatsApp message queued for ${lead.name}.`
  if (lead.action === 'View') return `Opening ${lead.name}'s lead profile.`
  return `Follow-up message drafted for ${lead.name}.`
}

export default function Leads() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [toast, setToast] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return leads.filter(
      (l) =>
        (filter === 'All' || l.status === filter) &&
        (!q || l.name.toLowerCase().includes(q) || l.source.toLowerCase().includes(q)),
    )
  }, [query, filter])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Leads</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every enquiry from WhatsApp, Instagram and the front desk, in one pipeline.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setToast('Lead list exported as CSV.')}>
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      </div>

      {/* Filters — one row above the table */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="input"
            placeholder="Search leads by name or source"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search leads"
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

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-ink-700 bg-ink-850">
              <tr>
                <th className="th">Name</th>
                <th className="th">Source</th>
                <th className="th">Status</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {rows.map((lead) => {
                const Source = sourceMeta[lead.source].icon
                const Status = statusMeta[lead.status].icon
                const Action = actionMeta[lead.action].icon
                return (
                  <tr key={lead.id} className="transition-colors hover:bg-ink-800/40">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-bold text-slate-300 ring-1 ring-ink-700">
                          {lead.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <p className="font-medium text-white">{lead.name}</p>
                          <p className="text-xs text-slate-500">
                            {lead.phone} · {lead.added}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      <span className={`chip ${sourceMeta[lead.source].className}`}>
                        <Source className="h-3.5 w-3.5" />
                        {lead.source}
                      </span>
                    </td>
                    <td className="td">
                      <span className={`chip ${statusMeta[lead.status].className}`}>
                        <Status className="h-3.5 w-3.5" />
                        {lead.status}
                      </span>
                    </td>
                    <td className="td text-right">
                      <button
                        onClick={() => setToast(actionMessage(lead))}
                        className={
                          actionMeta[lead.action].primary
                            ? 'btn-primary btn-sm'
                            : 'btn btn-ghost btn-sm'
                        }
                      >
                        <Action className="h-3.5 w-3.5" />
                        {lead.action}
                      </button>
                    </td>
                  </tr>
                )
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">
                    No leads match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-ink-700 bg-ink-850 px-4 py-3 text-xs text-slate-500">
          Showing {rows.length} of {leads.length} leads
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
