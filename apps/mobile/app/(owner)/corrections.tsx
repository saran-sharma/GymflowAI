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
  Section,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { dayLabel, timeOfDay } from '../../src/utils/format';

const STATUS_COLOR: Record<AttendanceCorrection['status'], string> = {
  pending: color.status.caution,
  approved: color.status.positive,
  rejected: color.status.critical,
  withdrawn: color.textTertiary,
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
            tintColor={color.brand}
          />
        }
      >
        {error ? <Banner tone="critical">{error}</Banner> : null}

        <Section title={`Waiting for review (${pending.length})`}>
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
                  <Text variant="heading">{row.trainer_name ?? `Trainer ${row.trainer_id}`}</Text>
                  <Badge
                    label={row.correction_type.replace(/_/g, ' ')}
                    colorOverride={color.status.caution}
                  />
                </Row>
                <Text variant="label" tone={color.textSecondary}>
                  {dayLabel(row.work_date)}
                </Text>

                <Divider />
                <Eyebrow>Reason given</Eyebrow>
                <Text variant="body" tone={color.textSecondary}>
                  {row.reason}
                </Text>

                <Divider />
                <Row style={styles.change}>
                  <View style={styles.grow}>
                    <Eyebrow>Currently</Eyebrow>
                    <Text variant="mono">
                      {timeOfDay(row.original_check_in_at)} — {timeOfDay(row.original_check_out_at)}
                    </Text>
                    <Text variant="label" tone={color.textTertiary}>
                      {row.original_status ?? '—'}
                    </Text>
                  </View>
                  <View style={styles.grow}>
                    <Eyebrow>Requested</Eyebrow>
                    <Text variant="mono" tone={color.brandAccent}>
                      {timeOfDay(row.requested_check_in_at ?? row.original_check_in_at)} —{' '}
                      {timeOfDay(row.requested_check_out_at ?? row.original_check_out_at)}
                    </Text>
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
                      variant="destructive"
                      loading={busyId === row.id}
                      onPress={() => void review(row, false)}
                    />
                  </View>
                </Row>
              </Card>
            ))
          )}
        </Section>

        {decided.length ? (
          <Section title="Decided">
            {decided.slice(0, 20).map((row) => (
              <Row key={row.id} style={styles.historyRow}>
                <View style={styles.grow}>
                  <Text variant="body">{row.trainer_name ?? `Trainer ${row.trainer_id}`}</Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {dayLabel(row.work_date)} · {row.correction_type.replace(/_/g, ' ')}
                  </Text>
                </View>
                <Badge label={row.status} colorOverride={STATUS_COLOR[row.status]} />
              </Row>
            ))}
          </Section>
        ) : null}

        <Text variant="label" tone={color.textTertiary} style={styles.footnote}>
          Approving writes the requested times to the attendance record and logs who decided, when,
          and what changed.
        </Text>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  cardHead: { justifyContent: 'space-between' },
  change: { gap: space.md, alignItems: 'flex-start' },
  actions: { gap: space.sm, paddingTop: space.sm },
  historyRow: {
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: space.lg },
});
