/**
 * The pieces the Member journey is assembled from.
 *
 * Two ideas drive everything here. First, a member opening the app is asking
 * one question — "what am I doing today?" — so `TodayCard` is the only element
 * on home that carries a filled button. Second, a session is never just a
 * session: an own workout, a PT session and a group class are different
 * commitments, and `KindTag` marks which one every time any of them appears.
 *
 * These live apart from `src/components/ui.tsx` deliberately. That module is
 * shared with the Trainer and Owner apps and is not this task's to change.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Badge,
  Card,
  Eyebrow,
  LinkButton,
  ProgressBar,
  ProgressRing,
  Row,
  Spacer,
  Stack,
  Text,
  alpha,
  color,
  font,
  hairline,
  radii,
  space,
  useThemedStyles,
  type Tone,
} from '../design';
import type {
  BodyComposition,
  BodyCompositionHistory,
  Feeling,
  JourneyDay,
  StrengthTrend,
  WorkoutSplit,
} from '../api/types';
import { addDays, parseISODate, toISODate, weekBounds, weekdayInitial } from '../utils/calendar';
import { BarChart, splitMeta } from './programme';

type IconName = keyof typeof Ionicons.glyphMap;

/* ------------------------------------------------------------- session kind */

/**
 * The four things a member's day can be.
 *
 * `rest` is one of them on purpose — a rest day is a prescription, not an
 * absence, and a member who sees "Rest & recovery" stops worrying that the app
 * failed to load their workout.
 */
export type SessionKind = 'own_workout' | 'pt_session' | 'group_class' | 'rest';

// `hue` is a getter on every entry, not a plain field: this object is built
// once at module scope, and a plain field would freeze whatever `color.X`
// resolved to at that instant — the same reason `toneColor` in
// `src/design/tokens` is getter-based. Read inline in a render (as every
// usage is), a getter always reflects the current theme.
export const kindMeta: Record<
  SessionKind,
  { label: string; tone: Tone; icon: IconName; hue: string }
> = {
  own_workout: {
    label: 'Own workout',
    tone: 'brand',
    icon: 'barbell',
    get hue() {
      return color.brand;
    },
  },
  pt_session: {
    label: 'PT session',
    tone: 'positive',
    icon: 'person',
    get hue() {
      return color.status.positive;
    },
  },
  group_class: {
    label: 'Group class',
    tone: 'info',
    icon: 'people',
    get hue() {
      return color.status.notable;
    },
  },
  rest: {
    label: 'Rest & recovery',
    tone: 'neutral',
    icon: 'moon',
    get hue() {
      return color.status.neutral;
    },
  },
};

/**
 * The marker that tells own-work from coached work.
 *
 * Subtle by design: same shape, same size, different hue and glyph. Two
 * genuinely different card designs would make a mixed list unreadable.
 */
