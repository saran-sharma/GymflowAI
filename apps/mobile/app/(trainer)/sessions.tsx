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
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { ScheduleItem } from '../../src/api/types';
import { sessionMeta } from '../../src/components/programme';
import {
  Banner,
  Body,
  EmptyState,
  ErrorState,
  LinkButton,
  Screen,
  Section,
  SessionCard,
  SkeletonScreen,
  StatCard,
  Text,
  TimelineRow,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';
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

  /**
   * Mark a supervised own-workout delivered.
   *
   * Only own-workout support closes from here. A PT session needs both people
   * marked present, so it opens the split view; a class needs its roster, so
   * it opens the class screen. Neither can be honestly closed from a list row.
   */
  const completeSupport = useCallback(
    async (item: ScheduleItem) => {
      setBusyId(item.reference_id);
      setError(null);
      try {
        await withToken((token) => api.completeSupportSession(item.reference_id, token));
        await schedule.refresh();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not update that session.');
      } finally {
        setBusyId(null);
      }
    },
    [withToken, schedule],
  );

  if (schedule.loading) return <SkeletonScreen cards={4} />;
  if (schedule.error) {
    const offline = schedule.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : "We could not load today's sessions"}
          detail={offline ? undefined : schedule.error?.message}
          onRetry={schedule.reload}
        />
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
            tintColor={color.brand}
          />
        }
      >
        {error ? <Banner tone="critical">{error}</Banner> : null}

        <View style={styles.tiles}>
          <StatCard label="Today" value={items.length} hint="sessions" />
          <StatCard label="Completed" value={completed} colorOverride={color.status.positive} />
          <StatCard
            label="Missed"
            value={missed}
            colorOverride={missed ? color.status.caution : color.textTertiary}
          />
        </View>

        <Section title="Today's schedule">
          {items.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="Nothing scheduled"
              detail="PT sessions and classes you are taking today will appear here."
            />
          ) : (
            items.map((item, index) => (
              <TimelineRow
                key={`${item.kind}-${item.reference_id}`}
                time={item.starts_at ? timeOfDay(item.starts_at) : '—'}
                endTime={item.ends_at ? timeOfDay(item.ends_at) : undefined}
                live={item.status === 'in_progress'}
                connected={index < items.length - 1}
                index={index}
                tone={item.status === 'in_progress' ? 'caution' : 'brand'}
              >
                <SessionCard
                  testID={`session-${item.reference_id}`}
                  kind={KIND_LABEL[item.kind]}
                  kindIcon={KIND_ICON[item.kind]}
                  title={item.title}
                  subtitle={item.subtitle ?? undefined}
                  status={{
                    label: sessionMeta[item.status].label,
                    colorOverride: sessionMeta[item.status].color,
                  }}
                  onPress={
                    item.kind === 'pt'
                      ? () => router.push(`/(trainer)/pt/${item.reference_id}` as never)
                      : undefined
                  }
                  footer={
                    item.can_complete && item.kind === 'own_workout_support' ? (
                      <LinkButton
                        title={busyId === item.reference_id ? 'Marking…' : 'Mark completed'}
                        disabled={busyId !== null}
                        onPress={() => void completeSupport(item)}
                      />
                    ) : item.can_complete && item.kind === 'group_class' ? (
                      <LinkButton
                        title="Take attendance"
                        onPress={() => router.push('/(trainer)/classes' as never)}
                      />
                    ) : undefined
                  }
                />
              </TimelineRow>
            ))
          )}

          <Text variant="label" tone={color.textTertiary} style={styles.footnote}>
            Session times come from the GymFlow server. You can record what happened; you cannot
            change a recorded time — ask your manager for a correction.
          </Text>
        </Section>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: space.sm },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: space.lg },
});
