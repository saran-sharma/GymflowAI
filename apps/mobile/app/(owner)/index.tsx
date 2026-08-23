/**
 * The Owner Dashboard — the Command Center.
 *
 * Answers three questions, in this order, and nothing else competes with
 * them for the first screen: how is the business doing, what needs my
 * attention, what should I do about it. Everything below KEY NUMBERS is
 * either a name to act on or a door to somewhere with more detail — never a
 * second copy of a number already shown above.
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
 *
 * Who is currently on the floor already has a home — Members' "Currently in
 * gym" — so this screen states the count and sends anyone who wants the
 * names there, rather than keeping a second, thinner copy of that list.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  AlertSeverity,
  Branch,
  BranchPerformanceResponse,
  Dashboard,
  Insight,
  MarketingDashboard,
  NeedsAttention,
  Occupancy,
  Renewals,
  RevenueSummary,
} from '../../src/api/types';
import { AccountAvatar } from '../../src/components/account';
import { NotConnected } from '../../src/components/member';
import {
  Body,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
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
  toneColor,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { money, percent } from '../../src/utils/format';

type Period = 'today' | 'week' | 'month';

const PERIODS = [
  { value: 'today' as const, label: 'Today' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
];

/** Insight/attention-item severity → the tone vocabulary the design system speaks. */
const SEVERITY_TONE: Record<AlertSeverity, 'critical' | 'caution' | 'info'> = {
  critical: 'critical',
  warning: 'caution',
  info: 'info',
};

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** One line the Owner can act on — a named shift, a named member, a rule
 * that tripped — normalised from the two feeds that produce them. */