export function KindTag({ kind, solid = false }: { kind: SessionKind; solid?: boolean }) {
  const styles = useThemedStyles(buildMemberStyles);
  const meta = kindMeta[kind];
  return (
    <View
      style={[
        styles.kindTag,
        {
          backgroundColor: solid ? meta.hue : alpha(meta.hue, 0.12),
          borderColor: solid ? meta.hue : alpha(meta.hue, 0.35),
        },
      ]}
    >
      <Ionicons name={meta.icon} size={11} color={solid ? color.textInverse : meta.hue} />
      <Text variant="caption" caps tone={solid ? color.textInverse : meta.hue} numberOfLines={1}>
        {meta.label}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------- today's card */

export interface TodayCardProps {
  kind: SessionKind;
  /** What the session is: "Push — Chest & Shoulders", "Coach Vikas". */
  title: string;
  /** The line under it: session count, exercise count, time. */
  subtitle?: string;
  /** Progress through the session, 0–100. Omitted when nothing has started. */
  percent?: number;
  /**
   * Draws the progress as a ring beside the title instead of a bar under it,
   * with this text inside. Use it when the progress has a natural fraction —
   * "4/9" reads as a position in a session in a way that a bar cannot.
   */
  ringLabel?: string;
  /** Right-hand status word, when the session has one. */
  status?: string;
  statusTone?: Tone;
  cta: string;
  onPress: () => void;
  /**
   * A quieter second route out of the card, under the CTA.
   *
   * Exists because one card can have two honest destinations — "carry on with
   * the next exercise" and "show me the whole chart" — and the alternative is
   * a second card competing with the first for the same glance.
   */
  secondary?: { label: string; onPress: () => void };
  disabled?: boolean;
  testID?: string;
}

/**
 * The answer to "what should I do today", and the only filled button on home.
 *
 * The kind sits above the title rather than beside it so the member reads
 * *what kind of session* before *which session* — that ordering is what makes
 * a PT day feel different from a solo day at a glance.
 */
export function TodayCard({
  kind,
  title,
  subtitle,
  percent,
  ringLabel,
  status,
  statusTone = 'neutral',
  cta,
  onPress,
  secondary,
  disabled = false,
  testID,
}: TodayCardProps) {
  const styles = useThemedStyles(buildMemberStyles);
  const meta = kindMeta[kind];
  return (
    <View style={styles.today} testID={testID}>
      <View style={[styles.todayRule, { backgroundColor: meta.hue }]} />
      <Stack gap="md" style={styles.grow}>
        <Row gap="sm">
          <KindTag kind={kind} />
          <Spacer />
          {status ? <Badge label={status} tone={statusTone} /> : null}
        </Row>

        <Row gap="lg" align="center">
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="title">{title}</Text>
            {subtitle ? (
              <Text variant="body" tone={color.textSecondary}>
                {subtitle}
              </Text>
            ) : null}
          </Stack>

          {percent !== undefined && ringLabel ? (
            <ProgressRing
              value={percent}
              label={ringLabel}
              caption={meta.label}
              colorOverride={meta.hue}
              accessibilityLabel={`${title}: ${ringLabel}`}
            />
          ) : null}
        </Row>

        {percent !== undefined && !ringLabel ? (
          <ProgressBar value={percent} colorOverride={meta.hue} />
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cta}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: meta.hue,
              opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
            },
          ]}
        >
          <Text
            variant="body"
            tone={kind === 'rest' ? color.text : color.textInverse}
            style={styles.ctaLabel}
          >
            {cta}
          </Text>
        </Pressable>

        {secondary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
            onPress={secondary.onPress}
            hitSlop={space.sm}
            style={styles.secondary}
          >
            <Text variant="label" tone={color.textSecondary}>
              {secondary.label}
            </Text>
          </Pressable>
        ) : null}
      </Stack>
    </View>
  );
}

/* ------------------------------------------------------------- this week */

/**
 * The member's training week: Push, Pull, Legs and the rest days between them.
 *
 * This replaces the 45-day counter on every member-facing surface. The 45 days
 * are a real business rule — they decide when a trainer is asked to review
 * somebody for PT — but they are *the gym's* rule, not the member's goal. A
 * member who sees "Day 31 of 45" reads a deadline they were never told about
 * and cannot act on; a member who sees this week's splits knows what to do
 * today and what is coming.
 *
 * The days come from the journey the server already computes, so nothing here
 * is invented: it is the same plan, framed as a week instead of a countdown.
 */
export interface WeekStripProps {
  days: JourneyDay[];
  /** ISO date of today, so the current column can be marked. */
  today: string;
  onPress?: () => void;
}

