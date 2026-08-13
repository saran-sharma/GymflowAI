/**
 * Attendance exceptions, from the trainer's side.
 *
 * A trainer explains what happened and asks for a fix. Nothing on this screen
 * changes an attendance record — the request sits until a manager approves it,
 * and both the ask and the decision are audited.
 */

import React, { useCallback, useState } from 'react';
import { Modal, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { AttendanceCorrection, AttendanceDay, CorrectionKind } from '../../src/api/types';
import { SectionHeader } from '../../src/components/programme';
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
  Loading,
  Row,
  Screen,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { colors, radius, spacing, statusMeta, typography } from '../../src/theme';
import { dayLabel, timeOfDay } from '../../src/utils/format';

const KINDS: { key: CorrectionKind; label: string }[] = [
  { key: 'missing_checkout', label: 'Forgot check-out' },
  { key: 'late_reason', label: 'Late arrival reason' },
  { key: 'early_exit_reason', label: 'Early exit reason' },
  { key: 'wrong_check_in', label: 'Wrong check-in' },
  { key: 'shift_correction', label: 'Shift correction' },
];

const STATUS_COLOR: Record<AttendanceCorrection['status'], string> = {
  pending: colors.late,
  approved: colors.onTime,
  rejected: colors.absent,
  withdrawn: colors.textFaint,
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
            requested_check_out_at:
              kind === 'missing_checkout' ? target.scheduled_end : null,
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
    return (
      <Screen>
        <ErrorState detail={history.error.message} onRetry={history.reload} />
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
            tintColor={colors.brand}
          />
        }
      >
        {sent ? (
          <Banner tone="success">
            Request sent. Your manager will review it.
          </Banner>
        ) : null}
        {error && !target ? <Banner tone="danger">{error}</Banner> : null}

        {pending.length ? (
          <Banner tone="warning">
            {pending.length} request{pending.length === 1 ? '' : 's'} waiting for review.
          </Banner>
        ) : null}

        <SectionHeader title="Days you can appeal" />
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
                  <Txt variant="body">{dayLabel(day.work_date)}</Txt>
                  <Badge label={meta.label} color={meta.color} />
                </Row>
                <Row style={styles.detail}>
                  <Txt variant="label" color={colors.textMuted}>
                    In / out
                  </Txt>
                  <Txt variant="mono">
                    {timeOfDay(day.check_in_at)} — {timeOfDay(day.check_out_at)}
                  </Txt>
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

        <SectionHeader title="Your requests" />
        {requests.length === 0 ? (
          <Txt variant="label" color={colors.textFaint}>
            Nothing requested yet.
          </Txt>
        ) : (
          requests.map((row) => (
            <Card key={row.id}>
              <Row style={styles.cardHead}>
                <Txt variant="body">{dayLabel(row.work_date)}</Txt>
                <Badge label={row.status} color={STATUS_COLOR[row.status]} />
              </Row>
              <Txt variant="label" color={colors.textMuted}>
                {KINDS.find((k) => k.key === row.correction_type)?.label ?? row.correction_type}
              </Txt>
              <Txt variant="body" color={colors.textMuted}>
                {row.reason}
              </Txt>
              {row.review_note ? (
                <>
                  <Divider />
                  <Txt variant="label" color={colors.textFaint}>
                    Manager: {row.review_note}
                  </Txt>
                </>
              ) : null}
            </Card>
          ))
        )}

        <Txt variant="label" color={colors.textFaint} style={styles.footnote}>
          Signed in as {user?.full_name}. Corrections are reviewed by your branch manager and
          recorded in the audit trail.
        </Txt>
      </Body>

      <Modal
        visible={target !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTarget(null)}
      >
        <View style={styles.backdrop}>
          <Card style={styles.modalCard}>
            <Txt variant="heading">Request a correction</Txt>
            {target ? (
              <Txt variant="label" color={colors.textMuted}>
                {dayLabel(target.work_date)} · {statusMeta[target.status].label}
              </Txt>
            ) : null}

            <Eyebrow>What happened</Eyebrow>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kinds}>
              <Row style={styles.kindRow}>
                {KINDS.map((option) => (
                  <Txt
                    key={option.key}
                    variant="label"
                    accessibilityRole="button"
                    accessibilityState={{ selected: kind === option.key }}
                    color={kind === option.key ? colors.text : colors.textFaint}
                    onPress={() => setKind(option.key)}
                    style={[styles.kind, kind === option.key && styles.kindSelected]}
                  >
                    {option.label}
                  </Txt>
                ))}
              </Row>
            </ScrollView>

            <Eyebrow>Reason</Eyebrow>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Tell your manager what happened."
              placeholderTextColor={colors.textFaint}
              multiline
              numberOfLines={3}
              style={styles.input}
              accessibilityLabel="Reason for the correction"
              testID="correction-reason"
            />

            {error && target ? <Banner tone="danger">{error}</Banner> : null}

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

const styles = StyleSheet.create({
  cardHead: { justifyContent: 'space-between' },
  detail: { justifyContent: 'space-between', paddingVertical: 3 },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: spacing.lg },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: { gap: spacing.md },
  kinds: { maxHeight: 44 },
  kindRow: { gap: spacing.sm },
  kind: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
    overflow: 'hidden',
  },
  kindSelected: { borderColor: colors.brand, backgroundColor: `${colors.brand}22` },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
