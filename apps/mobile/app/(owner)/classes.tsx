/**
 * Group classes across the owner's branches: announce one, and see turnout.
 */

import React, { useCallback, useState } from 'react';
import { Modal, RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Branch, GroupClass } from '../../src/api/types';
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
  ProgressBar,
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
import { dayLabel, timeOfDay } from '../../src/utils/format';

export default function OwnerClassesScreen() {
  const styles = useThemedStyles(buildStyles);
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
            tintColor={color.brand}
          />
        }
      >
        <Text variant="title">Group classes</Text>
        <Button title="ANNOUNCE A CLASS" icon="megaphone-outline" onPress={() => setOpen(true)} />

        {error && !open ? <Banner tone="critical">{error}</Banner> : null}

        <Section title="Scheduled">
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
                  <Text variant="heading">{row.name}</Text>
                  <Badge
                    label={row.status}
                    colorOverride={
                      row.status === 'cancelled' ? color.status.critical : color.status.positive
                    }
                  />
                </Row>
                <Text variant="label" tone={color.textSecondary}>
                  {row.branch_name} · {dayLabel(row.class_date)} · {timeOfDay(row.starts_at)}
                  {row.trainer_name ? ` · ${row.trainer_name}` : ''}
                </Text>

                <Divider />
                <Row style={styles.counts}>
                  <Text variant="mono" tone={color.status.positive}>
                    {row.yes_count} Yes
                  </Text>
                  <Text variant="mono" tone={color.textSecondary}>
                    {row.no_count} No
                  </Text>
                  <Text variant="mono" tone={color.textTertiary}>
                    {row.pending_count} Pending
                  </Text>
                </Row>
                <Text variant="label" tone={color.textTertiary}>
                  {row.available} of {row.capacity} places available
                </Text>

                {row.attended_count > 0 || row.status === 'completed' ? (
                  <>
                    <Divider />
                    <Row style={styles.counts}>
                      <Text variant="label" tone={color.textSecondary}>
                        Attended
                      </Text>
                      <Text variant="mono">
                        {row.attended_count} of {row.yes_count} ({row.show_up_pct}%)
                      </Text>
                    </Row>
                    <ProgressBar
                      value={row.show_up_pct}
                      colorOverride={
                        row.show_up_pct >= 50 ? color.status.positive : color.status.caution
                      }
                    />
                  </>
                ) : null}
              </Card>
            ))
          )}
        </Section>

        <Text variant="label" tone={color.textTertiary} style={styles.footnote}>
          Saying yes is an RSVP. Attendance is recorded separately by the trainer after the class.
        </Text>
      </Body>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Card style={styles.modalCard}>
            <Text variant="heading">Announce a class</Text>

            <Eyebrow>Branch</Eyebrow>
            <Row style={styles.branchRow}>
              {(branches.data ?? []).map((branch) => {
                const selected = (branchId ?? branches.data?.[0]?.id) === branch.id;
                return (
                  <Text
                    key={branch.id}
                    variant="label"
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    tone={selected ? color.text : color.textTertiary}
                    onPress={() => setBranchId(branch.id)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    {branch.name.replace(/^SLAM\s+/i, '')}
                  </Text>
                );
              })}
            </Row>

            <Input label="Class name" value={name} onChangeText={setName} placeholder="Zumba" />

            <Row style={styles.timeRow}>
              <View style={styles.grow}>
                <Input
                  label="Days from today"
                  value={daysAhead}
                  onChangeText={(v) => setDaysAhead(v.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.grow}>
                <Input
                  label="Hour (24h)"
                  value={hour}
                  onChangeText={(v) => setHour(v.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                />
              </View>
            </Row>

            {error ? <Banner tone="critical">{error}</Banner> : null}

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

function buildStyles() {
  return StyleSheet.create({
  grow: { flex: 1 },
  cardHead: { justifyContent: 'space-between' },
  counts: { justifyContent: 'space-between' },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: space.lg },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: space.lg,
  },
  modalCard: { gap: space.sm },
  branchRow: { gap: space.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surfaceOverlay,
    overflow: 'hidden',
  },
  chipSelected: { borderColor: color.brand, backgroundColor: `${color.brand}22` },
  timeRow: { gap: space.sm, alignItems: 'flex-start' },
});
}
