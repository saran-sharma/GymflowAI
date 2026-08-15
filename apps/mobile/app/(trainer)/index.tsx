/**
 * The Trainer Desk.
 *
 * One screen answering the three things a trainer checks between sessions:
 * what is on today, who am I coaching, and am I on track for the incentive.
 *
 * Who is on the floor leads, because it is what a trainer actually looks up
 * between sessions. The shift card that used to sit here is gone — checking in
 * is a once-a-day act and does not deserve the top of a screen opened twenty
 * times — but the route survives under More, since punctuality, late marks and
 * the whole incentive calculation are computed from those check-ins.
 */

import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  IncentiveResult,
  ScheduleItem,
  TrainerClient,
  TrainerToday,
  WhoIsInside,
} from '../../src/api/types';
import { LiveGym } from '../../src/components/livegym';
import { NotConnected } from '../../src/components/member';
import {
  Badge,
  Banner,
  Body,
  Button,
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
  SessionCard,
  Spacer,
  StatCard,
  StatRow,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { timeOfDay } from '../../src/utils/format';

/** A scheduled item's badge, from the status the server gave it. */
function itemStatus(item: ScheduleItem): { label: string; tone: 'positive' | 'caution' | 'critical' | 'neutral' } {
  switch (item.status) {
    case 'completed':
      return { label: 'Done', tone: 'positive' };
    case 'in_progress':
      return { label: 'Now', tone: 'caution' };
    case 'no_show':
    case 'missed':
      return { label: 'Missed', tone: 'critical' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
    default:
      return { label: 'Upcoming', tone: 'neutral' };
  }
}

const KIND_LABEL: Record<ScheduleItem['kind'], string> = {
  pt: 'PT session',
  group_class: 'Group class',
  own_workout_support: 'Supervised workout',
};

export default function TrainerDeskScreen() {
  const router = useRouter();
  const today = useApi<TrainerToday>((token) => api.myToday(token), []);
  const schedule = useApi<ScheduleItem[]>((token) => api.myScheduleToday(token), []);
  const clients = useApi<TrainerClient[]>((token) => api.myClients(token), []);
  const incentive = useApi<IncentiveResult>((token) => api.myIncentive(token), []);
  const inside = useApi<WhoIsInside>((token) => api.whoIsInside(token), []);

  const refreshAll = useCallback(() => {
    void today.refresh();
    void schedule.refresh();
    void clients.refresh();
    void incentive.refresh();
    void inside.refresh();
  }, [today, schedule, clients, incentive, inside]);

  if (today.loading && schedule.loading) return <SkeletonScreen cards={3} />;

  if (today.error && schedule.error) {
    const offline = today.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your desk'}
          detail={offline ? undefined : today.error.message}
          onRetry={refreshAll}
        />
      </Screen>
    );
  }

  const trainer = today.data?.trainer;
  const items = schedule.data ?? [];
  const roster = clients.data ?? [];
  const pay = incentive.data;

  const done = items.filter((item) => item.status === 'completed').length;
  const activeClients = roster.filter(
    (client) => client.pt_package?.status === 'active' || client.journey?.status === 'active',
  ).length;
  const lowBalance = roster.filter((client) => client.pt_package?.low_balance).length;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl refreshing={today.refreshing} onRefresh={refreshAll} tintColor={color.brand} />
        }
      >
        <Stack gap="xxs">
          <Eyebrow>Trainer</Eyebrow>
          <Text variant="title">{trainer?.full_name ?? 'Your desk'}</Text>
          <Text variant="body" tone={color.textSecondary}>
            {trainer?.specialty ?? trainer?.designation ?? 'Personal trainer'}
            {trainer?.branch_name ? ` · ${trainer.branch_name}` : ''}
          </Text>
        </Stack>

        {/* Who is on the floor right now — the first thing a trainer looks at. */}
        <Section
          title="Currently in gym"
          action={<Badge label="Live" tone="critical" solid />}
        >
          {inside.loading ? (
            <Text variant="label" tone={color.textTertiary}>
              Checking the floor…
            </Text>
          ) : inside.error ? (
            <Text variant="label" tone={color.status.caution}>
              The floor list did not load. Pull to refresh.
            </Text>
          ) : inside.data ? (
            <LiveGym
              data={inside.data}
              emptyDetail="Members appear here the moment they scan in at your branch."
            />
          ) : null}
        </Section>

        {/* What the desk can actually count. */}
        <StatRow>
          <StatCard
            label="Sessions today"
            value={items.length}
            hint={`${done} done`}
            tone={items.length ? 'brand' : 'neutral'}
            icon="calendar-outline"
          />
          <StatCard
            label="Active clients"
            value={activeClients}
            hint={`of ${roster.length}`}
            icon="people-outline"
          />
          <StatCard
            label="Low balance"
            value={lowBalance}
            hint="need renewal"
            tone={lowBalance ? 'caution' : 'neutral'}
            icon="alert-circle-outline"
          />
        </StatRow>

        <Button
          title="Publish availability"
          variant="secondary"
          icon="calendar-outline"
          onPress={() => router.push('/(trainer)/availability' as never)}
        />

        {/* Accountability, computed by the server's incentive service. */}
        {pay ? (
          <Card>
            <Row gap="sm">
              <Eyebrow>Your accountability</Eyebrow>
              <Spacer />
              <Badge
                label={
                  pay.status === 'eligible'
                    ? 'Incentive eligible'
                    : pay.status === 'needs_review'
                      ? 'Needs review'
                      : 'Not eligible'
                }
                tone={
                  pay.status === 'eligible'
                    ? 'positive'
                    : pay.status === 'needs_review'
                      ? 'caution'
                      : 'critical'
                }
                solid={pay.status === 'eligible'}
              />
            </Row>

            <Text variant="label" tone={color.textTertiary}>
              {pay.period_start} — {pay.period_end}
            </Text>

            <Divider />

            <MetricRow
              label="Punctuality"
              value={`${Math.round(pay.punctuality_pct)}%`}
              progress={pay.punctuality_pct}
              tone={pay.punctuality_pct >= 90 ? 'positive' : 'caution'}
            />
            <MetricRow
              label="Attendance"
              value={`${Math.round(pay.attendance_pct)}%`}
              progress={pay.attendance_pct}
              tone={pay.attendance_pct >= 90 ? 'positive' : 'caution'}
            />
            <MetricRow
              label="Shifts completed"
              value={`${pay.completed_shifts} / ${pay.scheduled_shifts}`}
              progress={
                pay.scheduled_shifts ? (pay.completed_shifts / pay.scheduled_shifts) * 100 : 0
              }
            />

            {pay.checks.length ? (
              <>
                <Divider />
                <Stack gap="xs">
                  {pay.checks.map((check) => (
                    <Row key={check.key} gap="sm">
                      <Text variant="label" tone={color.textSecondary} style={styles.grow}>
                        {check.label}
                      </Text>
                      <Badge
                        label={check.passed ? 'Pass' : 'Fail'}
                        tone={check.passed ? 'positive' : 'critical'}
                      />
                    </Row>
                  ))}
                </Stack>
              </>
            ) : null}

            <Text variant="label" tone={color.textTertiary}>
              {pay.disclaimer}
            </Text>
          </Card>
        ) : null}

        {/* Today's sessions. */}
        <Section
          title="Today's sessions"
          action={
            items.length ? (
              <LinkButton title="All sessions" onPress={() => router.push('/(trainer)/sessions' as never)} />
            ) : undefined
          }
        >
          {items.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="Nothing scheduled today"
              detail="PT sessions and classes assigned to you appear here as your branch books them."
            />
          ) : (
            items.map((item) => {
              const badge = itemStatus(item);
              return (
                <SessionCard
                  key={`${item.kind}-${item.reference_id}`}
                  kind={KIND_LABEL[item.kind]}
                  kindIcon={item.kind === 'group_class' ? 'people' : 'barbell'}
                  time={item.starts_at ? timeOfDay(item.starts_at) : undefined}
                  title={item.member_name ?? item.title}
                  subtitle={
                    item.session_number
                      ? `Session ${item.session_number}${item.package_size ? ` of ${item.package_size}` : ''}`
                      : (item.subtitle ?? undefined)
                  }
                  status={{ label: badge.label, tone: badge.tone }}
                  onPress={
                    item.kind === 'pt'
                      ? () => router.push(`/(trainer)/pt/${item.reference_id}` as never)
                      : item.kind === 'group_class'
                        ? () => router.push('/(trainer)/classes' as never)
                        : undefined
                  }
                />
              );
            })
          )}
        </Section>

        {clients.error ? (
          <Banner tone="caution" icon="alert-circle-outline">
            Your client list did not load. Pull to refresh.
          </Banner>
        ) : null}

        <Section
          title="Not available"
        >
          <Stack gap="sm">
            <NotConnected
              icon="cash-outline"
              title="Revenue and pending payments"
              detail="GymFlow has no billing model — no invoice, payment or ledger table — so there is no figure to show. PT packages carry an optional price, but nothing records what was collected."
            />
            <NotConnected
              icon="pulse-outline"
              title="Live floor attendance"
              detail="The eSSL X990 turnstile is not integrated yet. Check-ins recorded in GymFlow appear on your sessions; the live floor count does not."
            />
          </Stack>
        </Section>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
