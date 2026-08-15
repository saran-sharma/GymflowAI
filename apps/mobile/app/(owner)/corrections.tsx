/**
 * Attendance exceptions, from the manager's side.
 *
 * This is the only path that edits an attendance record, and both the request
 * and the decision are written to the audit trail with the before and after
 * values.
 */

import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { AttendanceCorrection } from '../../src/api/types';
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
import { colors, spacing } from '../../src/theme';
import { dayLabel, timeOfDay } from '../../src/utils/format';

const STATUS_COLOR: Record<AttendanceCorrection['status'], string> = {
  pending: colors.late,
  approved: colors.onTime,
  rejected: colors.absent,
  withdrawn: colors.textFaint,
};

export default function OwnerCorrectionsScreen() {
  const { withToken } = useAuth();
  const corrections = useApi<AttendanceCorrection[]>((token) => api.listCorrections(token), []);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const review = useCallback(
    async (row: AttendanceCorrection, approve: boolean) => {
      setBusyId(row.id);
      setError(null);
      try {
        await withToken((token) => api.reviewCorrection(row.id, approve, token));
        await corrections.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not record that decision.');
      } finally {
        setBusyId(null);
      }
    },
    [withToken, corrections],
  );

  if (corrections.loading) return <Loading label="Loading corrections" />;
  if (corrections.error) {
    const offline = corrections.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load corrections'}
          detail={offline ? undefined : corrections.error?.message}
          onRetry={corrections.reload}
        />
      </Screen>
    );
  }

  const rows = corrections.data ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const decided = rows.filter((r) => r.status !== 'pending');

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={corrections.refreshing}
            onRefresh={() => void corrections.refresh()}
            tintColor={colors.brand}
          />
        }
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}

        <SectionHeader title={`Waiting for review (${pending.length})`} />
        {pending.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Nothing waiting"
            detail="Trainer correction requests appear here for approval."
          />
        ) : (
          pending.map((row) => (
            <Card key={row.id}>
              <Row style={styles.cardHead}>
                <Txt variant="heading">{row.trainer_name ?? `Trainer ${row.trainer_id}`}</Txt>
                <Badge label={row.correction_type.replace(/_/g, ' ')} color={colors.late} />
              </Row>
              <Txt variant="label" color={colors.textMuted}>
                {dayLabel(row.work_date)}
              </Txt>

              <Divider />
              <Eyebrow>Reason given</Eyebrow>
              <Txt variant="body" color={colors.textMuted}>
                {row.reason}
              </Txt>

              <Divider />
              <Row style={styles.change}>
                <View style={styles.grow}>
                  <Eyebrow>Currently</Eyebrow>
                  <Txt variant="mono">
                    {timeOfDay(row.original_check_in_at)} — {timeOfDay(row.original_check_out_at)}
                  </Txt>
                  <Txt variant="label" color={colors.textFaint}>
                    {row.original_status ?? '—'}
                  </Txt>
                </View>
                <View style={styles.grow}>
                  <Eyebrow>Requested</Eyebrow>
                  <Txt variant="mono" color={colors.brandSoft}>
                    {timeOfDay(row.requested_check_in_at ?? row.original_check_in_at)} —{' '}
                    {timeOfDay(row.requested_check_out_at ?? row.original_check_out_at)}
                  </Txt>
                </View>
              </Row>

              <Row style={styles.actions}>
                <View style={styles.grow}>
                  <Button
                    title="APPROVE"
                    loading={busyId === row.id}
                    onPress={() => void review(row, true)}
                  />
                </View>
                <View style={styles.grow}>
                  <Button
                    title="REJECT"
                    variant="danger"
                    loading={busyId === row.id}
                    onPress={() => void review(row, false)}
                  />
                </View>
              </Row>
            </Card>
          ))
        )}

        {decided.length ? (
          <>
            <SectionHeader title="Decided" />
            {decided.slice(0, 20).map((row) => (
              <Row key={row.id} style={styles.historyRow}>
                <View style={styles.grow}>
                  <Txt variant="body">{row.trainer_name ?? `Trainer ${row.trainer_id}`}</Txt>
                  <Txt variant="label" color={colors.textFaint}>
                    {dayLabel(row.work_date)} · {row.correction_type.replace(/_/g, ' ')}
                  </Txt>
                </View>
                <Badge label={row.status} color={STATUS_COLOR[row.status]} />
              </Row>
            ))}
          </>
        ) : null}

        <Txt variant="label" color={colors.textFaint} style={styles.footnote}>
          Approving writes the requested times to the attendance record and logs who decided, when,
          and what changed.
        </Txt>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  cardHead: { justifyContent: 'space-between' },
  change: { gap: spacing.md, alignItems: 'flex-start' },
  actions: { gap: spacing.sm, paddingTop: spacing.sm },
  historyRow: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: spacing.lg },
});
