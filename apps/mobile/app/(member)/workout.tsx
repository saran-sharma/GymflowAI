/**
 * The member's workout.
 *
 * Days 1–3 are assessment and cardio, recorded by a trainer at the branch, so
 * this screen reports them rather than offering to start anything. Days 4–45
 * show the chart — sets, reps and rest — and let the member tick items off.
 * Finishing the chart completes the journey day server-side, including, on day
 * 45, the journey itself.
 *
 * The chart carries no load column. The API records sets, reps and rest and
 * nothing else, and a weight field the server cannot store would be a box that
 * silently forgets what a member typed.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Journey, JourneyDay, WorkoutItem, WorkoutSession } from '../../src/api/types';
import { KindTag, NotConnected, TodayCard } from '../../src/components/member';
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
  const done = session?.status === 'completed';
  const history = (days.data ?? [])
    .filter((day) => day.day_number < plan.current_day)
    .sort((a, b) => b.day_number - a.day_number);

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl refreshing={workout.refreshing} onRefresh={refreshAll} tintColor={color.brand} />
        }
      >
        {error ? <Banner tone="critical" icon="alert-circle-outline">{error}</Banner> : null}

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
            <Text variant="title">Days 1–{plan.assessment_days}</Text>
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

        {/* Rest is a prescription, not a gap in the plan. */}
        {restDay && !inAssessment ? (
          <TodayCard
            kind="rest"
            title="Rest & recovery"
            subtitle={`Day ${plan.current_day} of ${plan.duration_days}. Recovery is part of the programme.`}
            cta="Nothing to do today"
            onPress={() => {}}
            disabled
          />
        ) : null}

        {/* The chart. */}
        {!restDay && !inAssessment ? (
          !session ? (
            <Card>
              <Row gap="sm">
                <KindTag kind="own_workout" />
                <Spacer />
              </Row>
              <Text variant="title">{SPLIT_LABEL[plan.split_today] ?? plan.split_today}</Text>
              <Text variant="body" tone={color.textSecondary}>
                Day {plan.current_day} of {plan.duration_days}. Start to load your chart.
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
                    label={done ? 'Completed' : `${session.completed_items} of ${session.total_items}`}
                    tone={done ? 'positive' : 'brand'}
                    solid={done}
                  />
                </Row>
                <Text variant="title">{session.split_label}</Text>
                <ProgressBar
                  value={session.total_items ? (session.completed_items / session.total_items) * 100 : 0}
                  tone={done ? 'positive' : 'brand'}
                />
              </Card>

              <Section title="Exercises">
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
              </Section>

              <NotConnected
                icon="scale-outline"
                title="Loads are not recorded yet"
                detail="GymFlow stores sets, reps and rest for each exercise. Weight per set needs a change on the server before it can be saved."
              />

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
                  Workout recorded. Day {plan.current_day} is done.
                </Banner>
              )}
            </>
          )
        ) : null}

        {/* Where today sits in the 45. */}
        <Section title="Previous days">
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
      style={({ pressed }) => [styles.exercise, pressed ? styles.exercisePressed : null]}
    >
      <Ionicons
        name={done ? 'checkmark-circle' : 'ellipse-outline'}
        size={26}
        color={done ? color.status.positive : color.textTertiary}
      />
      <Stack gap="xxs" style={styles.grow}>
        <Text variant="body" tone={done ? color.textSecondary : color.text}>
          {item.exercise}
        </Text>
        <Text variant="label" tone={color.textTertiary}>
          {item.sets} × {item.reps}
          {item.rest_seconds ? ` · ${item.rest_seconds}s rest` : ''}
        </Text>
      </Stack>
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
      <Text variant="mono" tone={color.textTertiary} style={styles.dayNumber}>
        {day.day_number}
      </Text>
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