interface AttentionEntry {
  key: string;
  title: string;
  detail?: string;
  severity: AlertSeverity;
  onPress?: () => void;
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
  }, [dashboard, occupancy, renewals, performance, attention, insights, revenue, marketing, branches]);

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
  const firstName = user?.full_name?.split(' ')[0] ?? '';
  const topSource = marketing.data?.sources[0];

  // Two feeds, one list: a rule that tripped (insight) and a named event
  // that needs a decision (attention item) are both "something to act on"
  // to the person reading this, so they are ranked and shown together
  // rather than as two separate walls of cards.
  const attentionEntries: AttentionEntry[] = [
    ...(insights.data ?? []).map(
      (observation): AttentionEntry => ({
        key: `insight-${observation.key}`,
        title: observation.title,
        detail: observation.detail,
        severity: observation.severity,
      }),
    ),
    ...(attention.data?.items ?? []).map(
      (item): AttentionEntry => ({
        key: `item-${item.id}`,
        title: item.title,
        detail: item.body,
        severity: item.severity,
        onPress: item.action_route ? () => router.push(item.action_route as never) : undefined,
      }),
    ),
  ].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const pendingCorrections = attention.data?.pending_corrections ?? 0;
  const attentionTotal = attentionEntries.length + (pendingCorrections > 0 ? 1 : 0);
  const attentionLoaded = attention.data !== null && insights.data !== null;

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
        <Row gap="md" align="flex-start">
          <AccountAvatar size={44} />
          <Stack
            gap="xxs"
            style={styles.grow}
            accessible
            accessibilityLabel={`${greeting(new Date().getHours())}${firstName ? `, ${firstName}` : ''}. Here's what needs your attention today.`}
          >
            <Text variant="label" tone={color.textSecondary}>
              {greeting(new Date().getHours())}
              {firstName ? ',' : ''}
            </Text>
            <Text variant="title" numberOfLines={1} style={styles.heroName}>
              {firstName || 'there'}
            </Text>
            <Text variant="label" tone={color.textTertiary}>
              Here&apos;s what needs your attention today.
            </Text>
          </Stack>
          <Pressable
            onPress={() => router.push('/(owner)/broadcast' as never)}
            accessibilityRole="button"
            accessibilityLabel="Send a broadcast"
            accessibilityHint="Opens the broadcast composer to message members or trainers"
            testID="dashboard-broadcast"
            hitSlop={space.sm}
            style={({ pressed }) => [styles.broadcastButton, pressed ? styles.broadcastPressed : null]}
          >
            <Ionicons name="megaphone-outline" size={20} color={color.text} />
          </Pressable>
        </Row>

        {/* ------------------------------------------------- key numbers */}
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
            hint="live · tap for who"
            tone="brand"
            icon="body-outline"
            onPress={() => router.push('/(owner)/members' as never)}
          />
        </StatRow>
        <StatRow>
          <StatCard
            label="Renewals due"
            value={renewals.data?.count ?? '—'}
            hint="next 30 days"
            tone={(renewals.data?.count ?? 0) > 0 ? 'caution' : 'positive'}
            icon="refresh-outline"
            onPress={() => router.push('/(owner)/renewals' as never)}
          />
          <StatCard
            label="Ready for PT"
            value={attention.data?.pt_ready_count ?? '—'}
            hint="day 45 complete"
            tone={(attention.data?.pt_ready_count ?? 0) > 0 ? 'brand' : 'neutral'}
            icon="trending-up-outline"
            onPress={() => router.push('/(owner)/opportunities' as never)}
          />
        </StatRow>

        {/* -------------------------------------------------------- today */}
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
        </Section>

        {/* ----------------------------------------------------- attention */}
        <Section
          title="Attention"
          action={
            attentionTotal > 3 ? (
              <LinkButton
                title={`View all (${attentionTotal})`}
                onPress={() => router.push('/(owner)/alerts' as never)}
              />
            ) : undefined
          }
        >
          {!attentionLoaded ? (
            <SkeletonCard />
          ) : attentionTotal === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Nothing needs your attention"
              detail="Late trainers, renewals and quiet periods show up here as the rules find them."
            />
          ) : (
            <Card gap="none">
              {pendingCorrections > 0 ? (
                <AttentionRow
                  title={`${pendingCorrections} correction${pendingCorrections === 1 ? '' : 's'} pending review`}
                  severity="warning"
                  onPress={() => router.push('/(owner)/corrections' as never)}
                  withDivider={attentionEntries.length > 0}
                />
              ) : null}
              {attentionEntries.slice(0, 3).map((entry, index) => (
                <AttentionRow
                  key={entry.key}
                  title={entry.title}
                  detail={entry.detail}
                  severity={entry.severity}
                  onPress={entry.onPress}
                  withDivider={index < Math.min(attentionEntries.length, 3) - 1}
                />
              ))}
            </Card>
          )}
        </Section>

        {/* -------------------------------------------------------- business */}
        <Section
          title="Business"
          action={<LinkButton title="Marketing" onPress={() => router.push('/(owner)/marketing' as never)} />}
        >
          {marketing.data && marketing.data.has_data ? (
            <StatRow>
              <StatCard
                label="New members"
                value={marketing.data.new_members}
                hint="last 90 days"
                icon="person-add-outline"
                onPress={() => router.push('/(owner)/new-members' as never)}
              />
              <StatCard
                label="Top source"
                value={topSource?.joined ?? 0}
                hint={topSource?.source_label ?? '—'}
                icon="megaphone-outline"
                onPress={() => router.push('/(owner)/marketing' as never)}
              />
            </StatRow>
          ) : (
            <Text variant="label" tone={color.textTertiary}>
              No new members recorded in the last 90 days.
            </Text>
          )}

          <Card>
            <Row gap="sm">
              <Eyebrow>Money</Eyebrow>
              <Spacer />
              <LinkButton title="Payments" onPress={() => router.push('/(owner)/payments' as never)} />
            </Row>
            <Divider />
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
          </Card>
        </Section>

        {/* --------------------------------------------- secondary: performance */}
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

/** One compact, tappable line in the Attention card — a name and a reason,
 * not a bordered card of its own. Severity reads as a dot, not a fill,
 * because five tinted backgrounds in a row is harder to scan than one. */
function AttentionRow({
  title,
  detail,
  severity,
  onPress,
  withDivider,
}: {
  title: string;
  detail?: string;
  severity: AlertSeverity;
  onPress?: () => void;
  withDivider: boolean;
}) {
  const hue = toneColor[SEVERITY_TONE[severity]];
  const row = (
    <Row gap="sm" align="center" style={styles.attentionRow}>
      <View style={[styles.attentionDot, { backgroundColor: hue }]} />
      <Stack gap="xxs" style={styles.grow}>
        <Text variant="body" numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text variant="label" tone={color.textTertiary} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </Stack>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={color.textTertiary} /> : null}
    </Row>
  );

  return (
    <>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={detail ? `${title}. ${detail}` : title}
          style={({ pressed }) => (pressed ? styles.attentionPressed : null)}
        >
          {row}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={detail ? `${title}. ${detail}` : title}>
          {row}
        </View>
      )}
      {withDivider ? <Divider /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  heroName: { fontSize: 34, lineHeight: 38, letterSpacing: -1 },
  broadcastButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.border,
  },
  broadcastPressed: { backgroundColor: color.surfaceOverlay },
  attentionRow: { paddingVertical: space.sm },
  attentionPressed: { backgroundColor: color.surfaceOverlay },
  attentionDot: { width: 8, height: 8, borderRadius: 4 },
});
