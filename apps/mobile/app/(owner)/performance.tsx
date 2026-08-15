/**
 * BRANCH PERFORMANCE — Nagalkeni, Boganhalli and Alandur side by side.
 *
 * Where the previous period holds no data, the trend renders as "—". A 0%
 * change and "we have no history" are different statements, and only one of
 * them is true on a new deployment.
 */

import React, { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { BranchPerformanceResponse } from '../../src/api/types';
import { DemoTag, SectionHeader, TrendStat } from '../../src/components/programme';
import {
  Banner,
  Body,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Row,
  Screen,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { colors, radius, spacing } from '../../src/theme';
import { dayLabel } from '../../src/utils/format';

type Period = 'today' | 'week' | 'month';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
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
            tintColor={colors.brand}
          />
        }
      >
        <Txt variant="title">Branch performance</Txt>
        <Txt variant="label" color={colors.textMuted}>
          {dayLabel(data.period_start)} – {dayLabel(data.period_end)}
          {data.has_comparison && data.comparison_start
            ? ` vs ${dayLabel(data.comparison_start)} – ${dayLabel(data.comparison_end ?? '')}`
            : ''}
        </Txt>

        <Row style={styles.periods}>
          {PERIODS.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: option.key === period }}
              onPress={() => setPeriod(option.key)}
              style={({ pressed }) => [
                styles.period,
                option.key === period && styles.periodSelected,
                pressed && styles.periodPressed,
              ]}
            >
              <Txt
                variant="label"
                color={option.key === period ? colors.text : colors.textFaint}
              >
                {option.label}
              </Txt>
            </Pressable>
          ))}
        </Row>

        {data.note ? <Banner tone="info">{data.note}</Banner> : null}

        {data.branches.length === 0 ? (
          <EmptyState title="No branches in scope" />
        ) : (
          data.branches.map((branch) => (
            <Card key={branch.branch_id}>
              <Row style={styles.cardHead}>
                <Txt variant="heading">
                  {branch.branch_name.replace(/^SLAM\s+/i, '').toUpperCase()}
                </Txt>
                {branch.is_demo ? <DemoTag /> : null}
              </Row>
              <Txt variant="label" color={colors.textFaint}>
                {branch.members_inside} members inside now
              </Txt>

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

        <SectionHeader title="About these numbers" />
        <Card>
          <Eyebrow>How they are counted</Eyebrow>
          <Txt variant="body" color={colors.textMuted}>
            Every figure is a count of records GymFlow holds for the period shown. A comparison
            only appears when the previous period actually has data — otherwise the trend reads
            “—”.
          </Txt>
        </Card>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHead: { justifyContent: 'space-between' },
  periods: { gap: spacing.sm, paddingVertical: spacing.sm },
  period: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  periodSelected: { borderColor: colors.brand, backgroundColor: `${colors.brand}1F` },
  periodPressed: { opacity: 0.8 },
  grid: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm },
});
