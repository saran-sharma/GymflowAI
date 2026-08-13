/**
 * The member's PT: balance, sessions, and the offer after Day 45.
 *
 * Package sizes come from the server's configuration. No price is shown unless
 * SLAM has configured one — an invented number in front of a member would be
 * worse than none at all.
 */

import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { PTOffer, PTPackage, PTSession } from '../../src/api/types';
import { SectionHeader, sessionMeta } from '../../src/components/programme';
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
import { useAuth } from '../../src/store/AuthContext';
import { colors, radius, spacing } from '../../src/theme';
import { dayLabel, timeOfDay } from '../../src/utils/format';

export default function MemberPtScreen() {
  const { withToken } = useAuth();
  const packageInfo = useApi<PTPackage | null>((token) => api.myPtPackage(token), []);
  const sessions = useApi<PTSession[]>((token) => api.myPtSessions(token), []);
  const offer = useApi<PTOffer>((token) => api.ptOffer(token), []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<number | null>(null);

  const refreshAll = useCallback(() => {
    void packageInfo.refresh();
    void sessions.refresh();
    void offer.refresh();
  }, [packageInfo, sessions, offer]);

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
  if (packageInfo.error && offer.error) {
    return (
      <Screen>
        <ErrorState detail={packageInfo.error.message} onRetry={refreshAll} />
      </Screen>
    );
  }

  const pack = packageInfo.data;
  const rows = sessions.data ?? [];
  const upcoming = rows.filter((s) => s.status === 'scheduled' || s.status === 'in_progress');
  const past = rows.filter((s) => s.status !== 'scheduled' && s.status !== 'in_progress');
  const promotion = offer.data;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={packageInfo.refreshing}
            onRefresh={refreshAll}
            tintColor={colors.brand}
          />
        }
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}

        {pack && pack.status !== 'completed' ? (
          <Card>
            <Row style={styles.cardHead}>
              <Eyebrow>Your PT package</Eyebrow>
              <Badge
                label={pack.status}
                color={pack.status === 'active' ? colors.onTime : colors.textFaint}
              />
            </Row>
            <Row style={styles.balanceRow}>
              <Txt variant="display">{pack.sessions_used}</Txt>
              <Txt variant="heading" color={colors.textFaint}>
                / {pack.sessions_total} completed
              </Txt>
            </Row>
            <Meter
              value={
                pack.sessions_total ? (pack.sessions_used / pack.sessions_total) * 100 : 0
              }
              color={colors.brand}
            />
            <Txt variant="label" color={pack.low_balance ? colors.late : colors.textMuted}>
              {pack.sessions_remaining} remaining
              {pack.trainer_name ? ` · ${pack.trainer_name}` : ''}
            </Txt>
            {pack.low_balance ? (
              <Banner tone="warning">
                Only {pack.sessions_remaining} sessions left. Talk to your branch about renewing.
              </Banner>
            ) : null}
          </Card>
        ) : null}

        {pack && pack.status === 'completed' ? (
          <Card>
            <Eyebrow>PT package completed</Eyebrow>
            <Txt variant="body">
              You completed all {pack.sessions_total} sessions.
            </Txt>
            <Txt variant="label" color={colors.textMuted}>
              Speak to your branch about renewing.
            </Txt>
          </Card>
        ) : null}

        {/* The Day-45 conversion. Only shown when the server says so. */}
        {promotion?.eligible ? (
          <Card>
            <Eyebrow>What comes next</Eyebrow>
            <Txt variant="heading">{promotion.headline}</Txt>
            <Txt variant="body" color={colors.textMuted}>
              {promotion.message}
            </Txt>
            <Divider />
            {promotion.benefits.map((benefit) => (
              <Row key={benefit} style={styles.benefit}>
                <View style={styles.bullet} />
                <Txt variant="body" color={colors.textMuted} style={styles.grow}>
                  {benefit}
                </Txt>
              </Row>
            ))}
            <Divider />
            <Eyebrow>Packages</Eyebrow>
            <View style={styles.options}>
              {promotion.options.map((option) => (
                <View key={option.sessions} style={styles.option}>
                  <Txt variant="title">{option.sessions}</Txt>
                  <Txt variant="label" color={colors.textFaint}>
                    sessions
                  </Txt>
                  {option.price_amount !== null ? (
                    <Txt variant="mono">
                      {option.currency ?? ''} {option.price_amount}
                    </Txt>
                  ) : null}
                </View>
              ))}
            </View>
            <Txt variant="label" color={colors.textFaint}>
              {promotion.disclaimer}
            </Txt>
          </Card>
        ) : null}

        {!pack && !promotion?.eligible ? (
          <EmptyState
            icon="person-outline"
            title="No PT package yet"
            detail={promotion?.message ?? 'Personal training starts after your 45-day journey.'}
          />
        ) : null}

        {upcoming.length ? (
          <>
            <SectionHeader title="Upcoming sessions" />
            {upcoming.map((session) => (
              <Card key={session.id}>
                <Row style={styles.cardHead}>
                  <Txt variant="heading">{timeOfDay(session.scheduled_start)}</Txt>
                  <Badge
                    label={`${session.session_number} / ${session.package_size ?? '—'}`}
                    color={colors.brand}
                  />
                </Row>
                <Txt variant="label" color={colors.textMuted}>
                  {dayLabel(session.session_date)} · {session.trainer_name ?? 'Your trainer'}
                </Txt>
                <Divider />
                {/* The member's half of the split attendance view. */}
                <Row style={styles.split}>
                  <View style={styles.splitSide}>
                    <Eyebrow>You</Eyebrow>
                    <Txt
                      variant="body"
                      color={session.member_checked_in_at ? colors.onTime : colors.textFaint}
                    >
                      {session.member_checked_in_at
                        ? `Checked in ${timeOfDay(session.member_checked_in_at)}`
                        : 'Not checked in'}
                    </Txt>
                  </View>
                  <View style={styles.splitDivider} />
                  <View style={styles.splitSide}>
                    <Eyebrow>Trainer</Eyebrow>
                    <Txt
                      variant="body"
                      color={session.trainer_checked_in_at ? colors.onTime : colors.textFaint}
                    >
                      {session.trainer_checked_in_at
                        ? `Checked in ${timeOfDay(session.trainer_checked_in_at)}`
                        : 'Not checked in'}
                    </Txt>
                  </View>
                </Row>
                {!session.member_checked_in_at ? (
                  <Txt
                    variant="label"
                    color={colors.brandSoft}
                    onPress={busy ? undefined : () => void confirmArrival(session)}
                    accessibilityRole="button"
                    style={styles.arrivalAction}
                  >
                    I'm here — check me in
                  </Txt>
                ) : confirmed === session.id ? (
                  <Txt variant="label" color={colors.onTime}>
                    Arrival recorded. Your trainer completes the session.
                  </Txt>
                ) : null}
              </Card>
            ))}
          </>
        ) : null}

        {past.length ? (
          <>
            <SectionHeader title="History" />
            <View style={styles.tiles}>
              <StatTile
                label="Completed"
                value={past.filter((s) => s.status === 'completed').length}
                accent={colors.onTime}
              />
              <StatTile
                label="Missed"
                value={past.filter((s) => s.status === 'no_show' || s.status === 'missed').length}
                accent={colors.late}
              />
            </View>
            {past.slice(0, 12).map((session) => {
              const meta = sessionMeta[session.status];
              return (
                <Row key={session.id} style={styles.historyRow}>
                  <View style={styles.grow}>
                    <Txt variant="body">
                      Session {session.session_number} · {session.trainer_name ?? 'Trainer'}
                    </Txt>
                    <Txt variant="label" color={colors.textFaint}>
                      {dayLabel(session.session_date)}
                    </Txt>
                  </View>
                  <Badge label={meta.label} color={meta.color} />
                </Row>
              );
            })}
          </>
        ) : null}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  cardHead: { justifyContent: 'space-between' },
  balanceRow: { gap: spacing.sm, alignItems: 'baseline' },
  benefit: { gap: spacing.sm, paddingVertical: 2 },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand },
  options: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.raised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    gap: 2,
  },
  split: { alignItems: 'stretch', gap: spacing.md },
  splitSide: { flex: 1, gap: 4 },
  splitDivider: { width: 1, backgroundColor: colors.border },
  arrivalAction: { paddingVertical: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  historyRow: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
