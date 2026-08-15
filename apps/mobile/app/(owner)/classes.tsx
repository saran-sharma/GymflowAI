/**
 * Group classes across the owner's branches: announce one, and see turnout.
 */

import React, { useCallback, useState } from 'react';
import { Modal, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Branch, GroupClass } from '../../src/api/types';
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
  Meter,
  Row,
  Screen,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { colors, radius, spacing, typography } from '../../src/theme';
import { dayLabel, timeOfDay } from '../../src/utils/format';

export default function OwnerClassesScreen() {
  const { withToken } = useAuth();
  const classes = useApi<GroupClass[]>((token) => api.listClasses(token), []);
  const branches = useApi<Branch[]>((token) => api.listBranches(token), []);

  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [daysAhead, setDaysAhead] = useState('1');
  const [hour, setHour] = useState('18');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async () => {
    const branch = branchId ?? branches.data?.[0]?.id;
    if (!branch || name.trim().length < 2) return;

    // Build the start from the device clock only to *propose* a time. The
    // server stores it; nothing about attendance is decided from this value.
    const starts = new Date();
    starts.setDate(starts.getDate() + Math.max(0, Number(daysAhead) || 0));
    starts.setHours(Math.min(23, Number(hour) || 18), 0, 0, 0);

    setBusy(true);
    setError(null);
    try {
      await withToken((token) =>
        api.createClass(
          { branch_id: branch, name: name.trim(), starts_at: starts.toISOString() },
          token,
        ),
      );
      setOpen(false);
      setName('');
      await classes.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not create the class.');
    } finally {
      setBusy(false);
    }
  }, [branchId, branches.data, name, daysAhead, hour, withToken, classes]);

  if (classes.loading) return <Loading label="Loading classes" />;
  if (classes.error) {
    const offline = classes.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load classes'}
          detail={offline ? undefined : classes.error?.message}
          onRetry={classes.reload}
        />
      </Screen>
    );
  }

  const rows = classes.data ?? [];

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={classes.refreshing}
            onRefresh={() => void classes.refresh()}
            tintColor={colors.brand}
          />
        }
      >
        <Txt variant="title">Group classes</Txt>
        <Button
          title="ANNOUNCE A CLASS"
          icon="megaphone-outline"
          onPress={() => setOpen(true)}
        />

        {error && !open ? <Banner tone="danger">{error}</Banner> : null}

        <SectionHeader title="Scheduled" />
        {rows.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No classes scheduled"
            detail="Announce a class and every member at that branch is told in-app."
          />
        ) : (
          rows.map((row) => (
            <Card key={row.id}>
              <Row style={styles.cardHead}>
                <Txt variant="heading">{row.name}</Txt>
                <Badge
                  label={row.status}
                  color={row.status === 'cancelled' ? colors.absent : colors.onTime}
                />
              </Row>
              <Txt variant="label" color={colors.textMuted}>
                {row.branch_name} · {dayLabel(row.class_date)} · {timeOfDay(row.starts_at)}
                {row.trainer_name ? ` · ${row.trainer_name}` : ''}
              </Txt>

              <Divider />
              <Row style={styles.counts}>
                <Txt variant="mono" color={colors.onTime}>
                  {row.yes_count} Yes
                </Txt>
                <Txt variant="mono" color={colors.textMuted}>
                  {row.no_count} No
                </Txt>
                <Txt variant="mono" color={colors.textFaint}>
                  {row.pending_count} Pending
                </Txt>
              </Row>
              <Txt variant="label" color={colors.textFaint}>
                {row.available} of {row.capacity} places available
              </Txt>

              {row.attended_count > 0 || row.status === 'completed' ? (
                <>
                  <Divider />
                  <Row style={styles.counts}>
                    <Txt variant="label" color={colors.textMuted}>
                      Attended
                    </Txt>
                    <Txt variant="mono">
                      {row.attended_count} of {row.yes_count} ({row.show_up_pct}%)
                    </Txt>
                  </Row>
                  <Meter
                    value={row.show_up_pct}
                    color={row.show_up_pct >= 50 ? colors.onTime : colors.late}
                  />
                </>
              ) : null}
            </Card>
          ))
        )}

        <Txt variant="label" color={colors.textFaint} style={styles.footnote}>
          Saying yes is an RSVP. Attendance is recorded separately by the trainer after the class.
        </Txt>
      </Body>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Card style={styles.modalCard}>
            <Txt variant="heading">Announce a class</Txt>

            <Eyebrow>Branch</Eyebrow>
            <Row style={styles.branchRow}>
              {(branches.data ?? []).map((branch) => {
                const selected = (branchId ?? branches.data?.[0]?.id) === branch.id;
                return (
                  <Txt
                    key={branch.id}
                    variant="label"
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    color={selected ? colors.text : colors.textFaint}
                    onPress={() => setBranchId(branch.id)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    {branch.name.replace(/^SLAM\s+/i, '')}
                  </Txt>
                );
              })}
            </Row>

            <Eyebrow>Class name</Eyebrow>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Zumba"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              accessibilityLabel="Class name"
            />

            <Row style={styles.timeRow}>
              <View style={styles.grow}>
                <Eyebrow>Days from today</Eyebrow>
                <TextInput
                  value={daysAhead}
                  onChangeText={(v) => setDaysAhead(v.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  style={styles.input}
                  accessibilityLabel="Days from today"
                />
              </View>
              <View style={styles.grow}>
                <Eyebrow>Hour (24h)</Eyebrow>
                <TextInput
                  value={hour}
                  onChangeText={(v) => setHour(v.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  style={styles.input}
                  accessibilityLabel="Hour"
                />
              </View>
            </Row>

            {error ? <Banner tone="danger">{error}</Banner> : null}

            <Button
              title="ANNOUNCE"
              loading={busy}
              disabled={name.trim().length < 2}
              onPress={create}
            />
            <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  cardHead: { justifyContent: 'space-between' },
  counts: { justifyContent: 'space-between' },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: spacing.lg },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: { gap: spacing.sm },
  branchRow: { gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
    overflow: 'hidden',
  },
  chipSelected: { borderColor: colors.brand, backgroundColor: `${colors.brand}22` },
  timeRow: { gap: spacing.sm, alignItems: 'flex-start' },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
});
