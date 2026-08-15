/**
 * The classes this trainer is taking, and who turned up.
 *
 * RSVP counts come from the members' answers; attendance is recorded here,
 * separately, after the class has run.
 */

import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { ClassRosterEntry, GroupClass } from '../../src/api/types';
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

export default function TrainerClassesScreen() {
  const { withToken } = useAuth();
  const classes = useApi<GroupClass[]>((token) => api.listClasses(token), []);
  const [openId, setOpenId] = useState<number | null>(null);
  const [roster, setRoster] = useState<ClassRosterEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openRoster = useCallback(
    async (classId: number) => {
      setBusy(true);
      setError(null);
      try {
        const rows = await withToken((token) => api.classRoster(classId, token));
        setRoster(rows);
        setOpenId(classId);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not load the roster.');
      } finally {
        setBusy(false);
      }
    },
    [withToken],
  );

  const mark = useCallback(
    async (classId: number, memberId: number, attended: boolean) => {
      setBusy(true);
      setError(null);
      try {
        await withToken((token) => api.recordClassAttendance(classId, [memberId], attended, token));
        const rows = await withToken((token) => api.classRoster(classId, token));
        setRoster(rows);
        await classes.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not record that.');
      } finally {
        setBusy(false);
      }
    },
    [withToken, classes],
  );

  if (classes.loading) return <Loading label="Loading classes" />;
  if (classes.error) {
    const offline = classes.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your classes'}
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
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <SectionHeader title="Classes at your branch" />

        {rows.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No classes scheduled"
            detail="Classes created at your branch appear here."
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
                {dayLabel(row.class_date)} · {timeOfDay(row.starts_at)}
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
                  {row.available} left
                </Txt>
              </Row>
              {row.attended_count > 0 ? (
                <Txt variant="label" color={colors.textFaint}>
                  {row.attended_count} attended ({row.show_up_pct}% of those who said yes)
                </Txt>
              ) : null}

              <Button
                title={openId === row.id ? 'Hide roster' : 'Attendance'}
                variant="secondary"
                icon="list-outline"
                loading={busy && openId === row.id}
                onPress={() => (openId === row.id ? setOpenId(null) : void openRoster(row.id))}
              />

              {openId === row.id ? (
                <View style={styles.roster}>
                  <Eyebrow>Who said yes</Eyebrow>
                  {roster.filter((r) => r.response === 'yes').length === 0 ? (
                    <Txt variant="label" color={colors.textFaint}>
                      Nobody has confirmed yet.
                    </Txt>
                  ) : (
                    roster
                      .filter((r) => r.response === 'yes')
                      .map((entry) => (
                        <Row key={entry.member_id} style={styles.rosterRow}>
                          <Txt variant="body" style={styles.grow}>
                            {entry.member_name}
                          </Txt>
                          <Txt
                            variant="label"
                            accessibilityRole="button"
                            color={entry.attended === true ? colors.onTime : colors.textFaint}
                            onPress={() => void mark(row.id, entry.member_id, true)}
                            style={styles.rosterAction}
                          >
                            Present
                          </Txt>
                          <Txt
                            variant="label"
                            accessibilityRole="button"
                            color={entry.attended === false ? colors.absent : colors.textFaint}
                            onPress={() => void mark(row.id, entry.member_id, false)}
                            style={styles.rosterAction}
                          >
                            Absent
                          </Txt>
                        </Row>
                      ))
                  )}
                </View>
              ) : null}
            </Card>
          ))
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  cardHead: { justifyContent: 'space-between' },
  counts: { justifyContent: 'space-between' },
  roster: { gap: spacing.sm, paddingTop: spacing.sm },
  rosterRow: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rosterAction: { paddingHorizontal: spacing.sm, paddingVertical: 4 },
});
