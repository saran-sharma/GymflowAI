/** Every trainer the signed-in role may see, grouped by branch. */

import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Trainer } from '../../src/api/types';
import { Body, EmptyState, ErrorState, Eyebrow, Screen, Txt } from '../../src/components/ui';
import { PersonRow, SkeletonScreen } from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { colors, spacing } from '../../src/theme';

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

  if (trainers.loading) return <SkeletonScreen cards={5} stats={false} />;
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
              {list.map((trainer, index) => (
                <PersonRow
                  key={trainer.id}
                  index={index}
                  name={trainer.full_name}
                  detail={trainer.specialty ?? trainer.designation ?? 'Trainer'}
                  onPress={() => router.push(`/(owner)/trainer/${trainer.id}` as never)}
                  testID={`trainer-row-${trainer.id}`}
                />
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
});
