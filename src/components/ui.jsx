import { useEffect } from 'react'
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Minus, X } from 'lucide-react'

/* ------------------------------------------------------------------ text */

export function PageHeader({ eyebrow, title, sub, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1.5 text-2xl font-bold tracking-tightest text-white sm:text-[28px]">
          {title}
        </h1>
        {sub && <p className="mt-1.5 max-w-2xl text-sm text-zinc-400">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ title, sub, right, icon: Icon }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-brand">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
        </div>
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  )
}

/* ----------------------------------------------------------------- cards */

// min-w-0 so a card inside a grid or flex row can shrink below its content
// width instead of pushing the page sideways.
export function Card({ className = '', strong = false, children, ...rest }) {
  return (
    <div className={`${strong ? 'glass-strong' : 'glass'} min-w-0 ${className}`} {...rest}>
      {children}
    </div>
  )
}

const trendMeta = {
  up: { icon: ArrowUpRight, cls: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' },
  down: { icon: ArrowDownRight, cls: 'border-amber-400/25 bg-amber-400/10 text-amber-300' },
  flat: { icon: Minus, cls: 'border-white/10 bg-white/[0.05] text-zinc-400' },
}

export function StatCard({ label, value, delta, trend = 'flat', hint, icon: Icon, featured }) {
  const t = trendMeta[trend] ?? trendMeta.flat
  const TrendIcon = t.icon
  return (
    <Card
      className={`relative overflow-hidden p-5 transition-colors hover:border-white/15 ${
        featured ? 'ring-1 ring-brand/25' : ''
      }`}
    >
      {featured && (
        <span className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand/20 blur-3xl" />
      )}
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-400">{label}</p>
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-brand-soft">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <p className="num mt-3 text-[28px] font-bold leading-none tracking-tightest text-white">
        {value}
      </p>
      {(delta || hint) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {delta && (
            <span className={`chip ${t.cls}`}>
              <TrendIcon className="h-3 w-3" />
              {delta}
            </span>
          )}
          {hint && <span className="text-zinc-500">{hint}</span>}
        </div>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- meters */

/** Horizontal meter. The number is always rendered, so level is never colour-alone. */
export function Meter({ value, max = 100, tone = 'brand', label, showValue = true, size = 'md' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const tones = {
    brand: 'bg-brand',
    good: 'bg-emerald-400',
    warn: 'bg-amber-400',
    critical: 'bg-brand',
    neutral: 'bg-zinc-400',
  }
  const h = size === 'sm' ? 'h-1' : size === 'lg' ? 'h-2.5' : 'h-1.5'
  return (
    <div className="flex items-center gap-3">
      <div className={`${h} w-full overflow-hidden rounded-full bg-white/10`} aria-hidden="true">
        <div
          className={`${h} rounded-full ${tones[tone]} transition-[width] duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span className="num shrink-0 text-sm font-medium text-zinc-200">
          {label ?? `${Math.round(pct)}%`}
        </span>
      )}
    </div>
  )
}

/** Radial gauge for a single headline percentage. */
export function Ring({ value, max = 100, size = 132, stroke = 10, label, sub, tone = '#ef2b3c' }) {
  const pct = Math.max(0, Math.min(1, value / max))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="num text-2xl font-bold leading-none tracking-tightest text-white">{label}</p>
        {sub && <p className="mt-1 text-[11px] text-zinc-500">{sub}</p>}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- badges */

const statusTone = {
  good: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  warn: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  critical: 'border-brand/35 bg-brand/[0.12] text-brand-soft',
  info: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  neutral: 'border-white/10 bg-white/[0.05] text-zinc-300',
}

export function Badge({ tone = 'neutral', icon: Icon, children, className = '' }) {
  return (
    <span className={`chip ${statusTone[tone] ?? statusTone.neutral} ${className}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  )
}

export function Avatar({ initials, size = 'md', tone }) {
  const s = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-base' }[size]
  return (
    <span
      className={`${s} grid shrink-0 place-items-center rounded-full border border-white/10 font-bold text-white`}
      style={{ background: tone ? `${tone}22` : 'rgba(255,255,255,.06)' }}
    >
      {initials}
    </span>
  )
}

/* -------------------------------------------------------------- controls */

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1 ${className}`}>
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            aria-pressed={value === val}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              value === val ? 'bg-brand text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- modal */

export function Modal({ open, onClose, title, sub, children, footer, wide }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92vh] animate-fade-up overflow-y-auto rounded-t-3xl border border-white/10 bg-matte-900 shadow-lift sm:rounded-2xl`}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.08] bg-matte-900/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="sticky bottom-0 border-t border-white/[0.08] bg-matte-900/95 px-5 py-4 backdrop-blur">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- toast */

export function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, 3600)
    return () => clearTimeout(t)
  }, [message, onClose])

  if (!message) return null
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-5 z-[80] mx-auto flex max-w-md animate-fade-up items-start gap-3 rounded-2xl border border-brand/30 bg-matte-900/95 px-4 py-3 shadow-redglow backdrop-blur sm:left-auto sm:right-6 sm:mx-0"
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
      <div className="flex-1">
        <p className="text-sm text-zinc-100">{message}</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">Demo only — nothing was actually sent or charged.</p>
      </div>
      <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/* ----------------------------------------------------------------- misc */

export function KeyValue({ rows }) {
  return (
    <dl className="divide-y divide-white/[0.06]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="text-sm text-zinc-400">{k}</dt>
          <dd className="num text-sm font-medium text-zinc-100">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function LivePulse({ label = 'Live' }) {
  return (
    <span className="chip border-brand/30 bg-brand/10 text-brand-soft">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-pulsering rounded-full bg-brand" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
      </span>
      {label}
    </span>
  )
}
