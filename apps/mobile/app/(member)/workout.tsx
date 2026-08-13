/**
 * The member's workout for today.
 *
 * Days 1–3 show the assessment and cardio state; days 4–45 show the PPL chart
 * with sets, reps and rest, and let the member tick items off. Finishing the
 * chart completes the journey day server-side — including, on day 45, the
 * journey itself.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import * as api from '../../src/api/endpoints';
import { ApiError } from '../../src/api/client';
import type { Journey, WorkoutItem, WorkoutSession } from '../../src/api/types';
import { DayCounter, SplitBadge, splitMeta } from '../../src/components/programme';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Meter,
  Row,
  Screen,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { colors, radius, spacing } from '../../src/theme';

export default function MemberWorkoutScreen() {
  const { withToken } = useAuth();
  const journey = useApi<Journey | null>((token) => api.myJourney(token), []);
  const workout = useApi<WorkoutSession | null>((token) => api.todayWorkout(token), []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(() => {
    void journey.refresh();
    void workout.refresh();
  }, [journey, workout]);

  const run = useCallback(
    async (action: (token: string) => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await withToken(action);
        refreshAll();
      } catch (caught) {
        setError(
          caught instanceof ApiError ? caught.message : 'That did not save. Try again.',
        );
      } finally {
        setBusy(false);
      }
    },
    [withToken, refreshAll],
  );

  if (journey.loading || workout.loading) return <Loading label="Loading today's workout" />;
  if (journey.error) {
    return (
      <Screen>
        <ErrorState detail={journey.error.message} onRetry={journey.reload} />
      </Screen>
    );
  }

  const plan = journey.data;
  const session = workout.data;

  if (!plan) {
    return (
      <Screen>
        <EmptyState
          icon="barbell-outline"
          title="No journey yet"
          detail="Your trainer starts your 45-day General Training journey at the branch."
        />
      </Screen>
    );
  }

  const inAssessment = plan.phase === 'assessment';
  const done = session?.status === 'completed';
  const meta = splitMeta[plan.split_today] ?? splitMeta.rest;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={workout.refreshing}
            onRefresh={refreshAll}
            tintColor={colors.brand}
          />
        }
      >
        <Card>
          <DayCounter
            currentDay={plan.current_day}
            totalDays={plan.duration_days}
            phase={plan.phase}
            split={plan.split_today}
          />
        </Card>

        {error ? <Banner tone="danger">{error}</Banner> : null}

        {inAssessment ? (
          <Card>
            <Eyebrow>Assessment phase</Eyebrow>
            <Txt variant="body" color={colors.textMuted}>
              Days 1–{plan.assessment_days} are your assessment and cardio. Your trainer records
              these with you at the branch.
            </Txt>
            <Divider />
            <Row style={styles.detail}>
              <Txt variant="label" color={colors.textMuted}>
                Assessment
              </Txt>
              <Badge
                label={plan.assessment_status === 'completed' ? 'Completed' : 'Not started'}
                color={plan.assessment_status === 'completed' ? colors.onTime : colors.late}
              />
            </Row>
            <Row style={styles.detail}>
              <Txt variant="label" color={colors.textMuted}>
                Cardio
              </Txt>
              <Txt variant="mono">
                {plan.cardio_completed} / {plan.cardio_required}
              </Txt>
            </Row>
            <Meter
              value={
                plan.cardio_required ? (plan.cardio_completed / plan.cardio_required) * 100 : 0
              }
              color={colors.onTime}
            />
          </Card>
        ) : null}

        {plan.status === 'completed' ? (
          <Card>
            <Eyebrow>Journey complete</Eyebrow>
            <Txt variant="body" color={colors.textMuted}>
              You finished the 45-day programme. Your trainer will plan what comes next.
            </Txt>
          </Card>
        ) : null}

        {!session ? (
          <Card>
            <Row style={styles.cardHead}>
              <Txt variant="heading">Today: {meta.label}</Txt>
              <SplitBadge split={plan.split_today} />
            </Row>
            <Txt variant="body" color={colors.textMuted}>
              Start the workout to load your chart.
            </Txt>
            <Button
              title="START WORKOUT"
              size="lg"
              icon="play"
              loading={busy}
              onPress={() => void run((token) => api.startWorkout(token))}
            />
          </Card>
        ) : (
          <>
            <Row style={styles.chartHead}>
              <Txt variant="heading">{session.split_label}</Txt>
              <View style={styles.grow} />
              <Badge
                label={done ? 'Completed' : `${session.completed_items}/${session.total_items}`}
                color={done ? colors.onTime : colors.brand}
                filled={done}
              />
            </Row>
            <Meter
              value={
                session.total_items ? (session.completed_items / session.total_items) * 100 : 0
              }
              color={done ? colors.onTime : colors.brand}
            />

            {session.items.map((item) => (
              <ExerciseRow
                key={item.id}
                item={item}
                disabled={busy || done}
                onToggle={() =>
                  void run((token) =>
                    api.setWorkoutItem(session.id, item.id, item.status !== 'completed', token),
                  )
                }
              />
            ))}

            {!done ? (
              <Button
                title="FINISH WORKOUT"
                size="lg"
                icon="checkmark-done"
                loading={busy}
                onPress={() =>
                  Alert.alert('Finish workout?', 'This records today as complete.', [
                    { text: 'Not yet', style: 'cancel' },
                    {
                      text: 'Finish',
                      onPress: () => void run((token) => api.completeWorkout(session.id, token)),
                    },
                  ])
                }
              />
            ) : (
              <Banner tone="success">Workout recorded. Nice work.</Banner>
            )}
          </>
        )}
      </Body>
    </Screen>
  );
}

function ExerciseRow({
  item,
  disabled,
  onToggle,
}: {
  item: WorkoutItem;
  disabled: boolean;
  onToggle: () => void;
}) {
  const done = item.status === 'completed';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done, disabled }}
      accessibilityLabel={`${item.exercise}, ${item.sets} sets of ${item.reps}`}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [styles.exercise, pressed && styles.exercisePressed]}
    >
      <Ionicons
        name={done ? 'checkmark-circle' : 'ellipse-outline'}
        size={26}
        color={done ? colors.onTime : colors.textFaint}
      />
      <View style={styles.exerciseText}>
        <Txt variant="body" color={done ? colors.textMuted : colors.text}>
          {item.exercise}
        </Txt>
        <Txt variant="label" color={colors.textFaint}>
          {item.sets} × {item.reps}
          {item.rest_seconds ? ` · ${item.rest_seconds}s rest` : ''}
        </Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  cardHead: { justifyContent: 'space-between' },
  chartHead: { gap: spacing.sm, paddingTop: spacing.sm },
  detail: { justifyContent: 'space-between', paddingVertical: 3 },
  exercise: {
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
  exercisePressed: { backgroundColor: colors.raised, borderColor: colors.borderStrong },
  exerciseText: { flex: 1, gap: 2 },
});
