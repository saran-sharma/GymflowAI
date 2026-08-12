/**
 * The owner's home screen.
 *
 * Answers the six questions V1 exists for, above the fold: who is working, who
 * checked in, who is late, who is absent, who left early, and how punctual the
 * chain is. Below that, one card per SLAM branch, each a door into the branch.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { BranchSummary, Dashboard, Insight } from '../../src/api/types';
import { Wordmark } from '../../src/components/Brand';
import {
  Badge,
  Body,
  Card,
  ErrorState,
  Eyebrow,
  Loading,
  Meter,
  OfflineNotice,
  Row,
  Screen,
  StatTile,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { OFFLINE_MESSAGE, useNetwork } from '../../src/store/NetworkContext';
import { colors, radius, spacing } from '../../src/theme';
import { longDate, percent } from '../../src/utils/format';

export default function OwnerDashboardScreen() {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const router = useRouter();

  const dashboard = useApi<Dashboard>((token) => api.dashboard(token), []);
  const insights = useApi<Insight[]>((token) => api.insights(token), []);

  // The dashboard is the screen most likely to be stale — refresh on return.
  useFocusEffect(
    useCallback(() => {
      void dashboard.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (dashboard.loading) return <Loading label="Loading SLAM" />;
  if (dashboard.error || !dashboard.data) {
    return (
      <Screen>
        <ErrorState
          title={dashboard.error?.code === OFFLINE_CODE ? 'No connection' : 'Could not load the dashboard'}
          detail={dashboard.error?.message}
          onRetry={dashboard.reload}
        />
      </Screen>
    );
  }

  const data = dashboard.data;
  const punctualityColor =
    data.punctuality_pct >= 90 ? colors.onTime : data.punctuality_pct >= 75 ? colors.late : colors.absent;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={dashboard.refreshing}
            onRefresh={() => {
              void dashboard.refresh();
              void insights.refresh();
            }}
            tintColor={colors.brand}
          />
        }
      >
        <Wordmark subtitle={longDate(data.work_date)} />

        {!isOnline ? <OfflineNotice message={OFFLINE_MESSAGE} /> : null}

        {/* The six numbers. */}
        <View style={styles.tiles}>
          <StatTile label="Total trainers" value={data.total_trainers} hint={`${data.scheduled} rostered`} />
          <StatTile label="Present" value={data.present} accent={colors.onTime} />
        </View>
        <View style={styles.tiles}>
          <StatTile label="Late" value={data.late} accent={data.late ? colors.late : colors.textMuted} />
          <StatTile label="Absent" value={data.absent} accent={data.absent ? colors.absent : colors.textMuted} />
          <StatTile
            label="Early exit"
            value={data.early_exit}
            accent={data.early_exit ? colors.earlyExit : colors.textMuted}
          />
        </View>

        <Card>
          <Row style={styles.cardHead}>
            <Eyebrow>Chain punctuality</Eyebrow>
            <Txt variant="title" color={punctualityColor}>
              {percent(data.punctuality_pct)}
            </Txt>
          </Row>
          <Meter value={data.punctuality_pct} color={punctualityColor} />
          <Txt variant="label" color={colors.textFaint}>
            {data.present} of {data.scheduled} rostered shifts started, {data.missing_checkout} without a
            check-out
          </Txt>
        </Card>

        {/* One door per branch. */}
        <Txt variant="heading" style={styles.sectionHead}>
          Branches
        </Txt>
        {data.branches.map((branch) => (
          <BranchCard
            key={branch.branch_id}
            branch={branch}
            onPress={() => router.push(`/(owner)/branch/${branch.branch_id}` as never)}
          />
        ))}

        {insights.data && insights.data.length > 0 ? (
          <>
            <Txt variant="heading" style={styles.sectionHead}>
              Needs attention
            </Txt>
            {insights.data.map((insight) => (
              <Card key={insight.key} style={styles.insight}>
                <Row style={styles.cardHead}>
                  <Txt variant="label" style={styles.insightTitle}>
                    {insight.title}
                  </Txt>
                  <Badge
                    label={insight.severity}
                    color={
                      insight.severity === 'critical'
                        ? colors.absent
                        : insight.severity === 'warning'
                          ? colors.late
                          : colors.info
                    }
                  />
                </Row>
                <Txt variant="body" color={colors.textMuted}>
                  {insight.detail}
                </Txt>
              </Card>
            ))}
          </>
        ) : null}

        <Txt variant="label" color={colors.textFaint} style={styles.footer}>
          Signed in as {user?.full_name}. Times are recorded by the GymFlow server.
        </Txt>
      </Body>
    </Screen>
  );
}

function BranchCard({ branch, onPress }: { branch: BranchSummary; onPress: () => void }) {
  const punctualityColor =
    branch.punctuality_pct >= 90
      ? colors.onTime
      : branch.punctuality_pct >= 75
        ? colors.late
        : colors.absent;

  // "SLAM Nagalkeni" reads as "NAGALKENI" on the card; the brand is the header.
  const shortName = branch.branch_name.replace(/^SLAM\s+/i, '').toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${branch.branch_name}`}
      style={({ pressed }) => [styles.branchCard, pressed && styles.branchPressed]}
      testID={`branch-card-${branch.branch_code}`}
    >
      <Row style={styles.cardHead}>
        <Txt variant="heading">{shortName}</Txt>
        <Row style={styles.branchRight}>
          <Txt variant="heading" color={punctualityColor}>
            {percent(branch.punctuality_pct)}
          </Txt>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Row>
      </Row>

      <Meter value={branch.punctuality_pct} color={punctualityColor} />

      <Row style={styles.branchStats}>
        <MiniStat label="Scheduled" value={branch.scheduled} />
        <MiniStat label="Present" value={branch.present} color={colors.onTime} />
        <MiniStat label="Late" value={branch.late} color={branch.late ? colors.late : undefined} />
        <MiniStat label="Absent" value={branch.absent} color={branch.absent ? colors.absent : undefined} />
      </Row>

      {branch.occupancy ? (
        <Row style={styles.occupancy}>
          <Ionicons name="people-outline" size={14} color={colors.textFaint} />
          <Txt variant="label" color={colors.textFaint}>
            {branch.occupancy.inside} inside of {branch.occupancy.capacity} ·{' '}
            {branch.occupancy.crowd_level.toLowerCase()}
          </Txt>
        </Row>
      ) : null}
    </Pressable>
  );
}

function MiniStat({ label, value, color = colors.text }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.miniStat}>
      <Txt variant="heading" color={color}>
        {value}
      </Txt>
      <Txt variant="caption" color={colors.textFaint}>
        {label.toUpperCase()}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
  cardHead: { justifyContent: 'space-between' },
  sectionHead: { marginTop: spacing.lg },
  branchCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  branchPressed: { backgroundColor: colors.raised, borderColor: colors.borderStrong },
  branchRight: { gap: spacing.xs },
  branchStats: { justifyContent: 'space-between' },
  miniStat: { alignItems: 'flex-start', gap: 2 },
  occupancy: { gap: spacing.xs },
  insight: { gap: spacing.xs },
  insightTitle: { flex: 1, paddingRight: spacing.sm },
  footer: { textAlign: 'center', marginTop: spacing.lg },
});
