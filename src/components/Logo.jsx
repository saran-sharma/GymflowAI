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
 * The studio's own mark.
 *
 * The supplied artwork is a JPEG with the wordmark on an opaque white
 * background, which would show as a white box on a matte-black UI. `.logo.mjs`
 * derives two transparent PNGs from it — a knocked-out white version keeping
 * the brand-red "L" for dark surfaces, and the original ink for light ones —
 * both trimmed to the artwork's bounding box. Source stays in `brand/`,
 * unshipped.
 */
export function StudioLogo({ className = '', size = 'md', variant = 'dark', framed = false, wordmark = false }) {
  const h = { xs: 'h-4', sm: 'h-5', md: 'h-9', lg: 'h-12', xl: 'h-16' }[size] ?? 'h-9'
  // Below about 28px the tagline is unreadable, so small placements use the
  // wordmark-only crop instead of the full lockup.
  const src = wordmark
    ? './img/slam-wordmark-dark.png'
    : variant === 'light'
      ? './img/slam-logo-light.png'
      : './img/slam-logo-dark.png'
  const img = (
    <img
      src={src}
      alt={wordmark ? 'SLAM' : 'SLAM — Lifestyle and Fitness Studio'}
      className={`${h} w-auto ${className}`}
    />
  )
  if (!framed) return img
  return (
    <span className="inline-flex items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      {img}
    </span>
  )
}

/** Kept so older call sites keep working; renders the real mark now. */
export const StudioLogoSlot = ({ className = '', compact = false }) => (
  <StudioLogo className={className} size={compact ? 'xs' : 'sm'} framed />
)
