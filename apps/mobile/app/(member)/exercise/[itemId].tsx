/**
 * One exercise, while the member is doing it.
 *
 * This is the only screen in the app used mid-set, standing up, one-handed,
 * with a bar to get back under. Everything on it is arranged around that: the
 * two fields that matter are reachable with a thumb, the previous session sits
 * directly above them so there is nothing to remember, and nothing modal ever
 * appears between logging a set and starting the next one.
 *
 * It writes real rows to `workout_sets`. There is no local-only state that
 * could be lost, and no optimistic number shown before the server has it —
 * a member who trusts a figure the API rejected has been told a lie about
 * their own training.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type {
  PersonalRecord,
  WorkoutSession,
  WorkoutSet,
  WorkoutSetHistory,
} from '../../../src/api/types';
import {
  ExerciseHistorySheet,
  PreviousPerformance,
  RecordNote,
  RestBar,
  SetRow,
  loadLabel,
  useRestTimer,
} from '../../../src/components/workout';
import {
  Badge,
  Banner,
  Body,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  Input,
  Loading,
  Motion,
  Row,
  Screen,
  Spacer,
  Stack,
  Text,
  color,
  entrance,
  haptics,
  space,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { useAuth } from '../../../src/store/AuthContext';

/** Only ever used when the plan itself carries no rest for the exercise. */
const FALLBACK_REST_SECONDS = 60;

interface Draft {
  weight: string;
  reps: string;
  rpe: string;
}

const EMPTY: Draft = { weight: '', reps: '', rpe: '' };

