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

import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  Assessment,
  Feeling,
  JourneyDay,
  MemberHome,
  MemberIntake,
  Payment,
  WorkoutItem,
  WorkoutSession,
} from '../../src/api/types';
import { AccountAvatar } from '../../src/components/account';
import {
  FeelingCheckIn,
  NotConnected,
  PtLine,
  TodayCard,
  WeekStrip,
  journeyToday,
} from '../../src/components/member';
import {
  Badge,
  Banner,
  Body,
  Card,
  Divider,
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
import { useAuth } from '../../src/store/AuthContext';
import { dayLabel, money, timeOfDay } from '../../src/utils/format';

/** "Good Morning" / "Good Afternoon" / "Good Evening" — device-local time. */
function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

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

/**
 * The exercise the member should walk to next.
 *
 * The first one they have not finished, in the order the chart lists them.
 * Null when every exercise is done — at which point the thing left to do is
 * finish the workout, which is not an exercise and lives on the chart.
 */
function nextExercise(session: WorkoutSession): WorkoutItem | null {
  return (
    [...session.items]
      .sort((a, b) => a.order_index - b.order_index)
      .find((item) => item.status !== 'completed') ?? null
  );
}

/** Sets actually logged today, across the whole workout. */
function loggedSets(session: WorkoutSession): number {
  return session.items.reduce((total, item) => total + item.sets_logged, 0);
}

export default function MemberHomeScreen() {
  const router = useRouter();
  const { withToken } = useAuth();
  const home = useApi<MemberHome>((token) => api.memberHome(token), []);
  const payments = useApi<Payment[]>((token) => api.myPayments(token), []);
  // The member's week, which replaces the internal 45-day counter.
  const days = useApi<JourneyDay[]>((token) => api.myJourneyDays(token), []);
  // The trainer's hand-measured Day 1–3 weight — the one real weight source
  // that exists today. It is not a repeated measurement, so there is no
  // trend to show against it; see `renderWeight` for the honest framing.
  const weight = useApi<Assessment | null>((token) => api.myAssessment(token), []);
  // First-time fitness onboarding. `null` means the front desk created the
  // account without an intake and the member has never filled one in — send
  // them to the questionnaire before Home. Any saved row (even one field)
  // counts as done. A failed fetch does not trap the member on a redirect.
  const intake = useApi<MemberIntake | null>((token) => api.myIntake(token), []);

  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);

  const submitFeeling = useCallback(
    async (feeling: Feeling) => {
      setCheckinBusy(true);
      setCheckinError(null);
      try {
        const result = await withToken((token) => api.submitCheckIn(feeling, token));
        // Updates the one field that changed rather than refetching the
        // whole screen — the member just answered a question, not started a
        // new session.
        if (home.data) home.setData({ ...home.data, today_checkin: result });
      } catch (caught) {
        setCheckinError(
          caught instanceof ApiError ? caught.message : 'That did not save. Try again.',
        );
      } finally {
        setCheckinBusy(false);
      }
    },
    [withToken, home],
  );

  /* Home now sends the member straight into logging, so it is the screen they
   * come back to — and its counts describe a moment that has already passed.
   *
   * The callback holds no dependencies and reaches the current refresh through
   * a ref, so it never changes identity; one rebuilt each render would make
   * `useFocusEffect` fire on every render, which is a fetch loop. The first
   * focus is skipped because `useApi` has already fetched on mount. */
  const refreshOnReturn = useRef(home.refresh);
  refreshOnReturn.current = home.refresh;
  const arrived = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!arrived.current) {
        arrived.current = true;
        return;
      }
      void refreshOnReturn.current();
    }, []),
  );

  if (home.loading || intake.loading) return <SkeletonScreen cards={3} />;

  if (!intake.error && intake.data === null) {
    return <Redirect href="/(onboarding)/fitness-journey" />;
  }

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
  const pack = me.pt_package;

  const ptToday = pt ? isToday(pt.scheduled_start) : false;
  const restDay = journey?.split_today === 'rest';
  const journeyDone = journey?.status === 'completed';
  // The server reports "complete" for any journey that is not actively being
  // trained — finished, paused or cancelled — which is also the one signal
  // `start_workout` itself honours: off this phase it will not resolve the
  // member's real plan and instead opens a bare, unassigned session. Gating
  // the Today card on the same flag keeps the CTA from ever promising a
  // workout the server will not actually build.
  const journeyInactive = journey?.phase === 'complete';
  const daysRemaining = me.days_remaining;
  const membershipLapsed = daysRemaining !== null && daysRemaining < 0;
  const expiringSoon = daysRemaining !== null && daysRemaining <= 30;
  const membershipExpired = me.membership_status !== null && me.membership_status !== 'active';
  const owed = (payments.data ?? []).filter((row) => row.status === 'pending');
  const outstanding = owed.reduce((total, row) => total + row.amount, 0);

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
        {/* Establishes context immediately: who, when, and where. */}
        <Row gap="md">
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="title">
              {greeting()}, {me.full_name.split(' ')[0]}
            </Text>
            <Text variant="label" tone={color.textTertiary}>
              {me.branch_name}
            </Text>
          </Stack>
          {me.is_inside ? <Badge label="Inside" tone="positive" solid /> : null}
          <AccountAvatar size={44} />
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

        {/* Quick personal status — how the member is doing right now, in the
            two things GymFlow can actually say something real about. Weight
            is a single hand-measured point, not a tracked series, so it is
            framed by when it was recorded rather than implied to be today's.
            Feeling is the member's own answer, optional and one tap. */}
        <Card>
          {renderWeight()}
          <Divider />
          {checkinError ? (
            <Banner tone="critical" icon="alert-circle-outline">
              {checkinError}
            </Banner>
          ) : null}
          <FeelingCheckIn
            value={me.today_checkin?.feeling ?? null}
            busy={checkinBusy}
            onSelect={(feeling) => void submitFeeling(feeling)}
          />
        </Card>

        {/* The training week, immediately under today's session.
            Not the 45-day counter: that is a business rule about when a
            trainer is asked to review somebody, and showing a member a
            deadline they were never told about and cannot act on is worse
            than showing them what they are training this week. */}
        {journey && !journeyDone ? (
          <WeekStrip
            days={days.data ?? []}
            today={journeyToday(journey)}
            onPress={() => router.push('/(member)/workout' as never)}
          />
        ) : null}

        {journeyDone && journey ? (
          <Card>
            <Eyebrow>Programme complete</Eyebrow>
            <Text variant="heading">General Training complete</Text>
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

        {/* An active PT package with nothing booked yet still says so — a
            converted member should never land on Home and see no sign they
            are on PT at all. Gated on effective status, not the package's
            own status: a lapsed membership leaves the package row
            untouched, so this only shows "PT with {trainer}" for a member
            who can actually train PT today. */}
        {!pt && pack && me.effective_pt_status === 'pt_active' ? (
          <StatCard
            label={pack.trainer_name ? `PT with ${pack.trainer_name}` : 'Personal training'}
            value={pack.sessions_remaining}
            hint={`of ${pack.sessions_total} sessions left`}
            tone={pack.low_balance ? 'caution' : 'brand'}
            icon="person"
            onPress={() => router.push('/(member)/pt' as never)}
          />
        ) : null}

        {!pt && pack && me.effective_pt_status === 'pt_paused_membership_expired' ? (
          <StatCard
            label="PT paused — membership expired"
            value={pack.sessions_remaining}
            hint={`of ${pack.sessions_total} sessions kept, renew to resume`}
            tone="caution"
            icon="pause"
            onPress={() => router.push('/(member)/pt' as never)}
          />
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
            // `ends_on` can fall behind `membership_status` for a day or two,
            // so a lapsed plan is caught here too rather than trusting the
            // status card above alone — and a negative count reads as a typo,
            // not as "expired", if it is shown as a plain signed number.
            value={daysRemaining === null ? '—' : membershipLapsed ? 'Expired' : daysRemaining}
            unit={membershipLapsed ? undefined : 'on plan'}
            tone={membershipLapsed ? 'critical' : expiringSoon ? 'caution' : undefined}
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
    // A same-day PT session outranks everything else on the card, including
    // "no General Training journey" below — a member can be on PT with no GT
    // journey at all (a package created with no `journey_id`), and one whose
    // session is today should never be told their programme "has not
    // started" while it is, quite literally, starting in a few hours.
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

    if (!journey) {
      // Still true when there is no GT journey to speak of, but PT on its own
      // is a programme too — "has not started" would be false for a member
      // several sessions into PT. The full detail already lives in the
      // "Next PT session" section (or the package summary) further down, so
      // this only needs to say there is nothing to do today specifically.
      if (pt || (pack && me.effective_pt_status === 'pt_active')) {
        return (
          <Card>
            <Eyebrow>Today</Eyebrow>
            <Text variant="heading">No session today</Text>
            <Text variant="body" tone={color.textSecondary}>
              {pt
                ? 'Your next PT session is below.'
                : 'Nothing booked yet. Ask your branch to schedule your next PT session.'}
            </Text>
          </Card>
        );
      }
      return (
        <Card>
          <Eyebrow>Today</Eyebrow>
          <Text variant="heading">Your programme has not started</Text>
          <Text variant="body" tone={color.textSecondary}>
            Your trainer sets up your training programme with you at {me.branch_name}.
          </Text>
        </Card>
      );
    }

    // Nothing left to start. A completed journey is covered by the
    // "Programme complete" card below; a paused or cancelled one has no card
    // to fall back to, and showing nothing here is more honest than a CTA
    // that would open an empty, unassigned session.
    if (journeyInactive) return null;

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
    const next = started ? nextExercise(workout) : null;
    const chart = () => router.push('/(member)/workout' as never);

    return (
      <TodayCard
        testID="today-card"
        kind="own_workout"
        title={workout?.split_label ?? workout?.program_day_name ?? journey.split_today.toUpperCase()}
        subtitle={todaySubtitle()}
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
        // The CTA is the shortest honest sentence about what happens next, and
        // it lands wherever that actually is. Starting and finishing both live
        // on the chart; continuing lands on the exercise itself, because the
        // chart in between is a list the member would only scroll past.
        cta={
          done
            ? 'Review today’s workout'
            : next
              ? `Continue · ${next.exercise}`
              : started
                ? 'Finish workout'
                : 'Start today’s workout'
        }
        onPress={
          next && workout
            ? () =>
                router.push({
                  pathname: '/(member)/exercise/[itemId]',
                  params: { itemId: String(next.id), sessionId: String(workout.id) },
                })
            : chart
        }
        secondary={next ? { label: 'See the full chart', onPress: chart } : undefined}
      />
    );
  }

  /**
   * The one real weight source that exists today: the trainer's hand-measured
   * Day 1–3 assessment. It is a single point, not a series — no second
   * measurement exists anywhere to compare it against — so this states when
   * it was recorded rather than implying a "current" figure from today, and
   * never draws a trend arrow the data cannot back up.
   *
   * A body-composition trend (weight, body fat, muscle) belongs to InBody,
   * which is not connected — see `docs/INTEGRATIONS.md`. That gap is exactly
   * the empty state below, not a number.
   */
  function renderWeight() {
    const assessment = weight.data;
    if (weight.loading) {
      return (
        <Row gap="sm">
          <Eyebrow>Weight</Eyebrow>
        </Row>
      );
    }
    if (!assessment || assessment.weight_kg === null) {
      return (
        <Row gap="sm">
          <Eyebrow>Weight</Eyebrow>
          <Spacer />
          <Text variant="label" tone={color.textTertiary}>
            Not recorded yet
          </Text>
        </Row>
      );
    }
    return (
      <Row gap="md" align="center">
        <Stack gap="xxs" style={styles.grow}>
          <Eyebrow>Weight</Eyebrow>
          <Text variant="heading">{assessment.weight_kg} kg</Text>
        </Stack>
        {assessment.recorded_at ? (
          <Text variant="label" tone={color.textTertiary}>
            Recorded {dayLabel(assessment.recorded_at)}
          </Text>
        ) : null}
      </Row>
    );
  }

  /**
   * The line under the split.
   *
   * Once a workout is finished it states what was actually done — sets logged,
   * not exercises ticked — because that is the number the member built today
   * and the only one that came from them rather than from the plan.
   */
  function todaySubtitle(): string {
    if (!journey) return '';
    if (!workout) {
      return journey.phase === 'assessment'
        ? 'Assessment and cardio with your trainer'
        : 'Your chart is ready — tap to start';
    }

    const sets = loggedSets(workout);
    if (workout.status === 'completed') {
      return sets > 0
        ? `${workout.total_items} exercises · ${sets} ${sets === 1 ? 'set' : 'sets'} logged`
        : `${workout.total_items} exercises done`;
    }

    const progress = `${workout.completed_items} of ${workout.total_items} exercises done`;
    return sets > 0 ? `${progress} · ${sets} ${sets === 1 ? 'set' : 'sets'} logged` : progress;
  }
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
