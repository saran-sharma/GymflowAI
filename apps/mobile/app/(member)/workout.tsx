/**
 * The member's workout.
 *
 * The assessment days are cardio and a movement screen recorded by a trainer
 * at the branch, so this screen reports them rather than offering to start
 * anything. Every other day shows the chart — sets, reps and rest — and lets
 * the member work through it. Finishing the chart ticks the day off
 * server-side.
 *
 * The member is never shown the 45-day counter. It is a real rule — it decides
 * when a trainer is asked to review somebody for PT — but it is the gym's rule,
 * and a deadline the member was never told about and cannot act on only reads
 * as pressure. They see their week instead.
 *
 * The chart is a list, not a workspace. Each exercise opens its own screen for
 * logging, because weight and reps are entered between sets with one hand and
 * deserve the whole display rather than a row in a list. What stays here is the
 * thing the chart is for: which lift is next, and how far through it a member
 * already is.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Journey, JourneyDay, WorkoutItem, WorkoutSession } from '../../src/api/types';
import { KindTag, TodayCard, WeekStrip, journeyToday } from '../../src/components/member';
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
  MetricRow,
  ProgressBar,
  Row,
  Screen,
  Section,
  Spacer,
  Stack,
  Text,
  color,
  radii,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { dayLabel } from '../../src/utils/format';

const SPLIT_LABEL: Record<string, string> = {
  assessment: 'Assessment',
  cardio: 'Cardio',
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  rest: 'Rest',
};

export default function MemberWorkoutScreen() {
  const router = useRouter();
  const { withToken } = useAuth();
  const journey = useApi<Journey | null>((token) => api.myJourney(token), []);
  const workout = useApi<WorkoutSession | null>((token) => api.todayWorkout(token), []);
  const days = useApi<JourneyDay[]>((token) => api.myJourneyDays(token), []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(() => {
    void journey.refresh();
    void workout.refresh();
    void days.refresh();
  }, [journey, workout, days]);

  /* Re-read the chart whenever the member comes back to it.
   *
   * Sets are logged on the exercise screen, so every count on this screen —
   * `2/3` on a row, "3 of 6" in the badge, the progress bar — is stale the
   * moment that screen is opened. Without this the member finishes an exercise
   * and returns to a chart still showing the state they left, which reads as
   * the app having lost the sets they just did.
   *
   * The callback holds no dependencies and reaches the current refresh through
   * a ref, so it never changes identity. A callback rebuilt each render would
   * make `useFocusEffect` re-run on every render, which is a fetch loop rather
   * than a refresh.
   */
  const refreshOnReturn = useRef(workout.refresh);
  refreshOnReturn.current = workout.refresh;
  const arrived = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // `useApi` already fetched on mount; the first focus would duplicate it.
      if (!arrived.current) {
        arrived.current = true;
        return;
      }
      void refreshOnReturn.current();
    }, []),
  );

  const run = useCallback(
    async (action: (token: string) => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await withToken(action);
        refreshAll();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'That did not save. Try again.');
      } finally {
        setBusy(false);
      }
    },
    [withToken, refreshAll],
  );

  if (journey.loading || workout.loading) return <Loading label="Loading today's workout" />;

  if (journey.error) {
    const offline = journey.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your workout'}
          detail={offline ? undefined : journey.error.message}
          onRetry={journey.reload}
        />
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
          title="No programme yet"
          detail="Your trainer starts your 45-day General Training journey with you at the branch."
        />
      </Screen>
    );
  }

  const inAssessment = plan.phase === 'assessment';
  const restDay = plan.split_today === 'rest';
  // "complete" covers a finished, paused or cancelled journey alike — none of
  // them has a real plan for the server to build a session from, so none of
  // them gets a Start button. Starting one anyway used to be possible: the
  // server would silently fall back to a bare, unassigned workout instead of
  // rejecting the request.
  const journeyInactive = plan.phase === 'complete';
  const journeyDone = plan.status === 'completed';
  const done = session?.status === 'completed';
  const history = (days.data ?? [])
    .filter((day) => day.day_number < plan.current_day)
    .sort((a, b) => b.day_number - a.day_number);

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={workout.refreshing}
            onRefresh={refreshAll}
            tintColor={color.brand}
          />
        }
      >
        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}

        {/* Assessment days belong to the trainer, so this reports rather than acts. */}
        {inAssessment ? (
          <Card>
            <Row gap="sm">
              <KindTag kind="own_workout" />
              <Spacer />
              <Badge
                label={plan.assessment_status === 'completed' ? 'Completed' : 'In progress'}
                tone={plan.assessment_status === 'completed' ? 'positive' : 'caution'}
              />
            </Row>
            <Text variant="title">Getting started</Text>
            <Text variant="body" tone={color.textSecondary}>
              Your assessment and introductory cardio. Your trainer records these with you at the
              branch — there is nothing to start here.
            </Text>
            <Divider />
            <MetricRow
              label="Cardio sessions"
              value={`${plan.cardio_completed} / ${plan.cardio_required}`}
              progress={
                plan.cardio_required ? (plan.cardio_completed / plan.cardio_required) * 100 : 0
              }
              tone="positive"
            />
          </Card>
        ) : null}

        {/* General Training is over — nothing here to start or rest from. */}
        {journeyInactive && !inAssessment ? (
          <Card>
            <Eyebrow>{journeyDone ? 'Programme complete' : 'Programme paused'}</Eyebrow>
            <Text variant="title">
              {journeyDone ? 'General Training complete' : 'General Training is on hold'}
            </Text>
            <Text variant="body" tone={color.textSecondary}>
              {journeyDone
                ? `${plan.workouts_completed} workouts recorded. Your trainer plans what comes next.`
                : 'Speak to your trainer at your branch about resuming your programme.'}
            </Text>
          </Card>
        ) : null}

        {/* Rest is a prescription, not a gap in the plan. */}
        {restDay && !inAssessment && !journeyInactive ? (
          <TodayCard
            kind="rest"
            title="Rest & recovery"
            subtitle="No workout is planned for today. Recovery is part of the programme."
            cta="Nothing to do today"
            onPress={() => {}}
            disabled
          />
        ) : null}

        {/* The chart. */}
        {!restDay && !inAssessment && !journeyInactive ? (
          !session ? (
            <Card>
              <Row gap="sm">
                <KindTag kind="own_workout" />
                <Spacer />
              </Row>
              <Text variant="title">{SPLIT_LABEL[plan.split_today] ?? plan.split_today}</Text>
              <Text variant="body" tone={color.textSecondary}>
                Start to load today’s chart.
              </Text>
              <Button
                title="Start today’s workout"
                size="lg"
                icon="play"
                loading={busy}
                onPress={() => void run((token) => api.startWorkout(token))}
              />
            </Card>
          ) : (
            <>
              <Card>
                <Row gap="sm">
                  <KindTag kind="own_workout" />
                  <Spacer />
                  <Badge
                    label={
                      done ? 'Completed' : `${session.completed_items} of ${session.total_items}`
                    }
                    tone={done ? 'positive' : 'brand'}
                    solid={done}
                  />
                </Row>
                <Text variant="title">{session.split_label}</Text>
                <ProgressBar
                  value={
                    session.total_items ? (session.completed_items / session.total_items) * 100 : 0
                  }
                  tone={done ? 'positive' : 'brand'}
                />
              </Card>

              <Section title="Exercises">
                {session.items.map((item) => (
                  <ExerciseRow
                    key={item.id}
                    item={item}
                    onOpen={() =>
                      router.push({
                        pathname: '/(member)/exercise/[itemId]',
                        params: { itemId: String(item.id), sessionId: String(session.id) },
                      })
                    }
                  />
                ))}
              </Section>

              {!done ? (
                <Button
                  title="Finish workout"
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
                <Banner tone="positive" icon="checkmark-circle-outline">
                  Workout recorded. Nice work.
                </Banner>
              )}
            </>
          )
        ) : null}

        {/* The week, in place of the internal day counter. */}
        <WeekStrip days={days.data ?? []} today={journeyToday(plan)} />

        <Section title="Recent sessions">
          {history.length === 0 ? (
            <Text variant="label" tone={color.textTertiary}>
              Completed days will be listed here as you work through the programme.
            </Text>
          ) : (
            history.slice(0, 20).map((day) => <HistoryRow key={day.day_number} day={day} />)
          )}
        </Section>
      </Body>
    </Screen>
  );
}

