/**
 * One client, as the trainer needs them before a session.
 *
 * The server refuses this screen for a member who is not assigned to the
 * signed-in trainer, so nothing here re-checks the relationship — a 403 is the
 * access control, not a hint the UI is free to work around.
 *
 * Medical and injury information is absent because GymFlow has no model for
 * it. That is a gap to close on the server, not something to approximate from
 * a notes field.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type { BodyCompositionHistory, StrengthTrend, TrainerClientDetail } from '../../../src/api/types';
import { ConvertToPt, conversionState } from '../../../src/components/conversion';
import {
  CompactBodyComposition,
  JourneyBar,
  KindTag,
  NotConnected,
  RecentStrength,
} from '../../../src/components/member';
import {
  Avatar,
  Badge,
  Body,
  Button,
  Card,
  Divider,
  ErrorState,
  Eyebrow,
  Loading,
  ProgressCard,
  Row,
  Screen,
  Section,
  Spacer,
  StatCard,
  StatRow,
  Stack,
  Text,
  color,
  space,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { useAuth } from '../../../src/store/AuthContext';
import { dayLabel, daysAgoLabel, membershipDaysLabel, timeOfDay } from '../../../src/utils/format';

/**
 * "Last seen", short enough for a three-across stat row.
 *
 * `dayLabel`'s weekday makes it the one value in this row long enough to
 * clip against `StatCard`'s 28px mono digits — the other two are one or two
 * digits. Dropping the weekday (already implied by the "Yesterday" / "N
 * days ago" hint underneath) keeps this card's value bounded the same way
 * a visit count or workout count already is.
 */
