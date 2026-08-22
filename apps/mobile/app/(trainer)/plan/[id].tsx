/**
 * A trainer's programming for one client — the workout they are prescribing.
 *
 * This is the write side of the same plan the member's Workout screen reads
 * from (`GET /journeys/me/workout/today` resolves the day's split against
 * `WorkoutPlanItem` rows, falling back to the generic library only when a
 * member has none). Saving a split here is what "trainer posts a workout"
 * means today: the exact exercises, sets, reps and rest a member sees the
 * next time that split comes around in their rotation.
 *
 * One split at a time, on purpose — the server scopes the write the same
 * way, so an edit to Push can never silently drop Pull.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type { PlanItem, PlanItemUpsert, WorkoutPlan, WorkoutSplit } from '../../../src/api/types';
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
  Segmented,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { useAuth } from '../../../src/store/AuthContext';

const EDITABLE_SPLITS: { value: WorkoutSplit; label: string }[] = [
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
  { value: 'legs', label: 'Legs' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'assessment', label: 'Assessment' },
];

type DraftItem = PlanItemUpsert & { key: string };

let nextKey = 0;
function blankItem(split: WorkoutSplit): DraftItem {
  nextKey += 1;
  return {
    key: `new-${nextKey}`,
    split,
    exercise: '',
    sets: 3,
    reps: '8-12',
    rest_seconds: 60,
    notes: null,
  };
}

function draftsFor(plan: WorkoutPlan | null, split: WorkoutSplit): DraftItem[] {
  const items = (plan?.items ?? [])
    .filter((i) => i.split === split)
    .sort((a, b) => a.order_index - b.order_index);
  if (items.length === 0) return [];
  return items.map((item: PlanItem) => ({
    key: `existing-${item.id}`,
    split,
    exercise: item.exercise,
    sets: item.sets,
    reps: item.reps,
    rest_seconds: item.rest_seconds,
    notes: item.notes,
  }));
}

export default function TrainerPlanScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { withToken } = useAuth();
  const memberId = Number(id);

  const plan = useApi<WorkoutPlan | null>((token) => api.memberPlan(memberId, token), [memberId]);

  const [split, setSplit] = useState<WorkoutSplit>('push');
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed the draft whenever the split changes or fresh data arrives —
  // never merge, since the server is always this split's whole truth. Does
  // not touch `saved`: a successful save triggers its own refresh, and that
  // refresh must not erase the confirmation it just earned.
  useEffect(() => {
    setDrafts(draftsFor(plan.data ?? null, split));
  }, [plan.data, split]);

  // Switching splits is a fresh screen in every other sense — clear the
  // previous split's error/confirmation so they cannot bleed into this one.
  useEffect(() => {
    setError(null);
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split]);

  const updateItem = useCallback((key: string, patch: Partial<DraftItem>) => {
    setSaved(false);
    setDrafts((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, []);

  const removeItem = useCallback((key: string) => {
    setSaved(false);
    setDrafts((rows) => rows.filter((row) => row.key !== key));
  }, []);

  const addItem = useCallback(() => {
    setSaved(false);
    setDrafts((rows) => [...rows, blankItem(split)]);
  }, [split]);

  const save = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const payload: PlanItemUpsert[] = drafts
        .filter((d) => d.exercise.trim().length > 0)
        .map((d) => ({
          split,
          exercise: d.exercise.trim(),
          sets: d.sets,
          reps: d.reps,
          rest_seconds: d.rest_seconds,
          notes: d.notes?.trim() ? d.notes.trim() : null,
        }));
      await withToken((token) => api.replacePlanSplit(memberId, split, payload, token));
      await plan.refresh();
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not save. Check your connection.',
      );
    } finally {
      setBusy(false);
    }
  }, [drafts, memberId, plan, split, withToken]);

  if (plan.loading) return <Loading />;

  if (plan.error) {
    const offline = plan.error.code === OFFLINE_CODE;
    const noJourney = plan.error.status === 404;
    return (
      <Screen>
        {noJourney ? (
          <EmptyState
            icon="barbell-outline"
            title="No programme to edit yet"
            detail="This member has no General Training journey, so there is no plan for a split-by-split edit to attach to."
          />
        ) : (
          <ErrorState
            offline={offline}
            title={offline ? undefined : 'Could not load this plan'}
            detail={offline ? undefined : plan.error.message}
            onRetry={plan.reload}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Body>
        <Stack gap="xxs">
          <Text variant="title">Edit programming</Text>
          <Text variant="body" tone={color.textSecondary}>
            {name ? `${name}'s ` : ''}exact exercises, sets, reps and rest for one split at a time.
          </Text>
        </Stack>

        <Segmented options={EDITABLE_SPLITS} value={split} onChange={setSplit} testIDPrefix="plan-split" />

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}

        {saved ? (
          <Banner tone="positive" icon="checkmark-circle-outline">
            <Text variant="label" tone={color.status.positive} style={styles.grow}>
              Saved. The member sees this the next time{' '}
              {EDITABLE_SPLITS.find((s) => s.value === split)?.label.toLowerCase()} comes around.
            </Text>
          </Banner>
        ) : null}

        {drafts.length === 0 ? (
          <Card>
            <Text variant="body" tone={color.textSecondary}>
              No exercises prescribed for {EDITABLE_SPLITS.find((s) => s.value === split)?.label}{' '}
              yet. Add the first one below.
            </Text>
          </Card>
        ) : (
          drafts.map((row, index) => (
            <Card key={row.key} testID={`plan-row-${index}`}>
              <Row gap="sm">
                <Eyebrow>Exercise {index + 1}</Eyebrow>
                <Spacer />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove exercise"
                  onPress={() => removeItem(row.key)}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle-outline" size={20} color={color.textTertiary} />
                </Pressable>
              </Row>
              <Input
                placeholder="Exercise name"
                value={row.exercise}
                onChangeText={(text) => updateItem(row.key, { exercise: text })}
                testID={`plan-exercise-${index}`}
              />
              <Row gap="sm">
                <Stack style={styles.third}>
                  <Input
                    label="Sets"
                    keyboardType="number-pad"
                    value={String(row.sets)}
                    onChangeText={(text) =>
                      updateItem(row.key, { sets: Math.max(1, Number(text) || 1) })
                    }
                    testID={`plan-sets-${index}`}
                  />
                </Stack>
                <Stack style={styles.third}>
                  <Input
                    label="Reps"
                    value={row.reps}
                    onChangeText={(text) => updateItem(row.key, { reps: text })}
                    testID={`plan-reps-${index}`}
                  />
                </Stack>
                <Stack style={styles.third}>
                  <Input
                    label="Rest (s)"
                    keyboardType="number-pad"
                    value={String(row.rest_seconds)}
                    onChangeText={(text) =>
                      updateItem(row.key, { rest_seconds: Math.max(0, Number(text) || 0) })
                    }
                    testID={`plan-rest-${index}`}
                  />
                </Stack>
              </Row>
              <Input
                placeholder="Notes for the member (optional)"
                value={row.notes ?? ''}
                onChangeText={(text) => updateItem(row.key, { notes: text })}
                testID={`plan-notes-${index}`}
              />
            </Card>
          ))
        )}

        <Button
          title="Add exercise"
          variant="secondary"
          icon="add"
          onPress={addItem}
          testID="plan-add-exercise"
        />

        <Button
          title="Save changes"
          size="lg"
          loading={busy}
          onPress={() => void save()}
          testID="plan-save"
        />

        <Text
          variant="label"
          tone={color.brandAccent}
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(trainer)/clients'))}
          style={styles.back}
        >
          Back to client
        </Text>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  third: { flex: 1 },
  grow: { flex: 1 },
  back: { paddingVertical: space.md, textAlign: 'center' },
});
