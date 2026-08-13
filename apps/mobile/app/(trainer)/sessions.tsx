/**
 * The trainer's day: PT sessions, group classes and own-workout support.
 *
 * Composed by the server from the records that already exist, so a session
 * shown here is the same row the member sees — not a copy that can drift.
 * A trainer can mark work delivered; they cannot edit an attendance timestamp
 * from this screen, or anywhere else.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { ScheduleItem } from '../../src/api/types';
import { SectionHeader, sessionMeta } from '../../src/components/programme';
import {
  Badge,
  Banner,
  Body,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Row,
  Screen,
  StatTile,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
import { colors, radius, spacing } from '../../src/theme';
import { timeOfDay } from '../../src/utils/format';

const KIND_LABEL: Record<ScheduleItem['kind'], string> = {
  pt: 'PT',
  group_class: 'GROUP CLASS',
  own_workout_support: 'OWN WORKOUT SUPPORT',
};

const KIND_ICON: Record<ScheduleItem['kind'], keyof typeof Ionicons.glyphMap> = {
  pt: 'person-outline',
  group_class: 'people-outline',
  own_workout_support: 'barbell-outline',
};

export default function TrainerSessionsScreen() {
  const router = useRouter();
  const { withToken } = useAuth();
  const schedule = useApi<ScheduleItem[]>((token) => api.myScheduleToday(token), []);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const complete = useCallback(
    async (item: ScheduleItem) => {
      setBusyId(item.reference_id);
      setError(null);
      try {
        if (item.kind === 'own_workout_support') {
          await withToken((token) => api.completeSupportSession(item.reference_id, token));
        } else if (item.kind === 'group_class') {
          await withToken((token) =>
            api.recordClassAttendance(item.reference_id, [], true, token).catch(() => undefined),
          );
        }
        await schedule.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not update that session.');
      } finally {
        setBusyId(null);
      }
    },
    [withToken, schedule],
  );

  if (schedule.loading) return <Loading label="Loading today's sessions" />;
  if (schedule.error) {
    return (
      <Screen>
        <ErrorState detail={schedule.error.message} onRetry={schedule.reload} />
      </Screen>
    );
  }

  const items = schedule.data ?? [];
  const completed = items.filter((i) => i.status === 'completed').length;
  const missed = items.filter((i) => i.status === 'missed' || i.status === 'no_show').length;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={schedule.refreshing}
            onRefresh={() => void schedule.refresh()}
            tintColor={colors.brand}
          />
        }
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}

        <View style={styles.tiles}>
          <StatTile label="Today" value={items.length} hint="sessions" />
          <StatTile label="Completed" value={completed} accent={colors.onTime} />
          <StatTile label="Missed" value={missed} accent={missed ? colors.late : colors.textFaint} />
        </View>

        <SectionHeader title="Today's schedule" />

        {items.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="Nothing scheduled"
            detail="PT sessions and classes you are taking today will appear here."
          />
        ) : (
          items.map((item) => {
            const meta = sessionMeta[item.status];
            const openable = item.kind === 'pt';
            const body = (
              <>
                <Row style={styles.head}>
                  <Ionicons name={KIND_ICON[item.kind]} size={18} color={colors.textFaint} />
                  <Eyebrow>{KIND_LABEL[item.kind]}</Eyebrow>
                  <View style={styles.grow} />
                  <Badge label={meta.label} color={meta.color} />
                </Row>
                <Row style={styles.body}>
                  <Txt variant="mono" color={colors.textMuted} style={styles.time}>
                    {item.starts_at ? timeOfDay(item.starts_at) : '—'}
                  </Txt>
                  <View style={styles.grow}>
                    <Txt variant="body">{item.title}</Txt>
                    {item.subtitle ? (
                      <Txt variant="label" color={colors.textFaint}>
                        {item.subtitle}
                      </Txt>
                    ) : null}
                  </View>
                  {openable ? (
                    <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                  ) : null}
                </Row>
                {item.can_complete && item.kind === 'own_workout_support' ? (
                  <Txt
                    variant="label"
                    color={busyId === item.reference_id ? colors.textFaint : colors.brandSoft}
                    accessibilityRole="button"
                    onPress={busyId ? undefined : () => void complete(item)}
                    style={styles.action}
                  >
                    Mark completed
                  </Txt>
                ) : null}
              </>
            );

            if (openable) {
              return (
                <Pressable
                  key={`${item.kind}-${item.reference_id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${KIND_LABEL[item.kind]} with ${item.title}`}
                  onPress={() => router.push(`/(trainer)/pt/${item.reference_id}` as never)}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                >
                  {body}
                </Pressable>
              );
            }
            return (
              <Card key={`${item.kind}-${item.reference_id}`}>{body}</Card>
            );
          })
        )}

        <Txt variant="label" color={colors.textFaint} style={styles.footnote}>
          Session times come from the GymFlow server. You can record what happened; you cannot
          change a recorded time — ask your manager for a correction.
        </Txt>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { backgroundColor: colors.raised, borderColor: colors.borderStrong },
  head: { gap: spacing.sm },
  body: { gap: spacing.md },
  time: { minWidth: 52 },
  action: { paddingTop: spacing.sm },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: spacing.lg },
});
