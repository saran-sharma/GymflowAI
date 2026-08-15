/**
 * Incentive standing for every visible trainer.
 *
 * Eligibility only. There is no payout figure anywhere in this screen, and the
 * SLAM policy disclaimer is always on it.
 */

import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { IncentiveResult } from '../../src/api/types';
import {
  Badge,
  Banner,
  Body,
  EmptyState,
  ErrorState,
  Eyebrow,
  Meter,
  Row,
  Screen,
  StatTile,
  Txt,
} from '../../src/components/ui';
import { SkeletonScreen, TappableCard } from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { colors, incentiveMeta, spacing } from '../../src/theme';
import { percent } from '../../src/utils/format';

export default function OwnerIncentivesScreen() {
  const router = useRouter();
  const results = useApi<IncentiveResult[]>((token) => api.listIncentives(token), []);

  const tally = useMemo(() => {
    const rows = results.data ?? [];
    return {
      eligible: rows.filter((r) => r.status === 'eligible').length,
      review: rows.filter((r) => r.status === 'needs_review').length,
      not: rows.filter((r) => r.status === 'not_eligible').length,
    };
  }, [results.data]);

  if (results.loading) return <SkeletonScreen cards={4} />;
  if (results.error) {
    const offline = results.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load incentives'}
          detail={offline ? undefined : results.error?.message}
          onRetry={results.reload}
        />
      </Screen>
    );
  }

  const rows = results.data ?? [];

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={results.refreshing}
            onRefresh={results.refresh}
            tintColor={colors.brand}
          />
        }
      >
        <Txt variant="title">Incentives</Txt>
        <Txt variant="body" color={colors.textMuted}>
          Eligibility against the thresholds you configured. This is not a payout calculation.
        </Txt>

        <View style={styles.tiles}>
          <StatTile label="Eligible" value={tally.eligible} accent={colors.onTime} />
          <StatTile label="Needs review" value={tally.review} accent={colors.late} />
          <StatTile label="Not eligible" value={tally.not} accent={colors.absent} />
        </View>

        {rows.length === 0 ? (
          <EmptyState icon="ribbon-outline" title="Nothing to evaluate yet" />
        ) : (
          rows.map((row) => {
            const meta = incentiveMeta[row.status];
            return (
              <TappableCard
                key={row.trainer_id}
                onPress={() => router.push(`/(owner)/trainer/${row.trainer_id}` as never)}
                accessibilityLabel={`Open ${row.trainer_name}`}
                testID={`incentive-row-${row.trainer_id}`}
              >
                <Row style={styles.head}>
                  <View style={styles.headText}>
                    <Txt variant="heading">{row.trainer_name}</Txt>
                    <Eyebrow>{row.branch_name}</Eyebrow>
                  </View>
                  <Badge label={meta.label} color={meta.color} />
                </Row>

                <Meter value={row.score} color={meta.color} />

                <Row style={styles.stats}>
                  <Stat label="Punctuality" value={percent(row.punctuality_pct)} />
                  <Stat label="Attendance" value={percent(row.attendance_pct)} />
                  <Stat label="Late" value={String(row.late_count)} />
                  <Stat label="Early" value={String(row.early_exit_count)} />
                </Row>
              </TappableCard>
            );
          })
        )}

        <Banner tone="info">
          {rows[0]?.disclaimer ?? 'Final payroll/incentive calculation is subject to SLAM policy.'}
        </Banner>
      </Body>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="body">{value}</Txt>
      <Txt variant="caption" color={colors.textFaint}>
        {label.toUpperCase()}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
  head: { justifyContent: 'space-between' },
  headText: { flex: 1, gap: 2 },
  stats: { justifyContent: 'space-between' },
  stat: { gap: 2 },
});
