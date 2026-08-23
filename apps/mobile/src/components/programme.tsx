/**
 * Pieces shared by the programme screens — journey, workouts, PT and classes.
 *
 * These live apart from `src/design` because they carry product meaning, not
 * just styling: a split badge always uses the same colour for Push, a trend
 * that has no comparison always renders as "—" rather than a flat zero.
 *
 * Everything here is *built on* the design system rather than beside it. When
 * something in this file stops carrying product meaning and becomes pure
 * layout, it belongs in `src/design` instead — `DayCounter`, `AlertRow`,
 * `SectionHeader`, `MetricRow` and `InfoCard` all made that journey and now
 * live there as `JourneyBar`, `AlertCard`, `Section`, `MetricRow` and `Card`.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import type { SessionState, TrendPoint, WorkoutCategory, WorkoutSplit } from '../api/types';
import { Badge, Eyebrow, Row, Text, color, radii, space } from '../design';

/* --------------------------------------------------------------- splits */

// `color` is a getter on every entry, not a plain field: this object is
// built once at module scope, and a plain field would freeze whatever
// `color.status.X` resolved to at that instant — the same reason
// `toneColor` in `src/design/tokens` is getter-based.
export const splitMeta: Record<
  WorkoutSplit,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  push: {
    label: 'Push',
    icon: 'arrow-up-circle-outline',
    get color() {
      return color.status.warning;
    },
  },
  pull: {
    label: 'Pull',
    icon: 'arrow-down-circle-outline',
    get color() {
      return color.status.info;
    },
  },
  legs: {
    label: 'Legs',
    icon: 'walk-outline',
    get color() {
      return color.status.notable;
    },
  },
  cardio: {
    label: 'Cardio',
    icon: 'heart-outline',
    get color() {
      return color.status.positive;
    },
  },
  assessment: {
    label: 'Assessment',
    icon: 'clipboard-outline',
    get color() {
      return color.brand;
    },
  },
  rest: {
    label: 'Rest',
    icon: 'moon-outline',
    get color() {
      return color.status.neutral;
    },
  },
};

export const sessionMeta: Record<SessionState, { label: string; color: string }> = {
  scheduled: {
    label: 'Upcoming',
    get color() {
      return color.status.neutral;
    },
  },
  in_progress: {
    label: 'In progress',
    get color() {
      return color.status.info;
    },
  },
  completed: {
    label: 'Completed',
    get color() {
      return color.status.positive;
    },
  },
  cancelled: {
    label: 'Cancelled',
    get color() {
      return color.textTertiary;
    },
  },
  missed: {
    label: 'Missed',
    get color() {
      return color.status.caution;
    },
  },
  no_show: {
    label: 'No-show',
    get color() {
      return color.status.critical;
    },
  },
};

export function SplitBadge({ split, filled = false }: { split: WorkoutSplit; filled?: boolean }) {
  const meta = splitMeta[split] ?? splitMeta.rest;
  return <Badge label={meta.label} colorOverride={meta.color} solid={filled} />;
}

/* ------------------------------------------------------ workout categories */

// The muscle-focus vocabulary the templates/member-program system uses
// instead of `WorkoutSplit` — see `WorkoutCategory` in `api/types`. `custom`
// is the fallback for a trainer's own day name that doesn't fit any of the
// others, so it gets a neutral icon rather than implying a muscle group that
// was never chosen.
export const categoryMeta: Record<
  WorkoutCategory,
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  push: {
    label: 'Push',
    icon: 'arrow-up-circle-outline',
    get color() {
      return color.status.warning;
    },
  },
  pull: {
    label: 'Pull',
    icon: 'arrow-down-circle-outline',
    get color() {
      return color.status.info;
    },
  },
  legs: {
    label: 'Legs',
    icon: 'walk-outline',
    get color() {
      return color.status.notable;
    },
  },
  upper: {
    label: 'Upper Body',
    icon: 'body-outline',
    get color() {
      return color.status.warning;
    },
  },
  lower: {
    label: 'Lower Body',
    icon: 'walk-outline',
    get color() {
      return color.status.notable;
    },
  },
  full_body: {
    label: 'Full Body',
    icon: 'fitness-outline',
    get color() {
      return color.brand;
    },
  },
  core: {
    label: 'Core',
    icon: 'ellipse-outline',
    get color() {
      return color.status.info;
    },
  },
  conditioning: {
    label: 'Conditioning',
    icon: 'heart-outline',
    get color() {
      return color.status.positive;
    },
  },
  mobility: {
    label: 'Mobility',
    icon: 'body-outline',
    get color() {
      return color.status.neutral;
    },
  },
  custom: {
    label: 'Custom',
    icon: 'construct-outline',
    get color() {
      return color.textTertiary;
    },
  },
};

