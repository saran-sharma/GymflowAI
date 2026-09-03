/**
 * Member progress.
 *
 * The programme comes first because it is the thing the member is actually
 * doing; body composition sits second because it is the thing they want to
 * know. Four kinds of activity stay four kinds — a gym visit, an own workout,
 * a PT session and a group class are different commitments and are counted
 * separately.
 *
 * Body composition reads from the same InBody pipeline as everywhere else:
 * real scans only, via `body_composition_service` — no fabricated numbers,
 * no interpolated points between two real measurements.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  ActivityEntry,
  BodyCompositionHistory,
  ExerciseTrend,
  Journey,
  JourneyDay,
  MemberActivity,
  MemberIntelligence,
  StrengthTrend,
  WeeklySummary,
} from '../../src/api/types';
import { BarChart } from '../../src/components/programme';
import {
  MemberIntelligenceSection,
  WeeklySummaryCard,
} from '../../src/components/intelligence';
import {
  BodyCompositionSection,
  WeekStrip,
  journeyToday,
  kindMeta,
} from '../../src/components/member';
import {
  Body,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Row,
  Screen,
  Section,
  Spacer,
  Staggered,
  StatCard,
  StatRow,
  Stack,
  TappableCard,
  Text,
  color,
  space,
  useThemedStyles,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useShowMore } from '../../src/hooks/useShowMore';
import { dayLabel } from '../../src/utils/format';

/**
 * The change since the previous logged session, from real `points` only —
 * never a stored or invented figure. Null (no arrow shown) for a lift with
 * fewer than two sessions, since one point has nothing to compare against.
 */
function recentDelta(trend: ExerciseTrend): number | null {
  if (trend.points.length < 2) return null;
  const last = trend.points[trend.points.length - 1].top_weight_kg;
  const previous = trend.points[trend.points.length - 2].top_weight_kg;
  return last - previous;
}

/**
 * A bar's x-axis caption on the consistency chart: the week-starting day of
 * month, e.g. "17".
 *
 * This used to be `dayLabel(...).split(' ')[1]`, which reads a fixed word
 * position out of a string built for a sentence, not a table column.
 * `dayLabel` orders its parts by locale — day-then-month in some, month-then-
 * day in others (`Intl` renders it "Mon, Aug 17" in this app's default
 * locale) — so that split pulled out the month abbreviation instead of the
 * day number in most locales the app actually runs in, repeating the same
 * caption across every bar within a month and leaving the chart's x-axis
 * telling the member nothing about which week is which.
 */
function weekLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : String(date.getDate());
}

/** The timeline's kinds, mapped onto the shared session vocabulary. */
// `hue` is a getter on every entry — this object is built once at module
// scope, and a plain field would freeze whatever `color.status.X` (or
// `kindMeta.X.hue`, itself a getter) resolved to at that instant.
const TIMELINE: Record<ActivityEntry['kind'], { label: string; hue: string }> = {
  gym_visit: {
    label: 'Gym visit',
    get hue() {
      return color.status.info;
    },
  },
  own_workout: {
    label: kindMeta.own_workout.label,
    get hue() {
      return kindMeta.own_workout.hue;
    },
  },
  pt_session: {
    label: kindMeta.pt_session.label,
    get hue() {
      return kindMeta.pt_session.hue;
    },
  },
  group_class: {
    label: kindMeta.group_class.label,
    get hue() {
      return kindMeta.group_class.hue;
    },
  },
};

