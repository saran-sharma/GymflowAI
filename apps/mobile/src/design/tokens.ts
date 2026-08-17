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
  // The Figma neutral ramp. Genuinely neutral — no hue shift — because the
  // accent is now per-role, and greys tinted toward one accent would fight the
  // other three.
  ink0: '#0A0A0A', // page
  ink1: '#111111', // chrome and cards
  ink2: '#161616', // inputs
  ink3: '#191919', // elevated / pressed
  ink4: '#1F1F1F',
  ink5: 'rgba(255,255,255,0.07)', // the only border in the design
  ink6: 'rgba(255,255,255,0.14)',

  /**
   * Role accents.
   *
   * GymFlow no longer has one brand colour. A person's accent tells them whose
   * app they are in before they read a word of it, which is worth more in a
   * product where one human can be a member at one branch and a trainer at
   * another. Auth is gold because it belongs to none of them yet.
   */
  member: '#B4E052',
  owner: '#7C6EF5',
  trainer: '#D4A44C',
  gold: '#C9A84C',

  // Text ramp, from the design.
  text1: '#F0EDE8', // not pure white: warm, and easier to read at length
  text2: '#888888',
  text3: '#444444',
  text4: '#3A3A3A', // placeholders and inactive tabs

  // Outcome hues. Deliberately few, and none saturated enough to be mistaken
  // for a role accent.
  green: '#5FBF6A',
  amber: '#D9A441',
  red: '#E05252',
  orange: '#D98841',
  violet: '#8F7BF0',
  blue: '#5B8FD9',
  slate: '#6B6B6B',
} as const;

/* ------------------------------------------------------- semantic colour */

export const color = {
  /** App background — the furthest-back surface. */
  background: palette.ink0,
  /** Chrome that sits on the background: tab bar, headers. */
  surface: palette.ink1,
  /** Content containers. The default card. */
  surfaceRaised: palette.ink1,
  /** A container on top of a container, or a pressed state. */
  surfaceOverlay: palette.ink3,
  /** Form fields, which must read as recessed rather than raised. */
  surfaceInput: palette.ink2,

  border: palette.ink5,
  borderStrong: palette.ink6,

  /**
   * The accent for the app you are currently in.
   *
   * Defaults to gold — the auth colour — and is replaced per role group by
   * `roleAccent`. Every component reads `color.brand`, so a role's colour
   * arrives without a single component knowing roles exist.
   */
  brand: palette.gold,
  brandPressed: palette.trainer,
  brandDeep: palette.trainer,
  /** For text and icons on a dark ground. */
  brandAccent: palette.gold,

  text: palette.text1,
  textSecondary: palette.text2,
  textTertiary: palette.text3,
  /** Placeholders, inactive tabs — the quietest legible step. */
  textQuiet: palette.text4,
  /** On a brand or light fill. */
  textInverse: palette.ink0,

  status: {
    positive: palette.green,
    caution: palette.amber,
    critical: palette.red,
    warning: palette.orange,
    notable: palette.violet,
    info: palette.blue,
    neutral: palette.slate,
  },
} as const;

/** Each role's accent, and the colour the auth screen wears before any role. */
export const roleAccent = {
  member: palette.member,
  owner: palette.owner,
  branch_manager: palette.owner,
  super_admin: palette.owner,
  trainer: palette.trainer,
  auth: palette.gold,
} as const;

export type RoleAccent = keyof typeof roleAccent;

/**
 * A translucent wash of any token colour.
 *
 * Tints are how a status reads on a dark ground without a second solid fill:
 * `alpha(color.status.positive, 0.12)` gives a background that belongs to the
 * same hue as its border and text.
 */
export function alpha(hex: string, amount: number): string {
  const clamped = Math.max(0, Math.min(1, amount));
  // The border tokens are already rgba strings — the design defines its only
  // border as translucent white. Appending a hex alpha to one would produce a
  // colour React Native silently drops, so pass it through instead.
  if (!hex.startsWith('#')) return hex;
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
export const font = {
  /** Headlines and brand moments. Editorial, never functional UI. */
  display: 'Fraunces_300Light',
  displayItalic: 'Fraunces_300Light_Italic',
  displaySemi: 'Fraunces_400Regular',
  /** Everything a person reads to operate the app. */
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemi: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  /** Figures that must align in a column, and measurements. */
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

/**
 * One scale, eight roles.
 *
 * `display` and `title` are Fraunces because a headline is where this product
 * gets to have a voice; everything below them is Inter because a label, a
 * button and a form field are read, not admired. `mono` is DM Mono so a column
 * of numbers lines up — the reason monospace exists.
 *
 * Weight lives in the family name, not in `fontWeight`: React Native on Android
 * will happily synthesise a fake bold from a regular face, which looks like a
 * rendering bug rather than a typeface.
 */
export const text = {
  display: {
    fontFamily: font.display,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.5,
  },
  title: {
    fontFamily: font.display,
    fontSize: 27,
    lineHeight: 33,
    letterSpacing: -0.7,
  },
  heading: {
    fontFamily: font.sansSemi,
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: font.sans,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  label: {
    fontFamily: font.sansMedium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  /** All-caps eyebrows and section labels. Wide tracking makes caps legible. */
  caption: {
    fontFamily: font.sansMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
  },
  /** Times, counts and anything that should align in a column. */
  mono: {
    fontFamily: font.mono,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  },
  /** The oversized figure on a metric. Mono so a row of them aligns. */
  metric: {
    fontFamily: font.monoMedium,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1,
  },
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

  /**
   * The one spring the whole app presses with.
   *
   * Critically damped on purpose: an overshoot on a card that reports how many
   * members are in the building reads as a toy. The bounce belongs in a
   * consumer app, not in software someone uses forty times a shift.
   */
  press: { damping: 18, stiffness: 320, mass: 0.6 },

  /**
   * Entrance. `stagger` is per-item delay in a list — six items is 90ms of
   * total lead-in, which is felt rather than waited for.
   */
  enter: { duration: 260, stagger: 15, distance: 8 },

  /** How long a figure takes to count to its value. */
  count: 420,
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
  font,
  motion,
  control,
  toneColor,
  HIT_TARGET,
} as const;

export default tokens;
