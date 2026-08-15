/**
 * The trainer's own month: attendance history, punctuality and where they
 * stand against the incentive thresholds.
 */

import React from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

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
  Meter,
  Row,
  Screen,
  StatTile,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { colors, incentiveMeta, spacing, statusMeta } from '../../src/theme';
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
            tintColor={colors.brand}
          />
        }
      >
        <Txt variant="title">This month</Txt>

        {summary ? (
          <>
            <View style={styles.tiles}>
              <StatTile
                label="Punctuality"
                value={percent(summary.punctuality_pct)}
                accent={summary.punctuality_pct >= 90 ? colors.onTime : colors.late}
              />
              <StatTile
                label="Attendance"
                value={percent(summary.attendance_pct)}
                accent={summary.attendance_pct >= 95 ? colors.onTime : colors.late}
              />
            </View>
            <View style={styles.tiles}>
              <StatTile label="Late" value={summary.late_count} accent={colors.late} />
              <StatTile label="Early exit" value={summary.early_exit_count} accent={colors.earlyExit} />
              <StatTile label="Completed" value={summary.completed_shifts} />
            </View>

            {/* Incentive eligibility — never a payout figure. */}
            <Card>
              <Row style={styles.cardHead}>
                <Eyebrow>Incentive eligibility</Eyebrow>
                {eligibility ? <Badge label={eligibility.label} color={eligibility.color} /> : null}
              </Row>
              <Divider />
              {summary.checks.map((check) => (
                <Row key={check.key} style={styles.check}>
                  <Txt
                    variant="label"
                    color={check.passed ? colors.onTime : check.near_miss ? colors.late : colors.absent}
                    style={styles.checkLabel}
                  >
                    {check.passed ? '✓' : check.near_miss ? '~' : '✕'}  {check.label}
                  </Txt>
                  <Txt variant="mono" color={colors.textMuted}>
                    {check.actual}
                  </Txt>
                </Row>
              ))}
              <Banner tone="info">{summary.disclaimer}</Banner>
            </Card>
          </>
        ) : null}

        <Txt variant="heading" style={styles.sectionHead}>
          Attendance history
        </Txt>

        {days.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No shifts recorded yet"
            detail="Your attendance will appear here as soon as you check in."
          />
        ) : (
          days.map((day) => {
            const meta = statusMeta[day.status];
            return (
              <Card key={day.id} style={styles.dayCard}>
                <Row style={styles.dayHead}>
                  <Txt variant="heading">{dayLabel(day.work_date)}</Txt>
                  <Badge label={meta.short} color={meta.color} />
                </Row>
                <Row style={styles.dayTimes}>
                  <Txt variant="label" color={colors.textMuted}>
                    In {timeOfDay(day.check_in_at)}
                  </Txt>
                  <Txt variant="label" color={colors.textMuted}>
                    Out {timeOfDay(day.check_out_at)}
                  </Txt>
                  <Txt variant="label" color={colors.textFaint}>
                    {duration(day.worked_minutes)}
                  </Txt>
                </Row>
                {day.late_minutes > 0 || day.early_exit_minutes > 0 ? (
                  <Row style={styles.dayFlags}>
                    {day.late_minutes > 0 ? (
                      <Txt variant="label" color={colors.late}>
                        {day.late_minutes} min late
                      </Txt>
                    ) : null}
                    {day.early_exit_minutes > 0 ? (
                      <Txt variant="label" color={colors.earlyExit}>
                        {day.early_exit_minutes} min early exit
                      </Txt>
                    ) : null}
                  </Row>
                ) : null}
                <Meter
                  value={day.status === 'absent' ? 0 : 100}
                  color={meta.color}
                />
              </Card>
            );
          })
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
  cardHead: { justifyContent: 'space-between' },
  check: { justifyContent: 'space-between', paddingVertical: 3 },
  checkLabel: { flex: 1 },
  sectionHead: { marginTop: spacing.lg },
  dayCard: { gap: spacing.xs },
  dayHead: { justifyContent: 'space-between' },
  dayTimes: { gap: spacing.lg },
  dayFlags: { gap: spacing.lg },
});
