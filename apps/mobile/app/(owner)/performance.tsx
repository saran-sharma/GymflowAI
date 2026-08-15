/**
 * BRANCH PERFORMANCE — Nagalkeni, Boganhalli and Alandur side by side.
 *
 * Where the previous period holds no data, the trend renders as "—". A 0%
 * change and "we have no history" are different statements, and only one of
 * them is true on a new deployment.
 */

import React, { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { BranchPerformanceResponse } from '../../src/api/types';
import { TrendStat } from '../../src/components/programme';
import {
  Banner,
  Body,
  Card,
  DemoTag,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Row,
  Screen,
  Section,
  Segmented,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { dayLabel } from '../../src/utils/format';

type Period = 'today' | 'week' | 'month';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

export default function OwnerPerformanceScreen() {
  const [period, setPeriod] = useState<Period>('week');
  const performance = useApi<BranchPerformanceResponse>(
    (token) => api.branchPerformance(token, period),
    [period],
  );

  if (performance.loading) return <Loading label="Comparing branches" />;
  if (performance.error || !performance.data) {
    const offline = performance.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load performance'}
          detail={offline ? undefined : performance.error?.message}
          onRetry={performance.reload}
        />
      </Screen>
    );
  }

  const data = performance.data;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={performance.refreshing}
            onRefresh={() => void performance.refresh()}
            tintColor={color.brand}
          />
        }
      >
        <Text variant="title">Branch performance</Text>
        <Text variant="label" tone={color.textSecondary}>
          {dayLabel(data.period_start)} – {dayLabel(data.period_end)}
          {data.has_comparison && data.comparison_start
            ? ` vs ${dayLabel(data.comparison_start)} – ${dayLabel(data.comparison_end ?? '')}`
            : ''}
        </Text>

        <Segmented
          options={PERIODS}
          value={period}
          onChange={setPeriod}
          testIDPrefix="performance-period"
        />

        {data.note ? <Banner tone="info">{data.note}</Banner> : null}

        {data.branches.length === 0 ? (
          <EmptyState title="No branches in scope" />
        ) : (
          data.branches.map((branch) => (
            <Card key={branch.branch_id}>
              <Row style={styles.cardHead}>
                <Text variant="heading">
                  {branch.branch_name.replace(/^SLAM\s+/i, '').toUpperCase()}
                </Text>
                {branch.is_demo ? <DemoTag /> : null}
              </Row>
              <Text variant="label" tone={color.textTertiary}>
                {branch.members_inside} members inside now
              </Text>

              <View style={styles.grid}>
                <TrendStat label="Punctuality" point={branch.punctuality} />
                <TrendStat label="Attendance" point={branch.attendance} />
              </View>
              <View style={styles.grid}>
                <TrendStat label="Late marks" point={branch.late_marks} suffix="" invert />
                <TrendStat label="Early exits" point={branch.early_exits} suffix="" invert />
              </View>
              <View style={styles.grid}>
                <TrendStat label="Session completion" point={branch.session_completion} />
                <TrendStat label="PT utilisation" point={branch.pt_utilisation} />
              </View>
              <View style={styles.grid}>
                <TrendStat label="Member activity" point={branch.member_activity} />
                <TrendStat label="Marketing conversion" point={branch.marketing_conversion} />
              </View>
            </Card>
          ))
        )}

        <Section title="About these numbers">
          <Card>
            <Eyebrow>How they are counted</Eyebrow>
            <Text variant="body" tone={color.textSecondary}>
              Every figure is a count of records GymFlow holds for the period shown. A comparison
              only appears when the previous period actually has data — otherwise the trend reads
              “—”.
            </Text>
          </Card>
        </Section>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHead: { justifyContent: 'space-between' },
  grid: { flexDirection: 'row', gap: space.md, paddingTop: space.sm },
});
