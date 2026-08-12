/**
 * A single branch: today's numbers, live occupancy, and the trainer roster
 * with each trainer's current state. Tapping a trainer opens their record.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import * as api from '../../../src/api/endpoints';
import type { Dashboard, Trainer } from '../../../src/api/types';
import {
  Body,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  Meter,
  Row,
  Screen,
  StatTile,
  Txt,
} from '../../../src/components/ui';
import { useApi } from '../../../src/hooks/useApi';
import { colors, radius, spacing } from '../../../src/theme';
import { initials, percent } from '../../../src/utils/format';

export default function BranchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const branchId = Number(id);
  const router = useRouter();

  const dashboard = useApi<Dashboard>((token) => api.dashboard(token, branchId), [branchId]);
  const trainers = useApi<Trainer[]>((token) => api.listTrainers(token, branchId), [branchId]);

  if (dashboard.loading) return <Loading label="Loading branch" />;
  if (dashboard.error || !dashboard.data?.branches?.length) {
    return (
      <Screen>
        <ErrorState
          title="Could not load this branch"
          detail={dashboard.error?.message}
          onRetry={dashboard.reload}
        />
      </Screen>
    );
  }

  const branch = dashboard.data.branches[0];
  const occupancy = branch.occupancy;
  const punctualityColor =
    branch.punctuality_pct >= 90
      ? colors.onTime
      : branch.punctuality_pct >= 75
        ? colors.late
        : colors.absent;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={dashboard.refreshing}
            onRefresh={() => {
              void dashboard.refresh();
              void trainers.refresh();
            }}
            tintColor={colors.brand}
          />
        }
      >
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button">
          <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
          <Txt variant="label" color={colors.textMuted}>
            All branches
          </Txt>
        </Pressable>

        <View>
          <Eyebrow>{branch.branch_code}</Eyebrow>
          <Txt variant="title">{branch.branch_name}</Txt>
        </View>

        <View style={styles.tiles}>
          <StatTile label="Scheduled" value={branch.scheduled} />
          <StatTile label="Present" value={branch.present} accent={colors.onTime} />
        </View>
        <View style={styles.tiles}>
          <StatTile label="Late" value={branch.late} accent={branch.late ? colors.late : colors.textMuted} />
          <StatTile
            label="Absent"
            value={branch.absent}
            accent={branch.absent ? colors.absent : colors.textMuted}
          />
          <StatTile
            label="Early exit"
            value={branch.early_exit}
            accent={branch.early_exit ? colors.earlyExit : colors.textMuted}
          />
        </View>

        <Card>
          <Row style={styles.cardHead}>
            <Eyebrow>Punctuality today</Eyebrow>
            <Txt variant="title" color={punctualityColor}>
              {percent(branch.punctuality_pct)}
            </Txt>
          </Row>
          <Meter value={branch.punctuality_pct} color={punctualityColor} />
        </Card>

        {occupancy ? (
          <Card>
            <Row style={styles.cardHead}>
              <Eyebrow>Live occupancy</Eyebrow>
              <Txt variant="title">
                {occupancy.inside}
                <Txt variant="body" color={colors.textFaint}>
                  {' '}
                  / {occupancy.capacity}
                </Txt>
              </Txt>
            </Row>
            <Meter value={occupancy.occupancy_pct} color={colors.brand} />
            <Txt variant="label" color={colors.textFaint}>
              {occupancy.crowd_level} · {occupancy.entries_today} in, {occupancy.exits_today} out today
            </Txt>
          </Card>
        ) : null}

        <Txt variant="heading" style={styles.sectionHead}>
          Trainers
        </Txt>

        {trainers.loading ? (
          <Card>
            <Txt variant="body" color={colors.textMuted}>
              Loading roster…
            </Txt>
          </Card>
        ) : (trainers.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No trainers at this branch"
            detail="Add trainers from the admin tools to start tracking attendance."
          />
        ) : (
          trainers.data?.map((trainer) => (
            <Pressable
              key={trainer.id}
              onPress={() => router.push(`/(owner)/trainer/${trainer.id}` as never)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${trainer.full_name}`}
              style={({ pressed }) => [styles.trainerRow, pressed && styles.pressed]}
              testID={`trainer-row-${trainer.id}`}
            >
              <View style={styles.avatar}>
                <Txt variant="label">{initials(trainer.full_name)}</Txt>
              </View>
              <View style={styles.trainerText}>
                <Txt variant="body">{trainer.full_name}</Txt>
                <Txt variant="label" color={colors.textFaint}>
                  {trainer.designation ?? 'Trainer'} · {trainer.employee_code}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  cardHead: { justifyContent: 'space-between' },
  sectionHead: { marginTop: spacing.lg },
  trainerRow: {
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
  trainerText: { flex: 1, gap: 2 },
});
