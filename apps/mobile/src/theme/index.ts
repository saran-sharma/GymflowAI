/**
 * Compatibility view over the design system.
 *
 * Screens written before `src/design` existed import `colors`, `spacing`,
 * `radius` and `typography` from here. Rather than leave a second set of
 * values to drift, this module is now a *projection* of `src/design/tokens` —
 * so changing a token changes both the new components and every existing
 * screen, and there is nowhere for the two to disagree.
 *
 * New work should import from `src/design` directly. Nothing here is
 * deprecated in a way that breaks; it simply has a flatter shape.
 */

import {
  color,
  control,
  HIT_TARGET as HIT_TARGET_TOKEN,
  radii,
  space,
  text,
} from '../design/tokens';

/* ------------------------------------------------------------------ colour */

/**
 * The flat palette the screens use.
 *
 * Every entry points at a semantic token. The status colours map one-to-one
 * onto attendance outcomes, so a colour never means two different things
 * across screens.
 */
export const colors = {
  // Surfaces, darkest to lightest.
  bg: color.background,
  surface: color.surface,
  card: color.surfaceRaised,
  raised: color.surfaceOverlay,
  input: color.surfaceInput,
  border: color.border,
  borderStrong: color.borderStrong,

  // The SLAM red.
  brand: color.brand,
  brandSoft: color.brandAccent,
  brandDeep: color.brandDeep,

  // Text.
  text: color.text,
  textMuted: color.textSecondary,
  textFaint: color.textTertiary,
  textInverse: color.textInverse,

  // Outcome hues.
  onTime: color.status.positive,
  late: color.status.caution,
  absent: color.status.critical,
  earlyExit: color.status.warning,
  missing: color.status.notable,
  scheduled: color.status.neutral,
  info: color.status.info,
} as const;

/* ----------------------------------------------------- spacing and shape */

export const spacing = {
  xs: space.xs,
  sm: space.sm,
  md: space.md,
  lg: space.lg,
  xl: space.xl,
  xxl: space.xxl,
  xxxl: space.xxxl,
} as const;

export const radius = {
  sm: radii.sm,
  md: radii.md,
  lg: radii.lg,
  xl: radii.xl,
  pill: radii.pill,
} as const;

/**
 * The type scale.
 *
 * Spread into a style (`...typography.body`), so these now carry line heights
 * as well — stacked text was previously relying on the platform default, which
 * is what made multi-line copy look loose against the tight display sizes.
 */
export const typography = text;

/** Minimum tap target. Trainers use this on a gym floor, often mid-set. */
export const HIT_TARGET = HIT_TARGET_TOKEN;

/** Control heights, for screens that size a custom pressable. */
export const controlHeight = control.height;

/* ------------------------------------------------------------- attendance */

export type AttendanceStatus =
  | 'scheduled'
  | 'on_time'
  | 'late'
  | 'early_exit'
  | 'late_and_early_exit'
  | 'absent'
  | 'missing_checkout'
  | 'completed';

export const statusMeta: Record<
  AttendanceStatus,
  { label: string; color: string; short: string }
> = {
  scheduled: { label: 'Not checked in', color: colors.scheduled, short: 'Pending' },
  on_time: { label: 'On time', color: colors.onTime, short: 'On time' },
  late: { label: 'Late', color: colors.late, short: 'Late' },
  early_exit: { label: 'Left early', color: colors.earlyExit, short: 'Early' },
  late_and_early_exit: { label: 'Late + left early', color: colors.absent, short: 'Late/Early' },
  absent: { label: 'Absent', color: colors.absent, short: 'Absent' },
  missing_checkout: { label: 'No check-out', color: colors.missing, short: 'No out' },
  completed: { label: 'Shift completed', color: colors.onTime, short: 'Done' },
};

export const incentiveMeta = {
  eligible: { label: 'Eligible', color: colors.onTime },
  not_eligible: { label: 'Not eligible', color: colors.absent },
  needs_review: { label: 'Needs review', color: colors.late },
} as const;
