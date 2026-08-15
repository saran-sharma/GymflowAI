/** Every trainer the signed-in role may see, grouped by branch. */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Trainer } from '../../src/api/types';
import {
  Body,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Screen,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { colors, radius, spacing } from '../../src/theme';
import { initials } from '../../src/utils/format';

export default function OwnerTrainersScreen() {
  const router = useRouter();
  const trainers = useApi<Trainer[]>((token) => api.listTrainers(token), []);

  const grouped = useMemo(() => {
    const byBranch = new Map<string, Trainer[]>();
    for (const trainer of trainers.data ?? []) {
      const list = byBranch.get(trainer.branch_name) ?? [];
      list.push(trainer);
      byBranch.set(trainer.branch_name, list);
    }
    return [...byBranch.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [trainers.data]);

  if (trainers.loading) return <Loading label="Loading trainers" />;
  if (trainers.error) {
    const offline = trainers.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load trainers'}
          detail={offline ? undefined : trainers.error?.message}
          onRetry={trainers.reload}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={trainers.refreshing}
            onRefresh={trainers.refresh}
            tintColor={colors.brand}
          />
        }
      >
        <Txt variant="title">Trainers</Txt>

        {grouped.length === 0 ? (
          <EmptyState icon="people-outline" title="No trainers yet" />
        ) : (
          grouped.map(([branchName, list]) => (
            <View key={branchName} style={styles.group}>
              <Eyebrow>{branchName}</Eyebrow>
              {list.map((trainer) => (
                <Pressable
                  key={trainer.id}
                  onPress={() => router.push(`/(owner)/trainer/${trainer.id}` as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${trainer.full_name}`}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.avatar}>
                    <Txt variant="label">{initials(trainer.full_name)}</Txt>
                  </View>
                  <View style={styles.text}>
                    <Txt variant="body">{trainer.full_name}</Txt>
                    <Txt variant="label" color={colors.textFaint}>
                      {trainer.specialty ?? trainer.designation ?? 'Trainer'}
                    </Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                </Pressable>
              ))}
            </View>
          ))
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  pressed: { backgroundColor: colors.raised, borderColor: colors.borderStrong },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
