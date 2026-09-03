/**
 * The trainer record the owner opens from a branch, from Incentives, or from
 * an alert.
 *
 * Everything V1 promises about one person on one screen: who they are, what
 * they are doing right now, this month's punctuality and attendance, their
 * incentive standing, and the attendance history behind it. Same hierarchy as
 * the member 360 — one thing leads, the meters travel, the incentive checks
 * read as pass / near / fail, not a wall of glyphs.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import * as api from '../../../src/api/endpoints';
import type { AttendanceDay, TrainerDetail } from '../../../src/api/types';
import { TrainerTestimonialsSection } from '../../../src/components/testimonials';
import {
  Badge,
  Body,
  Card,
  Divider,
  EmptyState,
  Eyebrow,
  ErrorState,
  Loading,
  Motion,
  ProgressBar,
  ProgressCard,
  Row,
  Screen,
  ScreenHeader,
  Section,
  Spacer,
  Staggered,
  StatCard,
  StatRow,
  Stack,
  Text,
  color,
  entrance,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { incentiveMeta, statusMeta } from '../../../src/theme';
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

  // Reached from Trainers, from Incentives, and from an alert — `back()`
  // already returns to whichever of those pushed this screen.
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace('/(owner)/trainers' as never);

  if (detail.loading) return <Loading label="Loading trainer" />;
  if (detail.error || !detail.data) {
    return (
      <Screen background="owner" backgroundIntensity="subtle">
        <ScreenHeader title="Trainer" onBack={goBack} />
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
  const punctualityTone =
    data.month_punctuality_pct >= 90
      ? color.status.positive
      : data.month_punctuality_pct >= 75
        ? color.status.caution
        : color.status.critical;

  return (
    <Screen background="owner" backgroundIntensity="subtle">
      <ScreenHeader
        title={data.trainer.full_name}
        subtitle={`${data.trainer.branch_name} · ${data.trainer.designation ?? 'Trainer'}`}
        onBack={goBack}
        action={<Badge label={status.label} colorOverride={status.color} />}
      />
      <Body
        refreshControl={
          <RefreshControl
            refreshing={detail.refreshing}
            onRefresh={() => {
              void detail.refresh();
              void history.refresh();
            }}
            tintColor={color.brand}
          />
        }
      >
        <Staggered>
          {/* Right now. */}
          <Section title="Right now">
            <Card style={{ borderColor: color.borderStrong }} gap="xs">
              <Detail label="Today’s shift" value={data.shift_label ?? 'Not rostered'} />
              <Detail label="Check-in" value={timeOfDay(data.today?.check_in_at)} />
              <Detail label="Check-out" value={timeOfDay(data.today?.check_out_at)} />
              {data.today && data.today.late_minutes > 0 ? (
                <Detail
                  label="Late by"
                  value={`${data.today.late_minutes} min`}
                  valueColor={color.status.caution}
                />
              ) : null}
              {data.today && data.today.early_exit_minutes > 0 ? (
                <Detail
                  label="Left early by"
                  value={`${data.today.early_exit_minutes} min`}
                  valueColor={color.status.warning}
                />
              ) : null}
            </Card>
          </Section>

          {/* This month. */}
          <Section title="This month">
            <ProgressCard
              label="Monthly punctuality"
              value={percent(data.month_punctuality_pct)}
              percent={data.month_punctuality_pct}
              colorOverride={punctualityTone}
              caption={`${data.completed_shifts} completed of ${data.scheduled_shifts} rostered · ${percent(
                data.month_attendance_pct,
              )} attendance`}
            />
            <StatRow>
              <StatCard
                label="Late"
                value={data.late_count}
                tone={data.late_count ? 'caution' : undefined}
              />
              <StatCard
                label="Early exits"
                value={data.early_exit_count}
                colorOverride={data.early_exit_count ? color.status.warning : undefined}
              />
              <StatCard
                label="Absences"
                value={data.absent_count}
                tone={data.absent_count ? 'critical' : undefined}
              />
            </StatRow>
          </Section>

          {/* Incentive standing — eligibility only, never a payout. */}
          <Section title="Incentive standing">
            <Card>
              <Row gap="sm">
                <Eyebrow>Status</Eyebrow>
                <Spacer />
                <Badge label={eligibility.label} colorOverride={eligibility.color} solid />
              </Row>
              <Divider />
              <Stack gap="xs">
                {data.incentive_checks.map((check) => (
                  <Row key={check.key} gap="sm">
                    <Text
                      variant="label"
                      tone={color.textSecondary}
                      style={styles.grow}
                      numberOfLines={1}
                    >
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
                {data.incentive_disclaimer}
              </Text>
            </Card>
          </Section>
        </Staggered>

        <Section title="Attendance history">
          {(history.data?.length ?? 0) === 0 ? (
            <EmptyState icon="calendar-outline" title="No attendance recorded this month" />
          ) : (
            history.data?.map((day, index) => {
              const meta = statusMeta[day.status];
              return (
                <Motion.View key={day.id} entering={entrance(index)}>
                  <Card gap="xs">
                    <Row gap="sm">
                      <Text variant="body" style={styles.grow}>
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

        <TrainerTestimonialsSection trainerId={trainerId} />
      </Body>
    </Screen>
  );
}

function Detail({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <Row gap="md">
      <Text variant="label" tone={color.textSecondary} style={styles.grow}>
        {label}
      </Text>
      <Text variant="mono" tone={valueColor ?? color.text}>
        {value}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
