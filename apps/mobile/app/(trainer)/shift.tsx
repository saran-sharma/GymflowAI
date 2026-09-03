/**
 * The trainer's shift: check in, check out.
 *
 * Reached from the desk rather than being the desk itself, but unchanged in
 * what it does. One job: get from opening the screen to a recorded check-in in
 * a couple of seconds. Everything else on this screen is confirmation of what
 * the server recorded — name, branch, shift, and the server's own time — and
 * the verdict (on time / late / absent) is the server's, shown plainly the
 * moment it lands.
 */

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { CheckResponse, TrainerToday } from '../../src/api/types';
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
  Motion,
  OfflineNotice,
  Row,
  Screen,
  Sheet,
  Spacer,
  Stack,
  SuccessCheck,
  Text,
  color,
  entrance,
  haptics,
  radii,
  space,
  text as textTokens,
  useThemedStyles,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { OFFLINE_MESSAGE, useNetwork } from '../../src/store/NetworkContext';
import { statusMeta } from '../../src/theme';
import { relativeMinutes, timeOfDay } from '../../src/utils/format';

type Action = 'check_in' | 'check_out';

export default function TrainerShiftScreen() {
  const styles = useThemedStyles(buildStyles);
  const { withToken } = useAuth();
  const { isOnline } = useNetwork();
  const router = useRouter();
  const params = useLocalSearchParams<{ scannedToken?: string; scanNonce?: string }>();

  const today = useApi<TrainerToday>((token) => api.myToday(token), []);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pinPrompt, setPinPrompt] = useState<Action | null>(null);
  const [pin, setPin] = useState('');

  const data = today.data;
  const status = data ? statusMeta[data.status] : null;

  const submit = useCallback(
    async (action: Action, credential: { qrToken?: string; pin?: string }) => {
      if (!data) return;
      if (!isOnline) {
        setActionError(OFFLINE_MESSAGE);
        return;
      }

      setBusy(true);
      setActionError(null);
      try {
        const payload = {
          branchId: data.trainer.branch_id,
          method: credential.qrToken ? ('qr' as const) : ('pin' as const),
          qrToken: credential.qrToken,
          pin: credential.pin,
          deviceInfo: 'GymFlow Mobile',
        };
        const response =
          action === 'check_in'
            ? await withToken((token) => api.checkIn(payload, token))
            : await withToken((token) => api.checkOut(payload, token));

        setResult(response);
        setPinPrompt(null);
        setPin('');
        haptics.notify(
          response.status === 'late' || response.status === 'early_exit' ? 'warning' : 'success',
        );
        await today.refresh();
      } catch (caught) {
        const error = caught as ApiError;
        setActionError(
          error?.code === OFFLINE_CODE ? OFFLINE_MESSAGE : (error?.message ?? 'Could not record that.'),
        );
        haptics.notify('error');
      } finally {
        setBusy(false);
      }
    },
    [data, isOnline, today, withToken],
  );

  // A scan hands the token back through the router. The nonce makes a repeat
  // scan of the same code still count as a new attempt.
  const scannedToken = params.scannedToken;
  const scanNonce = params.scanNonce;
  useFocusEffect(
    useCallback(() => {
      if (!scannedToken || !data) return;
      const action: Action = data.can_check_in ? 'check_in' : 'check_out';
      router.setParams({ scannedToken: undefined, scanNonce: undefined });
      void submit(action, { qrToken: scannedToken });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scannedToken, scanNonce, data?.can_check_in]),
  );

  const action: Action | null = useMemo(() => {
    if (!data) return null;
    if (data.can_check_in) return 'check_in';
    if (data.can_check_out) return 'check_out';
    return null;
  }, [data]);

  const qrEnabled = data?.methods_enabled.includes('qr') ?? false;
  const pinEnabled = data?.methods_enabled.includes('pin') ?? false;

  if (today.loading) return <Loading label="Loading your shift" />;
  if (today.error || !data) {
    const offline = today.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'Could not load your shift'}
          detail={offline ? undefined : today.error?.message}
          onRetry={today.reload}
        />
      </Screen>
    );
  }

  const checkedIn = Boolean(data.check_in_at);
  const complete = Boolean(data.check_out_at);
  // The animated draw-on mark is reserved for a clean outcome. A late or
  // early-exit shift was still recorded — it gets a quiet, static mark in the
  // verdict's own colour, so the animation never reads as "well done" over a
  // flag.
  const cleanVerdict = data.status === 'on_time' || data.status === 'completed';

  return (
    <Screen>
      {/* `flexGrow` + the spacer below drop the check-in hero into the lower
          third — the brief's "128dp, bottom-anchored, thumb-reachable". */}
      <Body contentContainerStyle={styles.body}>
        {/* Identity: name, branch, shift. Three lines, nothing else. */}
        <Stack gap="xs">
          <Eyebrow>{data.trainer.branch_name}</Eyebrow>
          <Text variant="title">{data.trainer.full_name}</Text>
          <Row gap="xs">
            <Text variant="body" tone={color.textSecondary}>
              {data.has_shift ? `Today’s shift · ${data.shift_label}` : 'No shift rostered today'}
            </Text>
          </Row>
        </Stack>

        {!isOnline ? <OfflineNotice message={OFFLINE_MESSAGE} /> : null}

        {/* The verdict panel, once something has been recorded. It settles into
            place rather than snapping — the server has spoken. */}
        {checkedIn ? (
          <Motion.View key={complete ? 'complete' : 'in'} entering={entrance(0)}>
            <Card style={styles.verdict} gap="md">
              <Row gap="md" align="center">
                {cleanVerdict ? (
                  <SuccessCheck
                    size={40}
                    colorOverride={status?.color}
                    accessibilityLabel={complete ? 'Shift complete' : 'Checked in'}
                  />
                ) : (
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={40}
                    color={status?.color ?? color.textSecondary}
                    accessibilityLabel={complete ? 'Shift complete' : 'Checked in'}
                  />
                )}
                <Stack gap="xxs" style={styles.grow}>
                  <Text variant="heading" tone={status?.color}>
                    {complete ? 'Shift complete' : 'Checked in'}
                  </Text>
                  <Text variant="label" tone={color.textTertiary}>
                    Recorded by GymFlow · server time
                  </Text>
                </Stack>
              </Row>

              <Divider />

              <Stack gap="xs">
                <Detail label="Check-in" value={timeOfDay(data.check_in_at)} />
                <Detail label="Status" value={status?.label ?? '—'} valueColor={status?.color} />
                {data.late_minutes > 0 ? (
                  <Detail
                    label="Late by"
                    value={`${data.late_minutes} min`}
                    valueColor={color.status.caution}
                  />
                ) : null}
                {complete ? (
                  <>
                    <Detail label="Check-out" value={timeOfDay(data.check_out_at)} />
                    {data.early_exit_minutes > 0 ? (
                      <Detail
                        label="Left early by"
                        value={`${data.early_exit_minutes} min`}
                        valueColor={color.status.warning}
                      />
                    ) : null}
                  </>
                ) : null}
                <Detail label="Branch" value={data.trainer.branch_name} />
                <Detail label="Shift" value={data.shift_label ?? '—'} />
              </Stack>
            </Card>
          </Motion.View>
        ) : null}

        {actionError ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {actionError}
          </Banner>
        ) : null}
        {result && !actionError ? (
          <Banner tone="positive" icon="checkmark-circle-outline">
            {result.message}
          </Banner>
        ) : null}

        {/* The action, dropped to the thumb zone. */}
        {action ? (
          <>
          <Spacer />
          <Stack gap="md" style={styles.actionBlock}>
            {data.has_shift && action === 'check_in' && data.shift_start ? (
              <Text variant="label" tone={color.textTertiary} align="center">
                Shift starts {relativeMinutes(data.shift_start)} · {data.grace_minutes} min grace
              </Text>
            ) : null}

            {qrEnabled ? (
              <Button
                title={action === 'check_in' ? 'Check in' : 'Check out'}
                size="hero"
                icon="qr-code-outline"
                loading={busy}
                disabled={!isOnline}
                onPress={() => router.push('/(trainer)/scan')}
                testID="hero-action"
              />
            ) : null}

            {pinEnabled ? (
              <Button
                title={
                  qrEnabled
                    ? 'Use PIN instead'
                    : action === 'check_in'
                      ? 'Check in with PIN'
                      : 'Check out with PIN'
                }
                size={qrEnabled ? 'md' : 'hero'}
                variant={qrEnabled ? 'secondary' : 'primary'}
                icon="keypad-outline"
                disabled={busy || !isOnline}
                onPress={() => {
                  setActionError(null);
                  setPinPrompt(action);
                }}
                testID="pin-action"
              />
            ) : null}
          </Stack>
          </>
        ) : (
          <Card>
            <Text variant="heading">
              {complete ? 'Nothing more to do today' : 'No action available'}
            </Text>
            <Text variant="body" tone={color.textSecondary}>
              {complete
                ? 'Your shift is closed. See you tomorrow.'
                : data.has_shift
                  ? 'Your shift has already been recorded.'
                  : 'You are not rostered today. Speak to your branch manager if that looks wrong.'}
            </Text>
          </Card>
        )}
      </Body>

      <PinSheet
        visible={pinPrompt !== null}
        action={pinPrompt}
        pin={pin}
        busy={busy}
        onChange={setPin}
        onCancel={() => {
          setPinPrompt(null);
          setPin('');
        }}
        onSubmit={() => pinPrompt && submit(pinPrompt, { pin })}
      />
    </Screen>
  );
}

