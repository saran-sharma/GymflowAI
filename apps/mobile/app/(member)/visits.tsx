/**
 * The member's attendance.
 *
 * Two sources are joined here rather than one. `/members/me/visits` knows when
 * the member was in the building; `/members/me/activity` knows what they did
 * while they were there. A row that says only "you were here for 62 minutes"
 * is a turnstile log, not a training record — so each day is labelled with the
 * kind of session it actually was.
 *
 * Read-only. Corrections go through a trainer, which is what stops a member
 * editing their own attendance.
 */

import React, { useCallback, useMemo } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { ActivityEntry, MemberHome, MemberVisit } from '../../src/api/types';
import { KindTag, type SessionKind } from '../../src/components/member';
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
  StatCard,
  StatRow,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { dayLabel, duration, timeOfDay } from '../../src/utils/format';

/** Activity kinds map onto session kinds one-for-one, minus the gym visit. */
const ACTIVITY_KIND: Partial<Record<ActivityEntry['kind'], SessionKind>> = {
  own_workout: 'own_workout',
  pt_session: 'pt_session',
  group_class: 'group_class',
};

function daysAgo(iso: string, from = new Date()): number {
  const then = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(then.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((from.getTime() - then.getTime()) / 86_400_000);
}

export default function MemberAttendanceScreen() {
  const visits = useApi<MemberVisit[]>((token) => api.memberVisits(token), []);
  const activity = useApi<ActivityEntry[]>((token) => api.memberActivity(token, 120), []);
  const home = useApi<MemberHome>((token) => api.memberHome(token), []);

  const refreshAll = useCallback(() => {
    void visits.refresh();
    void activity.refresh();
    void home.refresh();
  }, [visits, activity, home]);

  /** date → the kinds of session recorded on it. */
  const kindsByDate = useMemo(() => {
    const map = new Map<string, SessionKind[]>();
    for (const entry of activity.data ?? []) {
      const kind = ACTIVITY_KIND[entry.kind];
      if (!kind) continue;
      const existing = map.get(entry.on) ?? [];
      if (!existing.includes(kind)) map.set(entry.on, [...existing, kind]);
    }
    return map;
  }, [activity.data]);

  if (visits.loading) return <Loading label="Loading your attendance" />;

  if (visits.error) {
    const offline = visits.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your attendance'}
          detail={offline ? undefined : visits.error.message}
          onRetry={visits.reload}
        />
      </Screen>
    );
  }

  const rows = visits.data ?? [];
  const lastThirty = rows.filter((visit) => daysAgo(visit.work_date) < 30);
  const minutesThirty = lastThirty.reduce((total, visit) => total + (visit.minutes ?? 0), 0);
  const journey = home.data?.journey ?? null;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={visits.refreshing}
            onRefresh={refreshAll}
            tintColor={color.brand}
          />
        }
      >
        <Stack gap="xxs">
          <Text variant="title">Attendance</Text>
          <Text variant="body" tone={color.textSecondary}>
            Every check-in recorded at your branch.
          </Text>
        </Stack>

        <StatRow>
          <StatCard
            label="Streak"
            value={home.data?.streak_days ?? '—'}
            hint={home.data?.streak_days === 1 ? 'day' : 'days'}
            tone={(home.data?.streak_days ?? 0) > 0 ? 'positive' : 'neutral'}
            icon="flame-outline"
          />
          <StatCard
            label="Last 30 days"
            value={lastThirty.length}
            hint={lastThirty.length === 1 ? 'visit' : 'visits'}
            icon="calendar-outline"
          />
          <StatCard
            label="Time in gym"
            value={duration(minutesThirty)}
            hint="last 30 days"
            icon="time-outline"
          />
        </StatRow>

        {journey ? (
          <Card>
            <Row gap="sm">
              <Eyebrow>Programme attendance</Eyebrow>
              <Spacer />
              <Text variant="label" tone={color.textTertiary}>
                {Math.round(journey.completion_pct)}%
              </Text>
            </Row>
            <Text variant="body" tone={color.textSecondary}>
              {journey.days_completed} of {journey.duration_days} days completed ·{' '}
              {journey.workouts_completed} workouts recorded
            </Text>
          </Card>
        ) : null}

        <Section title="History">
          {rows.length === 0 ? (
            <EmptyState
              icon="footsteps-outline"
              title="No visits yet"
              detail="Your check-ins appear here the moment you scan in at the branch."
            />
          ) : (
            rows.map((visit) => {
              const kinds = kindsByDate.get(visit.work_date) ?? [];
              return (
                <Stack key={visit.work_date} gap="sm" style={styles.visit}>
                  <Row gap="sm">
                    <Text variant="body">{dayLabel(visit.work_date)}</Text>
                    <Spacer />
                    <Text variant="mono" tone={color.textSecondary}>
                      {duration(visit.minutes)}
                    </Text>
                  </Row>

                  <Row gap="lg">
                    <Text variant="label" tone={color.textTertiary}>
                      In {timeOfDay(visit.check_in_at)}
                    </Text>
                    <Text variant="label" tone={color.textTertiary}>
                      Out {timeOfDay(visit.check_out_at)}
                    </Text>
                  </Row>

                  {kinds.length ? (
                    <Row gap="sm" wrap>
                      {kinds.map((kind) => (
                        <KindTag key={kind} kind={kind} />
                      ))}
                    </Row>
                  ) : (
                    <Text variant="label" tone={color.textTertiary}>
                      Gym visit — no session recorded
                    </Text>
                  )}
                </Stack>
              );
            })
          )}
        </Section>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  visit: {
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
});
