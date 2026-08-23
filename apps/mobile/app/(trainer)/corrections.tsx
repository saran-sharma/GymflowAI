/**
 * Attendance exceptions, from the trainer's side.
 *
 * A trainer explains what happened and asks for a fix. Nothing on this screen
 * changes an attendance record — the request sits until a manager approves it,
 * and both the ask and the decision are audited.
 */

import React, { useCallback, useState } from 'react';
import { Modal, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { AttendanceCorrection, AttendanceDay, CorrectionKind } from '../../src/api/types';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  Input,
  Loading,
  Row,
  Screen,
  Section,
  Text,
  color,
  radii,
  space,
  useThemedStyles,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { statusMeta } from '../../src/theme';
import { dayLabel, timeOfDay } from '../../src/utils/format';

const KINDS: { key: CorrectionKind; label: string }[] = [
  { key: 'missing_checkout', label: 'Forgot check-out' },
  { key: 'late_reason', label: 'Late arrival reason' },
  { key: 'early_exit_reason', label: 'Early exit reason' },
  { key: 'wrong_check_in', label: 'Wrong check-in' },
  { key: 'shift_correction', label: 'Shift correction' },
];

const STATUS_COLOR: Record<AttendanceCorrection['status'], string> = {
  get pending() {
    return color.status.caution;
  },
  get approved() {
    return color.status.positive;
  },
  get rejected() {
    return color.status.critical;
  },
  get withdrawn() {
    return color.textTertiary;
  },
};

/** Days worth appealing. A clean shift has nothing to correct. */
const CORRECTABLE = new Set([
  'late',
  'early_exit',
  'late_and_early_exit',
  'absent',
  'missing_checkout',
]);

export default function TrainerCorrectionsScreen() {
  const styles = useThemedStyles(buildStyles);
  const { withToken, user } = useAuth();
  const history = useApi<AttendanceDay[]>((token) => api.myAttendanceHistory(token), []);
  const corrections = useApi<AttendanceCorrection[]>((token) => api.listCorrections(token), []);

  const [target, setTarget] = useState<AttendanceDay | null>(null);
  const [kind, setKind] = useState<CorrectionKind>('missing_checkout');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = useCallback(async () => {
    if (!target || reason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      await withToken((token) =>
        api.requestCorrection(
          {
            attendance_id: target.id,
            correction_type: kind,
            reason: reason.trim(),
            // A "forgot check-out" asks for the rostered shift end. The
            // trainer never types a time of their own choosing.
            requested_check_out_at: kind === 'missing_checkout' ? target.scheduled_end : null,
          },
          token,
        ),
      );
      setTarget(null);
      setReason('');
      setSent(true);
      await corrections.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not send that request.');
    } finally {
      setBusy(false);
    }
  }, [target, kind, reason, withToken, corrections]);

  if (history.loading) return <Loading label="Loading your attendance" />;
  if (history.error) {
    const offline = history.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your corrections'}
          detail={offline ? undefined : history.error?.message}
          onRetry={history.reload}
        />
      </Screen>
    );
  }

  const days = (history.data ?? []).filter((day) => CORRECTABLE.has(day.status));
  const requests = corrections.data ?? [];
  const pending = requests.filter((r) => r.status === 'pending');

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={history.refreshing}
            onRefresh={() => {
              void history.refresh();
              void corrections.refresh();
            }}
            tintColor={color.brand}
          />
        }
      >
        {sent ? <Banner tone="positive">Request sent. Your manager will review it.</Banner> : null}
        {error && !target ? <Banner tone="critical">{error}</Banner> : null}

        {pending.length ? (
          <Banner tone="caution">
            <Text variant="label" tone={color.status.caution} style={{ flex: 1 }}>
              {pending.length} request{pending.length === 1 ? '' : 's'} waiting for review.
            </Text>
          </Banner>
        ) : null}

        <Section title="Days you can appeal">
          {days.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Nothing to correct"
              detail="Only late marks, early exits, absences and missing check-outs can be appealed."
            />
          ) : (
            days.map((day) => {
              const meta = statusMeta[day.status];
              return (
                <Card key={day.id}>
                  <Row style={styles.cardHead}>
                    <Text variant="body">{dayLabel(day.work_date)}</Text>
                    <Badge label={meta.label} colorOverride={meta.color} />
                  </Row>
                  <Row style={styles.detail}>
                    <Text variant="label" tone={color.textSecondary}>
                      In / out
                    </Text>
                    <Text variant="mono">
                      {timeOfDay(day.check_in_at)} — {timeOfDay(day.check_out_at)}
                    </Text>
                  </Row>
                  <Button
                    title="Request a correction"
                    variant="secondary"
                    icon="create-outline"
                    onPress={() => {
                      setTarget(day);
                      setSent(false);
                      setKind(
                        day.status === 'missing_checkout'
                          ? 'missing_checkout'
                          : day.status === 'absent'
                            ? 'wrong_check_in'
                            : day.status === 'early_exit'
                              ? 'early_exit_reason'
                              : 'late_reason',
                      );
                    }}
                  />
                </Card>
              );
            })
          )}
        </Section>

        <Section title="Your requests">
          {requests.length === 0 ? (
            <Text variant="label" tone={color.textTertiary}>
              Nothing requested yet.
            </Text>
          ) : (
            requests.map((row) => (
              <Card key={row.id}>
                <Row style={styles.cardHead}>
                  <Text variant="body">{dayLabel(row.work_date)}</Text>
                  <Badge label={row.status} colorOverride={STATUS_COLOR[row.status]} />
                </Row>
                <Text variant="label" tone={color.textSecondary}>
                  {KINDS.find((k) => k.key === row.correction_type)?.label ?? row.correction_type}
                </Text>
                <Text variant="body" tone={color.textSecondary}>
                  {row.reason}
                </Text>
                {row.review_note ? (
                  <>
                    <Divider />
                    <Text variant="label" tone={color.textTertiary}>
                      Manager: {row.review_note}
                    </Text>
                  </>
                ) : null}
              </Card>
            ))
          )}

          <Text variant="label" tone={color.textTertiary} style={styles.footnote}>
            Signed in as {user?.full_name}. Corrections are reviewed by your branch manager and
            recorded in the audit trail.
          </Text>
        </Section>
      </Body>

      <Modal
        visible={target !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTarget(null)}
      >
        <View style={styles.backdrop}>
          <Card style={styles.modalCard}>
            <Text variant="heading">Request a correction</Text>
            {target ? (
              <Text variant="label" tone={color.textSecondary}>
                {dayLabel(target.work_date)} · {statusMeta[target.status].label}
              </Text>
            ) : null}

            <Eyebrow>What happened</Eyebrow>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kinds}>
              <Row style={styles.kindRow}>
                {KINDS.map((option) => (
                  <Text
                    key={option.key}
                    variant="label"
                    accessibilityRole="button"
                    accessibilityState={{ selected: kind === option.key }}
                    tone={kind === option.key ? color.text : color.textTertiary}
                    onPress={() => setKind(option.key)}
                    style={[styles.kind, kind === option.key && styles.kindSelected]}
                  >
                    {option.label}
                  </Text>
                ))}
              </Row>
            </ScrollView>

            <Input
              label="Reason"
              value={reason}
              onChangeText={setReason}
              placeholder="Tell your manager what happened."
              multiline
              numberOfLines={3}
              accessibilityLabel="Reason for the correction"
              testID="correction-reason"
            />

            {error && target ? <Banner tone="critical">{error}</Banner> : null}

            <Button
              title="SEND REQUEST"
              loading={busy}
              disabled={reason.trim().length < 5}
              onPress={submit}
            />
            <Button title="Cancel" variant="ghost" onPress={() => setTarget(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

function buildStyles() {
  return StyleSheet.create({
  cardHead: { justifyContent: 'space-between' },
  detail: { justifyContent: 'space-between', paddingVertical: 3 },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: space.lg },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: space.lg,
  },
  modalCard: { gap: space.md },
  kinds: { maxHeight: 44 },
  kindRow: { gap: space.sm },
  kind: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surfaceOverlay,
    overflow: 'hidden',
  },
  kindSelected: { borderColor: color.brand, backgroundColor: `${color.brand}22` },
});
}