function Detail({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <Row gap="md">
      <Text variant="label" tone={color.textSecondary} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="mono" tone={valueColor ?? color.text}>
        {value}
      </Text>
    </Row>
  );
}

/**
 * PIN entry as a bottom sheet, not a centred dialog — the keypad and the
 * confirm land in the thumb's reach, and the sheet clears the navigation bar
 * and closes on hardware back.
 */
function PinSheet({
  visible,
  action,
  pin,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  action: Action | null;
  pin: string;
  busy: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const styles = useThemedStyles(buildStyles);
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      title={action === 'check_out' ? 'Check out with PIN' : 'Check in with PIN'}
      subtitle="Server time, not your phone"
      testID="pin-sheet"
      footer={
        <>
          <Button
            title="Confirm"
            size="lg"
            loading={busy}
            disabled={pin.length < 4}
            onPress={onSubmit}
            testID="pin-confirm"
          />
          <Button title="Cancel" variant="ghost" onPress={onCancel} />
        </>
      }
    >
      <TextInput
        value={pin}
        onChangeText={(value) => onChange(value.replace(/\D/g, '').slice(0, 8))}
        placeholder="••••••"
        placeholderTextColor={color.textTertiary}
        keyboardType="number-pad"
        secureTextEntry
        style={styles.pinInput}
        autoFocus
        accessibilityLabel="Check-in PIN"
        testID="pin-input"
      />
    </Sheet>
  );
}

function buildStyles() {
  return StyleSheet.create({
    grow: { flex: 1 },
    body: { flexGrow: 1 },
    verdict: { borderColor: color.borderStrong },
    actionBlock: { marginTop: space.sm },
    pinInput: {
      ...textTokens.metric,
      color: color.text,
      backgroundColor: color.surfaceInput,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: radii.md,
      height: 72,
      textAlign: 'center',
      letterSpacing: 8,
    },
  });
}
