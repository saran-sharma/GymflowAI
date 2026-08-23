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

import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Branch, Journey, PTPackage, WhoIsInside } from '../../src/api/types';
import { LiveGym } from '../../src/components/livegym';
import { SplitBadge } from '../../src/components/programme';
import {
  Badge,
  Body,
  Card,
  DemoTag,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  LinkButton,
  PersonRow,
  ProgressBar,
  radii,
  Row,
  Screen,
  Section,
  Segmented,
  SkeletonScreen,
  StatCard,
  TappableCard,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { dayLabel } from '../../src/utils/format';

type Tab = 'journeys' | 'pt';

const TABS: { value: Tab; label: string }[] = [
  { value: 'journeys', label: '45-day journeys' },
  { value: 'pt', label: 'PT activity' },
];

export default function OwnerMembersScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('journeys');
  const journeys = useApi<Journey[]>((token) => api.journeys(token), []);
  const packages = useApi<PTPackage[]>((token) => api.ptPackages(token), []);
  const branches = useApi<Branch[]>((token) => api.listBranches(token), []);

  // "Who's inside" is scoped to one branch at a time — an owner spanning
  // several branches has to say which floor, so a picker is what "the
  // question an owner opens the page to answer" actually needs.
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const insideBranchId = selectedBranchId ?? branches.data?.[0]?.id ?? null;
  const inside = useApi<WhoIsInside>(
    (token) => api.whoIsInside(token, insideBranchId ?? undefined),
    [insideBranchId],
  );

  const active = useMemo(
    () => (journeys.data ?? []).filter((j) => j.status === 'active'),
    [journeys.data],
  );
  const finished = useMemo(
    () => (journeys.data ?? []).filter((j) => j.status === 'completed'),
    [journeys.data],
  );
  const livePackages = useMemo(
    // Effective status, not the package's own status: a lapsed membership
    // leaves the package row "active" but paused — it should not count as
    // PT activity happening on the floor today.
    () => (packages.data ?? []).filter((p) => p.effective_status === 'pt_active'),
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
              void branches.refresh();
              void inside.refresh();
            }}
            tintColor={color.brand}
          />
        }
      >
        <Row>
          <Text variant="title" style={styles.grow}>
            Members
          </Text>
          <LinkButton
            title="Add member"
            testID="add-member"
            onPress={() => router.push('/(owner)/members/new' as never)}
          />
        </Row>

        {/* Live, and marked as such — the only figure here that moves. */}
        <Section title="Currently in gym">
          {(branches.data?.length ?? 0) > 1 ? (
            <Row style={styles.branchRow}>
              {(branches.data ?? []).map((branch) => {
                const selected = branch.id === insideBranchId;
                return (
                  <Text
                    key={branch.id}
                    variant="label"
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    testID={`inside-branch-${branch.id}`}
                    tone={selected ? color.text : color.textTertiary}
                    onPress={() => setSelectedBranchId(branch.id)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    {branch.name.replace(/^SLAM\s+/i, '')}
                  </Text>
                );
              })}
            </Row>
          ) : null}
          {inside.loading ? (
            <Text variant="label" tone={color.textTertiary}>
              Checking the floor…
            </Text>
          ) : inside.error ? (
            <Text variant="label" tone={color.status.caution}>
              {inside.error.status === 400
                ? 'Pick a branch above to see who is currently in the gym.'
                : 'The floor list did not load. Pull to refresh.'}
            </Text>
          ) : inside.data ? (
            <LiveGym
              data={inside.data}
              emptyDetail="Members appear here the moment they scan in at the branch."
            />
          ) : null}
        </Section>

        <View style={styles.tiles}>
          <StatCard label="On a journey" value={active.length} colorOverride={color.brand} />
          <StatCard
            label="Completed"
            value={finished.length}
            colorOverride={color.status.positive}
          />
          <StatCard
            label="PT packages"
            value={livePackages.length}
            colorOverride={color.status.info}
          />
        </View>

        <Segmented options={TABS} value={tab} onChange={setTab} testIDPrefix="members-tab" />

        {tab === 'journeys' ? (
          <>
            <Section title={`In progress (${active.length})`}>
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
                    <TappableCard
                      key={journey.id}
                      accessibilityLabel={`Open ${journey.member_name}`}
                      testID={`member-journey-${journey.member_id}`}
                      onPress={() => router.push(`/(owner)/member/${journey.member_id}` as never)}
                    >
                      <Row style={styles.cardHead}>
                        <Text variant="heading">{journey.member_name}</Text>
                        {journey.is_demo ? <DemoTag /> : null}
                      </Row>
                      <Row style={styles.dayRow}>
                        <Text variant="mono" tone={color.textSecondary}>
                          Day {journey.current_day} / {journey.duration_days}
                        </Text>
                        <View style={styles.grow} />
                        <SplitBadge split={journey.split_today} />
                      </Row>
                      <ProgressBar value={journey.completion_pct} colorOverride={color.brand} />
                      <Text variant="label" tone={color.textTertiary}>
                        {journey.phase === 'assessment'
                          ? `Assessment ${journey.assessment_status === 'completed' ? 'done' : 'pending'} · cardio ${journey.cardio_completed}/${journey.cardio_required}`
                          : `${journey.workouts_completed} workouts recorded`}
                        {journey.assigned_trainer_name ? ` · ${journey.assigned_trainer_name}` : ''}
                      </Text>
                    </TappableCard>
                  ))
              )}
            </Section>

            {finished.length ? (
              <Section title={`Completed (${finished.length})`}>
                {finished.map((journey, index) => (
                  <PersonRow
                    key={journey.id}
                    index={index}
                    name={journey.member_name}
                    detail={`Finished ${dayLabel(journey.completed_on ?? journey.end_date)}`}
                    testID={`member-completed-${journey.member_id}`}
                    trailing={
                      <Badge
                        label={journey.pt_converted ? 'PT started' : 'Ready for PT'}
                        colorOverride={journey.pt_converted ? color.status.positive : color.brand}
                        solid={!journey.pt_converted}
                      />
                    }
                    onPress={() => router.push(`/(owner)/member/${journey.member_id}` as never)}
                  />
                ))}
              </Section>
            ) : null}
          </>
        ) : (
          <>
            <Card>
              <Eyebrow>Sessions delivered</Eyebrow>
              <Text variant="display">{sessionsDelivered}</Text>
              <Text variant="label" tone={color.textTertiary}>
                Across every package on record. A session counts only once it has been completed
                with both the member and the trainer present.
              </Text>
            </Card>

            <Section title={`Active packages (${livePackages.length})`}>
              {livePackages.length === 0 ? (
                <EmptyState
                  icon="person-outline"
                  title="No PT running"
                  detail="Packages appear here once a member converts."
                />
              ) : (
                livePackages.map((pack) => (
                  <TappableCard
                    key={pack.id}
                    accessibilityLabel={`Open ${pack.member_name ?? 'member'}`}
                    testID={`member-pt-${pack.member_id}`}
                    onPress={() => router.push(`/(owner)/member/${pack.member_id}` as never)}
                  >
                    <Row style={styles.cardHead}>
                      <Text variant="heading">{pack.member_name ?? 'Member'}</Text>
                      {pack.low_balance ? (
                        <Badge label="Low" colorOverride={color.status.caution} solid />
                      ) : null}
                    </Row>
                    <Row style={styles.dayRow}>
                      <Text variant="mono">
                        {pack.sessions_used} / {pack.sessions_total} completed
                      </Text>
                      <View style={styles.grow} />
                      <Text variant="label" tone={color.textSecondary}>
                        {pack.sessions_remaining} remaining
                      </Text>
                    </Row>
                    <ProgressBar
                      value={
                        pack.sessions_total ? (pack.sessions_used / pack.sessions_total) * 100 : 0
                      }
                      colorOverride={pack.low_balance ? color.status.caution : color.brand}
                    />
                    <Divider />
                    <Text variant="label" tone={color.textTertiary}>
                      {pack.trainer_name ?? 'No trainer assigned'} ·{' '}
                      {pack.origin === 'journey_conversion' ? 'converted from Day 45' : 'direct'}
                      {pack.expiry_date ? ` · expires ${dayLabel(pack.expiry_date)}` : ''}
                    </Text>
                  </TappableCard>
                ))
              )}
            </Section>
          </>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  tiles: { flexDirection: 'row', gap: space.sm },
  cardHead: { justifyContent: 'space-between' },
  dayRow: { gap: space.sm },
  historyRow: {
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  branchRow: { gap: space.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surfaceOverlay,
    overflow: 'hidden',
  },
  chipSelected: { borderColor: color.brand, backgroundColor: `${color.brand}22` },
});