function shortDayLabel(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const SESSION_TONE: Record<string, 'positive' | 'caution' | 'critical' | 'neutral'> = {
  completed: 'positive',
  scheduled: 'neutral',
  in_progress: 'caution',
  no_show: 'critical',
  missed: 'critical',
  cancelled: 'neutral',
};

export default function TrainerClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const memberId = Number(id);

  const { withToken } = useAuth();
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const detail = useApi<TrainerClientDetail>(
    (token) => api.myClientDetail(memberId, token),
    [memberId],
  );
  // The sizes this branch sells. The server refuses anything else, so the
  // trainer is offered exactly what will be accepted.
  const options = useApi<number[]>((token) => api.ptOptions(token), []);
  const strength = useApi<StrengthTrend>(
    (token) => api.memberStrengthTrend(memberId, token),
    [memberId],
  );
  const bodyComposition = useApi<BodyCompositionHistory>(
    (token) => api.memberBodyComposition(memberId, token),
    [memberId],
  );

  /**
   * Record the trainer's decision.
   *
   * The client is re-read rather than patched locally: conversion changes the
   * package, the journey and which programme is authoritative, and a screen
   * that guessed at that would be showing a state the server never confirmed.
   * A 409 means somebody already converted them — which is a successful
   * outcome from this screen's point of view, so it refreshes rather than
   * complains.
   */
  const convert = useCallback(
    async (sessionsTotal: number) => {
      setConverting(true);
      setConvertError(null);
      try {
        await withToken((token) =>
          api.convertMemberToPt(memberId, { sessions_total: sessionsTotal, confirm: true }, token),
        );
        await detail.refresh();
      } catch (caught) {
        const failed = caught instanceof ApiError ? caught : null;
        if (failed?.status === 409) {
          await detail.refresh();
        } else {
          setConvertError(
            failed?.message ?? 'That did not go through. Check your connection and try again.',
          );
        }
      } finally {
        setConverting(false);
      }
    },
    [withToken, memberId, detail],
  );

  if (detail.loading) return <Loading label="Loading client" />;

  if (detail.error || !detail.data) {
    const offline = detail.error?.code === OFFLINE_CODE;
    const forbidden = detail.error?.status === 403;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={
            offline
              ? undefined
              : forbidden
                ? 'Not one of your clients'
                : 'We could not load this client'
          }
          detail={
            offline
              ? undefined
              : forbidden
                ? 'You can only open members assigned to you. Ask your branch if this should be your client.'
                : detail.error?.message
          }
          onRetry={forbidden ? undefined : detail.reload}
        />
      </Screen>
    );
  }

  const { client, recent_sessions: sessions, recent_workouts: workouts } = detail.data;
  const journey = client.journey;
  const pack = client.pt_package;

  // Reached only from Clients today, but back() should follow real history
  // rather than assume that — the same guard used everywhere else a pushed
  // detail screen needs a safe fallback for a no-history entry.
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace('/(trainer)/clients' as never);

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={detail.refreshing}
            onRefresh={() => {
              void detail.refresh();
              void strength.refresh();
              void bodyComposition.refresh();
            }}
            tintColor={color.brand}
          />
        }
      >
        <Row gap="md">
          <Avatar name={client.full_name} size={48} accent />
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="heading">{client.full_name}</Text>
            <Text variant="label" tone={color.textTertiary}>
              {client.member_code}
              {client.joined_on ? ` · joined ${dayLabel(client.joined_on)}` : ''}
            </Text>
          </Stack>
        </Row>

        <Card>
          <Row gap="sm">
            <Eyebrow>Membership</Eyebrow>
            <Spacer />
            {client.membership_status ? (
              <Badge
                label={client.membership_status}
                tone={client.membership_status === 'active' ? 'positive' : 'critical'}
              />
            ) : null}
          </Row>
          <Text variant="body">{client.membership_plan ?? 'No membership on file'}</Text>
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
        </Card>

        {journey ? (
          <JourneyBar
            currentDay={journey.current_day}
            totalDays={journey.duration_days}
            phase={journey.phase}
            daysCompleted={journey.days_completed}
            completionPct={journey.completion_pct}
          />
        ) : null}

        <ConvertToPt
          state={conversionState(journey, pack)}
          memberName={client.full_name}
          options={options.data ?? []}
          busy={converting}
          error={convertError}
          onConvert={convert}
        />

        {pack ? (
          <ProgressCard
            label="PT package"
            value={pack.sessions_remaining}
            total={pack.sessions_total}
            percent={pack.sessions_total ? (pack.sessions_used / pack.sessions_total) * 100 : 0}
            caption={`${pack.sessions_used} delivered · ${pack.status}`}
            tone={pack.low_balance ? 'caution' : 'brand'}
            trailing={<Badge label="left" tone="neutral" />}
          />
        ) : null}

        <StatRow>
          <StatCard
            label="Visits"
            value={client.visits_last_30}
            hint="last 30 days"
            icon="footsteps-outline"
          />
          <StatCard
            label="Workouts"
            value={journey?.workouts_completed ?? 0}
            hint="this programme"
            icon="barbell-outline"
          />
          <StatCard
            label="Last seen"
            value={client.last_seen_on ? shortDayLabel(client.last_seen_on) : 'Never'}
            hint={client.last_seen_on ? daysAgoLabel(client.last_seen_on) : undefined}
            icon="time-outline"
          />
        </StatRow>

        {client.next_pt_session ? (
          <Section title="Next session with you">
            <Card>
              <Row gap="sm">
                <KindTag kind="pt_session" />
                <Spacer />
                <Badge
                  label={`Session ${client.next_pt_session.session_number}${
                    client.next_pt_session.package_size
                      ? ` of ${client.next_pt_session.package_size}`
                      : ''
                  }`}
                  tone="brand"
                />
              </Row>
              <Text variant="heading">
                {dayLabel(client.next_pt_session.session_date)} ·{' '}
                {timeOfDay(client.next_pt_session.scheduled_start)}
              </Text>
            </Card>
          </Section>
        ) : null}

        <Section title="Recent PT sessions">
          {sessions.length === 0 ? (
            <Text variant="label" tone={color.textTertiary}>
              No PT sessions recorded with you yet.
            </Text>
          ) : (
            sessions.map((session) => (
              <Row key={session.id} gap="md" style={styles.row}>
                <Stack gap="xxs" style={styles.grow}>
                  <Text variant="body">Session {session.session_number}</Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {dayLabel(session.session_date)} · {timeOfDay(session.scheduled_start)}
                  </Text>
                </Stack>
                <Badge
                  label={session.status.replace('_', ' ')}
                  tone={SESSION_TONE[session.status] ?? 'neutral'}
                />
              </Row>
            ))
          )}
        </Section>

        <Section title="Recent workouts">
          <Button
            title="Edit programming"
            variant="secondary"
            icon="create-outline"
            onPress={() =>
              router.push({
                pathname: '/(trainer)/plan/[id]',
                params: { id: String(memberId), name: client.full_name },
              } as never)
            }
            testID="edit-programming"
          />
          {workouts.length === 0 ? (
            <Text variant="label" tone={color.textTertiary}>
              No own workouts recorded yet.
            </Text>
          ) : (
            workouts.map((workout) => (
              <Row key={workout.id} gap="md" style={styles.row}>
                <Stack gap="xxs" style={styles.grow}>
                  <Text variant="body">{workout.split_label}</Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {dayLabel(workout.session_date)}
                    {workout.day_number ? ` · day ${workout.day_number}` : ''}
                  </Text>
                </Stack>
                <Badge
                  label={
                    workout.status === 'completed'
                      ? 'Done'
                      : `${workout.completed_items}/${workout.total_items}`
                  }
                  tone={workout.status === 'completed' ? 'positive' : 'neutral'}
                />
              </Row>
            ))
          )}
        </Section>

        <Section title="Progress">
          {strength.data ? <RecentStrength trend={strength.data} /> : null}
        </Section>

        <Section title="Body composition">
          {bodyComposition.data ? <CompactBodyComposition history={bodyComposition.data} /> : null}
        </Section>

        <Section title="Not available">
          <Stack gap="sm">
            <NotConnected
              icon="medkit-outline"
              title="No medical or injury record"
              detail="GymFlow has no model for medical history or injury notes, so there is nothing to show or withhold here yet."
            />
            <NotConnected
              icon="card-outline"
              title="No payment status"
              detail="There is no billing model on the server, so this app cannot tell you whether a client has paid."
            />
          </Stack>
        </Section>

        <Divider />
        <Text
          variant="label"
          tone={color.brandAccent}
          accessibilityRole="button"
          onPress={goBack}
          style={styles.back}
        >
          Back to clients
        </Text>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  back: { paddingVertical: space.md },
});
