/**
 * The trainer's shift: check in, check out.
 *
 * Reached from the desk rather than being the desk itself, but unchanged in
 * what it does. One job: get from opening the screen to a recorded check-in in
 * a couple of seconds. Everything else on this screen is confirmation of what the server
 * recorded — name, branch, shift, and the server's own time.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useState } from 'react';
import { Modal, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { CheckResponse, TrainerToday } from '../../src/api/types';
import {
  Banner,
  Body,
  Button,
  Card,
  Divider,
  ErrorState,
  Eyebrow,
  Loading,
  OfflineNotice,
  Row,
  Screen,
  Txt,
} from '../../src/components/ui';
import { useThemedStyles } from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { OFFLINE_MESSAGE, useNetwork } from '../../src/store/NetworkContext';
import { colors, radius, spacing, statusMeta, typography } from '../../src/theme';
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
        void Haptics.notificationAsync(
          response.status === 'late' || response.status === 'early_exit'
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Success,
        );
        await today.refresh();
      } catch (caught) {
        const error = caught as ApiError;
        setActionError(
          error?.code === OFFLINE_CODE ? OFFLINE_MESSAGE : (error?.message ?? 'Could not record that.'),
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
    return (
      <Screen>
        <ErrorState
          title={today.error?.code === OFFLINE_CODE ? 'No connection' : 'Could not load your shift'}
          detail={today.error?.message}
          onRetry={today.reload}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={today.refreshing}
            onRefresh={today.refresh}
            tintColor={colors.brand}
          />
        }
      >
        {/* Identity: name, branch, shift. Three lines, nothing else. */}
        <View style={styles.header}>
          <Eyebrow>{data.trainer.branch_name}</Eyebrow>
          <Txt variant="title">{data.trainer.full_name}</Txt>
          <Row style={styles.shiftRow}>
            <Ionicons name="time-outline" size={16} color={colors.textMuted} />
            <Txt variant="body" color={colors.textMuted}>
              {data.has_shift ? `Today's shift · ${data.shift_label}` : 'No shift rostered today'}
            </Txt>
          </Row>
        </View>

        {!isOnline ? <OfflineNotice message={OFFLINE_MESSAGE} /> : null}

        {/* The confirmation panel, once something has been recorded. */}
        {data.check_in_at ? (
          <Card style={[styles.confirm, { borderColor: `${status?.color}55` }]}>
            <Row style={styles.confirmHead}>
              <Ionicons
                name={data.check_out_at ? 'checkmark-done-circle' : 'checkmark-circle'}
                size={26}
                color={status?.color}
              />
              <Txt variant="heading" color={status?.color}>
                {data.check_out_at ? '✓ SHIFT COMPLETE' : '✓ CHECKED IN'}
              </Txt>
            </Row>

            <Divider />

            <Detail label="Server time" value={timeOfDay(data.check_in_at)} />
            <Detail label="Branch" value={data.trainer.branch_name} />
            <Detail label="Shift" value={data.shift_label ?? '—'} />
            <Detail label="Status" value={status?.label ?? '—'} valueColor={status?.color} />
            {data.late_minutes > 0 ? (
              <Detail label="Late by" value={`${data.late_minutes} min`} valueColor={colors.late} />
            ) : null}
            {data.check_out_at ? (
              <>
                <Detail label="Check-out" value={timeOfDay(data.check_out_at)} />
                {data.early_exit_minutes > 0 ? (
                  <Detail
                    label="Left early by"
                    value={`${data.early_exit_minutes} min`}
                    valueColor={colors.earlyExit}
                  />
                ) : null}
              </>
            ) : null}
          </Card>
        ) : null}

        {actionError ? <Banner tone="danger">{actionError}</Banner> : null}
        {result && !actionError ? <Banner tone="success">{result.message}</Banner> : null}

        {/* The action. */}
        {action ? (
          <View style={styles.actionBlock}>
            {data.has_shift && action === 'check_in' && data.shift_start ? (
              <Txt variant="label" color={colors.textFaint} style={styles.countdown}>
                Shift starts {relativeMinutes(data.shift_start)} · {data.grace_minutes} min grace
              </Txt>
            ) : null}

            {qrEnabled ? (
              <Button
                title={action === 'check_in' ? 'CHECK IN' : 'CHECK OUT'}
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
                title={qrEnabled ? 'Use PIN instead' : `${action === 'check_in' ? 'CHECK IN' : 'CHECK OUT'} WITH PIN`}
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
          </View>
        ) : (
          <Card>
            <Txt variant="heading">
              {data.check_out_at ? 'Nothing more to do today' : 'No action available'}
            </Txt>
            <Txt variant="body" color={colors.textMuted}>
              {data.check_out_at
                ? 'Your shift is closed. See you tomorrow.'
                : data.has_shift
                  ? 'Your shift has already been recorded.'
                  : 'You are not rostered today. Speak to your branch manager if that looks wrong.'}
            </Txt>
          </Card>
        )}
      </Body>

      <PinDialog
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
  valueColor = colors.text,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const styles = useThemedStyles(buildStyles);
  return (
    <Row style={styles.detail}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt variant="mono" color={valueColor}>
        {value}
      </Txt>
    </Row>
  );
}

function PinDialog({
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <Card style={styles.modalCard}>
          <Txt variant="heading">
            {action === 'check_in' ? 'Check in with PIN' : 'Check out with PIN'}
          </Txt>
          <Txt variant="body" color={colors.textMuted}>
            Enter your GymFlow check-in PIN. The time is taken from the server.
          </Txt>
          <TextInput
            value={pin}
            onChangeText={(value) => onChange(value.replace(/\D/g, '').slice(0, 8))}
            placeholder="••••••"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            secureTextEntry
            style={styles.pinInput}
            autoFocus
            accessibilityLabel="Check-in PIN"
            testID="pin-input"
          />
          <Button
            title="CONFIRM"
            size="lg"
            loading={busy}
            disabled={pin.length < 4}
            onPress={onSubmit}
            testID="pin-confirm"
          />
          <Button title="Cancel" variant="ghost" onPress={onCancel} />
        </Card>
      </View>
    </Modal>
  );
}

function buildStyles() {
  return StyleSheet.create({
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  shiftRow: { gap: spacing.xs, marginTop: spacing.xs },
  confirm: { borderWidth: 1.5 },
  confirmHead: { gap: spacing.sm },
  detail: { justifyContent: 'space-between', paddingVertical: 3 },
  actionBlock: { gap: spacing.md, marginTop: spacing.sm },
  countdown: { textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: { gap: spacing.md },
  pinInput: {
    ...typography.display,
    color: colors.text,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    height: 72,
    textAlign: 'center',
    letterSpacing: 8,
  },
});
}