export default function ExerciseScreen() {
  const router = useRouter();
  const { withToken } = useAuth();
  const params = useLocalSearchParams<{ itemId: string; sessionId: string }>();
  const itemId = Number(params.itemId);
  const sessionId = Number(params.sessionId);

  const workout = useApi<WorkoutSession | null>((token) => api.todayWorkout(token), []);
  const sets = useApi<WorkoutSet[]>(
    (token) => api.workoutSets(sessionId, itemId, token),
    [sessionId, itemId],
  );
  const history = useApi<WorkoutSetHistory>(
    (token) => api.exerciseHistory(sessionId, itemId, token),
    [sessionId, itemId],
  );

  /* `null` means "nothing typed yet, show the suggestion". A concrete object
   * means the member has taken over the fields, and from then on what they
   * typed wins — including a field they deliberately cleared. Collapsing these
   * two states into one object is what makes a blanked field snap back. */
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  /* Records for the set just logged, and only that one. Cleared as soon as the
   * next set is started: a PR notice still on screen while the member types
   * the following set reads as a claim about the set they are typing. */
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const rest = useRestTimer();

  const session = workout.data;
  const item = session?.items.find((entry) => entry.id === itemId) ?? null;
  const logged = sets.data ?? [];

  const run = useCallback(
    async (action: (token: string) => Promise<unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await withToken(action);
        await sets.refresh();
        return true;
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'That did not save. Try again.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [withToken, sets],
  );

  /* The next set number, and the values to start it from.
   *
   * Prefilling from the last set of this session — or, on the first set, from
   * the last session — is the difference between three taps and a keyboard.
   * Most sets repeat the one before them. */
  const nextNumber = useMemo(
    () => logged.reduce((highest, entry) => Math.max(highest, entry.set_number), 0) + 1,
    [logged],
  );

  const suggestion = useMemo<Draft>(() => {
    // The last set of this session, or failing that the last set of the last
    // session. Most sets repeat the one before them, so this is the difference
    // between three taps and a keyboard.
    const source = logged.length
      ? logged[logged.length - 1]
      : (history.data?.sessions[0]?.sets.slice(-1)[0] ?? null);
    if (!source) return EMPTY;
    // RPE is never suggested: it is how hard *this* set felt, and carrying the
    // last one forward would put a number the member never gave into a field
    // that then gets saved.
    return { weight: String(source.weight_kg), reps: String(source.reps), rpe: '' };
  }, [logged, history.data]);

  const active = draft ?? suggestion;

  // The first keystroke seeds the draft from whatever is on screen, so taking
  // over one field never wipes the other two.
  const setField = (field: keyof Draft) => (value: string) => {
    setRecords([]);
    setDraft({ ...active, [field]: value });
  };

  const beginEdit = (entry: WorkoutSet) => {
    setEditing(entry.id);
    setDraft({
      weight: String(entry.weight_kg),
      reps: String(entry.reps),
      rpe: entry.rpe === null ? '' : String(entry.rpe),
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft(null);
  };

  const submit = async () => {
    Keyboard.dismiss();
    const weight = Number(active.weight);
    const reps = Number(active.reps);
    const rpe = active.rpe.trim() === '' ? null : Number(active.rpe);

    // Checked here as well as on the server so a typo does not cost a round
    // trip mid-workout. The server remains the authority.
    if (!Number.isFinite(weight) || weight < 0)
      return setError('Enter a weight in kilograms — 0 for bodyweight.');
    if (!Number.isInteger(reps) || reps < 1) return setError('Enter how many reps you completed.');
    if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) {
      return setError('RPE runs from 1 to 10, in halves.');
    }

    if (editing !== null) {
      // A correction is not an achievement: it changes a number that was
      // already counted, so it neither claims a record nor starts a rest.
      const saved = await run((token) =>
        api.updateWorkoutSet(sessionId, itemId, editing, { weight_kg: weight, reps, rpe }, token),
      );
      if (saved) cancelEdit();
      return;
    }

    let beaten: PersonalRecord[] = [];
    const saved = await run(async (token) => {
      const response = await api.logWorkoutSet(
        sessionId,
        itemId,
        { set_number: nextNumber, weight_kg: weight, reps, rpe },
        token,
      );
      beaten = response.records;
      return response;
    });

    if (saved) {
      // Back to the suggestion, which now derives from the set just logged.
      setDraft(null);
      setRecords(beaten);
      rest.start(item?.rest_seconds || FALLBACK_REST_SECONDS);
      // A light tick confirms the set landed; a beaten record is the one
      // moment on this screen that earns the stronger success pattern.
      if (beaten.length > 0) haptics.notify('success');
      else haptics.impact('light');
    }
  };

  const remove = (entry: WorkoutSet) =>
    Alert.alert(`Delete set ${entry.set_number}?`, 'This removes it from your record.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (editing === entry.id) cancelEdit();
          void run((token) => api.deleteWorkoutSet(sessionId, itemId, entry.id, token));
        },
      },
    ]);

  /* ------------------------------------------------------------- states */

  if (workout.loading || sets.loading) return <Loading label="Loading exercise" />;

  // History failing is not worth blocking the screen for: a member can log
  // sets without knowing what they did last week. It renders as "no history".
  const failure = workout.error ?? sets.error;
  if (failure) {
    const offline = failure.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load this exercise'}
          detail={offline ? undefined : failure.message}
          onRetry={() => {
            void workout.reload();
            void sets.reload();
          }}
        />
      </Screen>
    );
  }

  if (!session || !item) {
    return (
      <Screen>
        {/* Not an error — the workout moved on. Offering "Try again" would
            invite a retry of something that will not change. */}
        <EmptyState
          icon="barbell-outline"
          title="This exercise is not in today’s workout"
          detail="Pick it from the chart again."
          action={{ label: 'Back to workout', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const ordered = [...session.items].sort((a, b) => a.order_index - b.order_index);
  const position = ordered.findIndex((entry) => entry.id === item.id);
  const next = ordered[position + 1] ?? null;
  const done = item.status === 'completed';
  const closed = session.status === 'completed';

  return (
    <Screen>
      <Body>
        <Row gap="sm">
          <Pressable
            onPress={() => router.back()}
            hitSlop={space.md}
            accessibilityRole="button"
            accessibilityLabel="Back to workout"
          >
            <Ionicons name="chevron-back" size={22} color={color.textSecondary} />
          </Pressable>
          <Eyebrow>
            {session.split_label} · {position + 1} of {ordered.length}
          </Eyebrow>
          <Spacer />
          {done ? <Badge label="Done" tone="positive" solid /> : null}
        </Row>

        <Stack gap="xxs">
          <Text variant="title">{item.exercise}</Text>
          <Text variant="label" tone={color.textTertiary}>
            Plan: {item.sets} × {item.reps}
            {item.rest_seconds ? ` · ${item.rest_seconds}s rest` : ''}
          </Text>
        </Stack>

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}

        {closed ? (
          <Banner tone="neutral" icon="lock-closed-outline">
            This workout is finished, so its sets are now a record and cannot be changed.
          </Banner>
        ) : null}

        <PreviousPerformance history={history.data} onOpenHistory={() => setShowHistory(true)} />

        <RecordNote records={records} />

        <Divider />

        <Stack gap="sm">
          <Row gap="sm">
            <Eyebrow>Today</Eyebrow>
            <Spacer />
            {logged.length ? (
              <Text variant="label" tone={color.textTertiary}>
                {logged.length} {logged.length === 1 ? 'set' : 'sets'}
              </Text>
            ) : null}
          </Row>

          {logged.length === 0 ? (
            <Text variant="body" tone={color.textTertiary}>
              No sets logged yet. Enter your first below.
            </Text>
          ) : (
            logged.map((entry, index) => (
              <Motion.View key={entry.id} entering={entrance(index)}>
                <SetRow
                  entry={entry}
                  editing={editing === entry.id}
                  disabled={busy || closed}
                  onEdit={() => beginEdit(entry)}
                  onDelete={() => remove(entry)}
                />
              </Motion.View>
            ))
          )}
        </Stack>

        <RestBar timer={rest} />

        {!closed ? (
          <Stack gap="sm">
            <Row gap="sm" style={styles.fields}>
              <View style={styles.field}>
                <Input
                  label="Kg"
                  value={active.weight}
                  onChangeText={setField('weight')}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  placeholder="0"
                  testID="set-weight"
                />
              </View>
              <View style={styles.field}>
                <Input
                  label="Reps"
                  value={active.reps}
                  onChangeText={setField('reps')}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  placeholder="—"
                  testID="set-reps"
                />
              </View>
              <View style={styles.field}>
                <Input
                  label="RPE"
                  value={active.rpe}
                  onChangeText={setField('rpe')}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  placeholder="opt"
                  testID="set-rpe"
                />
              </View>
            </Row>

            <Button
              title={editing !== null ? 'Save changes' : `Log set ${nextNumber}`}
              size="lg"
              icon={editing !== null ? 'checkmark' : 'add'}
              loading={busy}
              onPress={() => void submit()}
              testID="log-set"
            />
            {editing !== null ? (
              <Button title="Cancel" variant="ghost" size="sm" onPress={cancelEdit} />
            ) : null}
          </Stack>
        ) : null}

        <Divider />

        <Stack gap="sm">
          {!closed ? (
            <Button
              title={done ? 'Mark as not done' : 'Mark exercise done'}
              variant={done ? 'ghost' : 'secondary'}
              icon={done ? 'refresh' : 'checkmark-done'}
              loading={busy}
              onPress={() =>
                void run(async (token) => {
                  await api.setWorkoutItem(sessionId, item.id, !done, token);
                  await workout.refresh();
                })
              }
            />
          ) : null}

          {next ? (
            <Button
              title={`Next: ${next.exercise}`}
              variant="primary"
              icon="arrow-forward"
              onPress={() =>
                router.replace({
                  pathname: '/(member)/exercise/[itemId]',
                  params: { itemId: String(next.id), sessionId: String(sessionId) },
                })
              }
            />
          ) : (
            <Button
              title="Back to workout"
              variant="primary"
              icon="list"
              onPress={() => router.back()}
            />
          )}
        </Stack>

        {logged.length ? (
          <Text variant="label" tone={color.textTertiary} style={styles.footnote}>
            Heaviest today: {loadLabel(Math.max(...logged.map((entry) => entry.weight_kg)))}
          </Text>
        ) : null}
      </Body>

      <ExerciseHistorySheet
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        history={history.data}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fields: { alignItems: 'flex-start' },
  field: { flex: 1 },
  footnote: { textAlign: 'center' },
});