export function WeekStrip({ days, today, onPress }: WeekStripProps) {
  const styles = useThemedStyles(buildMemberStyles);
  const week = weekAround(days, today);
  if (week.length === 0) return null;

  const inner = (
    <Stack gap="sm">
      <Row gap="sm">
        <Eyebrow>This week</Eyebrow>
        <Spacer />
        <Text variant="label" tone={color.textTertiary}>
          {week.filter((d) => d.status === 'completed').length} done
        </Text>
      </Row>

      <Row gap="xs">
        {week.map((day) => {
          const meta = splitMeta[day.split] ?? splitMeta.rest;
          const isToday = day.planned_on === today;
          const done = day.status === 'completed';
          return (
            <Stack key={day.planned_on} gap="xxs" align="center" style={styles.weekDay}>
              <Text variant="caption" caps tone={isToday ? color.text : color.textTertiary}>
                {weekdayInitial(day.planned_on)}
              </Text>
              <View
                style={[
                  styles.weekPip,
                  {
                    backgroundColor: done ? meta.color : 'transparent',
                    borderColor: isToday ? color.text : meta.color,
                    borderWidth: isToday ? 2 : 1,
                  },
                ]}
              />
              <Text
                variant="caption"
                tone={isToday ? color.text : color.textTertiary}
                numberOfLines={1}
              >
                {meta.label === 'Rest' ? '—' : meta.label}
              </Text>
            </Stack>
          );
        })}
      </Row>
    </Stack>
  );

  if (!onPress) return <Card>{inner}</Card>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="See your training week"
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.cardPressed : null]}
    >
      <Card>{inner}</Card>
    </Pressable>
  );
}

/**
 * Today, as the member's branch reckons it — the same calendar date the
 * server derived, not the device clock.
 *
 * `start_date + (current_day - 1)`, done as pure calendar arithmetic
 * (`addDays`). It must NOT round a device-local `Date` through
 * `.toISOString()`: on a phone east of UTC (Asia/Kolkata, +5:30) that moved
 * "today" a day early and the week strip highlighted the wrong split.
 */
export function journeyToday(journey: { start_date: string; current_day: number }): string {
  const parsed = parseISODate(journey.start_date);
  if (!parsed) return toISODate(new Date());
  return addDays(journey.start_date, Math.max(0, journey.current_day - 1));
}

/** The days the server sent that fall in the Monday–Sunday week of `today`. */
export function weekAround(days: JourneyDay[], today: string): JourneyDay[] {
  const bounds = weekBounds(today);
  if (!bounds) return [];
  return days
    .filter((day) => day.planned_on >= bounds.monday && day.planned_on <= bounds.sunday)
    .sort((a, b) => a.planned_on.localeCompare(b.planned_on));
}

/* --------------------------------------------------------------- the journey */

export interface JourneyBarProps {
  currentDay: number;
  totalDays: number;
  /** "assessment" | "training" | … — shown as the phase eyebrow. */
  phase?: string;
  daysCompleted?: number;
  completionPct?: number;
  split?: WorkoutSplit;
  onPress?: () => void;
}

/**
 * "Where am I in my 45 days?" — the member's spine through the programme.
 *
 * The day number is the display figure and the denominator is quiet, because
 * "Day 12" is what a member remembers; "of 45" is only context.
 */
