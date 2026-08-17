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
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Badge,
  Card,
  Eyebrow,
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
  type Tone,
} from '../design';
import type { JourneyDay, WorkoutSplit } from '../api/types';
import { splitMeta } from './programme';

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

export const kindMeta: Record<
  SessionKind,
  { label: string; tone: Tone; icon: IconName; hue: string }
> = {
  own_workout: { label: 'Own workout', tone: 'brand', icon: 'barbell', hue: color.brand },
  pt_session: { label: 'PT session', tone: 'positive', icon: 'person', hue: color.status.positive },
  group_class: { label: 'Group class', tone: 'info', icon: 'people', hue: color.status.notable },
  rest: { label: 'Rest & recovery', tone: 'neutral', icon: 'moon', hue: color.status.neutral },
};

/**
 * The marker that tells own-work from coached work.
 *
 * Subtle by design: same shape, same size, different hue and glyph. Two
 * genuinely different card designs would make a mixed list unreadable.
 */
export function KindTag({ kind, solid = false }: { kind: SessionKind; solid?: boolean }) {
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
 * Today, as the member's branch reckons it.
 *
 * Derived from the server's own day arithmetic — start date plus the day number
 * it computed — rather than the device clock. A phone in another timezone, or
 * one whose date is simply wrong, would otherwise highlight the wrong column.
 */
export function journeyToday(journey: { start_date: string; current_day: number }): string {
  const start = new Date(`${journey.start_date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return new Date().toISOString().slice(0, 10);
  start.setDate(start.getDate() + Math.max(0, journey.current_day - 1));
  return start.toISOString().slice(0, 10);
}

/** Monday-to-Sunday around `today`, from whatever days the server sent. */
export function weekAround(days: JourneyDay[], today: string): JourneyDay[] {
  const anchor = new Date(`${today}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return [];
  // getDay() is 0 for Sunday; the SLAM week starts on Monday.
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const from = monday.toISOString().slice(0, 10);
  const to = sunday.toISOString().slice(0, 10);
  return days
    .filter((day) => day.planned_on >= from && day.planned_on <= to)
    .sort((a, b) => a.planned_on.localeCompare(b.planned_on));
}

function weekdayInitial(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '?' : ['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()];
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

const styles = StyleSheet.create({
  weekDay: { flex: 1 },
  weekPip: { width: 18, height: 18, borderRadius: 9 },
  grow: { flex: 1 },
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
