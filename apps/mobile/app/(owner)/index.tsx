/**
 * The Owner Dashboard — the Command Center.
 *
 * A greeting, then what matters today, in the order an owner actually reads
 * it: the operational snapshot (members, who's in the building, renewals,
 * GT/PT), then TODAY's settled figures, then ATTENTION (what needs a
 * decision), then the live floor, then a marketing pulse, then a way to
 * reach everyone. Money and Performance-by-period keep their place — real,
 * tested sections this rewrite does not remove, just reorders around.
 *
 * Three kinds of number live here and are kept visually apart, because an
 * owner acting on them acts on different timescales: what is true *right
 * now* (members inside), what is true *today* (trainers present, late), and
 * what is true *over a period* (punctuality, PT utilisation, member
 * activity). Conflating them is how a dashboard gets someone to phone a
 * trainer about a late mark from three weeks ago.
 *
 * InBody is deliberately not on this screen. Body composition is a member
 * and trainer concern; an owner running three branches does not need a scan
 * count, and a panel telling them to switch an integration on reads as a
 * setup chore for something they never asked for.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  Branch,
  BranchPerformanceResponse,
  Dashboard,
  Insight,
  MarketingDashboard,
  NeedsAttention,
  Occupancy,
  Renewals,
  RevenueSummary,
  WhoIsInside,
} from '../../src/api/types';
import { AccountAvatar } from '../../src/components/account';
import { LiveGym } from '../../src/components/livegym';
import { NotConnected } from '../../src/components/member';
import {
  AlertCard,
  Badge,
  Body,
  Card,
  Chips,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  LinkButton,
  MetricRow,
  NavRow,
  Row,
  Screen,
  SkeletonScreen,
  Section,
  Segmented,
  SkeletonCard,
  Spacer,
  StatCard,
  StatRow,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { longDate, money, percent } from '../../src/utils/format';

type Period = 'today' | 'week' | 'month';

const PERIODS = [
  { value: 'today' as const, label: 'Today' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
];

/** What each payment kind is called on screen. */
const KIND_LABEL: Record<string, string> = {
  membership: 'Membership',
  pt: 'Personal training',
  group_class: 'Group classes',
  renewal: 'Renewals',
  addon: 'Add-ons',
};

