/**
 * The parts of workout execution that carry a rule rather than a layout.
 *
 * These live here rather than inside the exercise screen because each one
 * encodes something that would otherwise be re-decided, and re-decided
 * differently, the next time a screen needs it: what a load reads like when it
 * is zero, what "no history" is allowed to look like, and how a countdown
 * survives the phone going to sleep.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { WorkoutSet, WorkoutSetHistory } from '../api/types';
import { Badge, Button, Eyebrow, Row, Spacer, Stack, Text, color, radii, space } from '../design';
import { dayLabel } from '../utils/format';

/* ------------------------------------------------------------ formatting */

/**
 * A load, as a lifter would say it.
 *
 * Zero is "Bodyweight", not "0 kg". The column stores 0 for a pull-up because
 * that is the honest number, but reading it back as a weight would make the
 * app look like it lost the value.
 */
export function loadLabel(weightKg: number): string {
  if (weightKg <= 0) return 'Bodyweight';
  // 60 rather than 60.0, but 62.5 keeps its half.
  return `${Number.isInteger(weightKg) ? weightKg : weightKg.toFixed(1)} kg`;
}

/** `60 × 8` — the compact form used wherever sets are listed side by side. */
export function setLabel(entry: Pick<WorkoutSet, 'weight_kg' | 'reps'>): string {
  const load = entry.weight_kg <= 0 ? 'BW' : `${entry.weight_kg}`;
  return `${load} × ${entry.reps}`;
}

/** Total kilograms moved. Bodyweight sets contribute nothing measurable. */
export function volume(sets: WorkoutSet[]): number {
  return sets.reduce((sum, entry) => sum + entry.weight_kg * entry.reps, 0);
}

/* --------------------------------------------------------- previous work */

/**
 * What the member did last time, or an honest statement that they have not.
 *
 * `history` being null is a real answer from the server, so it is rendered as
 * one. An empty row here would read as a failed load, and a member who cannot
 * tell "first session" from "something broke" stops trusting the number the
 * next time it does appear.
 */
