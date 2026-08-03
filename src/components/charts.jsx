import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Table2 } from 'lucide-react'
import { Card } from './ui.jsx'

// Chart roles. Marks reference these, never ad-hoc hex.
const SURFACE = '#141417'
const GRID = '#2c2c33'
const TEXT_SECONDARY = '#a1a1ad'
export const SERIES = '#ef2b3c' // validated single-series red on SURFACE
// Adjacent-pair-validated categorical set. Bars and stacks only — the
// violet/blue pair fails all-pairs CVD, so never a pie or scatter.
export const CATEGORICAL = ['#ef2b3c', '#3987e5', '#c98500', '#199e70', '#9085e9']

const axis = {
  stroke: 'transparent',
  tickLine: false,
  axisLine: false,
  tick: { fill: TEXT_SECONDARY, fontSize: 11 },
}

function TipShell({ label, children }) {
  return (
    <div className="rounded-xl border border-white/[0.12] bg-matte-900/95 px-3 py-2 shadow-lift backdrop-blur">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function makeTip(format, unit, color = SERIES) {
  return function Tip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    return (
      <TipShell label={label}>
        <p className="num flex items-center gap-2 text-sm font-semibold text-white">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {format ? format(payload[0].value) : payload[0].value}
          {unit && <span className="font-normal text-zinc-400">{unit}</span>}
        </p>
      </TipShell>
    )
  }
}

/** Card frame with an accessible table view of the same numbers. */
export function ChartCard({ title, sub, right, data, columns, height = 240, children }) {
  const [table, setTable] = useState(false)
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {right}
          <button onClick={() => setTable((v) => !v)} className="btn btn-ghost btn-sm" aria-pressed={table}>
            <Table2 className="h-3.5 w-3.5" />
            {table ? 'Chart' : 'Data'}
          </button>
        </div>
      </div>

      <div className="mt-5">
        {table ? (
          <div className="overflow-auto rounded-xl border border-white/[0.08]" style={{ maxHeight: height }}>
            <table className="w-full">
              <thead className="sticky top-0 bg-matte-850">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="th">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.map((row, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} className="td num text-zinc-300">
                        {c.format ? c.format(row[c.key]) : row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ height, background: SURFACE, borderRadius: 12 }}>{children}</div>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ bars */

export function BarSeries({ data, xKey, yKey, unit, format, height = 240, maxBar = 40 }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, bottom: 2, left: 2 }} barCategoryGap="32%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={46} tickFormatter={format} allowDecimals={false} />
        <Tooltip content={makeTip(format, unit)} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
        <Bar dataKey={yKey} fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={maxBar} animationDuration={700} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Occupancy by hour — the current hour is emphasised rather than colour-coded. */
export function OccupancyBars({ data, currentHour, capacity }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, bottom: 2, left: 2 }} barCategoryGap="26%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="hour" {...axis} interval={0} />
        <YAxis {...axis} width={34} domain={[0, capacity]} />
        <Tooltip content={makeTip(null, 'inside')} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
        <Bar dataKey="people" radius={[4, 4, 0, 0]} maxBarSize={26} animationDuration={700}>
          {data.map((d) => (
            <Cell
              key={d.hour}
              fill={SERIES}
              fillOpacity={d.hour === currentHour ? 1 : 0.38}
              stroke={d.hour === currentHour ? '#ffffff' : 'transparent'}
              strokeWidth={d.hour === currentHour ? 1.5 : 0}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Lead sources — horizontal bars with direct labels (adjacent pairlist). */
export function SourceBars({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap="26%">
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" {...axis} hide />
        <YAxis type="category" dataKey="source" {...axis} width={78} />
        <Tooltip content={makeTip(null, 'leads')} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
        <Bar dataKey="leads" radius={[0, 4, 4, 0]} maxBarSize={26} animationDuration={700}>
          {data.map((d, i) => (
            <Cell key={d.source} fill={CATEGORICAL[i % CATEGORICAL.length]} />
          ))}
          <LabelList dataKey="leads" position="right" fill="#a1a1ad" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ----------------------------------------------------------------- lines */

export function AreaSeries({ data, xKey, yKey, unit, format, domainPad = 20 }) {
  const values = data.map((d) => d[yKey])
  const step = domainPad
  const domain = [
    Math.max(0, Math.floor((Math.min(...values) - step / 2) / step) * step),
    Math.ceil((Math.max(...values) + step / 2) / step) * step,
  ]
  const gid = `fill-${yKey}`
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.32} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={52} domain={domain} tickFormatter={format} />
        <Tooltip content={makeTip(format, unit)} cursor={{ stroke: GRID, strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={SERIES}
          strokeWidth={2}
          fill={`url(#${gid})`}
          activeDot={{ r: 5, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }}
          animationDuration={700}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Body composition over time. Two measures, so two stacked mini-charts — never a dual axis. */
export function CompositionLines({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 10, bottom: 2, left: 2 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} width={40} domain={[10, 40]} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <TipShell label={label}>
                <div className="space-y-1">
                  {payload.map((p) => (
                    <p key={p.dataKey} className="num flex items-center gap-2 text-sm text-white">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.stroke }} />
                      <span className="text-zinc-400">{p.dataKey === 'fat' ? 'Body fat' : 'Muscle'}</span>
                      {p.value}
                      <span className="font-normal text-zinc-400">{p.dataKey === 'fat' ? '%' : 'kg'}</span>
                    </p>
                  ))}
                </div>
              </TipShell>
            )
          }}
          cursor={{ stroke: GRID, strokeWidth: 1 }}
        />
        <Line type="monotone" dataKey="fat" stroke={CATEGORICAL[0]} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }} animationDuration={700} />
        <Line type="monotone" dataKey="muscle" stroke={CATEGORICAL[1]} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }} animationDuration={700} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Tiny inline trend line for stat cards. Decorative — the number carries the value. */
export function Spark({ data, dataKey = 'v', width = 84, height = 28 }) {
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
        <Line type="monotone" dataKey={dataKey} stroke={SERIES} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Legend for the two-series composition chart — identity is never colour-alone. */
export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="h-2 w-2 rounded-full" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}
