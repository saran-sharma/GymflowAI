/**
 * SLAM's design language, carried over from the web demo.
 *
 * Matte black surfaces with a faint red bias, one premium red accent, and
 * white/grey text. The neutrals are not pure grey on purpose — the ground and
 * the accent read as one family rather than "grey plus red".
 */

export const colors = {
  // Surfaces, darkest to lightest.
  bg: '#08080A',
  surface: '#0E0E11',
  card: '#141417',
  raised: '#1B1B1F',
  input: '#232329',
  border: '#2C2C33',
  borderStrong: '#3A3A42',

  // The SLAM red.
  brand: '#EF2B3C',
  brandSoft: '#FF5B68',
  brandDeep: '#C8102E',

  // Text.
  text: '#FFFFFF',
  textMuted: '#A1A1AA',
  textFaint: '#71717A',
  textInverse: '#08080A',

  // Status. These map one-to-one onto attendance statuses so a colour never
  // means two different things across screens.
  onTime: '#22C55E',
  late: '#F59E0B',
  absent: '#EF4444',
  earlyExit: '#F97316',
  missing: '#A855F7',
  scheduled: '#64748B',
  info: '#3B82F6',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  // Display sizes are tight and slightly negative-tracked, which is what makes
  // the numbers on the dashboard read as a product rather than a spreadsheet.
  display: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1.4 },
  title: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.8 },
  heading: { fontSize: 19, fontWeight: '700' as const, letterSpacing: -0.4 },
  body: { fontSize: 15, fontWeight: '500' as const, letterSpacing: -0.1 },
  label: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.2 },
  caption: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.1 },
  mono: { fontSize: 15, fontWeight: '700' as const, letterSpacing: 0.5 },
} as const;

/** Minimum tap target. Trainers use this on a gym floor, often mid-set. */
export const HIT_TARGET = 48;

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
