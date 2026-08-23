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

import React, { useCallback } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  ActivityEntry,
  BodyCompositionHistory,
  Journey,
  JourneyDay,
  MemberActivity,
  StrengthTrend,
} from '../../src/api/types';
import { BarChart } from '../../src/components/programme';
import {
  BodyCompositionSection,
  WeekStrip,
  journeyToday,
  kindMeta,
} from '../../src/components/member';
import {
  Badge,
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
  StatCard,
  StatRow,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useShowMore } from '../../src/hooks/useShowMore';
import { dayLabel } from '../../src/utils/format';

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
const TIMELINE: Record<ActivityEntry['kind'], { label: string; hue: string }> = {
  gym_visit: { label: 'Gym visit', hue: color.status.info },
  own_workout: { label: kindMeta.own_workout.label, hue: kindMeta.own_workout.hue },
  pt_session: { label: kindMeta.pt_session.label, hue: kindMeta.pt_session.hue },
  group_class: { label: kindMeta.group_class.label, hue: kindMeta.group_class.hue },
};

export default function MemberProgressScreen() {
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

  const refreshAll = useCallback(() => {
    void journey.refresh();
    void timeline.refresh();
    void stats.refresh();
    void strength.refresh();
    void bodyComposition.refresh();
  }, [journey, timeline, stats, strength, bodyComposition]);

  const entries = timeline.data ?? [];
  // Called unconditionally, before either early return below, so this
  // component never breaks the rule that hooks run in the same order every
  // render.
  const recent = useShowMore(entries, 3);

  if (timeline.loading && stats.loading) return <Loading label="Loading your progress" />;

  if (timeline.error) {
    const offline = timeline.error.code === OFFLINE_CODE;
    return (
      <Screen>
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
    <Screen>
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

        {plan ? <WeekStrip days={days.data ?? []} today={journeyToday(plan)} /> : null}

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
          <Section title="Strength">
            {strength.data.exercises.map((trend) => (
              <Card key={trend.exercise}>
                <Row gap="sm">
                  <Text variant="body" style={styles.grow}>
                    {trend.exercise}
                  </Text>
                  {trend.is_recent_pr ? <Badge label="PR" tone="brand" solid /> : null}
                  <Spacer />
                  <Text variant="label" tone={color.textTertiary}>
                    {trend.heaviest_kg > 0 ? `best ${trend.heaviest_kg}kg` : ''}
                  </Text>
                </Row>
                {trend.points.length > 1 ? (
                  <BarChart
                    data={trend.points.map((point) => ({
                      label: weekLabel(point.session_date),
                      value: point.top_weight_kg,
                    }))}
                    tint={color.status.notable}
                    height={60}
                  />
                ) : (
                  <Text variant="label" tone={color.textTertiary}>
                    One session logged so far — a trend needs at least two.
                  </Text>
                )}
              </Card>
            ))}
          </Section>
        ) : null}

        {bodyComposition.data ? (
          <Section title="Body composition">
            <BodyCompositionSection history={bodyComposition.data} />
          </Section>
        ) : null}

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
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  entry: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  rule: { width: 3, alignSelf: 'stretch', minHeight: 34, borderRadius: 2 },
});
