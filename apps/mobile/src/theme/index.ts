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
/**
 * Every entry is a getter, not a plain field: a value copied out of `color`
 * at import time would freeze at whatever theme was active on first load,
 * the same reason `elevation`/`hairline`/`toneColor` in `src/design/tokens`
 * are getters. Read inline in a component body (as every usage below is),
 * this always reflects the current theme; baked into a module-scope
 * `StyleSheet.create`, it would not — see `useThemedStyles`.
 */
export const colors = {
  // Surfaces, darkest to lightest.
  get bg() {
    return color.background;
  },
  get surface() {
    return color.surface;
  },
  get card() {
    return color.surfaceRaised;
  },
  get raised() {
    return color.surfaceOverlay;
  },
  get input() {
    return color.surfaceInput;
  },
  get border() {
    return color.border;
  },
  get borderStrong() {
    return color.borderStrong;
  },

  // The role/auth accent.
  get brand() {
    return color.brand;
  },
  get brandSoft() {
    return color.brandAccent;
  },
  get brandDeep() {
    return color.brandDeep;
  },

  // Text.
  get text() {
    return color.text;
  },
  get textMuted() {
    return color.textSecondary;
  },
  get textFaint() {
    return color.textTertiary;
  },
  get textInverse() {
    return color.textInverse;
  },

  // Outcome hues.
  get onTime() {
    return color.status.positive;
  },
  get late() {
    return color.status.caution;
  },
  get absent() {
    return color.status.critical;
  },
  get earlyExit() {
    return color.status.warning;
  },
  get missing() {
    return color.status.notable;
  },
  get scheduled() {
    return color.status.neutral;
  },
  get info() {
    return color.status.info;
  },
};

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

// Each `color` below is a getter for the same reason `colors` above is:
// this object is built once at module scope, and a plain field would freeze
// whatever `colors.X` resolved to at that instant.
export const statusMeta: Record<
  AttendanceStatus,
  { label: string; color: string; short: string }
> = {
  scheduled: {
    label: 'Not checked in',
    get color() {
      return colors.scheduled;
    },
    short: 'Pending',
  },
  on_time: {
    label: 'On time',
    get color() {
      return colors.onTime;
    },
    short: 'On time',
  },
  late: {
    label: 'Late',
    get color() {
      return colors.late;
    },
    short: 'Late',
  },
  early_exit: {
    label: 'Left early',
    get color() {
      return colors.earlyExit;
    },
    short: 'Early',
  },
  late_and_early_exit: {
    label: 'Late + left early',
    get color() {
      return colors.absent;
    },
    short: 'Late/Early',
  },
  absent: {
    label: 'Absent',
    get color() {
      return colors.absent;
    },
    short: 'Absent',
  },
  missing_checkout: {
    label: 'No check-out',
    get color() {
      return colors.missing;
    },
    short: 'No out',
  },
  completed: {
    label: 'Shift completed',
    get color() {
      return colors.onTime;
    },
    short: 'Done',
  },
};

export const incentiveMeta: Record<'eligible' | 'not_eligible' | 'needs_review', { label: string; color: string }> = {
  eligible: {
    label: 'Eligible',
    get color() {
      return colors.onTime;
    },
  },
  not_eligible: {
    label: 'Not eligible',
    get color() {
      return colors.absent;
    },
  },
  needs_review: {
    label: 'Needs review',
    get color() {
      return colors.late;
    },
  },
};
