/**
 * One workout day's exercises — add, edit, reorder, remove.
 *
 * Reached from `plan/[id]` (the program-days list). There is no dedicated
 * "get one day" endpoint, so this screen reads the day out of the member's
 * whole programme (already the source of truth the list screen fetched) and
 * refetches that same programme after every mutation — every action here is
 * a real round trip, never a local draft that could look saved and vanish.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type { MemberWorkoutProgram, ProgramExercise } from '../../../src/api/types';
import { CategoryBadge } from '../../../src/components/programme';
import {
  Banner,
  Body,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Input,
  Loading,
  Row,
  Screen,
  Sheet,
  Spacer,
  Stack,
  Text,
  color,
  space,
  useThemedStyles,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { useAuth } from '../../../src/store/AuthContext';

export default function TrainerProgramDayScreen() {
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const { dayId, memberId: memberIdParam, dayName } = useLocalSearchParams<{
    dayId: string;
    memberId: string;
    dayName?: string;
  }>();
  const { withToken } = useAuth();
  const memberId = Number(memberIdParam);
  const dayIdNum = Number(dayId);

  const program = useApi<MemberWorkoutProgram | null>(
    (token) => api.memberWorkoutProgram(memberId, token),
    [memberId],
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ProgramExercise | null>(null);
  const [addVisible, setAddVisible] = useState(false);
  const [formExercise, setFormExercise] = useState('');
  const [formSets, setFormSets] = useState('3');
  const [formReps, setFormReps] = useState('10');
  const [formRest, setFormRest] = useState('60');
  const [formNotes, setFormNotes] = useState('');

  const day = program.data?.days.find((d) => d.id === dayIdNum) ?? null;

  const openAdd = useCallback(() => {
    setFormExercise('');
    setFormSets('3');
    setFormReps('10');
    setFormRest('60');
    setFormNotes('');
    setAddVisible(true);
  }, []);

  const openEdit = useCallback((exercise: ProgramExercise) => {
    setEditing(exercise);
    setFormExercise(exercise.exercise);
    setFormSets(String(exercise.sets));
    setFormReps(exercise.reps);
    setFormRest(String(exercise.rest_seconds));
    setFormNotes(exercise.notes ?? '');
  }, []);

  const submitAdd = useCallback(async () => {
    if (!formExercise.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await withToken((token) =>
        api.addProgramExercise(
          memberId,
          dayIdNum,
          {
            exercise: formExercise.trim(),
            sets: Math.max(1, Number(formSets) || 1),
            reps: formReps.trim() || '10',
            rest_seconds: Math.max(0, Number(formRest) || 0),
            notes: formNotes.trim() ? formNotes.trim() : null,
          },
          token,
        ),
      );
      await program.refresh();
      setAddVisible(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not add that exercise.');
    } finally {
      setBusy(false);
    }
  }, [dayIdNum, formExercise, formNotes, formRest, formReps, formSets, memberId, program, withToken]);

  const submitEdit = useCallback(async () => {
    if (!editing || !formExercise.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await withToken((token) =>
        api.updateProgramExercise(
          memberId,
          dayIdNum,
          editing.id,
          {
            exercise: formExercise.trim(),
            sets: Math.max(1, Number(formSets) || 1),
            reps: formReps.trim() || '10',
            rest_seconds: Math.max(0, Number(formRest) || 0),
            notes: formNotes.trim() ? formNotes.trim() : null,
          },
          token,
        ),
      );
      await program.refresh();
      setEditing(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that exercise.');
    } finally {
      setBusy(false);
    }
  }, [
    dayIdNum,
    editing,
    formExercise,
    formNotes,
    formRest,
    formReps,
    formSets,
    memberId,
    program,
    withToken,
  ]);

  const removeExercise = useCallback(
    async (exercise: ProgramExercise) => {
      setError(null);
      setBusy(true);
      try {
        await withToken((token) =>
          api.removeProgramExercise(memberId, dayIdNum, exercise.id, token),
        );
        await program.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not remove that exercise.');
      } finally {
        setBusy(false);
      }
    },
    [dayIdNum, memberId, program, withToken],
  );

  const moveExercise = useCallback(
    async (exercise: ProgramExercise, direction: -1 | 1) => {
      const exercises = day?.exercises ?? [];
      const index = exercises.findIndex((e) => e.id === exercise.id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= exercises.length) return;
      const reordered = [...exercises];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      setError(null);
      setBusy(true);
      try {
        await withToken((token) =>
          api.reorderProgramExercises(
            memberId,
            dayIdNum,
            reordered.map((e) => e.id),
            token,
          ),
        );
        await program.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not reorder exercises.');
      } finally {
        setBusy(false);
      }
    },
    [day, dayIdNum, memberId, program, withToken],
  );

  if (program.loading) return <Loading />;

  if (program.error) {
    const offline = program.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'Could not load this day'}
          detail={offline ? undefined : program.error.message}
          onRetry={program.reload}
        />
      </Screen>
    );
  }

  if (!day) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="This day is no longer here"
          detail="It may have just been deleted from the program."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Body>
        <Stack gap="xxs">
          <Text variant="title">{dayName || day.name}</Text>
          <Row gap="sm">
            <CategoryBadge category={day.category} />
            {day.estimated_duration_minutes ? (
              <Text variant="label" tone={color.textTertiary}>
                ~{day.estimated_duration_minutes} min
              </Text>
            ) : null}
          </Row>
        </Stack>

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}

        {day.exercises.length === 0 ? (
          <Card>
            <Text variant="body" tone={color.textSecondary}>
              No exercises in this day yet. Add the first one below.
            </Text>
          </Card>
        ) : (
          day.exercises.map((exercise, index) => (
            <Card key={exercise.id} testID={`day-exercise-${index}`}>
              <Row gap="sm">
                <Eyebrow>Exercise {index + 1}</Eyebrow>
                <Spacer />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move up"
                  onPress={() => void moveExercise(exercise, -1)}
                  disabled={index === 0}
                  hitSlop={8}
                  testID={`exercise-move-up-${index}`}
                >
                  <Ionicons
                    name="arrow-up-circle-outline"
                    size={20}
                    color={index === 0 ? color.border : color.textTertiary}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move down"
                  onPress={() => void moveExercise(exercise, 1)}
                  disabled={index === day.exercises.length - 1}
                  hitSlop={8}
                  testID={`exercise-move-down-${index}`}
                >
                  <Ionicons
                    name="arrow-down-circle-outline"
                    size={20}
                    color={index === day.exercises.length - 1 ? color.border : color.textTertiary}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove exercise"
                  onPress={() => void removeExercise(exercise)}
                  hitSlop={8}
                  testID={`exercise-remove-${index}`}
                >
                  <Ionicons name="close-circle-outline" size={20} color={color.textTertiary} />
                </Pressable>
              </Row>
              <Pressable onPress={() => openEdit(exercise)} testID={`exercise-edit-${index}`}>
                <Text variant="body">{exercise.exercise}</Text>
                <Text variant="label" tone={color.textTertiary}>
                  {exercise.sets} × {exercise.reps} · {exercise.rest_seconds}s rest
                  {exercise.notes ? ` · ${exercise.notes}` : ''}
                </Text>
              </Pressable>
            </Card>
          ))
        )}

        <Button
          title="Add exercise"
          variant="secondary"
          icon="add"
          onPress={openAdd}
          testID="add-exercise"
        />

        <Text
          variant="label"
          tone={color.brandAccent}
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(trainer)/clients'))}
          style={styles.back}
        >
          Back to program
        </Text>
      </Body>

      <Sheet
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        title="Add exercise"
        testID="add-exercise-sheet"
        footer={
          <Button
            title="Add"
            loading={busy}
            onPress={() => void submitAdd()}
            testID="add-exercise-save"
          />
        }
      >
        <ExerciseForm
          exercise={formExercise}
          sets={formSets}
          reps={formReps}
          rest={formRest}
          notes={formNotes}
          onExercise={setFormExercise}
          onSets={setFormSets}
          onReps={setFormReps}
          onRest={setFormRest}
          onNotes={setFormNotes}
          idPrefix="add-exercise"
        />
      </Sheet>

      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit exercise"
        testID="edit-exercise-sheet"
        footer={
          <Button
            title="Save"
            loading={busy}
            onPress={() => void submitEdit()}
            testID="edit-exercise-save"
          />
        }
      >
        <ExerciseForm
          exercise={formExercise}
          sets={formSets}
          reps={formReps}
          rest={formRest}
          notes={formNotes}
          onExercise={setFormExercise}
          onSets={setFormSets}
          onReps={setFormReps}
          onRest={setFormRest}
          onNotes={setFormNotes}
          idPrefix="edit-exercise"
        />
      </Sheet>
    </Screen>
  );
}

function ExerciseForm({
  exercise,
  sets,
  reps,
  rest,
  notes,
  onExercise,
  onSets,
  onReps,
  onRest,
  onNotes,
  idPrefix,
}: {
  exercise: string;
  sets: string;
  reps: string;
  rest: string;
  notes: string;
  onExercise: (value: string) => void;
  onSets: (value: string) => void;
  onReps: (value: string) => void;
  onRest: (value: string) => void;
  onNotes: (value: string) => void;
  idPrefix: string;
}) {
  const styles = useThemedStyles(buildStyles);
  return (
    <Stack gap="sm">
      <Input
        label="Exercise name"
        value={exercise}
        onChangeText={onExercise}
        testID={`${idPrefix}-name`}
      />
      <Row gap="sm">
        <Stack style={styles.third}>
          <Input label="Sets" keyboardType="number-pad" value={sets} onChangeText={onSets} testID={`${idPrefix}-sets`} />
        </Stack>
        <Stack style={styles.third}>
          <Input label="Reps" value={reps} onChangeText={onReps} testID={`${idPrefix}-reps`} />
        </Stack>
        <Stack style={styles.third}>
          <Input
            label="Rest (s)"
            keyboardType="number-pad"
            value={rest}
            onChangeText={onRest}
            testID={`${idPrefix}-rest`}
          />
        </Stack>
      </Row>
      <Input
        label="Notes (optional)"
        value={notes}
        onChangeText={onNotes}
        testID={`${idPrefix}-notes`}
      />
    </Stack>
  );
}

function buildStyles() {
  return StyleSheet.create({
    third: { flex: 1 },
    back: { paddingVertical: space.md, textAlign: 'center' as const },
  });
}
