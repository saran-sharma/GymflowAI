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

import type {
  ExerciseSession,
  PersonalRecord,
  RecordKind,
  WorkoutSet,
  WorkoutSetHistory,
} from '../api/types';
import {
  Badge,
  Button,
  Divider,
  Eyebrow,
  Row,
  Sheet,
  Spacer,
  Stack,
  Text,
  color,
  radii,
  space,
  useThemedStyles,
} from '../design';
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
 * What the member did last time, set by set.
 *
 * Listed rather than run together on one line: a member glances at this
 * between sets to answer "what did I do?", and three stacked rows are read at
 * a glance where `60 × 8 · 60 × 8 · 57.5 × 10` has to be parsed.
 *
 * An empty `sessions` list is a real answer from the server, so it is rendered
 * as one. A blank block here would read as a failed load, and a member who
 * cannot tell "first session" from "something broke" stops trusting the number
 * the next time it does appear.
 */
export function PreviousPerformance({
  history,
  onOpenHistory,
}: {
  history: WorkoutSetHistory | null;
  onOpenHistory?: () => void;
}) {
  const styles = useThemedStyles(buildStyles);
  const last = history?.sessions[0] ?? null;

  if (!last || last.sets.length === 0) {
    return (
      <Stack gap="xxs" style={styles.previous}>
        <Eyebrow>Last time</Eyebrow>
        <Text variant="body" tone={color.textTertiary}>
          First time logging this lift — today sets the baseline.
        </Text>
      </Stack>
    );
  }

  const more = (history?.sessions.length ?? 0) > 1;

  return (
    <Stack gap="xs" style={styles.previous}>
      <Row gap="sm">
        <Eyebrow>Last time</Eyebrow>
        <Spacer />
        <Text variant="label" tone={color.textTertiary}>
          {dayLabel(last.session_date)}
        </Text>
      </Row>

      <Stack gap="xxs">
        {last.sets.map((entry) => (
          <Row key={entry.id} gap="sm">
            <Text variant="mono" tone={color.textSecondary}>
              {loadLabel(entry.weight_kg)} × {entry.reps}
            </Text>
            {entry.rpe ? (
              <Text variant="label" tone={color.textTertiary}>
                RPE {entry.rpe}
              </Text>
            ) : null}
          </Row>
        ))}
      </Stack>

      {onOpenHistory && more ? (
        <Pressable
          onPress={onOpenHistory}
          accessibilityRole="button"
          accessibilityLabel="See this exercise's history"
          hitSlop={space.sm}
        >
          <Text variant="label" tone={color.brand}>
            History · {history?.sessions.length} sessions
          </Text>
        </Pressable>
      ) : null}
    </Stack>
  );
}

/* ------------------------------------------------------- personal records */

const RECORD_LABEL: Record<RecordKind, string> = {
  heaviest_weight: 'Heaviest ever',
  best_reps_at_weight: 'Most reps at this weight',
  session_volume: 'Best session for this lift',
};

/** The one line that says what a record actually beat. */
export function recordDetail(record: PersonalRecord): string {
  if (record.kind === 'session_volume') {
    const was = record.previous_volume_kg;
    return `${Math.round(record.volume_kg ?? 0)} kg moved${was ? ` · was ${Math.round(was)} kg` : ''}`;
  }
  const was =
    record.previous_weight_kg !== null && record.previous_reps !== null
      ? ` · was ${loadLabel(record.previous_weight_kg)} × ${record.previous_reps}`
      : '';
  return `${loadLabel(record.weight_kg)} × ${record.reps}${was}`;
}

/**
 * A record, stated once and quietly.
 *
 * Deliberately not a celebration: no confetti, no modal, nothing that has to
 * be dismissed before the next set. A member mid-workout has their hands on a
 * bar, and an interruption that demands a tap is worse than no acknowledgement
 * at all. A thin gold rule and one line of type is the whole treatment — it
 * reads as premium precisely because it does not ask for anything.
 */
