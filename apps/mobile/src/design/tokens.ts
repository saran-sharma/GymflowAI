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
 * Raw values, one ramp per theme. Referenced only by the semantic tokens
 * below — never import a palette directly from a component, or the
 * semantics stop being changeable in one place.
 *
 * Role accents, the auth gold, and every status hue are identical across
 * both palettes on purpose: GymFlow's brand identity (gold for trainer
 * actions, purple for owner/selected/progress states, green for member) is
 * what makes the app recognisable, and a theme switch changes the *ground
 * the identity sits on*, never the identity itself.
 */
const brandInk = {
  member: '#B4E052',
  owner: '#7C6EF5',
  trainer: '#D4A44C',
  gold: '#C9A84C',
  green: '#5FBF6A',
  amber: '#D9A441',
  red: '#E05252',
  orange: '#D98841',
  violet: '#8F7BF0',
  blue: '#5B8FD9',
  slate: '#6B6B6B',
} as const;

const darkPalette = {
  ...brandInk,
  // The Figma neutral ramp. Genuinely neutral — no hue shift — because the
  // accent is now per-role, and greys tinted toward one accent would fight
  // the other three.
  ink0: '#0A0A0A', // page
  ink1: '#111111', // chrome and cards
  ink2: '#161616', // inputs
  ink3: '#191919', // elevated / pressed
  ink4: '#1F1F1F',
  ink5: 'rgba(255,255,255,0.07)', // the only border in the design
  ink6: 'rgba(255,255,255,0.14)',

  // Text ramp, from the design.
  text1: '#F0EDE8', // not pure white: warm, and easier to read at length
  text2: '#888888',
  text3: '#444444',
  text4: '#3A3A3A', // placeholders and inactive tabs
  textInverse: '#0A0A0A',
} as const;

const lightPalette = {
  ...brandInk,
  // Warm off-white rather than a harsh paper-white page, with genuinely
  // white cards sitting a visible step above it — the same "elevation is
  // lightness" rule as dark mode, just anchored at the opposite end.
  ink0: '#FAF6EF', // page
  ink1: '#FFFFFF', // chrome and cards
  ink2: '#F2ECE1', // inputs — recessed relative to a white card
  ink3: '#ECE4D6', // elevated / pressed
  ink4: '#E4D9C6',
  ink5: 'rgba(28,20,10,0.09)', // the only border in the design
  ink6: 'rgba(28,20,10,0.18)',

  // Warm near-black rather than pure black — the same reasoning as dark
  // mode's warm near-white, applied at the other end of the ramp.
  text1: '#211C15',
  text2: '#6E655A',
  text3: '#9C9184',
  text4: '#C7BCA9',
  textInverse: '#FFFFFF',
} as const;

export type ColorScheme = 'light' | 'dark';

/**
 * The live token object every component reads. Mutated in place by
 * `applyColorScheme` rather than reassigned, because dozens of modules hold
 * a direct reference to this exact object (`import { color } from
 * '../design'`) — replacing it would leave those imports pointed at a
 * stale copy. `elevation`, `hairline` and `toneColor` below read through
 * getters for the same reason: a value copied out of `color` at import time
 * would freeze at whatever theme was active on first load.
 */
interface ColorTokens {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceOverlay: string;
  surfaceInput: string;
  border: string;
  borderStrong: string;
  brand: string;
  brandPressed: string;
  brandDeep: string;
  brandAccent: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textQuiet: string;
  textInverse: string;
  status: {
    positive: string;
    caution: string;
    critical: string;
    warning: string;
    notable: string;
    info: string;
    neutral: string;
  };
}

