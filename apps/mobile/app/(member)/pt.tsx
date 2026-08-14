/**
 * The member's personal training.
 *
 * What is shown is bounded by what the server will let a member do. Booking is
 * one of the things it will not: `POST /pt/sessions` answers a member with
 * "Ask your branch to book a PT session", and there is no availability model
 * behind it to offer slots from. So this screen does the honest version — it
 * shows the trainers at the member's branch and their specialities, and says
 * where booking actually happens, rather than drawing a picker that would fail
 * on submit.
 *
 * Prices are only ever echoed from configuration. An invented number in front
 * of a member would be worse than none at all.
 */

import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { PTOffer, PTPackage, PTSession, Trainer } from '../../src/api/types';
import { KindTag, NotConnected, PtLine } from '../../src/components/member';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Divider,
  Dot,
  EmptyState,
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
  radii,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { dayLabel, timeOfDay } from '../../src/utils/format';

const STATUS_META: Record<string, { label: string; tone: 'positive' | 'caution' | 'critical' | 'neutral' }> = {
  completed: { label: 'Completed', tone: 'positive' },
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'caution' },
  no_show: { label: 'No show', tone: 'critical' },
  missed: { label: 'Missed', tone: 'critical' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export default function MemberPtScreen() {
  const { withToken } = useAuth();
  const packageInfo = useApi<PTPackage | null>((token) => api.myPtPackage(token), []);
  const sessions = useApi<PTSession[]>((token) => api.myPtSessions(token), []);
  const offer = useApi<PTOffer>((token) => api.ptOffer(token), []);
  const trainers = useApi<Trainer[]>((token) => api.listTrainers(token), []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<number | null>(null);

  const refreshAll = useCallback(() => {
    void packageInfo.refresh();
    void sessions.refresh();
    void offer.refresh();
    void trainers.refresh();
  }, [packageInfo, sessions, offer, trainers]);

  const confirmArrival = useCallback(
    async (session: PTSession) => {
      setBusy(true);
      setError(null);
      try {
        await withToken((token) => api.ptRecordArrival(session.id, 'member', token));
        setConfirmed(session.id);
        refreshAll();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not record that.');
      } finally {
        setBusy(false);
      }
    },
    [withToken, refreshAll],
  );

  if (packageInfo.loading && offer.loading) return <Loading label="Loading your PT" />;

  // Both failing means PT is unreachable; one failing still leaves a usable screen.
  if (packageInfo.error && offer.error) {
    const offline = packageInfo.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your PT'}
          detail={offline ? undefined : packageInfo.error.message}
          onRetry={refreshAll}
        />
      </Screen>
    );
  }

  const pack = packageInfo.data;
  const rows = sessions.data ?? [];
  const upcoming = rows.filter((s) => s.status === 'scheduled' || s.status === 'in_progress');
  const past = rows.filter((s) => s.status !== 'scheduled' && s.status !== 'in_progress');
  const promotion = offer.data;
  const roster = trainers.data ?? [];
  const active = pack && pack.status === 'active';

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl refreshing={packageInfo.refreshing} onRefresh={refreshAll} tintColor={color.brand} />
        }
      >
        {error ? <Banner tone="critical" icon="alert-circle-outline">{error}</Banner> : null}

        {/* The balance, as a single number a member can act on. */}
        {active ? (
          <ProgressCard
            label="Your PT package"
            value={pack.sessions_remaining}
            total={pack.sessions_total}
            percent={pack.sessions_total ? (pack.sessions_used / pack.sessions_total) * 100 : 0}
            caption={`${pack.sessions_used} used${pack.trainer_name ? ` · ${pack.trainer_name}` : ''}`}
            tone={pack.low_balance ? 'caution' : 'brand'}
            trailing={<Badge label="sessions left" tone="neutral" />}
          />
        ) : null}

        {active && pack.low_balance ? (
          <Banner tone="caution" icon="alert-circle-outline">
            Only {pack.sessions_remaining} session{pack.sessions_remaining === 1 ? '' : 's'} left.
            Talk to your branch about renewing.
          </Banner>
        ) : null}

        {pack && pack.status === 'completed' ? (
          <Card>
            <Eyebrow>Package complete</Eyebrow>
            <Text variant="heading">All {pack.sessions_total} sessions done.</Text>
            <Text variant="body" tone={color.textSecondary}>
              Speak to your branch about renewing.
            </Text>
          </Card>
        ) : null}

        {/* Upcoming first — it is the only part of this screen with a deadline. */}
        {upcoming.length ? (
          <Section title="Upcoming">
            {upcoming.map((session) => (
              <Card key={session.id}>
                <Row gap="sm">
                  <KindTag kind="pt_session" />
                  <Spacer />
                  <Badge
                    label={`Session ${session.session_number}${
                      session.package_size ? ` of ${session.package_size}` : ''
                    }`}
                    tone="brand"
                  />
                </Row>

                <Stack gap="xxs">
                  <Text variant="heading">{session.trainer_name ?? 'Your trainer'}</Text>
                  <Text variant="label" tone={color.textSecondary}>
                    {dayLabel(session.session_date)} · {timeOfDay(session.scheduled_start)}
                  </Text>
                </Stack>

                <Divider />

                {/* The member's half of the split attendance view. */}
                <Row gap="md" align="stretch">
                  <Stack gap="xxs" style={styles.half}>
                    <Eyebrow>You</Eyebrow>
                    <Text
                      variant="body"
                      tone={session.member_checked_in_at ? color.status.positive : color.textTertiary}
                    >
                      {session.member_checked_in_at
                        ? `In at ${timeOfDay(session.member_checked_in_at)}`
                        : 'Not checked in'}
                    </Text>
                  </Stack>
                  <View style={styles.splitRule} />
                  <Stack gap="xxs" style={styles.half}>
                    <Eyebrow>Trainer</Eyebrow>
                    <Text
                      variant="body"
                      tone={session.trainer_checked_in_at ? color.status.positive : color.textTertiary}
                    >
                      {session.trainer_checked_in_at
                        ? `In at ${timeOfDay(session.trainer_checked_in_at)}`
                        : 'Not checked in'}
                    </Text>
                  </Stack>
                </Row>

                {!session.member_checked_in_at ? (
                  <Button
                    title="I’m here — check me in"
                    variant="secondary"
                    loading={busy}
                    onPress={() => void confirmArrival(session)}
                  />
                ) : confirmed === session.id ? (
                  <Banner tone="positive" icon="checkmark-circle-outline">
                    Arrival recorded. Your trainer closes the session.
                  </Banner>
                ) : null}
              </Card>
            ))}
          </Section>
        ) : null}

        {/* No package at all: say what PT is and when it starts. */}
        {!pack && !promotion?.eligible ? (
          <EmptyState
            icon="person-outline"
            title="No PT package yet"
            detail={
              promotion?.message ??
              'Personal training starts after your 45-day journey. Your trainer will talk you through it.'
            }
          />
        ) : null}

        {/* The Day-45 conversion, only when the server says the member is eligible. */}
        {promotion?.eligible ? (
          <Card>
            <Eyebrow>What comes next</Eyebrow>
            <Text variant="title">{promotion.headline}</Text>
            <Text variant="body" tone={color.textSecondary}>
              {promotion.message}
            </Text>

            <Divider />

            <Stack gap="sm">
              {promotion.benefits.map((benefit) => (
                <Row key={benefit} gap="sm" align="flex-start">
                  <View style={styles.bulletWrap}>
                    <Dot tone="brand" />
                  </View>
                  <Text variant="body" tone={color.textSecondary} style={styles.grow}>
                    {benefit}
                  </Text>
                </Row>
              ))}
            </Stack>

            <Divider />

            <Eyebrow>Packages</Eyebrow>
            <Row gap="sm" align="stretch">
              {promotion.options.map((option) => (
                <Stack key={option.sessions} gap="xxs" align="center" style={styles.option}>
                  <Text variant="title">{option.sessions}</Text>
                  <Text variant="caption" caps tone={color.textTertiary}>
                    sessions
                  </Text>
                  {option.price_amount !== null ? (
                    <Text variant="mono">
                      {option.currency ?? ''} {option.price_amount}
                    </Text>
                  ) : null}
                </Stack>
              ))}
            </Row>

            <Text variant="label" tone={color.textTertiary}>
              {promotion.disclaimer}
            </Text>
          </Card>
        ) : null}

        {/* Who a member could train with, from the real roster at their branch. */}
        {roster.length ? (
          <Section title="Trainers at your branch">
            {roster.map((trainer) => (
              <Row key={trainer.id} gap="md" style={styles.trainerRow}>
                <Stack gap="xxs" style={styles.grow}>
                  <Text variant="body">{trainer.full_name}</Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {trainer.specialty ?? trainer.designation ?? 'Personal trainer'}
                  </Text>
                </Stack>
                {pack?.trainer_id === trainer.id ? <Badge label="Yours" tone="brand" /> : null}
              </Row>
            ))}
            <NotConnected
              icon="calendar-outline"
              title="Booking happens at your branch"
              detail="GymFlow has no slot availability for trainers yet, and only staff can create a PT session. Ask the front desk or your trainer and the session will appear here."
            />
          </Section>
        ) : null}

        {past.length ? (
          <Section title="History">
            <StatRow>
              <StatCard
                label="Completed"
                value={past.filter((s) => s.status === 'completed').length}
                tone="positive"
              />
              <StatCard
                label="Missed"
                value={past.filter((s) => s.status === 'no_show' || s.status === 'missed').length}
                tone="caution"
              />
            </StatRow>
            {past.slice(0, 12).map((session) => {
              const meta = STATUS_META[session.status] ?? { label: session.status, tone: 'neutral' as const };
              return (
                <Row key={session.id} gap="md" style={styles.historyRow}>
                  <Stack gap="xxs" style={styles.grow}>
                    <Text variant="body">
                      Session {session.session_number} · {session.trainer_name ?? 'Trainer'}
                    </Text>
                    <Text variant="label" tone={color.textTertiary}>
                      {dayLabel(session.session_date)}
                    </Text>
                  </Stack>
                  <Badge label={meta.label} tone={meta.tone} />
                </Row>
              );
            })}
          </Section>
        ) : null}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  half: { flex: 1 },
  splitRule: { width: 1, backgroundColor: color.border },
  bulletWrap: { paddingTop: 7 },
  option: {
    flex: 1,
    backgroundColor: color.surfaceOverlay,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: space.md,
  },
  trainerRow: {
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  historyRow: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
});