export function JourneyBar({
  currentDay,
  totalDays,
  phase,
  daysCompleted,
  completionPct,
  onPress,
}: JourneyBarProps) {
  const styles = useThemedStyles(buildMemberStyles);
  const pct = completionPct ?? (totalDays ? (currentDay / totalDays) * 100 : 0);
  const remaining = Math.max(0, totalDays - currentDay);

  const inner = (
    <Stack gap="sm">
      <Row gap="sm">
        <Eyebrow>{phase === 'assessment' ? 'Assessment phase' : '45-day programme'}</Eyebrow>
        <Spacer />
        <Text variant="label" tone={color.textTertiary}>
          {Math.round(pct)}%
        </Text>
      </Row>

      <Row gap="sm" align="baseline">
        <Text variant="display">{currentDay}</Text>
        <Text variant="heading" tone={color.textTertiary}>
          / {totalDays}
        </Text>
        <Spacer />
        <Text variant="label" tone={color.textSecondary}>
          {remaining} to go
        </Text>
      </Row>

      <ProgressBar value={pct} tone="brand" />

      {daysCompleted !== undefined ? (
        <Text variant="label" tone={color.textTertiary}>
          {daysCompleted} day{daysCompleted === 1 ? '' : 's'} completed
        </Text>
      ) : null}
    </Stack>
  );

  if (!onPress) return <Card>{inner}</Card>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`45-day programme, day ${currentDay} of ${totalDays}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      {inner}
    </Pressable>
  );
}

/* ----------------------------------------------------------------- PT detail */

export interface PtLineProps {
  trainerName: string | null;
  sessionNumber: number;
  packageSize: number | null;
  /** Pre-formatted by the caller. */
  when: string;
  status?: string;
  statusTone?: Tone;
  onPress?: () => void;
}

/**
 * A PT session stated the way SLAM says it out loud:
 * "Coach Vikas · Session 5 of 12 · Today 7:00 PM".
 */
export function PtLine({
  trainerName,
  sessionNumber,
  packageSize,
  when,
  status,
  statusTone = 'neutral',
  onPress,
}: PtLineProps) {
  const styles = useThemedStyles(buildMemberStyles);
  const body = (
    <Stack gap="sm">
      <Row gap="sm">
        <KindTag kind="pt_session" />
        <Spacer />
        {status ? <Badge label={status} tone={statusTone} /> : null}
      </Row>
      <Stack gap="xxs">
        <Text variant="heading">{trainerName ?? 'Your trainer'}</Text>
        <Text variant="label" tone={color.textSecondary}>
          Session {sessionNumber}
          {packageSize ? ` of ${packageSize}` : ''} · {when}
        </Text>
      </Stack>
    </Stack>
  );

  if (!onPress) return <Card>{body}</Card>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`PT session ${sessionNumber} with ${trainerName ?? 'your trainer'}, ${when}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      {body}
    </Pressable>
  );
}

/* ------------------------------------------------------------- daily feeling */

export const FEELING_META: Record<Feeling, { emoji: string; label: string }> = {
  great: { emoji: '😊', label: 'Great' },
  good: { emoji: '🙂', label: 'Good' },
  okay: { emoji: '😐', label: 'Okay' },
  tired: { emoji: '😓', label: 'Tired' },
  low: { emoji: '😴', label: 'Low' },
};

/**
 * "How are you feeling today?" — a daily check-in, not a form.
 *
 * One tap answers it. Once answered it collapses to a single quiet line
 * rather than staying interactive, because there is nothing more honest to
 * ask a member who already told the app how their day is going — and
 * re-showing five buttons next to their own answer would read as not having
 * heard it.
 */
export function FeelingCheckIn({
  value,
  busy = false,
  onSelect,
}: {
  /** Already answered today, or null to show the picker. */
  value: Feeling | null;
  busy?: boolean;
  onSelect: (feeling: Feeling) => void;
}) {
  const styles = useThemedStyles(buildMemberStyles);
  if (value) {
    const meta = FEELING_META[value];
    return (
      <Row gap="sm">
        <Text style={styles.feelingBigEmoji}>{meta.emoji}</Text>
        <Text variant="body" tone={color.textSecondary} style={styles.grow}>
          Feeling {meta.label.toLowerCase()} today. Let’s make it count.
        </Text>
      </Row>
    );
  }

  return (
    <Stack gap="sm">
      <Text variant="label" tone={color.textSecondary}>
        How are you feeling today?
      </Text>
      <Row gap="xs">
        {(Object.keys(FEELING_META) as Feeling[]).map((feeling) => (
          <Pressable
            key={feeling}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={FEELING_META[feeling].label}
            onPress={() => onSelect(feeling)}
            style={({ pressed }) => [
              styles.feelingOption,
              pressed ? styles.feelingOptionPressed : null,
              busy ? styles.feelingOptionBusy : null,
            ]}
          >
            <Text style={styles.feelingEmoji}>{FEELING_META[feeling].emoji}</Text>
            <Text variant="caption" tone={color.textTertiary} numberOfLines={1}>
              {FEELING_META[feeling].label}
            </Text>
          </Pressable>
        ))}
      </Row>
    </Stack>
  );
}

