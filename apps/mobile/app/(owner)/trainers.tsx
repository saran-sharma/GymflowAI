/** Every trainer the signed-in role may see, grouped by branch. */

import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Trainer } from '../../src/api/types';
import {
  Body,
  EmptyState,
  ErrorState,
  Eyebrow,
  PersonRow,
  Screen,
  SkeletonScreen,
  Staggered,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';

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
      <Screen background="owner" backgroundIntensity="subtle">
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
    <Screen background="owner" backgroundIntensity="subtle">
      <Body
        refreshControl={
          <RefreshControl
            refreshing={trainers.refreshing}
            onRefresh={trainers.refresh}
            tintColor={color.brand}
          />
        }
      >
        <Text variant="title">Trainers</Text>

        {grouped.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No trainers yet"
            detail="Trainers appear here once your branches add them in GymFlow."
          />
        ) : (
          <Staggered>
            {grouped.map(([branchName, list]) => (
              <View key={branchName} style={styles.group}>
                <Eyebrow>{branchName}</Eyebrow>
                {list.map((trainer) => (
                  <PersonRow
                    key={trainer.id}
                    name={trainer.full_name}
                    detail={trainer.specialty ?? trainer.designation ?? 'Trainer'}
                    onPress={() => router.push(`/(owner)/trainer/${trainer.id}` as never)}
                    testID={`trainer-row-${trainer.id}`}
                  />
                ))}
              </View>
            ))}
          </Staggered>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm, marginTop: space.md },
});