export const color: ColorTokens = {
  background: darkPalette.ink0,
  surface: darkPalette.ink1,
  surfaceRaised: darkPalette.ink1,
  surfaceOverlay: darkPalette.ink3,
  surfaceInput: darkPalette.ink2,
  border: darkPalette.ink5,
  borderStrong: darkPalette.ink6,
  brand: darkPalette.gold,
  brandPressed: darkPalette.trainer,
  brandDeep: darkPalette.trainer,
  brandAccent: darkPalette.gold,
  text: darkPalette.text1,
  textSecondary: darkPalette.text2,
  textTertiary: darkPalette.text3,
  textQuiet: darkPalette.text4,
  textInverse: darkPalette.textInverse,
  status: {
    positive: darkPalette.green,
    caution: darkPalette.amber,
    critical: darkPalette.red,
    warning: darkPalette.orange,
    notable: darkPalette.violet,
    info: darkPalette.blue,
    neutral: darkPalette.slate,
  },
};

/**
 * Applies a resolved scheme to the live `color` object in place. Called by
 * `ThemeProvider` — see `src/store/ThemeContext` — synchronously during its
 * render, so the very first frame after a theme change already reads the
 * new values rather than flashing the old ones for a tick.
 */
export function applyColorScheme(scheme: ColorScheme): void {
  const p = scheme === 'light' ? lightPalette : darkPalette;
  color.background = p.ink0;
  color.surface = p.ink1;
  color.surfaceRaised = p.ink1;
  color.surfaceOverlay = p.ink3;
  color.surfaceInput = p.ink2;
  color.border = p.ink5;
  color.borderStrong = p.ink6;
  color.brand = p.gold;
  color.brandPressed = p.trainer;
  color.brandDeep = p.trainer;
  color.brandAccent = p.gold;
  color.text = p.text1;
  color.textSecondary = p.text2;
  color.textTertiary = p.text3;
  color.textQuiet = p.text4;
  color.textInverse = p.textInverse;
  color.status.positive = p.green;
  color.status.caution = p.amber;
  color.status.critical = p.red;
  color.status.warning = p.orange;
  color.status.notable = p.violet;
  color.status.info = p.blue;
  color.status.neutral = p.slate;
}

/**
 * Each role's accent, and the colour the auth screen wears before any role.
 * Deliberately theme-invariant — see the module docstring.
 */
export const roleAccent = {
  member: brandInk.member,
  owner: brandInk.owner,
  branch_manager: brandInk.owner,
  super_admin: brandInk.owner,
  trainer: brandInk.trainer,
  auth: brandInk.gold,
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
 * shadow. Levels 0–2 deliberately carry no shadow in dark mode, where it
 * would be invisible against a near-black ground; light mode's level3 adds
 * a soft shadow of its own, since a floating sheet needs to read as lifted
 * off a light ground too.
 *
 * Every level is a getter rather than a plain field: `color.background`
 * etc. would otherwise be copied out as a fixed string the moment this
 * module first loads, and a later theme switch would never reach it.
 */
export const elevation: Record<'level0' | 'level1' | 'level2' | 'level3', ViewStyle> = {
  /** Flush with the background. */
  get level0() {
    return { backgroundColor: color.background };
  },
  /** A content container. */
  get level1() {
    return { backgroundColor: color.surfaceRaised };
  },
  /** A container on a container, or a pressed card. */
  get level2() {
    return { backgroundColor: color.surfaceOverlay };
  },
  /** Floating over content: modals, sheets, the tab bar. */
  get level3() {
    return {
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
    };
  },
};

/**
 * The hairline that separates surfaces of similar lightness. A getter for
 * `borderColor`, not a fixed field, for the same live-theme reason as
 * `elevation` above.
 */
export const hairline: { borderWidth: number; borderColor: string } = {
  borderWidth: 1,
  get borderColor() {
    return color.border;
  },
};

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
  get neutral() {
    return color.status.neutral;
  },
  get brand() {
    return color.brand;
  },
  get positive() {
    return color.status.positive;
  },
  get caution() {
    return color.status.caution;
  },
  get critical() {
    return color.status.critical;
  },
  get info() {
    return color.status.info;
  },
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