/** Insight severity → the tone vocabulary the design system already speaks. */
const SEVERITY_TONE = {
  critical: 'critical',
  warning: 'caution',
  info: 'info',
} as const;

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function OwnerDashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('week');

  const dashboard = useApi<Dashboard>((token) => api.dashboard(token), []);
  const occupancy = useApi<Occupancy[]>((token) => api.allOccupancy(token), []);
  const renewals = useApi<Renewals>((token) => api.renewalsDue(token, 30), []);
  const performance = useApi<BranchPerformanceResponse>(
    (token) => api.branchPerformance(token, period),
    [period],
  );
  // Fetching this also runs the server-side automations, so what the owner
  // sees is the current state rather than the last sweep's leftovers.
  const attention = useApi<NeedsAttention>((token) => api.needsAttention(token), []);
  const insights = useApi<Insight[]>((token) => api.insights(token), []);
  const revenue = useApi<RevenueSummary>((token) => api.revenueSummary(token, 30), []);
  const marketing = useApi<MarketingDashboard>((token) => api.marketingDashboard(token), []);
  const branches = useApi<Branch[]>((token) => api.listBranches(token), []);

  // "Currently in gym" is scoped to one branch at a time — the same reason
  // Members needs a picker for it.
  const [liveBranchId, setLiveBranchId] = useState<number | null>(null);
  const effectiveLiveBranchId = liveBranchId ?? branches.data?.[0]?.id ?? null;
  const live = useApi<WhoIsInside>(
    (token) => api.whoIsInside(token, effectiveLiveBranchId ?? undefined),
    [effectiveLiveBranchId],
  );

  const refreshAll = useCallback(() => {
    void dashboard.refresh();
    void occupancy.refresh();
    void renewals.refresh();
    void performance.refresh();
    void attention.refresh();
    void insights.refresh();
    void revenue.refresh();
    void marketing.refresh();
    void branches.refresh();
    void live.refresh();
  }, [dashboard, occupancy, renewals, performance, attention, insights, revenue, marketing, branches, live]);

  // The dashboard is the screen most likely to be stale — refresh on return.
  useFocusEffect(
    useCallback(() => {
      void dashboard.refresh();
      void occupancy.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (dashboard.loading) return <SkeletonScreen cards={4} />;

  if (dashboard.error || !dashboard.data) {
    const offline = dashboard.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your dashboard'}
          detail={
            offline
              ? undefined
              : (dashboard.error?.message ??
                'The branches are still recording. This is a problem reaching GymFlow, not with your gyms.')
          }
          onRetry={refreshAll}
        />
      </Screen>
    );
  }

  const day = dashboard.data;
  const crowds = occupancy.data ?? [];
  const inside = crowds.reduce((total, branch) => total + branch.inside, 0);
  const items = attention.data?.items ?? [];
  const observations = insights.data ?? [];
  const firstName = user?.full_name?.split(' ')[0] ?? '';
  const liveBranch = day.branches.find((b) => b.branch_id === effectiveLiveBranchId);
  const topSource = marketing.data?.sources[0];

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={dashboard.refreshing}
            onRefresh={refreshAll}
            tintColor={color.brand}
          />
        }
      >
        {/* ---------------------------------------------------- greeting */}
        <Row gap="md" align="center">
          <AccountAvatar size={40} />
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="heading" numberOfLines={1}>
              {greeting(new Date().getHours())}
              {firstName ? `, ${firstName}` : ''}
            </Text>
            <Text variant="label" tone={color.textTertiary}>
              Here&apos;s what needs your attention today.
            </Text>
          </Stack>
        </Row>

        {/* ------------------------------------------------ the snapshot */}
        <StatRow>
          <StatCard
            label="Members"
            value={day.total_members}
            icon="people-outline"
            onPress={() => router.push('/(owner)/members' as never)}
          />
          <StatCard
            label="Inside now"
            value={inside}
            hint="live"
            tone="brand"
            icon="body-outline"
          />
        </StatRow>
        <StatRow>
          <StatCard
            label="Renewals due"
            value={renewals.data?.count ?? '—'}
            hint="next 30 days"
            tone={(renewals.data?.count ?? 0) > 0 ? 'caution' : 'positive'}
            icon="refresh-outline"
            onPress={() => router.push('/(owner)/members' as never)}
          />
          <StatCard
            label="Ready for PT"
            value={attention.data?.pt_ready_count ?? '—'}
            hint="Day 45 complete"
            tone={(attention.data?.pt_ready_count ?? 0) > 0 ? 'brand' : 'neutral'}
            icon="trending-up-outline"
            onPress={() => router.push('/(owner)/members' as never)}
          />
        </StatRow>

        {/* --------------------------------------------------------- today */}
        <Section title="Today">
          <StatRow>
            <StatCard
              label="Late"
              value={day.late}
              hint="past grace"
              tone={day.late ? 'caution' : 'positive'}
              icon="time-outline"
              onPress={() => router.push('/(owner)/trainers' as never)}
            />
            <StatCard
              label="Absent"
              value={day.absent}
              hint="no check-in"
              tone={day.absent ? 'critical' : 'positive'}
              icon="close-circle-outline"
              onPress={() => router.push('/(owner)/trainers' as never)}
            />
            <StatCard
              label="Punctuality"
              value={percent(day.punctuality_pct)}
              hint="today"
              tone={day.punctuality_pct >= 90 ? 'positive' : 'caution'}
              icon="speedometer-outline"
              onPress={() => router.push('/(owner)/performance' as never)}
            />
          </StatRow>

          {marketing.data ? (
            <StatCard
              label="New members"
              value={marketing.data.new_members}
              hint={`last ${Math.max(
                1,
                Math.round(
                  (new Date(marketing.data.period_end).getTime() -
                    new Date(marketing.data.period_start).getTime()) /
                    86_400_000,
                ),
              )} days`}
              icon="person-add-outline"
              onPress={() => router.push('/(owner)/marketing' as never)}
            />
          ) : null}
        </Section>

        {/* ----------------------------------------------------- attention */}
        <Section title="Attention">
          {attention.data ? (
            <StatRow>
              <StatCard
                label="Corrections"
                value={attention.data.pending_corrections}
                hint="pending review"
                tone={attention.data.pending_corrections ? 'caution' : 'positive'}
                icon="hand-left-outline"
                onPress={() => router.push('/(owner)/corrections' as never)}
              />
              <StatCard
                label="Ready for PT"
                value={attention.data.pt_ready_count}
                hint="Day 45 complete"
                tone={attention.data.pt_ready_count ? 'brand' : 'positive'}
                icon="flag-outline"
                onPress={() => router.push('/(owner)/members' as never)}
              />
            </StatRow>
          ) : null}

          {observations.length === 0 && items.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Nothing else needs your attention"
              detail="Late trainers, renewals and quiet periods show up here as the rules find them."
            />
          ) : null}

          {observations.map((observation) => (
            <AlertCard
              key={observation.key}
              title={observation.title}
              body={observation.detail}
              tone={SEVERITY_TONE[observation.severity] ?? 'info'}
            />
          ))}

          {items.slice(0, 8).map((item) => (
            <AlertCard
              key={item.id}
              title={item.title}
              body={item.body}
              tone={SEVERITY_TONE[item.severity] ?? 'info'}
              onPress={
                item.action_route ? () => router.push(item.action_route as never) : undefined
              }
            />
          ))}
        </Section>

        {/* ---------------------------------------------------- live gym */}
        <Section title="Live gym">
          {(branches.data?.length ?? 0) > 1 ? (
            <Chips
              options={(branches.data ?? []).map((b) => ({
                value: String(b.id),
                label: b.name.replace(/^SLAM\s+/i, ''),
              }))}
              value={String(effectiveLiveBranchId ?? '')}
              onChange={(value) => setLiveBranchId(Number(value))}
              testIDPrefix="live-branch"
            />
          ) : null}

          {liveBranch ? (
            <Text variant="label" tone={color.textTertiary}>
              {liveBranch.present}/{liveBranch.scheduled} trainers present today
            </Text>
          ) : null}

          {live.loading ? (
            <SkeletonCard />
          ) : live.error ? (
            <Text variant="label" tone={color.status.caution}>
              The floor list did not load. Pull to refresh.
            </Text>
          ) : live.data ? (
            <LiveGym
              data={live.data}
              emptyDetail="Members appear here the moment they scan in at this branch."
            />
          ) : null}
        </Section>

        {/* --------------------------------------------------- marketing */}
        <Section
          title="Marketing"
          action={<LinkButton title="Detail" onPress={() => router.push('/(owner)/marketing' as never)} />}
        >
          {marketing.data && marketing.data.has_data ? (
            <StatRow>
              <StatCard
                label="New members"
                value={marketing.data.new_members}
                hint={`${longDate(marketing.data.period_start)} –`}
                icon="person-add-outline"
              />
              <StatCard
                label="Top source"
                value={topSource?.joined ?? 0}
                hint={topSource?.source_label ?? '—'}
                icon="megaphone-outline"
              />
            </StatRow>
          ) : (
            <Text variant="label" tone={color.textTertiary}>
              No new members recorded in the last 90 days.
            </Text>
          )}
        </Section>

        {/* -------------------------------------------------- broadcast */}
        <Section title="Broadcast">
          <Card>
            <NavRow
              label="Send a broadcast"
              detail="Reach members or trainers with an announcement"
              icon="megaphone-outline"
              testID="dashboard-broadcast"
              onPress={() => router.push('/(owner)/broadcast' as never)}
            />
          </Card>
        </Section>

        {/* ------------------------------------------------------- money */}
        <Section
          title="Money"
          action={
            <LinkButton
              title="Payments"
              onPress={() => router.push('/(owner)/payments' as never)}
            />
          }
        >
          <StatRow>
            <StatCard
              label="Collected"
              value={money(revenue.data?.collected_total, revenue.data?.currency)}
              hint="last 30 days"
              tone="positive"
              icon="cash-outline"
              onPress={() => router.push('/(owner)/payments' as never)}
            />
            <StatCard
              label="Outstanding"
              value={money(revenue.data?.pending_total, revenue.data?.currency)}
              hint="all unpaid"
              tone={(revenue.data?.pending_total ?? 0) > 0 ? 'caution' : 'neutral'}
              icon="alert-circle-outline"
              onPress={() => router.push('/(owner)/payments' as never)}
            />
          </StatRow>

          {revenue.data && revenue.data.lines.length ? (
            <Card>
              <Eyebrow>By what was sold</Eyebrow>
              <Divider />
              {revenue.data.lines.map((line) => (
                <Row key={line.kind} gap="sm">
                  <Text variant="label" tone={color.textSecondary} style={styles.grow}>
                    {KIND_LABEL[line.kind] ?? line.kind}
                  </Text>
                  <Text variant="mono" tone={color.status.positive}>
                    {money(line.collected, revenue.data?.currency)}
                  </Text>
                  {line.pending > 0 ? (
                    <Text variant="mono" tone={color.status.caution}>
                      +{money(line.pending, revenue.data?.currency)}
                    </Text>
                  ) : null}
                </Row>
              ))}
              <Text variant="label" tone={color.textTertiary}>
                Collected in green, still owed in amber.
              </Text>
            </Card>
          ) : revenue.loading ? (
            <SkeletonCard />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title="No payments recorded yet"
              detail="Charges raised at the front desk appear here."
            />
          )}
        </Section>

        {/* ----------------------------------------------- performance */}
        <Section
          title="Performance"
          action={
            <LinkButton
              title="Detail"
              onPress={() => router.push('/(owner)/performance' as never)}
            />
          }
        >
          <Segmented options={PERIODS} value={period} onChange={setPeriod} testIDPrefix="period" />

          {performance.loading ? (
            <SkeletonCard />
          ) : performance.error ? (
            <Text variant="label" tone={color.status.caution}>
              Performance did not load. Pull to refresh.
            </Text>
          ) : (
            (performance.data?.branches ?? []).map((branch) => (
              <Card key={branch.branch_id}>
                <Row gap="sm">
                  <Eyebrow>{branch.branch_name}</Eyebrow>
                  <Spacer />
                  <Text variant="label" tone={color.textTertiary}>
                    {branch.members_inside} inside
                  </Text>
                </Row>
                <Divider />
                <MetricRow
                  label="Punctuality"
                  value={percent(branch.punctuality.value)}
                  progress={branch.punctuality.value}
                  tone={branch.punctuality.value >= 90 ? 'positive' : 'caution'}
                />
                <MetricRow
                  label="Attendance"
                  value={percent(branch.attendance.value)}
                  progress={branch.attendance.value}
                  tone={branch.attendance.value >= 90 ? 'positive' : 'caution'}
                />
                <MetricRow
                  label="PT utilisation"
                  value={percent(branch.pt_utilisation.value)}
                  progress={branch.pt_utilisation.value}
                />
                <MetricRow
                  label="Member activity"
                  value={percent(branch.member_activity.value)}
                  progress={branch.member_activity.value}
                />
              </Card>
            ))
          )}

          {performance.data?.note ? (
            <Text variant="label" tone={color.textTertiary}>
              {performance.data.note}
            </Text>
          ) : null}
        </Section>

        {/* One thing this dashboard still cannot draw, said plainly. */}
        <NotConnected
          icon="stats-chart-outline"
          title="Monthly trend charts"
          detail="Revenue, membership growth and PT bookings by month need history GymFlow does not store yet. Punctuality, attendance and PT utilisation are shown above as period figures instead."
        />
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
