/**
 * Member home.
 *
 * The screen answers two questions in the order a member actually asks them:
 * "what am I doing today?" and then "how am I doing overall?". Everything that
 * is neither of those sits below both, or on another screen entirely.
 *
 * It is still one request. Opening the app on gym wifi should not cost six
 * round trips, and reading `/members/me/home` also settles a finished journey
 * server-side — which is how Day 45 completes without anyone pressing anything.
 */

import { useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { MemberHome, Payment } from '../../src/api/types';
import { AccountAvatar } from '../../src/components/account';
import {
  JourneyBar,
  NotConnected,
  PtLine,
  TodayCard,
  type SessionKind,
} from '../../src/components/member';
import {
  Badge,
  Body,
  Card,
  ErrorState,
  Eyebrow,
  LinkButton,
  MetricTile,
  Row,
  Screen,
  SkeletonScreen,
  StatCard,
  Section,
  Spacer,
  StatRow,
  Stack,
  Text,
  color,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { dayLabel, money, timeOfDay } from '../../src/utils/format';

/** Local midnight-to-midnight test, so "today" means the member's today. */
function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return false;
  const now = new Date();
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}

export default function MemberHomeScreen() {
  const router = useRouter();
  const home = useApi<MemberHome>((token) => api.memberHome(token), []);
  const payments = useApi<Payment[]>((token) => api.myPayments(token), []);

  if (home.loading) return <SkeletonScreen cards={3} />;

  if (home.error || !home.data) {
    const offline = home.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your day'}
          detail={
            offline
              ? undefined
              : (home.error?.message ??
                'Your plan is safe — this is a problem reaching SLAM, not with your account.')
          }
          onRetry={home.reload}
        />
      </Screen>
    );
  }

  const me = home.data;
  const journey = me.journey;
  const workout = me.today_workout;
  const pt = me.next_pt_session;

  const ptToday = pt ? isToday(pt.scheduled_start) : false;
  const restDay = journey?.split_today === 'rest';
  const journeyDone = journey?.status === 'completed';
  const expiringSoon = me.days_remaining !== null && me.days_remaining <= 30;
  const membershipExpired = me.membership_status !== null && me.membership_status !== 'active';
  const owed = (payments.data ?? []).filter((row) => row.status === 'pending');
  const outstanding = owed.reduce((total, row) => total + row.amount, 0);

  const kind: SessionKind = ptToday ? 'pt_session' : restDay ? 'rest' : 'own_workout';

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={home.refreshing}
            onRefresh={() => void home.refresh()}
            tintColor={color.brand}
          />
        }
      >
        {/* Who and where. Quiet — the member knows their own name. */}
        <Row gap="md">
          <AccountAvatar size={44} />
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="heading">{me.full_name}</Text>
            <Text variant="label" tone={color.textTertiary}>
              {me.branch_name}
            </Text>
          </Stack>
          {me.is_inside ? <Badge label="Inside" tone="positive" solid /> : null}
        </Row>

        {membershipExpired ? (
          <Card>
            <Row gap="sm">
              <Eyebrow>Membership</Eyebrow>
              <Spacer />
              <Badge label={me.membership_status ?? 'inactive'} tone="critical" />
            </Row>
            <Text variant="body" tone={color.textSecondary}>
              Your membership is not active. Speak to the front desk at {me.branch_name} to train
              again.
            </Text>
          </Card>
        ) : null}

        {outstanding > 0 ? (
          <Card>
            <Row gap="sm">
              <Eyebrow>Payment due</Eyebrow>
              <Spacer />
              <Badge label={money(outstanding)} tone="caution" />
            </Row>
            <Text variant="body" tone={color.textSecondary}>
              {owed.length === 1 ? 'One charge is' : `${owed.length} charges are`} outstanding on
              your account. Settle at the front desk at {me.branch_name}.
            </Text>
          </Card>
        ) : null}

        {/* Today. The one thing this screen exists to say. */}
        {renderToday()}

        {/* The 45 days, immediately under today's session. */}
        {journey && !journeyDone ? (
          <JourneyBar
            currentDay={journey.current_day}
            totalDays={journey.duration_days}
            phase={journey.phase}
            daysCompleted={journey.days_completed}
            completionPct={journey.completion_pct}
            onPress={() => router.push('/(member)/progress' as never)}
          />
        ) : null}

        {journeyDone && journey ? (
          <Card>
            <Eyebrow>Programme complete</Eyebrow>
            <Text variant="heading">All {journey.duration_days} days done.</Text>
            <Text variant="body" tone={color.textSecondary}>
              {journey.workouts_completed} workouts recorded. Your trainer plans what comes next.
            </Text>
            {!journey.pt_converted ? (
              <LinkButton
                title="See what comes next"
                onPress={() => router.push('/(member)/pt' as never)}
              />
            ) : null}
          </Card>
        ) : null}

        {/* The next PT session, when it is not already today's card. */}
        {pt && !ptToday ? (
          <Section title="Next PT session">
            <PtLine
              trainerName={pt.trainer_name}
              sessionNumber={pt.session_number}
              packageSize={pt.package_size}
              when={`${dayLabel(pt.session_date)} · ${timeOfDay(pt.scheduled_start)}`}
              onPress={() => router.push('/(member)/pt' as never)}
            />
          </Section>
        ) : null}

        {/* How am I doing — three numbers, no more. */}
        <StatRow>
          <MetricTile
            label="Streak"
            value={me.streak_days}
            unit={me.streak_days === 1 ? 'day' : 'days'}
            tone={me.streak_days > 0 ? 'positive' : undefined}
            icon="flame"
          />
          <MetricTile
            label="Workouts"
            value={journey?.workouts_completed ?? 0}
            unit="done"
            icon="barbell"
          />
          <MetricTile
            label="Days left"
            value={me.days_remaining ?? '—'}
            unit="on plan"
            tone={expiringSoon ? 'caution' : undefined}
            icon="calendar"
          />
        </StatRow>

        <Section
          title="Progress"
          action={
            <LinkButton
              title="View all"
              onPress={() => router.push('/(member)/progress' as never)}
            />
          }
        >
          <NotConnected
            icon="body-outline"
            title="No InBody scan on file"
            detail="Weight, body fat and muscle mass appear here once your branch connects its InBody machine to GymFlow."
          />
        </Section>

        {/* Everything below is secondary and is allowed to look it. */}
        {me.next_class ? (
          <Section title="Next class">
            <StatCard
              label={me.next_class.name}
              value={timeOfDay(me.next_class.starts_at)}
              hint={
                me.next_class.my_response === 'yes'
                  ? 'You said yes'
                  : `${me.next_class.available} places left`
              }
              tone={me.next_class.my_response === 'yes' ? 'positive' : 'neutral'}
              onPress={() => router.push('/(member)/classes' as never)}
            />
          </Section>
        ) : null}

        {me.unread_alerts > 0 ? (
          <LinkButton
            title={`${me.unread_alerts} update${me.unread_alerts === 1 ? '' : 's'} for you`}
            onPress={() => router.push('/(member)/alerts' as never)}
          />
        ) : null}
      </Body>
    </Screen>
  );

  /**
   * Today's card, in the order the day is actually decided: a booked PT
   * session outranks a solo workout, a rest day outranks an empty chart, and
   * "no journey yet" is stated rather than dressed up as a workout.
   */
  function renderToday() {
    if (!journey) {
      return (
        <Card>
          <Eyebrow>Today</Eyebrow>
          <Text variant="heading">Your programme has not started</Text>
          <Text variant="body" tone={color.textSecondary}>
            Your trainer starts your 45-day journey with you at {me.branch_name}.
          </Text>
        </Card>
      );
    }

    if (ptToday && pt) {
      return (
        <TodayCard
          testID="today-card"
          kind="pt_session"
          title={pt.trainer_name ?? 'Your trainer'}
          subtitle={`Session ${pt.session_number}${
            pt.package_size ? ` of ${pt.package_size}` : ''
          } · ${timeOfDay(pt.scheduled_start)}`}
          status={pt.member_checked_in_at ? 'Checked in' : 'Upcoming'}
          statusTone={pt.member_checked_in_at ? 'positive' : 'neutral'}
          cta="Open your PT session"
          onPress={() => router.push('/(member)/pt' as never)}
        />
      );
    }

    if (restDay) {
      return (
        <TodayCard
          testID="today-card"
          kind="rest"
          title="Rest & recovery"
          subtitle="No workout is planned for today. Rest is part of the programme."
          cta="See your week"
          onPress={() => router.push('/(member)/workout' as never)}
        />
      );
    }

    const started = workout !== null;
    const done = workout?.status === 'completed';

    return (
      <TodayCard
        testID="today-card"
        kind="own_workout"
        title={workout?.split_label ?? journey.split_today.toUpperCase()}
        subtitle={
          started
            ? `${workout.completed_items} of ${workout.total_items} exercises done`
            : journey.phase === 'assessment'
              ? `Day ${journey.current_day} · assessment and cardio with your trainer`
              : `Day ${journey.current_day} of ${journey.duration_days}`
        }
        percent={
          started && workout.total_items
            ? (workout.completed_items / workout.total_items) * 100
            : undefined
        }
        ringLabel={
          started && workout.total_items
            ? `${workout.completed_items}/${workout.total_items}`
            : undefined
        }
        status={done ? 'Completed' : started ? 'In progress' : undefined}
        statusTone={done ? 'positive' : 'brand'}
        cta={
          done ? 'Review today’s workout' : started ? 'Continue workout' : 'Start today’s workout'
        }
        onPress={() => router.push('/(member)/workout' as never)}
      />
    );
  }
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