export default function MemberProgressScreen() {
  const router = useRouter();
  const journey = useApi<Journey | null>((token) => api.myJourney(token), []);
  const days = useApi<JourneyDay[]>((token) => api.myJourneyDays(token), []);
  const timeline = useApi<ActivityEntry[]>((token) => api.memberActivity(token, 40), []);
  const stats = useApi<MemberActivity | null>(async (token) => {
    const me = await api.memberMe(token);
    return api.memberActivityStats(me.member_id, token, 8);
  }, []);
  const strength = useApi<StrengthTrend>((token) => api.myStrengthTrend(token), []);
  const bodyComposition = useApi<BodyCompositionHistory>(
    (token) => api.myBodyComposition(token),
    [],
  );
  const intel = useApi<MemberIntelligence>((token) => api.myIntelligence(token), []);
  const weeklySummary = useApi<WeeklySummary>((token) => api.myWeeklySummary(token), []);

  const refreshAll = useCallback(() => {
    void journey.refresh();
    void timeline.refresh();
    void stats.refresh();
    void strength.refresh();
    void bodyComposition.refresh();
    void intel.refresh();
    void weeklySummary.refresh();
  }, [journey, timeline, stats, strength, bodyComposition, intel, weeklySummary]);

  const entries = timeline.data ?? [];
  // Called unconditionally, before either early return below, so this
  // component never breaks the rule that hooks run in the same order every
  // render.
  const recent = useShowMore(entries, 3);
  const strengthRows = useShowMore(strength.data?.exercises ?? [], 4);
  const styles = useThemedStyles(buildStyles);

  if (timeline.loading && stats.loading) return <Loading label="Loading your progress" />;

  if (timeline.error) {
    const offline = timeline.error.code === OFFLINE_CODE;
    return (
      <Screen background="member" backgroundIntensity="subtle">
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your progress'}
          detail={offline ? undefined : timeline.error.message}
          onRetry={refreshAll}
        />
      </Screen>
    );
  }

  const totals = stats.data?.totals;
  const weekly = stats.data?.weekly ?? [];
  const plan = journey.data;

  return (
    <Screen background="member" backgroundIntensity="subtle">
      <Body
        refreshControl={
          <RefreshControl
            refreshing={timeline.refreshing}
            onRefresh={refreshAll}
            tintColor={color.brand}
          />
        }
      >
        <Stack gap="xxs">
          <Text variant="title">Progress</Text>
          <Text variant="body" tone={color.textSecondary}>
            Where you are in the programme, and everything you have recorded.
          </Text>
        </Stack>

        <Staggered>
        {plan ? <WeekStrip days={days.data ?? []} today={journeyToday(plan)} /> : null}

        <MemberIntelligenceSection
          data={intel.data}
          loading={intel.loading}
          error={intel.error}
          onRetry={() => void intel.reload()}
          onNavigate={(route) => router.push(route as never)}
        />

        <WeeklySummaryCard
          data={weeklySummary.data}
          loading={weeklySummary.loading}
          error={weeklySummary.error}
        />

        {totals ? (
          <Section title="Your activity">
            <StatRow>
              <StatCard
                label="Gym visits"
                value={totals.gym_visits}
                colorOverride={color.status.info}
              />
              <StatCard
                label="Own workouts"
                value={totals.own_workouts}
                colorOverride={kindMeta.own_workout.hue}
              />
            </StatRow>
            <StatRow>
              <StatCard
                label="PT sessions"
                value={totals.pt_sessions}
                colorOverride={kindMeta.pt_session.hue}
              />
              <StatCard
                label="Group classes"
                value={totals.group_classes}
                colorOverride={kindMeta.group_class.hue}
              />
            </StatRow>
          </Section>
        ) : null}

        {strength.data && strength.data.exercises.length > 0 ? (
          <Section title="Strength" action={strengthRows.toggle}>
            {strengthRows.visible.map((trend) => (
              <StrengthRow
                key={trend.exercise}
                trend={trend}
                onPress={() =>
                  router.push({
                    pathname: '/(member)/progress-exercise',
                    params: { exercise: trend.exercise },
                  })
                }
              />
            ))}
          </Section>
        ) : null}

        {bodyComposition.data ? (
          <Section title="Body composition">
            <BodyCompositionSection history={bodyComposition.data} />
          </Section>
        ) : null}

        <Section title="Progress photos">
          <Pressable
            onPress={() => router.push('/(member)/progress-photos' as never)}
            testID="progress-photos-link"
          >
            <Card>
              <Row gap="sm">
                <Ionicons name="camera-outline" size={20} color={color.textSecondary} />
                <Text variant="heading">Progress photos</Text>
                <Spacer />
                <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
              </Row>
              <Text variant="label" tone={color.textTertiary}>
                Private front / side / back photos, a timeline, and a before-and-after you can share.
              </Text>
            </Card>
          </Pressable>
        </Section>

        {weekly.length ? (
          <Card>
            <Eyebrow>Consistency — last {weekly.length} weeks</Eyebrow>
            <BarChart
              data={weekly.map((week) => ({
                label: weekLabel(week.week_start),
                value: week.total,
              }))}
            />
            <Text variant="label" tone={color.textTertiary}>
              All activity per week, by week starting date.
            </Text>
          </Card>
        ) : null}

        <Section title="Recent activity" action={recent.toggle}>
          {entries.length === 0 ? (
            <EmptyState
              icon="footsteps-outline"
              title="Nothing recorded yet"
              detail="Your visits, workouts, PT sessions and classes appear here as they happen."
            />
          ) : (
            recent.visible.map((entry, index) => {
              const meta = TIMELINE[entry.kind];
              return (
                <Row
                  key={`${entry.kind}-${entry.reference_id}-${index}`}
                  gap="md"
                  style={styles.entry}
                >
                  <View style={[styles.rule, { backgroundColor: meta.hue }]} />
                  <Stack gap="xxs" style={styles.grow}>
                    <Text variant="body">{meta.label}</Text>
                    <Text variant="label" tone={color.textTertiary}>
                      {dayLabel(entry.on)}
                      {entry.detail ? ` · ${entry.detail}` : ''}
                    </Text>
                  </Stack>
                </Row>
              );
            })
          )}
        </Section>
        </Staggered>
      </Body>
    </Screen>
  );
}

/**
 * One lift, compact: name, PR, and the change since the previous session —
 * never a chart. Tapping opens the real trend chart and recent sessions
 * (`progress-exercise`) for a member who wants more than a glance.
 */
function StrengthRow({ trend, onPress }: { trend: ExerciseTrend; onPress: () => void }) {
  const styles = useThemedStyles(buildStyles);
  const delta = recentDelta(trend);
  const deltaTone =
    delta === null
      ? color.textTertiary
      : delta > 0
        ? color.status.positive
        : delta < 0
          ? color.textSecondary
          : color.textTertiary;
  const deltaLabel =
    delta === null ? '' : delta > 0 ? `↑ +${delta}kg` : delta < 0 ? `↓ ${delta}kg` : '→ 0kg';

  return (
    <TappableCard onPress={onPress} accessibilityLabel={`Open ${trend.exercise} trend`}>
      <Row gap="sm">
        <Text variant="body" style={styles.grow}>
          {trend.exercise}
        </Text>
      </Row>
      <Row gap="sm">
        <Text variant="label" tone={color.textSecondary}>
          {trend.heaviest_kg > 0 ? `PR · ${trend.heaviest_kg}kg` : 'No PR yet'}
        </Text>
        <Spacer />
        {delta !== null ? (
          <Text variant="label" tone={deltaTone}>
            {deltaLabel}
          </Text>
        ) : null}
      </Row>
    </TappableCard>
  );
}

function buildStyles() {
  return StyleSheet.create({
    grow: { flex: 1 },
    entry: {
      paddingVertical: space.sm,
      borderBottomWidth: 1,
      borderBottomColor: color.border,
    },
    rule: { width: 3, alignSelf: 'stretch', minHeight: 34, borderRadius: 2 },
  });
}
