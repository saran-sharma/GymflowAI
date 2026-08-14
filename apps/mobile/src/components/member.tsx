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
  Row,
  Spacer,
  Stack,
  Text,
  alpha,
  color,
  hairline,
  radii,
  space,
  type Tone,
} from '../design';
import type { WorkoutSplit } from '../api/types';

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
      <Ionicons
        name={meta.icon}
        size={11}
        color={solid ? color.textInverse : meta.hue}
      />
      <Text
        variant="caption"
        caps
        tone={solid ? color.textInverse : meta.hue}
        numberOfLines={1}
      >
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
  /** Right-hand status word, when the session has one. */
  status?: string;
  statusTone?: Tone;
  cta: string;
  onPress: () => void;
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
  status,
  statusTone = 'neutral',
  cta,
  onPress,
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

        <Stack gap="xxs">
          <Text variant="title">{title}</Text>
          {subtitle ? (
            <Text variant="body" tone={color.textSecondary}>
              {subtitle}
            </Text>
          ) : null}
        </Stack>

        {percent !== undefined ? <ProgressBar value={percent} colorOverride={meta.hue} /> : null}

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
      </Stack>
    </View>
  );
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
  ctaLabel: { fontWeight: '800', letterSpacing: 0.3 },
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
