/**
 * Member progress.
 *
 * The programme comes first because it is the thing the member is actually
 * doing; body composition sits second because it is the thing they want to
 * know. Four kinds of activity stay four kinds — a gym visit, an own workout,
 * a PT session and a group class are different commitments and are counted
 * separately.
 *
 * Body composition has a place here and nothing in it. Those numbers come from
 * InBody, which is not connected to GymFlow, and are not guessed.
 */

import React, { useCallback } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { ActivityEntry, Journey, JourneyDay, MemberActivity } from '../../src/api/types';
import { BarChart } from '../../src/components/programme';
import { NotConnected, WeekStrip, journeyToday, kindMeta } from '../../src/components/member';
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
  StatCard,
  StatRow,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { dayLabel } from '../../src/utils/format';

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

  const refreshAll = useCallback(() => {
    void journey.refresh();
    void timeline.refresh();
    void stats.refresh();
  }, [journey, timeline, stats]);

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

  const entries = timeline.data ?? [];
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

        {/* Reserved for InBody. Deliberately empty rather than filled with
            plausible-looking numbers nobody measured. */}
        <Section title="Body composition">
          <NotConnected
            icon="body-outline"
            title="No scan on file"
            detail="Weight, body fat, skeletal muscle, BMI and the change since your last scan appear here once your branch connects its InBody machine to GymFlow."
          />
        </Section>

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

        {weekly.length ? (
          <Card>
            <Eyebrow>Consistency — last {weekly.length} weeks</Eyebrow>
            <BarChart
              data={weekly.map((week) => ({
                label: dayLabel(week.week_start).split(' ')[1] ?? '',
                value: week.total,
              }))}
            />
            <Text variant="label" tone={color.textTertiary}>
              All activity per week, by week starting date.
            </Text>
          </Card>
        ) : null}

        <Section title="Recent activity">
          {entries.length === 0 ? (
            <EmptyState
              icon="footsteps-outline"
              title="Nothing recorded yet"
              detail="Your visits, workouts, PT sessions and classes appear here as they happen."
            />
          ) : (
            entries.map((entry, index) => {
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
