import { useState } from 'react'
import { photos } from '../data/photos.js'

/**
 * Generated artwork, drawn as SVG rather than shipped as photos.
 *
 * There is no stock photography in this build, so these duotone scenes stand in
 * for it: geometric gym equipment over a brand-tinted ground. They scale
 * perfectly, cost nothing to load and stay on-palette.
 *
 * To use real photography instead, drop files into `public/img/` and pass
 * `src` — the photo replaces the drawing and keeps the same framing and tint.
 */

const PALETTES = {
  red: { base: '#12080a', mid: '#2a0e14', glow: 'rgba(239,43,60,.55)', line: 'rgba(255,255,255,.16)' },
  slate: { base: '#0b0d12', mid: '#141a26', glow: 'rgba(57,135,229,.38)', line: 'rgba(255,255,255,.14)' },
  ember: { base: '#140c08', mid: '#2b1710', glow: 'rgba(201,133,0,.42)', line: 'rgba(255,255,255,.15)' },
}

/* Each scene is a set of shapes drawn in a 400×260 viewBox. */
function Rack({ c }) {
  return (
    <g>
      {/* uprights */}
      <rect x="78" y="60" width="13" height="170" rx="4" fill={c.line} />
      <rect x="309" y="60" width="13" height="170" rx="4" fill={c.line} />
      {/* bar */}
      <rect x="40" y="104" width="320" height="9" rx="4.5" fill="#ef2b3c" />
      {/* plates */}
      {[54, 68].map((x, i) => (
        <rect key={x} x={x} y={78 - i * 4} width="11" height={61 + i * 8} rx="4" fill="#fff" opacity={0.9 - i * 0.25} />
      ))}
      {[331, 317].map((x, i) => (
        <rect key={x} x={x} y={78 - i * 4} width="11" height={61 + i * 8} rx="4" fill="#fff" opacity={0.9 - i * 0.25} />
      ))}
      {/* bench */}
      <rect x="150" y="176" width="100" height="13" rx="6" fill={c.line} />
      <rect x="163" y="189" width="9" height="38" rx="4" fill={c.line} />
      <rect x="228" y="189" width="9" height="38" rx="4" fill={c.line} />
    </g>
  )
}

function Dumbbells({ c }) {
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => {
        const x = 46 + i * 64
        const h = 34 + (i % 3) * 12
        return (
          <g key={i}>
            <rect x={x} y={214 - h} width="14" height={h} rx="6" fill="#ef2b3c" opacity={0.35 + i * 0.13} />
            <rect x={x - 9} y={210 - h} width="32" height="12" rx="6" fill="#fff" opacity={0.82} />
            <rect x={x - 9} y="214" width="32" height="12" rx="6" fill={c.line} />
          </g>
        )
      })}
      <rect x="30" y="230" width="340" height="7" rx="3.5" fill={c.line} />
    </g>
  )
}

function Cardio({ c }) {
  return (
    <g>
      {[0, 1, 2].map((i) => {
        const x = 42 + i * 116
        return (
          <g key={i} opacity={1 - i * 0.22}>
            <rect x={x} y="150" width="92" height="16" rx="8" fill={c.line} />
            <rect x={x + 8} y="166" width="8" height="52" rx="4" fill={c.line} />
            <rect x={x + 74} y="166" width="8" height="52" rx="4" fill={c.line} />
            <rect x={x + 66} y="70" width="9" height="82" rx="4.5" fill={c.line} />
            <rect x={x + 44} y="52" width="52" height="26" rx="7" fill="#ef2b3c" opacity="0.85" />
          </g>
        )
      })}
      <rect x="24" y="228" width="352" height="7" rx="3.5" fill={c.line} />
    </g>
  )
}