/* -------------------------------------------------------------- honest gaps */

/**
 * Says a feature is not connected, and does not draw a fake one.
 *
 * Used where SLAM has the process but GymFlow has no data source yet — InBody,
 * diet plans, medical notes. A plausible-looking placeholder number is worse
 * than an empty panel, because a member cannot tell it is not theirs.
 */
export function NotConnected({
  title,
  detail,
  icon = 'information-circle-outline',
}: {
  title: string;
  detail: string;
  icon?: IconName;
}) {
  const styles = useThemedStyles(buildMemberStyles);
  return (
    <View style={styles.notConnected}>
      <Ionicons name={icon} size={20} color={color.textTertiary} />
      <Stack gap="xxs" style={styles.grow}>
        <Text variant="body" tone={color.textSecondary}>
          {title}
        </Text>
        <Text variant="label" tone={color.textTertiary}>
          {detail}
        </Text>
      </Stack>
    </View>
  );
}

/**
 * A compact, chart-free view of a member's strength trend — for a trainer or
 * owner glancing at one member, not the member's own richer Progress screen
 * (`app/(member)/progress.tsx`, which charts each lift). Same data
 * (`journey_service.strength_trend`), read across every role rather than
 * duplicated per screen.
 */
export function RecentStrength({ trend }: { trend: StrengthTrend }) {
  const styles = useThemedStyles(buildMemberStyles);
  if (trend.exercises.length === 0) {
    return (
      <NotConnected
        icon="trending-up-outline"
        title="No sets logged yet"
        detail="Strength trends appear here once this member logs sets on their own workouts."
      />
    );
  }
  return (
    <Stack gap="sm">
      {trend.exercises.map((exercise) => (
        <Row key={exercise.exercise} gap="sm">
          <Text variant="body" style={styles.grow}>
            {exercise.exercise}
          </Text>
          {exercise.is_recent_pr ? <Badge label="PR" tone="brand" solid /> : null}
          <Spacer />
          <Text variant="label" tone={color.textTertiary}>
            best {exercise.heaviest_kg}kg
          </Text>
        </Row>
      ))}
    </Stack>
  );
}

/** "22 Aug" — the date format the body-composition history uses, with no
 * weekday: a scan is a point on a timeline, not an appointment. */
function scanDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

/** One history row's numbers, each omitted individually when this scan does
 * not have it — never a placeholder dash standing in for a real field. */
function scanSummary(scan: BodyComposition): string {
  const parts: string[] = [];
  if (scan.weight_kg != null) parts.push(`${scan.weight_kg}kg`);
  if (scan.body_fat_pct != null) parts.push(`${scan.body_fat_pct}% BF`);
  if (scan.muscle_mass_kg != null) parts.push(`${scan.muscle_mass_kg}kg SMM`);
  return parts.join(' · ');
}

/**
 * Chronological, most-recent-first — the "22 Aug / 10 Aug / 01 Aug" list
 * both the member's own Progress screen and the trainer/owner compact card
 * expand into. Never interpolated: a gap between two real scans is just a
 * gap.
 */
export function BodyCompositionHistoryList({
  measurements,
}: {
  measurements: BodyComposition[];
}) {
  const styles = useThemedStyles(buildMemberStyles);
  const rows = [...measurements].reverse();
  return (
    <Stack gap="sm">
      {rows.map((scan) => (
        <Row key={scan.measured_at} gap="sm">
          <Text variant="label" tone={color.textTertiary} style={styles.scanDate}>
            {scanDateLabel(scan.measured_at)}
          </Text>
          <Text variant="body" style={styles.grow}>
            {scanSummary(scan) || '—'}
          </Text>
        </Row>
      ))}
    </Stack>
  );
}

const EMPTY_BODY_COMPOSITION = {
  icon: 'body-outline' as const,
  title: 'No InBody measurements yet',
};

