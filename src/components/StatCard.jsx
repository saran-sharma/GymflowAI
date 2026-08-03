import { ArrowUpRight, Minus } from 'lucide-react'

export default function StatCard({ label, value, delta, trend = 'up', hint, icon: Icon, accent }) {
  return (
    <div className="card group relative overflow-hidden p-5 transition-colors hover:border-ink-600">
      {accent && (
        <span className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-accent/10 blur-2xl" />
      )}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-400">{label}</p>
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-800 text-accent-soft ring-1 ring-ink-700">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>

      <p className="mt-3 text-[28px] font-bold leading-none tracking-tight text-white">{value}</p>

      <div className="mt-3 flex items-center gap-2 text-xs">
        <span
          className={[
            'chip',
            trend === 'up'
              ? 'border-accent/30 bg-accent/10 text-accent-soft'
              : 'border-ink-700 bg-ink-800 text-slate-400',
          ].join(' ')}
        >
          {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {delta}
        </span>
        {hint && <span className="text-slate-500">{hint}</span>}
      </div>
    </div>
  )
}
