/**
 * GymFlow AI — design tokens.
 *
 * The single source of truth for every colour, size and rhythm in the app.
 * Screens and components reference these names; nothing hardcodes a hex value
 * or a magic number. `src/theme` re-exports a flat view of these for the
 * screens written against the older shape, so there is exactly one place to
 * change a value.
 *
 * Three rules the palette follows, and the reasons they matter on a dark UI:
 *
 * 1. **Not pure black, and not pure grey.** The neutrals carry a faint red
 *    bias so the ground and the SLAM accent read as one family. Pure #000 also
 *    crushes on OLED and makes every border look like a scratch.
 * 2. **Elevation is lightness, not shadow.** On a dark surface a drop shadow is
 *    nearly invisible; a lighter surface is what reads as "closer". Shadows are
 *    reserved for things that genuinely float over content.
 * 3. **One accent.** Red means SLAM, and red means "act on this". Status hues
 *    exist only where the product must distinguish outcomes (on time, late,
 *    absent) and are muted so they never compete with the accent.
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/* ------------------------------------------------------------------ palette */

/**
 * Raw values. Referenced only by the semantic tokens below — never import this
 * directly from a component, or the semantics stop being changeable in one
 * place.
 */
const palette = {
  // Neutral ramp, darkest to lightest. Hue-shifted a few degrees toward red.
  ink0: '#08080A',
  ink1: '#0E0E11',
  ink2: '#141417',
  ink3: '#1B1B1F',
  ink4: '#232329',
  ink5: '#2C2C33',
  ink6: '#3A3A42',

  // SLAM red.
  red400: '#FF5B68',
  red500: '#EF2B3C',
  red600: '#D01F2F',
  red700: '#C8102E',

  // Text ramp.
  white: '#FFFFFF',
  grey300: '#D4D4D8',
  grey400: '#A1A1AA',
  grey500: '#71717A',

  // Outcome hues. Deliberately few, and none of them saturated enough to
  // compete with the accent.
  green: '#22C55E',
  amber: '#F59E0B',
  orange: '#F97316',
  violet: '#A855F7',
  blue: '#3B82F6',
  slate: '#64748B',
} as const;

/* ------------------------------------------------------- semantic colour */

export const color = {
  /** App background — the furthest-back surface. */
  background: palette.ink0,
  /** Chrome that sits on the background: tab bar, headers. */
  surface: palette.ink1,
  /** Content containers. The default card. */
  surfaceRaised: palette.ink2,
  /** A container on top of a container, or a pressed state. */
  surfaceOverlay: palette.ink3,
  /** Form fields, which must read as recessed rather than raised. */
  surfaceInput: palette.ink4,

  border: palette.ink5,
  borderStrong: palette.ink6,

  brand: palette.red500,
  brandPressed: palette.red600,
  brandDeep: palette.red700,
  /** For text and icons on a dark ground, where red500 is too dense to read. */
  brandAccent: palette.red400,

  text: palette.white,
  textSecondary: palette.grey400,
  textTertiary: palette.grey500,
  /** On a brand or light fill. */
  textInverse: palette.ink0,

  status: {
    positive: palette.green,
    caution: palette.amber,
    critical: palette.red500,
    warning: palette.orange,
    notable: palette.violet,
    info: palette.blue,
    neutral: palette.slate,
  },
} as const;

/**
 * A translucent wash of any token colour.
 *
 * Tints are how a status reads on a dark ground without a second solid fill:
 * `alpha(color.status.positive, 0.12)` gives a background that belongs to the
 * same hue as its border and text.
 */
export function alpha(hex: string, amount: number): string {
  const clamped = Math.max(0, Math.min(1, amount));
  const value = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${value}`;
}

/* ------------------------------------------------------------------ spacing */

/** A 4pt rhythm. Every gap, pad and margin comes from here. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/* ------------------------------------------------------------------- radius */

export const radii = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/* --------------------------------------------------------------- typography */

/**
 * One scale, seven roles. Line heights are set here rather than per screen —
 * their absence is what makes stacked text look accidental.
 *
 * Display and title are tightly tracked because the app is mostly numbers, and
 * negative tracking is what makes a metric read as a figure rather than a
 * spreadsheet cell.
 */
export const text = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1.4 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.8 },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.4 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '500', letterSpacing: -0.1 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.2 },
  /** All-caps eyebrows and badges. Wide tracking is what makes caps legible. */
  caption: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.1 },
  /** Times, counts and anything that should align in a column. */
  mono: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: 0.5 },
} as const satisfies Record<string, TextStyle>;

export type TextRole = keyof typeof text;

/* -------------------------------------------------------------- elevation */

/**
 * Elevation as surface lightness plus, only where something truly floats, a
 * shadow. Levels 0–2 deliberately carry no shadow: on a near-black ground it
 * would be invisible cost.
 */
export const elevation = {
  /** Flush with the background. */
  level0: { backgroundColor: color.background },
  /** A content container. */
  level1: { backgroundColor: color.surfaceRaised },
  /** A container on a container, or a pressed card. */
  level2: { backgroundColor: color.surfaceOverlay },
  /** Floating over content: modals, sheets, the tab bar. */
  level3: {
    backgroundColor: color.surfaceOverlay,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
} as const satisfies Record<string, ViewStyle>;

/** The hairline that separates surfaces of similar lightness. */
export const hairline = { borderWidth: 1, borderColor: color.border } as const;

/* ----------------------------------------------------------------- motion */

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  /** How far a pressable scales in. Small enough to feel, not to bounce. */
  pressScale: 0.985,
  pressOpacity: 0.82,
  disabledOpacity: 0.45,
} as const;

/* ------------------------------------------------------------ interaction */

/** Minimum tap target. Trainers use this on a gym floor, often mid-set. */
export const HIT_TARGET = 48;

export const control = {
  height: { sm: 36, md: HIT_TARGET, lg: 56 },
  /** The trainer's one job — unmissable and thumb-reachable. */
  heightHero: 128,
  paddingX: { sm: space.md, md: space.lg, lg: space.xl },
} as const;

/* ------------------------------------------------------------------ tones */

/**
 * The semantic tones a badge, alert or button can carry. Naming these once is
 * what stops "warning" meaning amber on one screen and orange on the next.
 */
export type Tone = 'neutral' | 'brand' | 'positive' | 'caution' | 'critical' | 'info';

export const toneColor: Record<Tone, string> = {
  neutral: color.status.neutral,
  brand: color.brand,
  positive: color.status.positive,
  caution: color.status.caution,
  critical: color.status.critical,
  info: color.status.info,
};

export const tokens = {
  color,
  space,
  radii,
  text,
  elevation,
  hairline,
  motion,
  control,
  toneColor,
  HIT_TARGET,
} as const;

export default tokens;
