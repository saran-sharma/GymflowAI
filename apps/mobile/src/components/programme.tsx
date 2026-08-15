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
import { StyleSheet, View } from 'react-native';

import type { SessionState, TrendPoint, WorkoutSplit } from '../api/types';
import { Badge, Eyebrow, Row, Text, color, space } from '../design';

/* --------------------------------------------------------------- splits */

export const splitMeta: Record<
  WorkoutSplit,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  push: { label: 'Push', color: color.status.warning, icon: 'arrow-up-circle-outline' },
  pull: { label: 'Pull', color: color.status.info, icon: 'arrow-down-circle-outline' },
  legs: { label: 'Legs', color: color.status.notable, icon: 'walk-outline' },
  cardio: { label: 'Cardio', color: color.status.positive, icon: 'heart-outline' },
  assessment: { label: 'Assessment', color: color.brand, icon: 'clipboard-outline' },
  rest: { label: 'Rest', color: color.status.neutral, icon: 'moon-outline' },
};

export const sessionMeta: Record<SessionState, { label: string; color: string }> = {
  scheduled: { label: 'Upcoming', color: color.status.neutral },
  in_progress: { label: 'In progress', color: color.status.info },
  completed: { label: 'Completed', color: color.status.positive },
  cancelled: { label: 'Cancelled', color: color.textTertiary },
  missed: { label: 'Missed', color: color.status.caution },
  no_show: { label: 'No-show', color: color.status.critical },
};

export function SplitBadge({ split, filled = false }: { split: WorkoutSplit; filled?: boolean }) {
  const meta = splitMeta[split] ?? splitMeta.rest;
  return <Badge label={meta.label} colorOverride={meta.color} solid={filled} />;
}

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
