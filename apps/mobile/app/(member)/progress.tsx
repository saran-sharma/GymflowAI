/**
 * Member progress.
 *
 * Four kinds of activity stay four kinds: a gym visit, an own workout, a PT
 * session and a group class are counted and shown separately. Body
 * composition has a place reserved on this screen and nothing in it — those
 * numbers come from InBody, which is not connected, and are not guessed here.
 */

import React, { useCallback } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import * as api from '../../src/api/endpoints';
import type { ActivityEntry, Journey, MemberActivity } from '../../src/api/types';
import { BarChart, DayCounter, SectionHeader } from '../../src/components/programme';
import {
  Badge,
  Body,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Row,
  Screen,
  StatTile,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { colors, spacing } from '../../src/theme';
import { dayLabel } from '../../src/utils/format';

const KIND_META: Record<ActivityEntry['kind'], { label: string; color: string }> = {
  gym_visit: { label: 'GYM VISIT', color: colors.info },
  own_workout: { label: 'OWN WORKOUT', color: colors.brand },
  pt_session: { label: 'PT SESSION', color: colors.onTime },
  group_class: { label: 'GROUP CLASS', color: '#A855F7' },
};

export default function MemberProgressScreen() {
  const journey = useApi<Journey | null>((token) => api.myJourney(token), []);
  const timeline = useApi<ActivityEntry[]>((token) => api.memberActivity(token, 40), []);
  const stats = useApi<MemberActivity | null>(
    async (token) => {
      const me = await api.memberMe(token);
      return api.memberActivityStats(me.member_id, token, 8);
    },
    [],
  );

  const refreshAll = useCallback(() => {
    void journey.refresh();
    void timeline.refresh();
    void stats.refresh();
  }, [journey, timeline, stats]);

  if (timeline.loading && stats.loading) return <Loading label="Loading your progress" />;
  if (timeline.error) {
    return (
      <Screen>
        <ErrorState detail={timeline.error.message} onRetry={refreshAll} />
      </Screen>
    );
  }

  const entries = timeline.data ?? [];
  const totals = stats.data?.totals;
  const weekly = stats.data?.weekly ?? [];

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={timeline.refreshing}
            onRefresh={refreshAll}
            tintColor={colors.brand}
          />
        }
      >
        {journey.data ? (
          <Card>
            <Eyebrow>45-day journey</Eyebrow>
            <DayCounter
              currentDay={journey.data.current_day}
              totalDays={journey.data.duration_days}
              phase={journey.data.phase}
            />
            <Divider />
            <Row style={styles.detail}>
              <Txt variant="label" color={colors.textMuted}>
                Workouts completed
              </Txt>
              <Txt variant="mono">{journey.data.workouts_completed}</Txt>
            </Row>
            <Row style={styles.detail}>
              <Txt variant="label" color={colors.textMuted}>
                Days completed
              </Txt>
              <Txt variant="mono">
                {journey.data.days_completed} / {journey.data.duration_days}
              </Txt>
            </Row>
          </Card>
        ) : null}

        {totals ? (
          <>
            <SectionHeader title="Your activity" />
            <View style={styles.tiles}>
              <StatTile label="Gym visits" value={totals.gym_visits} accent={colors.info} />
              <StatTile label="Own workouts" value={totals.own_workouts} accent={colors.brand} />
            </View>
            <View style={styles.tiles}>
              <StatTile label="PT sessions" value={totals.pt_sessions} accent={colors.onTime} />
              <StatTile label="Group classes" value={totals.group_classes} accent="#A855F7" />
            </View>
          </>
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
            <Txt variant="label" color={colors.textFaint}>
              All activity per week, by week starting date.
            </Txt>
          </Card>
        ) : null}

        {/* Reserved for InBody. Deliberately empty rather than filled with
            plausible-looking numbers nobody measured. */}
        <Card>
          <Row style={styles.cardHead}>
            <Eyebrow>Body composition</Eyebrow>
            <Badge label="Coming soon" color={colors.textFaint} />
          </Row>
          <Txt variant="body" color={colors.textMuted}>
            Weight, body fat, muscle mass, BMI, visceral fat, BMR and body water will appear here
            once your branch's InBody scans are connected to GymFlow.
          </Txt>
        </Card>

        <SectionHeader title="Recent activity" />
        {entries.length === 0 ? (
          <EmptyState
            icon="footsteps-outline"
            title="Nothing recorded yet"
            detail="Your visits, workouts, PT sessions and classes will show up here."
          />
        ) : (
          entries.map((entry, index) => {
            const meta = KIND_META[entry.kind];
            return (
              <Row key={`${entry.kind}-${entry.reference_id}-${index}`} style={styles.entry}>
                <View style={[styles.entryBar, { backgroundColor: meta.color }]} />
                <View style={styles.entryText}>
                  <Txt variant="label" color={colors.textFaint}>
                    {dayLabel(entry.on)}
                  </Txt>
                  <Txt variant="body">
                    {meta.label}
                    {entry.detail ? ` — ${entry.detail}` : ''}
                  </Txt>
                </View>
              </Row>
            );
          })
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHead: { justifyContent: 'space-between' },
  detail: { justifyContent: 'space-between', paddingVertical: 3 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  entry: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  entryBar: { width: 3, alignSelf: 'stretch', minHeight: 34, borderRadius: 2 },
  entryText: { flex: 1, gap: 2 },
});
