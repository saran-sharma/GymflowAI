/**
 * The Owner Dashboard.
 *
 * Three kinds of number live here and are kept visually apart, because an
 * owner acting on them acts on different timescales: what is true *right now*
 * (members inside), what is true *today* (trainers present, late), and what is
 * true *over a period* (punctuality, PT utilisation, member activity).
 * Conflating them is how a dashboard gets someone to phone a trainer about a
 * late mark from three weeks ago.
 *
 * Money is its own section rather than a tile among the operational ones,
 * because collected and outstanding answer to different clocks: collected is
 * bounded by the window, and outstanding never is — an invoice from March that
 * is still unpaid is this month's problem.
 *
 * InBody is deliberately not on this screen at all. Body composition is a
 * member and trainer concern; an owner running three branches does not need a
 * scan count, and a panel telling them to switch an integration on reads as a
 * setup chore for something they never asked for.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  BranchPerformanceResponse,
  Dashboard,
  Insight,
  NeedsAttention,
  Occupancy,
  Renewals,
  RevenueSummary,
} from '../../src/api/types';
import { NotConnected } from '../../src/components/member';
import {
  AlertCard,
  Badge,
  Body,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  HeroCard,
  LinkButton,
  MetricRow,
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

export default function OwnerDashboardScreen() {
  const router = useRouter();
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

  const refreshAll = useCallback(() => {
    void dashboard.refresh();
    void occupancy.refresh();
    void renewals.refresh();
    void performance.refresh();
    void attention.refresh();
    void insights.refresh();
    void revenue.refresh();
  }, [dashboard, occupancy, renewals, performance, attention, insights, revenue]);

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
  const capacity = crowds.reduce((total, branch) => total + branch.capacity, 0);
  const items = attention.data?.items ?? [];
  const observations = insights.data ?? [];

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
        {/*
          Right now, and only right now. The ring is occupancy against capacity
          because that is the single figure an owner opens this screen for; the
          three under it are the rest of the live picture. Everything settled
          starts at "Today" below, and the "Live" badge is what keeps the two
          from being read as one number.
        */}
        <HeroCard
          testID="owner-hero"
          eyebrow="Right now"
          title={`${inside} inside`}
          subtitle={`${longDate(day.work_date)} · ${day.branches.length} branch${
            day.branches.length === 1 ? '' : 'es'
          }`}
          status={{ label: 'Live', tone: 'critical', solid: true }}
          ring={
            capacity
              ? {
                  value: (inside / capacity) * 100,
                  label: `${Math.round((inside / capacity) * 100)}%`,
                  caption: 'full',
                }
              : undefined
          }
          metrics={[
            {
              label: 'Present',
              value: `${day.present}/${day.total_trainers}`,
              unit: 'trainers',
              progress: day.total_trainers ? (day.present / day.total_trainers) * 100 : 0,
              tone: day.present >= day.scheduled ? 'positive' : 'caution',
            },
            { label: 'Scheduled', value: day.scheduled, unit: 'shifts' },
            {
              label: 'Capacity',
              value: capacity ? capacity : '—',
              unit: capacity ? 'members' : 'not set',
            },
          ]}
          onPress={() => router.push('/(owner)/members' as never)}
        />

        {/* Today. Settled counts for the current business day. */}
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

          <StatCard
            label="Renewals due"
            value={renewals.data?.count ?? '—'}
            hint="next 30 days"
            tone={(renewals.data?.count ?? 0) > 0 ? 'caution' : 'neutral'}
            icon="refresh-outline"
            onPress={() => router.push('/(owner)/members' as never)}
          />
        </Section>

        {/* Money. Collected is bounded by the window; outstanding never is. */}
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

        {/* Over a period. The only place a comparison is shown. */}
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

        {/* Insights: deterministic, from the rule-based provider. No model. */}
        <Section title="Insights" action={<Badge label="Rule-based" tone="neutral" />}>
          {observations.length === 0 && items.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Nothing needs your attention"
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

          {attention.data ? (
            <Row gap="md">
              <Text variant="label" tone={color.textTertiary} style={styles.grow}>
                {attention.data.pt_ready_count} ready for PT · {attention.data.pending_corrections}{' '}
                correction
                {attention.data.pending_corrections === 1 ? '' : 's'} pending
              </Text>
            </Row>
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
