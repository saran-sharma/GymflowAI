/**
 * A trainer's programming for one client — Program Days, not a fixed split.
 *
 * Replaces the old PUSH | PULL | LEGS | CARDIO | ASSESSMENT tab bar (still
 * reachable at `plan-legacy/[id]` for a member on the 45-day journey's own
 * `WorkoutPlan`, which this screen does not touch). A member with a
 * `MemberWorkoutProgram` — built from a template or from scratch — gets
 * arbitrary trainer-named days here instead: "Day 1 — Upper Strength" is a
 * real name, not PPL relabelled.
 *
 * Every action round-trips through the real API immediately; there is no
 * local-only draft state that could look saved and then vanish on
 * navigation, unlike the legacy split editor's batch-save-per-split model.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type {
  MemberWorkoutProgram,
  MemberWorkoutProgramDay,
  WorkoutCategory,
} from '../../../src/api/types';
import { categoryMeta, WorkoutArtwork } from '../../../src/components/programme';
import {
  Banner,
  Body,
  Button,
  Card,
  Chips,
  Divider,
  EmptyState,
  ErrorState,
  Input,
  LinkButton,
  Loading,
  Row,
  Screen,
  Sheet,
  Spacer,
  Stack,
  Text,
  TappableCard,
  color,
  space,
  useThemedStyles,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { useAuth } from '../../../src/store/AuthContext';

const CATEGORY_OPTIONS: { value: WorkoutCategory; label: string }[] = (
  Object.keys(categoryMeta) as WorkoutCategory[]
).map((value) => ({ value, label: categoryMeta[value].label }));

function dayCategoryLine(day: MemberWorkoutProgramDay): string {
  const exerciseCount = day.exercises.length;
  const parts = [`${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}`];
  if (day.estimated_duration_minutes) parts.push(`~${day.estimated_duration_minutes} min`);
  return parts.join(' · ');
}

export default function TrainerProgramScreen() {
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { withToken } = useAuth();
  const memberId = Number(id);

  const program = useApi<MemberWorkoutProgram | null>(
    (token) => api.memberWorkoutProgram(memberId, token),
    [memberId],
  );

  /* Reached repeatedly via `router.replace`/`router.back` from templates,
   * the day editor, and the day-add/rename sheets — all of which write
   * through the real API and expect this list to reflect it immediately.
   * Expo Router can resolve those navigations back onto an already-mounted
   * instance of this screen (same route, same params), which does not
   * re-run `useApi`'s effect on its own: without this, applying a template
   * left the screen showing its stale pre-apply state (still "no personal
   * program yet") even though the apply had already succeeded server-side.
   */
  const refreshOnReturn = useRef(program.refresh);
  refreshOnReturn.current = program.refresh;
  const arrived = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!arrived.current) {
        arrived.current = true;
        return;
      }
      void refreshOnReturn.current();
    }, []),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addDayVisible, setAddDayVisible] = useState(false);
  const [addDayName, setAddDayName] = useState('');
  const [addDayCategory, setAddDayCategory] = useState<WorkoutCategory>('full_body');
  const [addDayDuration, setAddDayDuration] = useState('');

  const [menuDay, setMenuDay] = useState<MemberWorkoutProgramDay | null>(null);

  const [renameDay, setRenameDayState] = useState<MemberWorkoutProgramDay | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameCategory, setRenameCategory] = useState<WorkoutCategory>('full_body');

  const openRename = useCallback((day: MemberWorkoutProgramDay) => {
    setMenuDay(null);
    setRenameDayState(day);
    setRenameName(day.name);
    setRenameCategory(day.category);
  }, []);

  const startFromScratch = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await withToken((token) =>
        api.createCustomProgram(memberId, `${name ? `${name}'s` : "Member's"} program`, token),
      );
      await program.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not start a new programme.');
    } finally {
      setBusy(false);
    }
  }, [memberId, name, program, withToken]);

  const submitAddDay = useCallback(async () => {
    if (!addDayName.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await withToken((token) =>
        api.addProgramDay(
          memberId,
          {
            name: addDayName.trim(),
            category: addDayCategory,
            estimated_duration_minutes: addDayDuration ? Number(addDayDuration) : null,
          },
          token,
        ),
      );
      await program.refresh();
      setAddDayVisible(false);
      setAddDayName('');
      setAddDayDuration('');
      setAddDayCategory('full_body');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not add that day.');
    } finally {
      setBusy(false);
    }
  }, [addDayCategory, addDayDuration, addDayName, memberId, program, withToken]);

  const submitRename = useCallback(async () => {
    if (!renameDay || !renameName.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await withToken((token) =>
        api.renameProgramDay(
          memberId,
          renameDay.id,
          { name: renameName.trim(), category: renameCategory },
          token,
        ),
      );
      await program.refresh();
      setRenameDayState(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not rename that day.');
    } finally {
      setBusy(false);
    }
  }, [memberId, program, renameCategory, renameDay, renameName, withToken]);

  const moveDay = useCallback(
    async (day: MemberWorkoutProgramDay, direction: -1 | 1) => {
      const days = program.data?.days ?? [];
      const index = days.findIndex((d) => d.id === day.id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= days.length) return;
      const reordered = [...days];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      setMenuDay(null);
      setError(null);
      setBusy(true);
      try {
        await withToken((token) =>
          api.reorderProgramDays(
            memberId,
            reordered.map((d) => d.id),
            token,
          ),
        );
        await program.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not reorder days.');
      } finally {
        setBusy(false);
      }
    },
    [memberId, program, withToken],
  );

  const duplicateDay = useCallback(
    async (day: MemberWorkoutProgramDay) => {
      setMenuDay(null);
      setError(null);
      setBusy(true);
      try {
        await withToken(async (token) => {
          const created = await api.addProgramDay(
            memberId,
            {
              name: `${day.name} (Copy)`,
              category: day.category,
              estimated_duration_minutes: day.estimated_duration_minutes,
            },
            token,
          );
          for (const exercise of day.exercises) {
            await api.addProgramExercise(
              memberId,
              created.id,
              {
                exercise: exercise.exercise,
                sets: exercise.sets,
                reps: exercise.reps,
                rest_seconds: exercise.rest_seconds,
                notes: exercise.notes,
              },
              token,
            );
          }
        });
        await program.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not duplicate that day.');
      } finally {
        setBusy(false);
      }
    },
    [memberId, program, withToken],
  );

  const deleteDay = useCallback(
    async (day: MemberWorkoutProgramDay) => {
      setMenuDay(null);
      setError(null);
      setBusy(true);
      try {
        await withToken((token) => api.deleteProgramDay(memberId, day.id, token));
        await program.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not delete that day.');
      } finally {
        setBusy(false);
      }
    },
    [memberId, program, withToken],
  );

  if (program.loading) return <Loading />;

  if (program.error) {
    const offline = program.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'Could not load this programme'}
          detail={offline ? undefined : program.error.message}
          onRetry={program.reload}
        />
      </Screen>
    );
  }

  const days = program.data?.days ?? [];

  return (
    <Screen>
      <Body>
        <Stack gap="xxs">
          <Text variant="title">Edit programming</Text>
          <Text variant="body" tone={color.textSecondary}>
            {name ? `${name} · ` : ''}
            {program.data ? 'Personalized program' : 'No personalized program yet'}
          </Text>
        </Stack>

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}

        {!program.data ? (
          <>
            <EmptyState
              icon="barbell-outline"
              title="Build this member's program"
              detail="Start from one of GymFlow's templates — including Push / Pull / Legs, now just one option among several — or build a fully custom program from nothing."
            />
            <Button
              title="Browse workout templates"
              icon="albums-outline"
              onPress={() =>
                router.push({
                  pathname: '/(trainer)/templates',
                  params: { memberId: String(memberId), name: name ?? '' },
                } as never)
              }
              testID="browse-templates"
            />
            <Button
              title="Start from scratch"
              variant="secondary"
              icon="add-circle-outline"
              loading={busy}
              onPress={() => void startFromScratch()}
              testID="start-from-scratch"
            />
          </>
        ) : (
          <>
            <Row gap="sm">
              <Text variant="label" tone={color.textTertiary} style={styles.grow}>
                PROGRAM DAYS
              </Text>
              <LinkButton
                title="Browse templates"
                testID="browse-templates-link"
                onPress={() =>
                  router.push({
                    pathname: '/(trainer)/templates',
                    params: { memberId: String(memberId), name: name ?? '' },
                  } as never)
                }
              />
            </Row>

            {days.map((day, index) => (
              <TappableCard
                key={day.id}
                testID={`program-day-${day.id}`}
                accessibilityLabel={`Open ${day.name}`}
                onPress={() =>
                  router.push({
                    pathname: '/(trainer)/plan-day/[dayId]',
                    params: {
                      dayId: String(day.id),
                      memberId: String(memberId),
                      dayName: day.name,
                    },
                  } as never)
                }
              >
                <WorkoutArtwork category={day.category} testID={`program-day-art-${day.id}`} />
                <Row gap="sm">
                  <Stack gap="xxs" style={styles.grow}>
                    <Text variant="label" tone={color.textTertiary}>
                      Day {index + 1}
                    </Text>
                    <Text variant="heading">{day.name}</Text>
                    <Text variant="label" tone={color.textSecondary}>
                      {dayCategoryLine(day)}
                    </Text>
                  </Stack>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`More actions for ${day.name}`}
                    onPress={() => setMenuDay(day)}
                    hitSlop={12}
                    testID={`program-day-menu-${day.id}`}
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color={color.textTertiary} />
                  </Pressable>
                </Row>
              </TappableCard>
            ))}

            <Button
              title="Add workout day"
              variant="secondary"
              icon="add"
              onPress={() => setAddDayVisible(true)}
              testID="add-workout-day"
            />
          </>
        )}
      </Body>

      <Sheet
        visible={menuDay !== null}
        onClose={() => setMenuDay(null)}
        title={menuDay?.name}
        testID="day-menu-sheet"
      >
        {menuDay ? (
          <Stack gap="xs">
            <Button
              title="Edit exercises"
              variant="secondary"
              icon="list-outline"
              onPress={() => {
                const day = menuDay;
                setMenuDay(null);
                router.push({
                  pathname: '/(trainer)/plan-day/[dayId]',
                  params: {
                    dayId: String(day.id),
                    memberId: String(memberId),
                    dayName: day.name,
                  },
                } as never);
              }}
              testID="menu-edit-exercises"
            />
            <Button
              title="Rename / change category"
              variant="secondary"
              icon="create-outline"
              onPress={() => openRename(menuDay)}
              testID="menu-rename"
            />
            <Button
              title="Duplicate day"
              variant="secondary"
              icon="copy-outline"
              loading={busy}
              onPress={() => void duplicateDay(menuDay)}
              testID="menu-duplicate"
            />
            <Row gap="sm">
              <View style={styles.half}>
                <Button
                  title="Move up"
                  variant="secondary"
                  icon="arrow-up"
                  disabled={(program.data?.days ?? [])[0]?.id === menuDay.id}
                  onPress={() => void moveDay(menuDay, -1)}
                  testID="menu-move-up"
                />
              </View>
              <View style={styles.half}>
                <Button
                  title="Move down"
                  variant="secondary"
                  icon="arrow-down"
                  disabled={
                    (program.data?.days ?? [])[(program.data?.days.length ?? 1) - 1]?.id ===
                    menuDay.id
                  }
                  onPress={() => void moveDay(menuDay, 1)}
                  testID="menu-move-down"
                />
              </View>
            </Row>
            <Divider />
            <Button
              title="Delete day"
              variant="destructive"
              icon="trash-outline"
              loading={busy}
              onPress={() => void deleteDay(menuDay)}
              testID="menu-delete"
            />
          </Stack>
        ) : null}
      </Sheet>

      <Sheet
        visible={renameDay !== null}
        onClose={() => setRenameDayState(null)}
        title="Rename day"
        testID="rename-sheet"
        footer={
          <Button
            title="Save"
            loading={busy}
            onPress={() => void submitRename()}
            testID="rename-save"
          />
        }
      >
        <Input
          label="Day name"
          value={renameName}
          onChangeText={setRenameName}
          testID="rename-input"
        />
        <Spacer />
        <Text variant="label" tone={color.textTertiary}>
          Category
        </Text>
        <Chips
          options={CATEGORY_OPTIONS}
          value={renameCategory}
          onChange={setRenameCategory}
          testIDPrefix="rename-category"
        />
      </Sheet>

      <Sheet
        visible={addDayVisible}
        onClose={() => setAddDayVisible(false)}
        title="Add workout day"
        testID="add-day-sheet"
        footer={
          <Button
            title="Add day"
            loading={busy}
            onPress={() => void submitAddDay()}
            testID="add-day-save"
          />
        }
      >
        <Input
          label="Day name"
          placeholder="Day 4 — Upper Strength"
          value={addDayName}
          onChangeText={setAddDayName}
          testID="add-day-name"
        />
        <Spacer />
        <Text variant="label" tone={color.textTertiary}>
          Category
        </Text>
        <Chips
          options={CATEGORY_OPTIONS}
          value={addDayCategory}
          onChange={setAddDayCategory}
          testIDPrefix="add-day-category"
        />
        <Spacer />
        <Input
          label="Estimated duration (minutes, optional)"
          keyboardType="number-pad"
          value={addDayDuration}
          onChangeText={setAddDayDuration}
          testID="add-day-duration"
        />
      </Sheet>
    </Screen>
  );
}

function buildStyles() {
  return StyleSheet.create({
    grow: { flex: 1 },
    half: { flex: 1 },
  });
}
