/**
 * One lift's detail — the real trend chart and recent sessions.
 *
 * Reached by tapping a compact row on Progress. Nothing here is invented:
 * the chart is the same `points` the compact row's delta was computed from,
 * and "recent sessions" is `myExerciseHistory`'s real `WorkoutSet` rows —
 * the same source Progress's PR figures and the workout chart's previous-
 * performance line already read from.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  ProgressionRecommendation,
  StrengthTrend,
  WorkoutSetHistory,
} from '../../src/api/types';
import { BarChart } from '../../src/components/programme';
import { RecommendationCard } from '../../src/components/intelligence';
import {
  Body,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Row,
  Screen,
  Section,
  Spacer,
  Stack,
  Text,
  color,
  useThemedStyles,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';

function buildStyles() {
  return StyleSheet.create({ grow: { flex: 1 } });
}

function weekLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : String(date.getDate());
}

export default function ProgressExerciseScreen() {
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const { exercise } = useLocalSearchParams<{ exercise: string }>();

  const trend = useApi<StrengthTrend>((token) => api.myStrengthTrend(token), []);
  const history = useApi<WorkoutSetHistory>(
    (token) => api.myExerciseHistory(exercise, token),
    [exercise],
  );
  const recommendation = useApi<ProgressionRecommendation>(
    (token) => api.myExerciseRecommendation(exercise, token),
    [exercise],
  );

  if (trend.loading || history.loading) return <Loading label="Loading your history" />;

  if (history.error) {
    const offline = history.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'Could not load this exercise'}
          detail={offline ? undefined : history.error.message}
          onRetry={history.reload}
        />
      </Screen>
    );
  }

  const thisTrend = trend.data?.exercises.find((t) => t.exercise === exercise);
  const sessions = history.data?.sessions ?? [];

  return (
    <Screen>
      <Body>
        <Stack gap="xxs">
          <Text variant="title">{exercise}</Text>
          {thisTrend && thisTrend.heaviest_kg > 0 ? (
            <Text variant="body" tone={color.textSecondary}>
              PR · {thisTrend.heaviest_kg}kg
            </Text>
          ) : null}
        </Stack>

        <Card>
          {thisTrend && thisTrend.points.length > 1 ? (
            <BarChart
              data={thisTrend.points.map((point) => ({
                label: weekLabel(point.session_date),
                value: point.top_weight_kg,
              }))}
              tint={color.status.notable}
              height={90}
              // A lift's working weight moves by a few kg on a base of tens —
              // scale across the range it actually covers, not from zero.
              baseline="auto"
            />
          ) : (
            <Text variant="label" tone={color.textTertiary}>
              One session logged so far — a trend needs at least two.
            </Text>
          )}
        </Card>

        <RecommendationCard
          data={recommendation.data}
          loading={recommendation.loading}
          error={recommendation.error}
        />

        <Section title="Recent sessions">
          {sessions.length === 0 ? (
            <EmptyState
              icon="barbell-outline"
              title="Nothing logged yet"
              detail="Sets you record for this exercise will appear here."
            />
          ) : (
            sessions.map((entry) => (
              <Row key={entry.session_id} gap="md">
                <Stack gap="xxs" style={styles.grow}>
                  <Text variant="body">
                    {entry.program_day_name ?? entry.split_label ?? 'Workout'}
                  </Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {entry.session_date}
                  </Text>
                </Stack>
                <Spacer />
                <Text variant="mono" tone={color.textSecondary}>
                  {entry.top_weight_kg}kg
                </Text>
              </Row>
            ))
          )}
        </Section>

        <Text
          variant="label"
          tone={color.brandAccent}
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(member)/progress'))}
        >
          Back to progress
        </Text>
      </Body>
    </Screen>
  );
}
