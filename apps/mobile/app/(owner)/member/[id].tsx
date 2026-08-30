/**
 * Member Intelligence — one member's whole operational picture for the owner.
 *
 * Reachable from Members, from a marketing source's acquisition list, and
 * from anywhere else a member is named. It reads the same `client_detail_out`
 * builder the trainer desk's client screen does — an owner and a trainer are
 * never looking at two different truths about the same member — opened up to
 * any member the owner is allowed to see, not just one trainer's clients.
 *
 * Sections are membership, training (GT or PT, whichever is live), attendance,
 * workout and progress — in that order, because that is the order an owner
 * actually reasons in: are they still paying, are they training, are they
 * showing up, what did they just do, how is it going. Progress stays honest
 * about what GymFlow can measure today; the InBody placeholder is a labelled
 * gap; a real integration fills it in without this screen changing shape.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type {
  ActivityEntry,
  BodyCompositionHistory,
  Payment,
  StrengthTrend,
  TrainerClientDetail,
} from '../../../src/api/types';
import { FitnessProfile } from '../../../src/components/fitness-profile';
import {
  CompactBodyComposition,
  JourneyBar,
  KindTag,
  RecentStrength,
} from '../../../src/components/member';
import {
  Avatar,
  Badge,
  Body,
  Card,
  Divider,
  ErrorState,
  Eyebrow,
  LinkButton,
  Loading,
  ProgressCard,
  Row,
  Screen,
  ScreenHeader,
  Section,
  Spacer,
  StatCard,
  StatRow,
  Stack,
  Text,
  color,
  space,
  useThemedStyles,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { dayLabel, daysAgoLabel, membershipDaysLabel, money } from '../../../src/utils/format';

const WORKOUT_TONE: Record<string, 'positive' | 'neutral'> = {
  completed: 'positive',
};

export default function OwnerMemberScreen() {
  const styles = useThemedStyles(buildStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const memberId = Number(id);

  const detail = useApi<TrainerClientDetail>((token) => api.getMember(memberId, token), [
    memberId,
  ]);
  // Payment history is its own call: it exists for any member (Payments
  // already reads it this way), but is not part of the shared client
  // builder, which the trainer desk also uses and has no payment concept.
  const payments = useApi<Payment[]>(
    (token) => api.listPayments(token, { memberId }),
    [memberId],
  );
  const strength = useApi<StrengthTrend>(
    (token) => api.memberStrengthTrend(memberId, token),
    [memberId],
  );
  const bodyComposition = useApi<BodyCompositionHistory>(
    (token) => api.memberBodyComposition(memberId, token),
    [memberId],
  );

  // A member is opened from Members, from a marketing source's acquisition
  // list, and from search results elsewhere — `back()` already returns to
  // whichever of those pushed this screen, via each tab's own history. The
  // `canGoBack` guard only matters for the rare case of landing here directly
  // (a deep link) with no history to unwind.
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace('/(owner)/members' as never);

  if (detail.loading) return <Loading label="Loading member" />;

  if (detail.error || !detail.data) {
    const offline = detail.error?.code === OFFLINE_CODE;
    const forbidden = detail.error?.status === 403;
    return (
      <Screen>
        <ScreenHeader title="Member" onBack={goBack} />
        <ErrorState
          offline={offline}
          title={offline ? undefined : forbidden ? 'Outside your branches' : 'We could not load this member'}
          detail={
            offline
              ? undefined
              : forbidden
                ? 'This member is at a branch you do not have access to.'
                : detail.error?.message
          }
          onRetry={forbidden ? undefined : detail.reload}
        />
      </Screen>
    );
  }

  const { client, recent_workouts: workouts, activity, intake } = detail.data;
  const journey = client.journey;
  const pack = client.pt_package;
  const isPt = Boolean(journey?.pt_converted && pack);
  const recentVisits = activity.filter((entry) => entry.kind === 'gym_visit').slice(0, 8);
  const todayWorkout = workouts[0]?.session_date === todayIso() ? workouts[0] : null;
  const membershipPayments = (payments.data ?? []).slice(0, 5);

  return (
    <Screen>
      <ScreenHeader
        title="Member"
        onBack={goBack}
        action={
          <LinkButton
            title="Message"
            testID="message-member"
            onPress={() =>
              router.push({
                pathname: '/(owner)/broadcast',
                params: { memberId: String(client.member_id), memberName: client.full_name },
              } as never)
            }
          />
        }
      />
      <Body
        refreshControl={
          <RefreshControl
            refreshing={detail.refreshing}
            onRefresh={() => {
              void detail.refresh();
              void payments.refresh();
              void strength.refresh();
              void bodyComposition.refresh();
            }}
            tintColor={color.brand}
          />
        }
      >
        {/* ------------------------------------------------------- header */}
        <Row gap="md">
          <Avatar name={client.full_name} size={52} accent />
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="heading">{client.full_name}</Text>
            <Row gap="xs">
              {client.membership_status ? (
                <Badge
                  label={client.membership_status}
                  tone={client.membership_status === 'active' ? 'positive' : 'critical'}
                />
              ) : null}
              <KindTag kind={isPt ? 'pt_session' : 'own_workout'} />
            </Row>
            <Text variant="label" tone={color.textTertiary}>
              {client.member_code}
              {client.joined_on ? ` · joined ${dayLabel(client.joined_on)}` : ''}
            </Text>
          </Stack>
        </Row>

        {/* -------------------------------------------------- membership */}
        <Section title="Membership">
          <Card>
            <Row gap="sm">
              <Eyebrow>Plan</Eyebrow>
              <Spacer />
              {client.days_remaining !== null ? (
                <Text
                  variant="label"
                  tone={
                    client.days_remaining < 0
                      ? color.status.critical
                      : client.days_remaining <= 30
                        ? color.status.caution
                        : color.textTertiary
                  }
                >
                  {membershipDaysLabel(client.days_remaining)}
                </Text>
              ) : null}
            </Row>
            <Text variant="body">{client.membership_plan ?? 'No membership on file'}</Text>
          </Card>

          {payments.data && membershipPayments.length ? (
            <Card>
              <Eyebrow>Recent payments</Eyebrow>
              <Divider />
              {membershipPayments.map((payment) => (
                <Row key={payment.id} gap="sm">
                  <Text variant="label" tone={color.textSecondary} style={styles.grow}>
                    {payment.kind.replace('_', ' ')}
                    {payment.paid_at ? ` · ${dayLabel(payment.paid_at)}` : ''}
                  </Text>
                  <Text
                    variant="mono"
                    tone={payment.status === 'paid' ? color.status.positive : color.status.caution}
                  >
                    {money(payment.amount, payment.currency)}
                  </Text>
                  <Badge
                    label={payment.status}
                    tone={payment.status === 'paid' ? 'positive' : 'caution'}
                  />
                </Row>
              ))}
            </Card>
          ) : payments.data ? (
            <Text variant="label" tone={color.textTertiary}>
              No payments on file for this member.
            </Text>
          ) : null}
        </Section>

        {/* ---------------------------------------------------- training */}
        <Section title="Training">
          {journey ? (
            <JourneyBar
              currentDay={journey.current_day}
              totalDays={journey.duration_days}
              phase={journey.phase}
              daysCompleted={journey.days_completed}
              completionPct={journey.completion_pct}
            />
          ) : (
            <Text variant="label" tone={color.textTertiary}>
              No General Training programme on record.
            </Text>
          )}

          {isPt && pack ? (
            <ProgressCard
              testID="pt-package-progress"
              label="PT package"
              value={pack.sessions_remaining}
              total={pack.sessions_total}
              percent={pack.sessions_total ? (pack.sessions_used / pack.sessions_total) * 100 : 0}
              caption={`${pack.trainer_name ?? 'No trainer assigned'} · ${pack.effective_status_label}`}
              tone={pack.effective_status === 'pt_active' ? (pack.low_balance ? 'caution' : 'brand') : 'caution'}
              trailing={<Badge label="left" tone="neutral" />}
            />
          ) : journey && !journey.pt_converted && journey.status === 'completed' ? (
            <Badge label="Ready for PT" tone="brand" solid />
          ) : null}

          {isPt && client.next_pt_session ? (
            <Card>
              <Row gap="sm">
                <KindTag kind="pt_session" />
                <Spacer />
                <Badge label={`Session ${client.next_pt_session.session_number}`} tone="brand" />
              </Row>
              <Text variant="body">
                {dayLabel(client.next_pt_session.session_date)}
              </Text>
            </Card>
          ) : null}
        </Section>

        {/* -------------------------------------------------- attendance */}
        <FitnessProfile intake={intake} />

        <Section title="Attendance">
          <StatRow>
            <StatCard
              label="Visits"
              value={client.visits_last_30}
              hint="last 30 days"
              icon="footsteps-outline"
            />
            <StatCard
              label="Last seen"
              value={client.last_seen_on ? dayLabel(client.last_seen_on) : 'Never'}
              hint={client.last_seen_on ? daysAgoLabel(client.last_seen_on) : undefined}
              icon="time-outline"
            />
          </StatRow>

          {recentVisits.length ? (
            <Card>
              <Eyebrow>Recent visits</Eyebrow>
              <Divider />
              {recentVisits.map((entry: ActivityEntry, index) => (
                <Text key={`${entry.on}-${index}`} variant="label" tone={color.textSecondary}>
                  {dayLabel(entry.on)}
                </Text>
              ))}
            </Card>
          ) : (
            <Text variant="label" tone={color.textTertiary}>
              No visits recorded yet.
            </Text>
          )}
        </Section>

        {/* ------------------------------------------------------ workout */}
        <Section title="Workout">
          {todayWorkout ? (
            <Card>
              <Row gap="sm">
                <Eyebrow>Today</Eyebrow>
                <Spacer />
                <Badge
                  label={
                    todayWorkout.status === 'completed'
                      ? 'Done'
                      : `${todayWorkout.completed_items}/${todayWorkout.total_items}`
                  }
                  tone={WORKOUT_TONE[todayWorkout.status] ?? 'neutral'}
                />
              </Row>
              <Text variant="body">{todayWorkout.split_label ?? todayWorkout.program_day_name}</Text>
            </Card>
          ) : (
            <Text variant="label" tone={color.textTertiary}>
              No workout started today.
            </Text>
          )}

          {workouts.length ? (
            <Card>
              <Eyebrow>Recent workouts</Eyebrow>
              <Divider />
              {workouts.slice(0, 6).map((workout) => (
                <Row key={workout.id} gap="md" style={styles.row}>
                  <Stack gap="xxs" style={styles.grow}>
                    <Text variant="body">{workout.split_label ?? workout.program_day_name}</Text>
                    <Text variant="label" tone={color.textTertiary}>
                      {dayLabel(workout.session_date)}
                    </Text>
                  </Stack>
                  <Badge
                    label={
                      workout.status === 'completed'
                        ? 'Done'
                        : `${workout.completed_items}/${workout.total_items}`
                    }
                    tone={WORKOUT_TONE[workout.status] ?? 'neutral'}
                  />
                </Row>
              ))}
            </Card>
          ) : null}
        </Section>

        {/* ----------------------------------------------------- progress */}
        <Section title="Progress">
          {journey ? (
            <StatRow>
              <StatCard
                label="Workouts"
                value={journey.workouts_completed}
                hint="this programme"
                icon="barbell-outline"
              />
              <StatCard
                label="Programme"
                value={`${Math.round(journey.completion_pct)}%`}
                hint={`day ${journey.current_day} of ${journey.duration_days}`}
                icon="flag-outline"
              />
            </StatRow>
          ) : null}

          {strength.data ? <RecentStrength trend={strength.data} /> : null}
        </Section>

        <Section title="Body composition">
          {bodyComposition.data ? <CompactBodyComposition history={bodyComposition.data} /> : null}
        </Section>
      </Body>
    </Screen>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildStyles() {
  return StyleSheet.create({
  grow: { flex: 1 },
  row: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
});
}
