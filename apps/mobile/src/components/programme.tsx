/**
 * Pieces shared by the programme screens — journey, workouts, PT and classes.
 *
 * These live apart from `ui.tsx` because they carry product meaning, not just
 * styling: a split badge always uses the same colour for Push, a trend that
 * has no comparison always renders as "—" rather than a flat zero.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import type { AlertSeverity, SessionState, TrendPoint, WorkoutSplit } from '../api/types';
import { Badge, Card, Eyebrow, Meter, Row, Txt } from './ui';

/* --------------------------------------------------------------- splits */

export const splitMeta: Record<WorkoutSplit, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  push: { label: 'Push', color: '#F97316', icon: 'arrow-up-circle-outline' },
  pull: { label: 'Pull', color: '#3B82F6', icon: 'arrow-down-circle-outline' },
  legs: { label: 'Legs', color: '#A855F7', icon: 'walk-outline' },
  cardio: { label: 'Cardio', color: '#22C55E', icon: 'heart-outline' },
  assessment: { label: 'Assessment', color: colors.brand, icon: 'clipboard-outline' },
  rest: { label: 'Rest', color: colors.scheduled, icon: 'moon-outline' },
};

export const sessionMeta: Record<SessionState, { label: string; color: string }> = {
  scheduled: { label: 'Upcoming', color: colors.scheduled },
  in_progress: { label: 'In progress', color: colors.info },
  completed: { label: 'Completed', color: colors.onTime },
  cancelled: { label: 'Cancelled', color: colors.textFaint },
  missed: { label: 'Missed', color: colors.late },
  no_show: { label: 'No-show', color: colors.absent },
};

export const severityColor: Record<AlertSeverity, string> = {
  info: colors.info,
  warning: colors.late,
  critical: colors.absent,
};

export function SplitBadge({ split, filled = false }: { split: WorkoutSplit; filled?: boolean }) {
  const meta = splitMeta[split] ?? splitMeta.rest;
  return <Badge label={meta.label} color={meta.color} filled={filled} />;
}

/* ------------------------------------------------------------- journey */

/** "DAY 12 / 45" with the phase underneath and a progress meter. */
export function DayCounter({
  currentDay,
  totalDays,
  phase,
  split,
}: {
  currentDay: number;
  totalDays: number;
  phase: string;
  split?: WorkoutSplit;
}) {
  const pct = totalDays ? (currentDay / totalDays) * 100 : 0;
  const phaseLabel =
    phase === 'assessment'
      ? 'Assessment & cardio'
      : phase === 'training'
        ? 'Training'
        : phase === 'complete'
          ? 'Complete'
          : 'Not started yet';

  return (
    <View style={styles.dayCounter}>
      <Row style={styles.dayRow}>
        <Txt variant="display" style={styles.dayNumber}>
          {currentDay}
        </Txt>
        <Txt variant="heading" color={colors.textFaint} style={styles.dayTotal}>
          / {totalDays}
        </Txt>
        <View style={styles.grow} />
        {split ? <SplitBadge split={split} /> : null}
      </Row>
      <Meter value={pct} color={colors.brand} />
      <Txt variant="label" color={colors.textMuted}>
        {phaseLabel}
      </Txt>
    </View>
  );
}

/* ---------------------------------------------------------------- trends */

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

  return (
    <View style={styles.trend}>
      <Eyebrow>{label}</Eyebrow>
      <Row style={styles.trendRow}>
        <Txt variant="heading">
          {Number.isInteger(point.value) ? point.value : point.value.toFixed(1)}
          {suffix}
        </Txt>
        {flat ? (
          <Txt variant="label" color={colors.textFaint}>
            {point.has_comparison ? 'no change' : '—'}
          </Txt>
        ) : (
          <Row style={styles.deltaRow}>
            <Ionicons
              name={delta > 0 ? 'caret-up' : 'caret-down'}
              size={12}
              color={improved ? colors.onTime : colors.absent}
            />
            <Txt variant="label" color={improved ? colors.onTime : colors.absent}>
              {Math.abs(delta).toFixed(1)}
              {suffix}
            </Txt>
          </Row>
        )}
      </Row>
    </View>
  );
}

/* ---------------------------------------------------------------- alerts */

/** One row of NEEDS ATTENTION. Tapping it opens whatever it is about. */
export function AlertRow({
  title,
  body,
  severity,
  onPress,
  actionable = true,
}: {
  title: string;
  body: string;
  severity: AlertSeverity;
  onPress?: () => void;
  actionable?: boolean;
}) {
  const tint = severityColor[severity] ?? colors.info;
  const content = (
    <>
      <View style={[styles.alertBar, { backgroundColor: tint }]} />
      <View style={styles.alertText}>
        <Txt variant="body" numberOfLines={2}>
          {title}
        </Txt>
        <Txt variant="label" color={colors.textMuted} numberOfLines={3}>
          {body}
        </Txt>
      </View>
      {actionable && onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPress={onPress}
        style={({ pressed }) => [styles.alert, pressed && styles.alertPressed]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={styles.alert}>{content}</View>;
}

/* --------------------------------------------------------------- sections */

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <Row style={styles.sectionHeader}>
      <Eyebrow>{title}</Eyebrow>
      <View style={styles.grow} />
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Txt variant="label" color={colors.brandSoft}>
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </Row>
  );
}

/**
 * A labelled note for seeded data.
 *
 * Demo rows must never be mistaken for a real SLAM employee or customer, so
 * anything the seeder produced says so on screen.
 */
export function DemoTag() {
  return <Badge label="Demo" color={colors.textFaint} />;
}

/** A simple weekly bar chart. No library, no axes it cannot justify. */
export function BarChart({
  data,
  color = colors.brand,
  height = 90,
}: {
  data: { label: string; value: number }[];
  color?: string;
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
                  backgroundColor: point.value ? color : colors.raised,
                },
              ]}
            />
          </View>
          <Txt variant="caption" color={colors.textFaint} style={styles.chartLabel}>
            {point.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** A single labelled metric with an optional meter, used across dashboards. */
export function MetricRow({
  label,
  value,
  meter,
  color = colors.text,
}: {
  label: string;
  value: string;
  meter?: number;
  color?: string;
}) {
  return (
    <View style={styles.metric}>
      <Row style={styles.metricRow}>
        <Txt variant="label" color={colors.textMuted}>
          {label}
        </Txt>
        <Txt variant="mono" color={color}>
          {value}
        </Txt>
      </Row>
      {meter !== undefined ? <Meter value={meter} color={color} /> : null}
    </View>
  );
}

export function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <Eyebrow>{title}</Eyebrow>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  dayCounter: { gap: spacing.sm },
  dayRow: { gap: spacing.sm, alignItems: 'flex-end' },
  dayNumber: { lineHeight: 44 },
  dayTotal: { marginBottom: 6 },
  trend: { flex: 1, minWidth: 120, gap: 2 },
  trendRow: { gap: spacing.sm, alignItems: 'baseline' },
  deltaRow: { gap: 2, alignItems: 'center' },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 64,
  },
  alertPressed: { backgroundColor: colors.raised, borderColor: colors.borderStrong },
  alertBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  alertText: { flex: 1, gap: 2 },
  sectionHeader: { paddingTop: spacing.sm },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  chartColumn: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  chartTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', borderRadius: 3, minHeight: 2 },
  chartLabel: { fontSize: 9, letterSpacing: 0 },
  metric: { gap: 4 },
  metricRow: { justifyContent: 'space-between' },
});