/**
 * One exercise on the chart.
 *
 * The row states progress rather than offering a tick box: an exercise is
 * finished by logging its sets, and a checkbox beside a lift with two of three
 * sets recorded would be offering to contradict the member's own data.
 */
function ExerciseRow({ item, onOpen }: { item: WorkoutItem; onOpen: () => void }) {
  const done = item.status === 'completed';
  const started = item.sets_logged > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.exercise}, ${item.sets_logged} of ${item.sets} sets logged. Open.`}
      onPress={onOpen}
      style={({ pressed }) => [styles.exercise, pressed ? styles.exercisePressed : null]}
    >
      <Ionicons
        name={done ? 'checkmark-circle' : started ? 'ellipse' : 'ellipse-outline'}
        size={26}
        color={done ? color.status.positive : started ? color.brand : color.textTertiary}
      />
      <Stack gap="xxs" style={styles.grow}>
        <Text variant="body" tone={done ? color.textSecondary : color.text}>
          {item.exercise}
        </Text>
        <Text variant="label" tone={color.textTertiary}>
          {/* The prescription, and against it what has actually been recorded. */}
          {item.sets} × {item.reps}
          {item.rest_seconds ? ` · ${item.rest_seconds}s rest` : ''}
        </Text>
      </Stack>
      {started ? (
        <Text variant="mono" tone={done ? color.status.positive : color.brand}>
          {item.sets_logged}/{item.sets}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
    </Pressable>
  );
}

function HistoryRow({ day }: { day: JourneyDay }) {
  const tone =
    day.status === 'completed' ? 'positive' : day.status === 'missed' ? 'critical' : 'neutral';
  const label =
    day.status === 'completed' ? 'Done' : day.status === 'missed' ? 'Missed' : 'Not recorded';

  return (
    <Row gap="md" style={styles.historyRow}>
      <Stack gap="xxs" style={styles.grow}>
        <Text variant="body">{SPLIT_LABEL[day.split] ?? day.split}</Text>
        <Text variant="label" tone={color.textTertiary}>
          {dayLabel(day.planned_on)}
        </Text>
      </Stack>
      <Badge label={label} tone={tone} />
    </Row>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  dayNumber: { minWidth: 26 },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surfaceRaised,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
    minHeight: 64,
  },
  exercisePressed: { backgroundColor: color.surfaceOverlay, borderColor: color.borderStrong },
  historyRow: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
});