export function PreviousPerformance({ history }: { history: WorkoutSetHistory | null }) {
  if (!history || history.sets.length === 0) {
    return (
      <Stack gap="xxs" style={styles.previous}>
        <Eyebrow>Last time</Eyebrow>
        <Text variant="body" tone={color.textTertiary}>
          First time logging this lift — today sets the baseline.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xs" style={styles.previous}>
      <Row gap="sm">
        <Eyebrow>Last time</Eyebrow>
        <Spacer />
        <Text variant="label" tone={color.textTertiary}>
          {dayLabel(history.session_date)}
        </Text>
      </Row>
      <Row gap="sm" style={styles.previousSets}>
        {history.sets.map((entry) => (
          <Text key={entry.id} variant="mono" tone={color.textSecondary}>
            {setLabel(entry)}
          </Text>
        ))}
      </Row>
    </Stack>
  );
}

/* ----------------------------------------------------------------- a set */

export interface SetRowProps {
  entry: WorkoutSet;
  /** Highlights the row currently loaded into the entry fields. */
  editing?: boolean;
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * One logged set.
 *
 * The whole row is the edit target and delete is a separate control, because
 * the two actions have very different costs and a member is doing this
 * one-handed between sets with their hands shaking.
 */
export function SetRow({
  entry,
  editing = false,
  disabled = false,
  onEdit,
  onDelete,
}: SetRowProps) {
  return (
    <Row gap="md" style={[styles.setRow, editing ? styles.setRowEditing : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Set ${entry.set_number}, ${loadLabel(entry.weight_kg)} for ${entry.reps} reps${
          entry.rpe ? `, RPE ${entry.rpe}` : ''
        }. Edit.`}
        accessibilityState={{ disabled, selected: editing }}
        disabled={disabled}
        onPress={onEdit}
        style={styles.setPress}
      >
        <Text variant="mono" tone={color.textTertiary} style={styles.setNumber}>
          {entry.set_number}
        </Text>
        <Text variant="heading">{loadLabel(entry.weight_kg)}</Text>
        <Text variant="body" tone={color.textSecondary}>
          × {entry.reps}
        </Text>
        <Spacer />
        {entry.rpe ? <Badge label={`RPE ${entry.rpe}`} tone="neutral" /> : null}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete set ${entry.set_number}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onDelete}
        hitSlop={space.md}
        style={styles.setDelete}
      >
        <Ionicons name="close" size={18} color={color.textTertiary} />
      </Pressable>
    </Row>
  );
}

/* ----------------------------------------------------------- rest timer */

export interface RestTimer {
  /** Seconds left, or null when no rest is running. */
  remaining: number | null;
  start: (seconds: number) => void;
  extend: (seconds: number) => void;
  stop: () => void;
}

/**
 * A countdown that measures elapsed time rather than counting its own ticks.
 *
 * The naive version decrements a number on an interval, which drifts, and
 * stops entirely when the phone sleeps or the JS thread stalls — so a member
 * who pockets their phone for ninety seconds comes back to a timer that says
 * it still has a minute to run. Holding a deadline and subtracting `Date.now()`
 * makes the interval a repaint rather than the source of truth, so the value
 * is correct the instant the screen comes back regardless of what happened in
 * between.
 */
export function useRestTimer(): RestTimer {
  const [deadline, setDeadline] = useState<number | null>(null);
  // The tick's *value* is what re-derives `remaining`. A stable setter in the
  // dependency list would look like a repaint and never actually recompute.
  const [tick, setTick] = useState(0);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (deadline === null) return;
    interval.current = setInterval(() => setTick((n) => n + 1), 250);
    return () => {
      if (interval.current) clearInterval(interval.current);
      interval.current = null;
    };
  }, [deadline]);

  const remaining = useMemo(() => {
    if (deadline === null) return null;
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    // `tick` is the repaint signal; the value itself comes from the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, tick]);

  // Stop repainting at zero. The bar stays on screen until it is dismissed.
  useEffect(() => {
    if (remaining === 0 && interval.current) {
      clearInterval(interval.current);
      interval.current = null;
    }
  }, [remaining]);

  return {
    remaining,
    start: useCallback((seconds: number) => setDeadline(Date.now() + seconds * 1000), []),
    extend: useCallback(
      (seconds: number) =>
        setDeadline((current) => Math.max(current ?? Date.now(), Date.now()) + seconds * 1000),
      [],
    ),
    stop: useCallback(() => setDeadline(null), []),
  };
}

export function clockLabel(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * The rest bar.
 *
 * It never blocks the screen. A member who wants to start the next set early
 * should be able to, and a countdown that has to be dismissed before the app
 * responds again is a timer that gets in the way of the workout it is timing.
 */
export function RestBar({ timer, onDone }: { timer: RestTimer; onDone?: () => void }) {
  const { remaining } = timer;
  if (remaining === null) return null;

  const finished = remaining === 0;
  return (
    <Row gap="md" style={[styles.rest, finished ? styles.restDone : null]}>
      <Ionicons
        name={finished ? 'checkmark-circle' : 'timer-outline'}
        size={22}
        color={finished ? color.status.positive : color.brand}
      />
      <Stack gap="xxs">
        <Eyebrow tone={finished ? color.status.positive : color.brand}>
          {finished ? 'Rest over' : 'Resting'}
        </Eyebrow>
        <Text variant="metric" tone={finished ? color.text : color.text} style={styles.restClock}>
          {clockLabel(remaining)}
        </Text>
      </Stack>
      <Spacer />
      {!finished ? (
        <Button title="+30s" variant="ghost" size="sm" onPress={() => timer.extend(30)} />
      ) : null}
      <Button
        title={finished ? 'Done' : 'Skip'}
        variant="secondary"
        size="sm"
        onPress={() => {
          timer.stop();
          onDone?.();
        }}
      />
    </Row>
  );
}

const styles = StyleSheet.create({
  previous: {
    paddingVertical: space.sm,
  },
  previousSets: { flexWrap: 'wrap' },
  setRow: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingRight: space.sm,
    minHeight: 56,
  },
  setRowEditing: { borderColor: color.brand, backgroundColor: color.surfaceOverlay },
  setPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingLeft: space.md,
    minHeight: 56,
  },
  setNumber: { minWidth: 16 },
  setDelete: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rest: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: color.brand,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  restDone: { borderColor: color.status.positive },
  restClock: { fontSize: 26, lineHeight: 30 },
});