/**
 * The member's own Body Composition — snapshot, then a trend once there is
 * more than one scan to trend, then the full history. A single measurement
 * shows the snapshot alone; charting one point would only ever be a flat
 * line pretending to be a trend. Labels stay neutral ("Weight trend", not
 * "Weight — improving") because whether a change in any of these numbers is
 * good news depends on the member's own goal, which GymFlow does not know.
 */
export function BodyCompositionSection({ history }: { history: BodyCompositionHistory }) {
  const styles = useThemedStyles(buildMemberStyles);
  if (!history.latest) {
    return (
      <NotConnected
        icon={EMPTY_BODY_COMPOSITION.icon}
        title={EMPTY_BODY_COMPOSITION.title}
        detail="Once your next scan is synced, your measurements will appear here."
      />
    );
  }
  const latest = history.latest;
  const trendable = history.measurements.length > 1;

  return (
    <Stack gap="md">
      <Row gap="lg" wrap>
        {latest.weight_kg != null ? (
          <Stack gap="xxs">
            <Text variant="label" tone={color.textTertiary}>
              Weight
            </Text>
            <Text variant="heading">{latest.weight_kg} kg</Text>
          </Stack>
        ) : null}
        {latest.muscle_mass_kg != null ? (
          <Stack gap="xxs">
            <Text variant="label" tone={color.textTertiary}>
              Skeletal muscle
            </Text>
            <Text variant="heading">{latest.muscle_mass_kg} kg</Text>
          </Stack>
        ) : null}
        {latest.body_fat_pct != null ? (
          <Stack gap="xxs">
            <Text variant="label" tone={color.textTertiary}>
              Body fat
            </Text>
            <Text variant="heading">{latest.body_fat_pct}%</Text>
          </Stack>
        ) : null}
        {latest.bmi != null ? (
          <Stack gap="xxs">
            <Text variant="label" tone={color.textTertiary}>
              BMI
            </Text>
            <Text variant="heading">{latest.bmi}</Text>
          </Stack>
        ) : null}
      </Row>
      <Text variant="label" tone={color.textTertiary}>
        Measured {scanDateLabel(latest.measured_at)}
      </Text>

      {trendable ? (
        <Stack gap="md">
          {latest.weight_kg != null ? (
            <Stack gap="xxs">
              <Eyebrow>Weight trend</Eyebrow>
              <BarChart
                data={history.measurements
                  .filter((m) => m.weight_kg != null)
                  .map((m) => ({
                    label: scanDateLabel(m.measured_at),
                    value: m.weight_kg as number,
                  }))}
                height={50}
                baseline="auto"
              />
            </Stack>
          ) : null}
          {latest.body_fat_pct != null ? (
            <Stack gap="xxs">
              <Eyebrow>Body fat trend</Eyebrow>
              <BarChart
                data={history.measurements
                  .filter((m) => m.body_fat_pct != null)
                  .map((m) => ({
                    label: scanDateLabel(m.measured_at),
                    value: m.body_fat_pct as number,
                  }))}
                tint={color.status.info}
                height={50}
                baseline="auto"
              />
            </Stack>
          ) : null}
          {latest.muscle_mass_kg != null ? (
            <Stack gap="xxs">
              <Eyebrow>Skeletal muscle trend</Eyebrow>
              <BarChart
                data={history.measurements
                  .filter((m) => m.muscle_mass_kg != null)
                  .map((m) => ({
                    label: scanDateLabel(m.measured_at),
                    value: m.muscle_mass_kg as number,
                  }))}
                tint={color.status.notable}
                height={50}
                baseline="auto"
              />
            </Stack>
          ) : null}
        </Stack>
      ) : null}

      <Stack gap="xs">
        <Eyebrow>History</Eyebrow>
        <BodyCompositionHistoryList measurements={history.measurements} />
      </Stack>
    </Stack>
  );
}