export function RecordNote({ records }: { records: PersonalRecord[] }) {
  const styles = useThemedStyles(buildStyles);
  if (records.length === 0) return null;

  return (
    <Stack gap="xs" style={styles.records}>
      {records.map((record) => (
        <Row key={record.kind} gap="md" style={styles.record}>
          <Ionicons name="trophy-outline" size={16} color={color.brandAccent} />
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="caption" caps tone={color.brandAccent}>
              {RECORD_LABEL[record.kind]}
            </Text>
            <Text variant="body">{recordDetail(record)}</Text>
          </Stack>
        </Row>
      ))}
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
  const styles = useThemedStyles(buildStyles);
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

/* --------------------------------------------------------------- history */

/** One past session in the history sheet: what was done, and what it came to. */
export function HistorySession({ entry }: { entry: ExerciseSession }) {
  const styles = useThemedStyles(buildStyles);
  return (
    <Stack gap="xs" style={styles.historyRow}>
      <Row gap="sm">
        <Text variant="label">{dayLabel(entry.session_date)}</Text>
        <Spacer />
        {entry.average_rpe !== null ? (
          <Text variant="label" tone={color.textTertiary}>
            RPE {entry.average_rpe}
          </Text>
        ) : null}
        <Text variant="mono" tone={color.textTertiary}>
          {Math.round(entry.volume_kg)} kg
        </Text>
      </Row>
      <Row gap="md" style={styles.historySets}>
        {entry.sets.map((set) => (
          <Text key={set.id} variant="mono" tone={color.textSecondary}>
            {setLabel(set)}
          </Text>
        ))}
      </Row>
    </Stack>
  );
}

/**
 * Everything the member has done on this lift.
 *
 * A sheet rather than a screen: it is a reference consulted mid-workout and
 * closed again, and pushing a route would take the member out of the exercise
 * they are in the middle of.
 *
 * Volume and top weight are stated as totals, not charted. A trend line drawn
 * through three sessions implies a confidence three sessions do not support.
 */
export function ExerciseHistorySheet({
  visible,
  onClose,
  history,
}: {
  visible: boolean;
  onClose: () => void;
  history: WorkoutSetHistory | null;
}) {
  const styles = useThemedStyles(buildStyles);
  const sessions = history?.sessions ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} title={history?.exercise} subtitle="Your history">
      {sessions.length === 0 ? (
        <Text variant="body" tone={color.textTertiary}>
          Nothing logged for this lift yet. Sets you record today will appear here.
        </Text>
      ) : (
        <>
          {history?.heaviest || history?.best_volume_kg ? (
            <Stack gap="sm">
              <Eyebrow>Your best</Eyebrow>
              {history.heaviest ? (
                <Row gap="md">
                  <Text variant="body" tone={color.textSecondary} style={styles.grow}>
                    Heaviest set
                  </Text>
                  <Text variant="mono">
                    {loadLabel(history.heaviest.weight_kg)} × {history.heaviest.reps}
                  </Text>
                </Row>
              ) : null}
              {history.best_volume_kg ? (
                <Row gap="md">
                  <Text variant="body" tone={color.textSecondary} style={styles.grow}>
                    Most moved in a session
                  </Text>
                  <Text variant="mono">{Math.round(history.best_volume_kg)} kg</Text>
                </Row>
              ) : null}
              <Divider />
            </Stack>
          ) : null}

          <Eyebrow>Recent sessions</Eyebrow>
          {sessions.map((entry) => (
            <HistorySession key={entry.session_id} entry={entry} />
          ))}
        </>
      )}
    </Sheet>
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
  const styles = useThemedStyles(buildStyles);
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

function buildStyles() {
  return StyleSheet.create({
    grow: { flex: 1 },
    previous: {
      paddingVertical: space.sm,
    },
    records: { paddingVertical: space.xs },
    record: {
      borderLeftWidth: 2,
      borderLeftColor: color.brandAccent,
      paddingLeft: space.md,
      paddingVertical: space.xs,
    },
    historyRow: {
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: color.border,
    },
    historySets: { flexWrap: 'wrap' as const },
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
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.md,
      paddingVertical: space.sm,
      paddingLeft: space.md,
      minHeight: 56,
    },
    setNumber: { minWidth: 16 },
    setDelete: {
      width: 36,
      height: 36,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
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
}
