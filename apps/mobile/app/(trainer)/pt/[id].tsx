/**
 * PT attendance — the split view.
 *
 * The trainer's operational counterpart to the member's exercise screen: fast,
 * one-handed, and built around a single gate. MEMBER on the left, TRAINER on
 * the right, each owning its own arrival state; recording an arrival buzzes and
 * draws a check, and COMPLETE SESSION only lights once both sides are present —
 * which is the whole reason for showing them apart.
 *
 * The layout reads `PTSplitView`. If SLAM means something different by "split
 * screen" it can be re-laid-out without touching the PT model underneath.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type { PTSplitView } from '../../../src/api/types';
import { sessionMeta } from '../../../src/components/programme';
import {
  Avatar,
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
  ScreenHeader,
  Spacer,
  Staggered,
  Stack,
  SuccessCheck,
  Text,
  alpha,
  color,
  haptics,
  radii,
  space,
  useThemedStyles,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { useAuth } from '../../../src/store/AuthContext';
import { dayLabel, timeOfDay } from '../../../src/utils/format';

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
        haptics.notify('success');
        success?.();
        await view.refresh();
      } catch (caught) {
        haptics.notify('error');
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
      <Screen edges={['top']}>
        <ScreenHeader title="PT session" onBack={goBack} />
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
    <Screen edges={['top']}>
      <ScreenHeader
        title="PT attendance"
        subtitle={`${dayLabel(session.session_date)} · ${timeOfDay(session.scheduled_start)}`}
        onBack={goBack}
        action={<Badge label={meta.label} colorOverride={meta.color} />}
      />
      <Body
        refreshControl={
          <RefreshControl
            refreshing={view.refreshing}
            onRefresh={() => void view.refresh()}
            tintColor={color.brand}
          />
        }
      >
        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}
        {done && !error ? (
          <Banner tone="positive" icon="checkmark-circle-outline">
            Session recorded.
          </Banner>
        ) : null}

        <Staggered>
          {/* The split. Two sides, one row, each owning its own state. */}
          <Row gap="sm" align="stretch">
            <Side
              title="Member"
              name={split.member_name}
              checkedIn={split.member_checked_in}
              at={session.member_checked_in_at}
              disabled={busy || closed}
              onPress={() =>
                void act((token) => api.ptRecordArrival(session.id, 'member', token))
              }
            />
            <Side
              title="Trainer"
              name={split.trainer_name}
              checkedIn={split.trainer_checked_in}
              at={session.trainer_checked_in_at}
              disabled={busy || closed}
              onPress={() =>
                void act((token) => api.ptRecordArrival(session.id, 'trainer', token))
              }
            />
          </Row>

          <Card>
            <Row gap="sm">
              <Eyebrow>Session</Eyebrow>
              <Spacer />
              <Text variant="heading">
                {session.session_number} / {session.package_size ?? '—'}
              </Text>
            </Row>
            <Divider />
            <Text variant="label" tone={color.textTertiary}>
              Times are recorded by the GymFlow server when you tap, not from this phone.
            </Text>
          </Card>

          {!closed ? (
            <Stack gap="sm">
              <Button
                title="Complete session"
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
                <Text variant="label" tone={color.textTertiary} align="center">
                  Mark both the member and the trainer present first.
                </Text>
              ) : null}

              <Button
                title="Member did not show"
                variant="destructive"
                icon="close-circle-outline"
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    'Mark as no-show?',
                    'This does not use one of the member’s sessions.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'No-show',
                        style: 'destructive',
                        onPress: () =>
                          void act((token) => api.ptCloseSession(session.id, 'no_show', token)),
                      },
                    ],
                  )
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
            </Stack>
          ) : (
            <Banner tone={session.status === 'completed' ? 'positive' : 'caution'}>
              {session.status === 'completed'
                ? `Completed${session.completed_at ? ` at ${timeOfDay(session.completed_at)}` : ''}.`
                : 'This session was cancelled.'}
            </Banner>
          )}
        </Staggered>
      </Body>
    </Screen>
  );
}

/**
 * One side of the split: who they are, and whether their arrival is on record.
 *
 * Not checked in → one button. Checked in → the mark draws once and the
 * server's time sits under it. The card tints toward positive so "both green"
 * is readable across the row without reading either label.
 */
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
    <View style={[styles.side, checkedIn ? styles.sideIn : null]}>
      <Eyebrow tone={checkedIn ? color.status.positive : color.textTertiary}>{title}</Eyebrow>
      <Avatar name={name} size={56} accent={checkedIn} />
      <Text variant="body" align="center" numberOfLines={2} style={styles.sideName}>
        {name}
      </Text>
      {checkedIn ? (
        <Stack gap="xxs" align="center">
          <SuccessCheck key="in" size={28} tone="positive" accessibilityLabel="Present" />
          <Text variant="label" tone={color.status.positive}>
            Present
          </Text>
          <Text variant="mono" tone={color.textSecondary}>
            {timeOfDay(at)}
          </Text>
        </Stack>
      ) : (
        <Button
          title="Mark present"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onPress={onPress}
        />
      )}
    </View>
  );
}

function buildStyles() {
  return StyleSheet.create({
    side: {
      flex: 1,
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: color.surfaceRaised,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: color.border,
      padding: space.lg,
      minHeight: 220,
    },
    sideIn: {
      borderColor: alpha(color.status.positive, 0.4),
      backgroundColor: alpha(color.status.positive, 0.06),
    },
    sideName: { textAlign: 'center' },
  });
}