/**
 * The compact version for a trainer or owner glancing at one member — three
 * numbers and when they were taken, with the full history tucked behind
 * "View history" rather than shown by default. Same data
 * (`body_composition_service`), same empty-state honesty, less real estate.
 */
export function CompactBodyComposition({ history }: { history: BodyCompositionHistory }) {
  const [expanded, setExpanded] = useState(false);
  const styles = useThemedStyles(buildMemberStyles);

  if (!history.latest) {
    return (
      <NotConnected
        icon={EMPTY_BODY_COMPOSITION.icon}
        title={EMPTY_BODY_COMPOSITION.title}
        detail="Once this member's next scan is synced, their measurements will appear here."
      />
    );
  }
  const latest = history.latest;

  return (
    <Stack gap="sm">
      {latest.weight_kg != null ? (
        <Row gap="sm">
          <Text variant="label" tone={color.textTertiary} style={styles.grow}>
            Weight
          </Text>
          <Text variant="body">{latest.weight_kg} kg</Text>
        </Row>
      ) : null}
      {latest.muscle_mass_kg != null ? (
        <Row gap="sm">
          <Text variant="label" tone={color.textTertiary} style={styles.grow}>
            Skeletal muscle
          </Text>
          <Text variant="body">{latest.muscle_mass_kg} kg</Text>
        </Row>
      ) : null}
      {latest.body_fat_pct != null ? (
        <Row gap="sm">
          <Text variant="label" tone={color.textTertiary} style={styles.grow}>
            Body fat
          </Text>
          <Text variant="body">{latest.body_fat_pct}%</Text>
        </Row>
      ) : null}
      <Text variant="label" tone={color.textTertiary}>
        Last measured: {scanDateLabel(latest.measured_at)}
      </Text>

      {history.measurements.length > 1 ? (
        expanded ? (
          <Stack gap="sm">
            <BodyCompositionHistoryList measurements={history.measurements} />
            <LinkButton title="Hide history" onPress={() => setExpanded(false)} />
          </Stack>
        ) : (
          <LinkButton title="View history →" onPress={() => setExpanded(true)} />
        )
      ) : null}
    </Stack>
  );
}

/**
 * One shared factory rather than a module-scope `StyleSheet.create` — see
 * `src/design/cards.tsx` for the same pattern and why.
 */
function buildMemberStyles() {
  return StyleSheet.create({
    scanDate: { width: 64 },
    weekDay: { flex: 1 },
    weekPip: { width: 18, height: 18, borderRadius: 9 },
    grow: { flex: 1 },
    feelingBigEmoji: { fontSize: 22, lineHeight: 26 },
    feelingOption: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
      paddingVertical: space.sm,
      borderRadius: radii.md,
      minHeight: 56,
      justifyContent: 'center',
    },
    feelingOptionPressed: { backgroundColor: color.surfaceOverlay },
    feelingOptionBusy: { opacity: 0.5 },
    feelingEmoji: { fontSize: 22, lineHeight: 26 },
    kindTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: space.sm,
      paddingVertical: 4,
      borderRadius: radii.pill,
      borderWidth: 1,
      alignSelf: 'flex-start',
    },
    today: {
      flexDirection: 'row',
      gap: space.lg,
      backgroundColor: color.surfaceRaised,
      borderRadius: radii.lg,
      ...hairline,
      padding: space.lg,
    },
    todayRule: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
    cta: {
      height: 48,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondary: { alignSelf: 'center', paddingVertical: space.xs },
    ctaLabel: { fontFamily: font.sansSemi, letterSpacing: 0.3 },
    card: {
      backgroundColor: color.surfaceRaised,
      borderRadius: radii.lg,
      ...hairline,
      padding: space.lg,
    },
    cardPressed: { backgroundColor: color.surfaceOverlay, borderColor: color.borderStrong },
    notConnected: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.md,
      backgroundColor: color.surface,
      borderRadius: radii.md,
      ...hairline,
      padding: space.md,
    },
  });
}
