/**
 * The trainer record the owner opens from a branch.
 *
 * Everything V1 promises about one person on one screen: who they are, where
 * they work, what they are doing right now, today's shift and its two
 * timestamps, the month's punctuality, and their incentive standing.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import * as api from '../../../src/api/endpoints';
import type { AttendanceDay, TrainerDetail } from '../../../src/api/types';
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
} from '../../../src/components/ui';
import { useApi } from '../../../src/hooks/useApi';
import { colors, incentiveMeta, spacing, statusMeta } from '../../../src/theme';
import { dayLabel, duration, percent, timeOfDay } from '../../../src/utils/format';

export default function TrainerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trainerId = Number(id);
  const router = useRouter();

  const detail = useApi<TrainerDetail>((token) => api.trainerDetail(trainerId, token), [trainerId]);
  const history = useApi<AttendanceDay[]>(
    (token) => api.trainerAttendance(trainerId, token),
    [trainerId],
  );

  if (detail.loading) return <Loading label="Loading trainer" />;
  if (detail.error || !detail.data) {
    return (
      <Screen>
        <ErrorState
          title="Could not load this trainer"
          detail={detail.error?.message}
          onRetry={detail.reload}
        />
      </Screen>
    );
  }

  const data = detail.data;
  const status = statusMeta[data.current_status];
  const eligibility = incentiveMeta[data.incentive_status];
  const punctualityColor =
    data.month_punctuality_pct >= 90
      ? colors.onTime
      : data.month_punctuality_pct >= 75
        ? colors.late
        : colors.absent;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={detail.refreshing}
            onRefresh={() => {
              void detail.refresh();
              void history.refresh();
            }}
            tintColor={colors.brand}
          />
        }
      >
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button">
          <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
          <Txt variant="label" color={colors.textMuted}>
            Back
          </Txt>
        </Pressable>

        <View style={styles.identity}>
          <Txt variant="title">{data.trainer.full_name}</Txt>
          <Row style={styles.identityMeta}>
            <Txt variant="label" color={colors.textMuted}>
              {data.trainer.branch_name}
            </Txt>
            <Txt variant="label" color={colors.textFaint}>
              · {data.trainer.designation ?? 'Trainer'}
            </Txt>
          </Row>
        </View>

        {/* Right now. */}
        <Card style={{ borderColor: `${status.color}55` }}>
          <Row style={styles.cardHead}>
            <Eyebrow>Current status</Eyebrow>
            <Badge label={status.label} color={status.color} />
          </Row>
          <Divider />
          <Detail label="Today's shift" value={data.shift_label ?? 'Not rostered'} />
          <Detail label="Check-in" value={timeOfDay(data.today?.check_in_at)} />
          <Detail label="Check-out" value={timeOfDay(data.today?.check_out_at)} />
          {data.today && data.today.late_minutes > 0 ? (
            <Detail label="Late by" value={`${data.today.late_minutes} min`} color={colors.late} />
          ) : null}
          {data.today && data.today.early_exit_minutes > 0 ? (
            <Detail
              label="Left early by"
              value={`${data.today.early_exit_minutes} min`}
              color={colors.earlyExit}
            />
          ) : null}
        </Card>

        {/* This month. */}
        <Card>
          <Row style={styles.cardHead}>
            <Eyebrow>Monthly punctuality</Eyebrow>
            <Txt variant="title" color={punctualityColor}>
              {percent(data.month_punctuality_pct)}
            </Txt>
          </Row>
          <Meter value={data.month_punctuality_pct} color={punctualityColor} />
          <Txt variant="label" color={colors.textFaint}>
            {data.completed_shifts} completed of {data.scheduled_shifts} rostered ·{' '}
            {percent(data.month_attendance_pct)} attendance
          </Txt>
        </Card>

        <View style={styles.tiles}>
          <StatTile label="Late count" value={data.late_count} accent={data.late_count ? colors.late : colors.textMuted} />
          <StatTile
            label="Early exits"
            value={data.early_exit_count}
            accent={data.early_exit_count ? colors.earlyExit : colors.textMuted}
          />
          <StatTile
            label="Absences"
            value={data.absent_count}
            accent={data.absent_count ? colors.absent : colors.textMuted}
          />
        </View>

        {/* Incentive standing — eligibility only, never a payout. */}
        <Card>
          <Row style={styles.cardHead}>
            <Eyebrow>Incentive status</Eyebrow>
            <Badge label={eligibility.label} color={eligibility.color} filled />
          </Row>
          <Divider />
          {data.incentive_checks.map((check) => (
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
          <Banner tone="info">{data.incentive_disclaimer}</Banner>
        </Card>

        <Txt variant="heading" style={styles.sectionHead}>
          Attendance history
        </Txt>

        {(history.data?.length ?? 0) === 0 ? (
          <EmptyState icon="calendar-outline" title="No attendance recorded this month" />
        ) : (
          history.data?.map((day) => {
            const meta = statusMeta[day.status];
            return (
              <Card key={day.id} style={styles.dayCard}>
                <Row style={styles.cardHead}>
                  <Txt variant="body">{dayLabel(day.work_date)}</Txt>
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
              </Card>
            );
          })
        )}
      </Body>
    </Screen>
  );
}

function Detail({ label, value, color = colors.text }: { label: string; value: string; color?: string }) {
  return (
    <Row style={styles.detail}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt variant="mono" color={color}>
        {value}
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing.sm },
  identity: { gap: spacing.xs },
  identityMeta: { gap: spacing.xs },
  cardHead: { justifyContent: 'space-between' },
  detail: { justifyContent: 'space-between', paddingVertical: 3 },
  check: { justifyContent: 'space-between', paddingVertical: 3 },
  checkLabel: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  sectionHead: { marginTop: spacing.lg },
  dayCard: { gap: spacing.xs },
  dayTimes: { gap: spacing.lg },
});
