import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Table2 } from 'lucide-react'

// Chart roles resolved once — the marks below reference roles, never raw hex.
const SURFACE = '#111a15'
const GRID = '#1e2b24'
const TEXT_SECONDARY = '#9db0a5'
const SERIES_1 = '#16a34a' // validated against SURFACE for the dark band + 3:1

const axis = {
  stroke: 'transparent',
  tickLine: false,
  axisLine: false,
  tick: { fill: TEXT_SECONDARY, fontSize: 12 },
}

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-900/95 px-3 py-2 shadow-card backdrop-blur">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-white">
        <span className="h-2 w-2 rounded-full" style={{ background: SERIES_1 }} />
        {payload[0].value} <span className="font-normal text-slate-400">{unit}</span>
      </p>
    </div>
  )
}

/** Card frame shared by both charts, with an optional accessible table view. */
function ChartCard({ title, caption, children, data, columns }) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{caption}</p>
        </div>
        <button
          onClick={() => setShowTable((v) => !v)}
          className="btn btn-ghost btn-sm shrink-0"
          aria-pressed={showTable}
        >
          <Table2 className="h-3.5 w-3.5" />
          {showTable ? 'Chart' : 'Data'}
        </button>
      </div>

      <div className="mt-5">
        {showTable ? (
          <div className="max-h-[240px] overflow-auto rounded-xl border border-ink-700">
            <table className="w-full">
              <thead className="sticky top-0 bg-ink-850">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="th">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700">
                {data.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} className="td text-slate-300">
                        {row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-[240px] w-full" style={{ background: SURFACE }}>
            {children}
          </div>
        )}
      </div>
    </section>
  )
}

export function LeadsChart({ data }) {
  return (
    <ChartCard
      title="Leads this week"
      caption="New enquiries captured across WhatsApp, Instagram and walk-ins"
      data={data}
      columns={[
        { key: 'day', label: 'Day' },
        { key: 'leads', label: 'Leads' },
      ]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="34%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" {...axis} />
          <YAxis {...axis} width={36} allowDecimals={false} />
          <Tooltip
            content={<ChartTooltip unit="leads" />}
            cursor={{ fill: 'rgba(255,255,255,.04)' }}
          />
          <Bar
            dataKey="leads"
            fill={SERIES_1}
            radius={[4, 4, 0, 0]}
            maxBarSize={38}
            animationDuration={700}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

/** Pad the y-range out to round multiples of 20 so the ticks read cleanly. */
function growthDomain(data) {
  const values = data.map((d) => d.members)
  const step = 20
  return [
    Math.max(0, Math.floor((Math.min(...values) - 10) / step) * step),
    Math.ceil((Math.max(...values) + 10) / step) * step,
  ]
}

export function GrowthChart({ data }) {
  return (
    <ChartCard
      title="Membership growth"
      caption="Active members at the end of each month"
      data={data}
      columns={[
        { key: 'month', label: 'Month' },
        { key: 'members', label: 'Active members' },
      ]}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_1} stopOpacity={0.34} />
              <stop offset="100%" stopColor={SERIES_1} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" {...axis} />
          <YAxis {...axis} width={44} domain={growthDomain(data)} tickCount={5} />
          <Tooltip
            content={<ChartTooltip unit="members" />}
            cursor={{ stroke: GRID, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="members"
            stroke={SERIES_1}
            strokeWidth={2}
            fill="url(#growthFill)"
            activeDot={{ r: 5, fill: SERIES_1, stroke: SURFACE, strokeWidth: 2 }}
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
