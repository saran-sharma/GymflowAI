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
import React from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type { TrainerClientDetail } from '../../../src/api/types';
import { JourneyBar, KindTag, NotConnected } from '../../../src/components/member';
import {
  Avatar,
  Badge,
  Body,
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
import { dayLabel, timeOfDay } from '../../../src/utils/format';

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

  const detail = useApi<TrainerClientDetail>(
    (token) => api.myClientDetail(memberId, token),
    [memberId],
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
            offline ? undefined : forbidden ? 'Not one of your clients' : 'We could not load this client'
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

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={detail.refreshing}
            onRefresh={() => void detail.refresh()}
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
              tone={client.days_remaining <= 30 ? color.status.caution : color.textTertiary}
            >
              {client.days_remaining} days remaining
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
            value={client.last_seen_on ? dayLabel(client.last_seen_on).split(' ')[0] : '—'}
            hint={client.last_seen_on ? dayLabel(client.last_seen_on) : 'never'}
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

        <Section title="Not available">
          <Stack gap="sm">
            <NotConnected
              icon="medkit-outline"
              title="No medical or injury record"
              detail="GymFlow has no model for medical history or injury notes, so there is nothing to show or withhold here yet."
            />
            <NotConnected
              icon="body-outline"
              title="No InBody history"
              detail="The scan table exists but nothing writes to it. Body composition appears here once the InBody integration is switched on."
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
          onPress={() => router.back()}
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
