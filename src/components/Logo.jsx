/** GymFlow AI wordmark. The glyph is a stylised plate-loaded bar. */
export default function Logo({ size = 'md', className = '' }) {
  const box = { sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-11 w-11' }[size]
  const text = { sm: 'text-[15px]', md: 'text-lg', lg: 'text-xl' }[size]
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`${box} grid place-items-center rounded-xl border border-brand/40 bg-brand/15`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="#ef2b3c" strokeWidth="2.4" strokeLinecap="round">
          <path d="M4 8v8M8 6v12M16 6v12M20 8v8M8 12h8" />
        </svg>
      </span>
      <span className={`${text} font-bold tracking-tightest text-white`}>
        GymFlow<span className="text-brand"> AI</span>
      </span>
    </span>
  )
}

/**
 * Placeholder frame for the client's own logo. Deliberately looks like a slot
 * waiting for artwork rather than a finished mark.
 */
export function StudioLogoSlot({ name = 'SLAM Fitness Studio', className = '', compact = false }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-3 py-2 ${className}`}
      title="Placeholder — drop the studio logo here"
    >
      <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/15 bg-white/[0.05] text-[9px] font-bold text-zinc-400">
        LOGO
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-xs font-semibold text-zinc-200">{name}</span>
          <span className="block text-[10px] text-zinc-500">Logo placeholder</span>
        </span>
      )}
    </span>
  )
}