function Kettlebells({ c }) {
  return (
    <g>
      {[
        [104, 1.25],
        [200, 1.7],
        [292, 1.0],
      ].map(([x, s], i) => {
        const tone = i === 1 ? '#ef2b3c' : c.line
        return (
          <g key={x} transform={`translate(${x} ${228 - 30 * s}) scale(${s})`}>
            {/* open handle arc, then the bell — reads as a kettlebell rather
                than a closed padlock outline */}
            <path d="M-11 -12 a11 11 0 0 1 22 0" fill="none" stroke={tone} strokeWidth="4.5" strokeLinecap="round" />
            <path
              d="M0 -12 c-13 0 -20 10 -20 19 a20 20 0 0 0 40 0 c0 -9 -7 -19 -20 -19 z"
              fill={tone}
              opacity={i === 1 ? 0.95 : 0.7}
            />
          </g>
        )
      })}
      <rect x="30" y="230" width="340" height="7" rx="3.5" fill={c.line} />
    </g>
  )
}

/** Abstract athlete silhouette, for trainer cards and progress frames. */
function Figure({ c, build = 1 }) {
  // Exaggerate the difference so a lean and a heavy build read apart at a glance.
  const w = 0.72 + build * 0.42
  return (
    <g transform="translate(200 140)">
      <circle cx="0" cy="-64" r="24" fill="#fff" opacity="0.9" />
      <rect x={-30 * w} y="-34" width={60 * w} height="76" rx={26 * w} fill="#ef2b3c" opacity="0.9" />
      <rect x={-46 * w} y="-30" width={15 * w} height="66" rx="7" fill="#fff" opacity="0.72" />
      <rect x={31 * w} y="-30" width={15 * w} height="66" rx="7" fill="#fff" opacity="0.72" />
      <rect x="-25" y="42" width="19" height="62" rx="9" fill="#fff" opacity="0.66" />
      <rect x="6" y="42" width="19" height="62" rx="9" fill="#fff" opacity="0.66" />
    </g>
  )
}

const SCENES = { rack: Rack, dumbbells: Dumbbells, cardio: Cardio, kettlebells: Kettlebells, figure: Figure }

export default function Scene({
  variant = 'rack',
  palette = 'red',
  src,
  photo,
  alt = '',
  className = '',
  ratio = 'aspect-[16/10]',
  build,
  children,
}) {
  const c = PALETTES[palette] ?? PALETTES.red
  const Shapes = SCENES[variant] ?? Rack
  const gid = `sg-${variant}-${palette}`

  // A photo can come from a `photo` key in src/data/photos.js, or directly
  // as `src`. If it fails to load we fall back to the drawing rather than
  // showing a broken image — a demo should never have a hole in it.
  const configured = src ?? (photo ? photos[photo] : null)
  const [failed, setFailed] = useState(false)
  const showPhoto = configured && !failed

  if (showPhoto) {
    return (
      <div className={`relative overflow-hidden ${ratio} ${className}`}>
        <img
          src={configured}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
        {/* Same tint the drawings carry, so photos and art sit together. */}
        <div className="absolute inset-0 bg-gradient-to-t from-matte-950 via-matte-950/30 to-transparent" />
        <div className="absolute inset-0 bg-brand/[0.06] mix-blend-overlay" />
        {children}
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden ${ratio} ${className}`} role="img" aria-label={alt}>
      <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <linearGradient id={`${gid}-bg`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor={c.mid} />
            <stop offset="100%" stopColor={c.base} />
          </linearGradient>
          <radialGradient id={`${gid}-glow`} cx="0.28" cy="0.12" r="0.85">
            <stop offset="0%" stopColor={c.glow} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <pattern id={`${gid}-grid`} width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M26 0H0v26" fill="none" stroke="#fff" strokeOpacity="0.05" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width="400" height="260" fill={`url(#${gid}-bg)`} />
        <rect width="400" height="260" fill={`url(#${gid}-grid)`} />
        <rect width="400" height="260" fill={`url(#${gid}-glow)`} />
        <Shapes c={c} build={build} />
        {/* floor fade, so the art sits into the card rather than on top of it */}
        <rect y="180" width="400" height="80" fill="url(#fade)" />
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#08080a" stopOpacity="0" />
            <stop offset="100%" stopColor="#08080a" stopOpacity="0.85" />
          </linearGradient>
        </defs>
      </svg>
      {children}
    </div>
  )
}
