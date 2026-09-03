/**
 * The trainer's own month: attendance history, punctuality and where they
 * stand against the incentive thresholds.
 */

import React from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { AttendanceDay, IncentiveResult } from '../../src/api/types';
import {
  Badge,
  Banner,
  Body,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Motion,
  ProgressBar,
  Row,
  Screen,
  Section,
  Spacer,
  Staggered,
  StatCard,
  StatRow,
  Stack,
  Text,
  color,
  entrance,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { incentiveMeta, statusMeta } from '../../src/theme';
import { dayLabel, duration, percent, timeOfDay } from '../../src/utils/format';

export default function TrainerAttendanceScreen() {
  const history = useApi<AttendanceDay[]>((token) => api.myAttendanceHistory(token), []);
  const incentive = useApi<IncentiveResult>((token) => api.myIncentive(token), []);

  if (history.loading || incentive.loading) return <Loading label="Loading your month" />;
  if (history.error && !history.data) {
    const offline = history.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your attendance'}
          detail={offline ? undefined : history.error?.message}
          onRetry={history.reload}
        />
      </Screen>
    );
  }

  const days = history.data ?? [];
  const summary = incentive.data;
  const eligibility = summary ? incentiveMeta[summary.status] : null;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={history.refreshing}
            onRefresh={() => {
              void history.refresh();
              void incentive.refresh();
            }}
            tintColor={color.brand}
          />
        }
      >
        <Text variant="title">This month</Text>

        <Staggered>
          {summary ? (
            <StatRow>
              <StatCard
                label="Punctuality"
                value={percent(summary.punctuality_pct)}
                colorOverride={
                  summary.punctuality_pct >= 90 ? color.status.positive : color.status.caution
                }
              />
              <StatCard
                label="Attendance"
                value={percent(summary.attendance_pct)}
                colorOverride={
                  summary.attendance_pct >= 95 ? color.status.positive : color.status.caution
                }
              />
            </StatRow>
          ) : null}

          {summary ? (
            <StatRow>
              <StatCard
                label="Late"
                value={summary.late_count}
                tone={summary.late_count ? 'caution' : undefined}
              />
              <StatCard
                label="Early exit"
                value={summary.early_exit_count}
                colorOverride={
                  summary.early_exit_count ? color.status.warning : undefined
                }
              />
              <StatCard label="Completed" value={summary.completed_shifts} />
            </StatRow>
          ) : null}

          {/* Incentive eligibility — never a payout figure. */}
          {summary ? (
            <Card>
              <Row gap="sm">
                <Eyebrow>Incentive eligibility</Eyebrow>
                <Spacer />
                {eligibility ? (
                  <Badge label={eligibility.label} colorOverride={eligibility.color} />
                ) : null}
              </Row>
              <Divider />
              <Stack gap="xs">
                {summary.checks.map((check) => (
                  <Row key={check.key} gap="sm">
                    <Text variant="label" tone={color.textSecondary} style={styles.grow}>
                      {check.label}
                    </Text>
                    <Text variant="mono" tone={color.textTertiary}>
                      {check.actual}
                    </Text>
                    <Badge
                      label={check.passed ? 'Pass' : check.near_miss ? 'Near' : 'Fail'}
                      tone={check.passed ? 'positive' : check.near_miss ? 'caution' : 'critical'}
                    />
                  </Row>
                ))}
              </Stack>
              <Text variant="label" tone={color.textTertiary}>
                {summary.disclaimer}
              </Text>
            </Card>
          ) : null}
        </Staggered>

        <Section title="Attendance history">
          {days.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="No shifts recorded yet"
              detail="Your attendance will appear here as soon as you check in."
            />
          ) : (
            days.map((day, index) => {
              const meta = statusMeta[day.status];
              return (
                <Motion.View key={day.id} entering={entrance(index)}>
                <Card gap="xs">
                  <Row gap="sm">
                    <Text variant="heading" style={styles.grow}>
                      {dayLabel(day.work_date)}
                    </Text>
                    <Badge label={meta.short} colorOverride={meta.color} />
                  </Row>
                  <Row gap="lg">
                    <Text variant="label" tone={color.textSecondary}>
                      In {timeOfDay(day.check_in_at)}
                    </Text>
                    <Text variant="label" tone={color.textSecondary}>
                      Out {timeOfDay(day.check_out_at)}
                    </Text>
                    <Text variant="label" tone={color.textTertiary}>
                      {duration(day.worked_minutes)}
                    </Text>
                  </Row>
                  {day.late_minutes > 0 || day.early_exit_minutes > 0 ? (
                    <Row gap="lg">
                      {day.late_minutes > 0 ? (
                        <Text variant="label" tone={color.status.caution}>
                          {day.late_minutes} min late
                        </Text>
                      ) : null}
                      {day.early_exit_minutes > 0 ? (
                        <Text variant="label" tone={color.status.warning}>
                          {day.early_exit_minutes} min early exit
                        </Text>
                      ) : null}
                    </Row>
                  ) : null}
                  <ProgressBar
                    value={day.status === 'absent' ? 0 : 100}
                    colorOverride={meta.color}
                  />
                </Card>
                </Motion.View>
              );
            })
          )}
        </Section>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
