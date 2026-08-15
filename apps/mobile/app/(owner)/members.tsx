/**
 * Member journeys and PT activity across the owner's branches.
 *
 * Two lists that answer two different questions — how far through the 45-day
 * programme is everyone, and what PT is actually being delivered — composed
 * from the journey and package endpoints rather than a separate report.
 *
 * Who is in the building right now sits above both, because it is the only
 * thing on this screen that changes minute to minute — and it is the question
 * an owner opens the page to answer.
 *
 * This is also where a `/owner/member/...` alert lands.
 */

import React, { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Journey, PTPackage, WhoIsInside } from '../../src/api/types';
import { LiveGym } from '../../src/components/livegym';
import { DemoTag, SectionHeader, SplitBadge } from '../../src/components/programme';
import {
  Badge,
  Body,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  Meter,
  Row,
  Screen,
  StatTile,
  Txt,
} from '../../src/components/ui';
import { Segmented, SkeletonScreen } from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { colors, spacing } from '../../src/theme';
import { dayLabel } from '../../src/utils/format';

type Tab = 'journeys' | 'pt';

const TABS: { value: Tab; label: string }[] = [
  { value: 'journeys', label: '45-day journeys' },
  { value: 'pt', label: 'PT activity' },
];

export default function OwnerMembersScreen() {
  const [tab, setTab] = useState<Tab>('journeys');
  const journeys = useApi<Journey[]>((token) => api.journeys(token), []);
  const packages = useApi<PTPackage[]>((token) => api.ptPackages(token), []);
  const inside = useApi<WhoIsInside>((token) => api.whoIsInside(token), []);

  const active = useMemo(
    () => (journeys.data ?? []).filter((j) => j.status === 'active'),
    [journeys.data],
  );
  const finished = useMemo(
    () => (journeys.data ?? []).filter((j) => j.status === 'completed'),
    [journeys.data],
  );
  const livePackages = useMemo(
    () => (packages.data ?? []).filter((p) => p.status === 'active'),
    [packages.data],
  );

  if (journeys.loading && packages.loading) return <SkeletonScreen cards={4} />;
  if (journeys.error && packages.error) {
    const offline = journeys.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load members'}
          detail={offline ? undefined : journeys.error?.message}
          onRetry={journeys.reload}
        />
      </Screen>
    );
  }

  const sessionsDelivered = (packages.data ?? []).reduce((sum, p) => sum + p.sessions_used, 0);

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={journeys.refreshing}
            onRefresh={() => {
              void journeys.refresh();
              void packages.refresh();
              void inside.refresh();
            }}
            tintColor={colors.brand}
          />
        }
      >
        <Txt variant="title">Members</Txt>

        {/* Live, and marked as such — the only figure here that moves. */}
        <SectionHeader title="Currently in gym" />
        {inside.loading ? (
          <Txt variant="label" color={colors.textFaint}>
            Checking the floor…
          </Txt>
        ) : inside.error ? (
          <Txt variant="label" color={colors.late}>
            {inside.error.status === 400
              ? 'Choose a branch to see who is currently in the gym.'
              : 'The floor list did not load. Pull to refresh.'}
          </Txt>
        ) : inside.data ? (
          <LiveGym
            data={inside.data}
            emptyDetail="Members appear here the moment they scan in at the branch."
          />
        ) : null}

        <View style={styles.tiles}>
          <StatTile label="On a journey" value={active.length} accent={colors.brand} />
          <StatTile label="Completed" value={finished.length} accent={colors.onTime} />
          <StatTile label="PT packages" value={livePackages.length} accent={colors.info} />
        </View>

        <Segmented options={TABS} value={tab} onChange={setTab} testIDPrefix="members-tab" />

        {tab === 'journeys' ? (
          <>
            <SectionHeader title={`In progress (${active.length})`} />
            {active.length === 0 ? (
              <EmptyState
                icon="walk-outline"
                title="Nobody on a journey"
                detail="Members appear here once a trainer starts their 45-day programme."
              />
            ) : (
              active
                .slice()
                .sort((a, b) => b.current_day - a.current_day)
                .map((journey) => (
                  <Card key={journey.id}>
                    <Row style={styles.cardHead}>
                      <Txt variant="heading">{journey.member_name}</Txt>
                      {journey.is_demo ? <DemoTag /> : null}
                    </Row>
                    <Row style={styles.dayRow}>
                      <Txt variant="mono" color={colors.textMuted}>
                        Day {journey.current_day} / {journey.duration_days}
                      </Txt>
                      <View style={styles.grow} />
                      <SplitBadge split={journey.split_today} />
                    </Row>
                    <Meter value={journey.completion_pct} color={colors.brand} />
                    <Txt variant="label" color={colors.textFaint}>
                      {journey.phase === 'assessment'
                        ? `Assessment ${journey.assessment_status === 'completed' ? 'done' : 'pending'} · cardio ${journey.cardio_completed}/${journey.cardio_required}`
                        : `${journey.workouts_completed} workouts recorded`}
                      {journey.assigned_trainer_name ? ` · ${journey.assigned_trainer_name}` : ''}
                    </Txt>
                  </Card>
                ))
            )}

            {finished.length ? (
              <>
                <SectionHeader title={`Completed (${finished.length})`} />
                {finished.map((journey) => (
                  <Row key={journey.id} style={styles.historyRow}>
                    <View style={styles.grow}>
                      <Txt variant="body">{journey.member_name}</Txt>
                      <Txt variant="label" color={colors.textFaint}>
                        Finished {dayLabel(journey.completed_on ?? journey.end_date)}
                      </Txt>
                    </View>
                    <Badge
                      label={journey.pt_converted ? 'PT started' : 'Ready for PT'}
                      color={journey.pt_converted ? colors.onTime : colors.brand}
                      filled={!journey.pt_converted}
                    />
                  </Row>
                ))}
              </>
            ) : null}
          </>
        ) : (
          <>
            <Card>
              <Eyebrow>Sessions delivered</Eyebrow>
              <Txt variant="display">{sessionsDelivered}</Txt>
              <Txt variant="label" color={colors.textFaint}>
                Across every package on record. A session counts only once it has been completed
                with both the member and the trainer present.
              </Txt>
            </Card>

            <SectionHeader title={`Active packages (${livePackages.length})`} />
            {livePackages.length === 0 ? (
              <EmptyState
                icon="person-outline"
                title="No PT running"
                detail="Packages appear here once a member converts."
              />
            ) : (
              livePackages.map((pack) => (
                <Card key={pack.id}>
                  <Row style={styles.cardHead}>
                    <Txt variant="heading">{pack.member_name ?? 'Member'}</Txt>
                    {pack.low_balance ? <Badge label="Low" color={colors.late} filled /> : null}
                  </Row>
                  <Row style={styles.dayRow}>
                    <Txt variant="mono">
                      {pack.sessions_used} / {pack.sessions_total} completed
                    </Txt>
                    <View style={styles.grow} />
                    <Txt variant="label" color={colors.textMuted}>
                      {pack.sessions_remaining} remaining
                    </Txt>
                  </Row>
                  <Meter
                    value={
                      pack.sessions_total ? (pack.sessions_used / pack.sessions_total) * 100 : 0
                    }
                    color={pack.low_balance ? colors.late : colors.brand}
                  />
                  <Divider />
                  <Txt variant="label" color={colors.textFaint}>
                    {pack.trainer_name ?? 'No trainer assigned'} ·{' '}
                    {pack.origin === 'journey_conversion' ? 'converted from Day 45' : 'direct'}
                    {pack.expiry_date ? ` · expires ${dayLabel(pack.expiry_date)}` : ''}
                  </Txt>
                </Card>
              ))
            )}
          </>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  cardHead: { justifyContent: 'space-between' },
  dayRow: { gap: spacing.sm },
  historyRow: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