export function CategoryBadge({
  category,
  filled = false,
}: {
  category: WorkoutCategory;
  filled?: boolean;
}) {
  const meta = categoryMeta[category] ?? categoryMeta.custom;
  return <Badge label={meta.label} colorOverride={meta.color} solid={filled} />;
}

/* ------------------------------------------------------ workout artwork */

/**
 * Only four categories have a dedicated illustration. Every other category —
 * `upper`, `lower`, `core`, `conditioning`, `mobility`, `custom`, and a day
 * with no category match at all — falls back to the Full Body piece rather
 * than showing nothing. This is presentation only: it reads `category` but
 * never writes it, so it can never influence how a day is structured.
 */
const WORKOUT_ARTWORK: Partial<Record<WorkoutCategory, ImageSourcePropType>> = {
  push: require('../../assets/workouts/push.webp'),
  pull: require('../../assets/workouts/pull.webp'),
  legs: require('../../assets/workouts/legs.webp'),
  full_body: require('../../assets/workouts/full-body.webp'),
};
const FALLBACK_WORKOUT_ARTWORK = WORKOUT_ARTWORK.full_body as ImageSourcePropType;

export function workoutArtworkSource(
  category: WorkoutCategory | null | undefined,
): ImageSourcePropType {
  return (category && WORKOUT_ARTWORK[category]) || FALLBACK_WORKOUT_ARTWORK;
}

/**
 * A moderate-sized artwork header for a workout-day card — never a full-screen
 * banner. The aspect ratio lives on the outer `View`, not the `Image`: our
 * source assets carry no `@2x`/`@3x` density suffix, so React Native reads
 * their raw pixel size (1200×~676) as their layout size at scale 1 and an
 * `Image` given only `width: '100%'` sizes itself from that intrinsic size
 * instead — hundreds of points too large, overflowing the card. A `View`
 * has no intrinsic size to fall back to, so pinning the ratio there and
 * stretching the `Image` to fill it with explicit `width`/`height: '100%'`
 * keeps the rendered size to exactly the frame regardless of asset metadata.
 */
export function WorkoutArtwork({
  category,
  testID,
}: {
  category: WorkoutCategory | null | undefined;
  testID?: string;
}) {
  return (
    <View style={artworkStyles.frame}>
      <Image
        source={workoutArtworkSource(category)}
        style={artworkStyles.image}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        testID={testID}
      />
    </View>
  );
}

const artworkStyles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radii.md,
    backgroundColor: color.surfaceOverlay,
    marginBottom: space.sm,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

/* ------------------------------------------------------------- journey */

/**
 * A metric beside its change.
 *
 * When the API says there is no comparison window, this shows a dash. It never
 * renders a 0% delta, because "unchanged" and "we have no idea" are different
 * statements and only one of them is true.
 */
export function TrendStat({
  label,
  point,
  suffix = '%',
  invert = false,
}: {
  label: string;
  point: TrendPoint;
  suffix?: string;
  invert?: boolean;
}) {
  const delta = point.delta ?? 0;
  const improved = invert ? delta < 0 : delta > 0;
  const flat = !point.has_comparison || delta === 0;
  const deltaColor = improved ? color.status.positive : color.status.critical;

  return (
    <View style={styles.trend}>
      <Eyebrow>{label}</Eyebrow>
      <Row gap="sm" align="baseline">
        <Text variant="heading">
          {Number.isInteger(point.value) ? point.value : point.value.toFixed(1)}
          {suffix}
        </Text>
        {flat ? (
          <Text variant="label" tone={color.textTertiary}>
            {point.has_comparison ? 'no change' : '—'}
          </Text>
        ) : (
          <Row gap="xxs">
            <Ionicons name={delta > 0 ? 'caret-up' : 'caret-down'} size={12} color={deltaColor} />
            <Text variant="label" tone={deltaColor}>
              {Math.abs(delta).toFixed(1)}
              {suffix}
            </Text>
          </Row>
        )}
      </Row>
    </View>
  );
}

/* ---------------------------------------------------------------- chart */

/** A simple weekly bar chart. No library, no axes it cannot justify. */
export function BarChart({
  data,
  tint = color.brand,
  height = 90,
}: {
  data: { label: string; value: number }[];
  tint?: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={[styles.chart, { height }]}>
      {data.map((point, index) => (
        <View key={`${point.label}-${index}`} style={styles.chartColumn}>
          <View style={styles.chartTrack}>
            <View
              style={[
                styles.chartBar,
                {
                  height: `${Math.max(point.value ? 6 : 0, (point.value / max) * 100)}%`,
                  backgroundColor: point.value ? tint : color.surfaceOverlay,
                },
              ]}
            />
          </View>
          <Text variant="caption" tone={color.textTertiary} style={styles.chartLabel}>
            {point.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  trend: { flex: 1, minWidth: 120, gap: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs + 2 },
  chartColumn: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  chartTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', borderRadius: 3, minHeight: 2 },
  chartLabel: { fontSize: 9, letterSpacing: 0 },
});
