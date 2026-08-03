import { useMemo, useState } from 'react'
import { Download, FileBarChart, Mail, Search, Sparkles } from 'lucide-react'
import { Badge, Card, PageHeader, SectionTitle, Toast } from '../components/ui.jsx'
import { reports } from '../data/gym.js'

export default function Reports() {
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return reports.filter((r) => !q || r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q))
  }, [query])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business"
        title="Reports"
        sub="Everything the accountant, the landlord and the bank ever ask for — generated on demand."
        actions={
          <button onClick={() => setToast('All 13 reports exported and emailed as a single archive.')} className="btn-primary btn-sm">
            <Download className="h-3.5 w-3.5" />
            Export all
          </button>
        }
      />

      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          className="input input-icon"
          placeholder="Search reports"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search reports"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.name} className="flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-white/15">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-brand">
                {r.tag === 'AI' ? <Sparkles className="h-[18px] w-[18px]" /> : <FileBarChart className="h-[18px] w-[18px]" />}
              </span>
              <Badge tone={r.tag === 'AI' ? 'critical' : 'neutral'}>{r.tag}</Badge>
            </div>

            <h3 className="mt-4 text-sm font-semibold text-white">{r.name}</h3>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-zinc-500">{r.desc}</p>

            <p className="num mt-4 text-xl font-bold tracking-tightest text-white">{r.value}</p>

            <div className="mt-4 flex gap-2 border-t border-white/[0.08] pt-4">
              <button onClick={() => setToast(`${r.name} generated — PDF downloaded.`)} className="btn btn-ghost btn-sm flex-1">
                <Download className="h-3.5 w-3.5" />
                PDF
              </button>
              <button onClick={() => setToast(`${r.name} emailed to your accountant.`)} className="btn btn-ghost btn-sm flex-1">
                <Mail className="h-3.5 w-3.5" />
                Email
              </button>
            </div>
          </Card>
        ))}

        {rows.length === 0 && (
          <Card className="col-span-full p-12 text-center text-sm text-zinc-500">
            No reports match that search.
          </Card>
        )}
      </div>

      <Card strong className="p-5">
        <SectionTitle
          icon={Sparkles}
          title="Scheduled reports"
          sub="Delivered without anyone asking"
          right={<Badge tone="good">4 active</Badge>}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ['Daily Collection', 'Every night at 11 PM', 'WhatsApp + email', 'Owner'],
            ['Monthly Revenue', '1st of every month', 'Email', 'Owner, accountant'],
            ['GST Report', 'Quarterly, 5 days before filing', 'Email', 'Accountant'],
            ['Member Churn Prediction', 'Every Monday, 8 AM', 'WhatsApp', 'Owner, sales'],
          ].map(([name, when, how, who]) => (
            <div key={name} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
              <p className="text-sm font-semibold text-white">{name}</p>
              <p className="mt-1 text-xs text-zinc-500">{when} · {how}</p>
              <p className="mt-2 text-[11px] text-zinc-600">To: {who}</p>
            </div>
          ))}
        </div>
      </Card>

      <Toast message={toast} onClose={() => setToast('')} />
    </div>
  )
}
