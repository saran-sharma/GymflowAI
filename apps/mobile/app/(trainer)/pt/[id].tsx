/**
 * PT attendance — the split view.
 *
 * MEMBER on the left, TRAINER on the right, each with their own arrival state,
 * and the session number underneath. COMPLETE SESSION only lights up once both
 * sides are recorded present: that is the whole point of showing them apart.
 *
 * The layout is deliberately a single component reading `PTSplitView`. If SLAM
 * means something different by "split screen", this can be re-laid-out without
 * touching the PT model underneath.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type { PTSplitView } from '../../../src/api/types';
import { sessionMeta } from '../../../src/components/programme';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Divider,
  ErrorState,
  Eyebrow,
  Loading,
  Row,
  Screen,
  Txt,
} from '../../../src/components/ui';
import { ScreenHeader, useThemedStyles } from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { useAuth } from '../../../src/store/AuthContext';
import { colors, radius, spacing } from '../../../src/theme';
import { dayLabel, initials, timeOfDay } from '../../../src/utils/format';

export default function PtSplitScreen() {
  const styles = useThemedStyles(buildStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);
  const router = useRouter();
  const { withToken } = useAuth();

  const view = useApi<PTSplitView>((token) => api.ptSplitView(sessionId, token), [sessionId]);
  // Reached from the Desk and from Sessions — back() already returns to
  // whichever of those pushed this screen, via each tab's own history.
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace('/(trainer)/sessions' as never);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const act = useCallback(
    async (action: (token: string) => Promise<unknown>, success?: () => void) => {
      setBusy(true);
      setError(null);
      try {
        await withToken(action);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        success?.();
        await view.refresh();
      } catch (caught) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(caught instanceof ApiError ? caught.message : 'That did not save. Try again.');
      } finally {
        setBusy(false);
      }
    },
    [withToken, view],
  );

  if (view.loading) return <Loading label="Loading session" />;
  if (view.error || !view.data) {
    const offline = view.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load this PT session'}
          detail={offline ? undefined : view.error?.message}
          onRetry={view.reload}
        />
      </Screen>
    );
  }

  const split = view.data;
  const session = split.session;
  const meta = sessionMeta[session.status];
  const closed = session.status === 'completed' || session.status === 'cancelled';

  return (
    <Screen edges={['top', 'bottom']}>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={view.refreshing}
            onRefresh={() => void view.refresh()}
            tintColor={colors.brand}
          />
        }
      >
        <ScreenHeader
          title="PT attendance"
          subtitle={`${dayLabel(session.session_date)} · ${timeOfDay(session.scheduled_start)}`}
          onBack={goBack}
          action={<Badge label={meta.label} color={meta.color} />}
        />

        {error ? <Banner tone="danger">{error}</Banner> : null}
        {done ? <Banner tone="success">Session recorded.</Banner> : null}

        {/* The split. Two sides, one row, each owning its own state. */}
        <View style={styles.split}>
          <Side
            title="MEMBER"
            name={split.member_name}
            checkedIn={split.member_checked_in}
            at={session.member_checked_in_at}
            disabled={busy || closed}
            onPress={() => void act((token) => api.ptRecordArrival(session.id, 'member', token))}
          />
          <Side
            title="TRAINER"
            name={split.trainer_name}
            checkedIn={split.trainer_checked_in}
            at={session.trainer_checked_in_at}
            disabled={busy || closed}
            onPress={() => void act((token) => api.ptRecordArrival(session.id, 'trainer', token))}
          />
        </View>

        <Card>
          <Row style={styles.cardHead}>
            <Eyebrow>Session</Eyebrow>
            <Txt variant="heading">
              {session.session_number} / {session.package_size ?? '—'}
            </Txt>
          </Row>
          <Divider />
          <Txt variant="label" color={colors.textMuted}>
            Times are recorded by the GymFlow server when you tap, not from this phone.
          </Txt>
        </Card>

        {!closed ? (
          <>
            <Button
              title="COMPLETE SESSION"
              size="lg"
              icon="checkmark-done"
              loading={busy}
              disabled={!split.can_complete}
              onPress={() =>
                void act(
                  (token) => api.ptCompleteSession(session.id, token),
                  () => setDone(true),
                )
              }
            />
            {!split.can_complete ? (
              <Txt variant="label" color={colors.textFaint} style={styles.hint}>
                Both the member and the trainer must be marked present first.
              </Txt>
            ) : null}

            <Button
              title="Member did not show"
              variant="danger"
              icon="close-circle-outline"
              disabled={busy}
              onPress={() =>
                Alert.alert('Mark as no-show?', 'This does not use one of the member’s sessions.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'No-show',
                    style: 'destructive',
                    onPress: () =>
                      void act((token) => api.ptCloseSession(session.id, 'no_show', token)),
                  },
                ])
              }
            />
            <Button
              title="Cancel session"
              variant="ghost"
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  'Cancel this session?',
                  'The member keeps the session in their package.',
                  [
                    { text: 'Keep it', style: 'cancel' },
                    {
                      text: 'Cancel session',
                      style: 'destructive',
                      onPress: () =>
                        void act((token) => api.ptCloseSession(session.id, 'cancelled', token)),
                    },
                  ],
                )
              }
            />
          </>
        ) : (
          <Banner tone={session.status === 'completed' ? 'success' : 'warning'}>
            {session.status === 'completed'
              ? `Completed${session.completed_at ? ` at ${timeOfDay(session.completed_at)}` : ''}.`
              : 'This session was cancelled.'}
          </Banner>
        )}
      </Body>
    </Screen>
  );
}

function Side({
  title,
  name,
  checkedIn,
  at,
  disabled,
  onPress,
}: {
  title: string;
  name: string;
  checkedIn: boolean;
  at: string | null;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(buildStyles);
  return (
    <View style={[styles.side, checkedIn && styles.sideIn]}>
      <Eyebrow color={checkedIn ? colors.onTime : colors.textFaint}>{title}</Eyebrow>
      <View style={[styles.sideAvatar, checkedIn && styles.sideAvatarIn]}>
        <Txt variant="heading" color={checkedIn ? colors.onTime : colors.textMuted}>
          {initials(name)}
        </Txt>
      </View>
      <Txt variant="body" numberOfLines={2} style={styles.sideName}>
        {name}
      </Txt>
      {checkedIn ? (
        <>
          <Row style={styles.sideStatus}>
            <Ionicons name="checkmark-circle" size={16} color={colors.onTime} />
            <Txt variant="label" color={colors.onTime}>
              Checked in
            </Txt>
          </Row>
          <Txt variant="mono" color={colors.textMuted}>
            {timeOfDay(at)}
          </Txt>
        </>
      ) : (
        <Button title="CHECK IN" variant="secondary" disabled={disabled} onPress={onPress} />
      )}
    </View>
  );
}

function buildStyles() {
  return StyleSheet.create({
  grow: { flex: 1 },
  cardHead: { justifyContent: 'space-between' },
  split: { flexDirection: 'row', gap: spacing.sm },
  side: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: 220,
  },
  sideIn: { borderColor: `${colors.onTime}66`, backgroundColor: `${colors.onTime}0F` },
  sideAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideAvatarIn: { borderColor: colors.onTime },
  sideName: { textAlign: 'center' },
  sideStatus: { gap: 4 },
  hint: { textAlign: 'center' },
});
}
