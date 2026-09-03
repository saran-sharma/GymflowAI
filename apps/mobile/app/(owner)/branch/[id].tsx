/**
 * A single branch: today's accountability numbers, live occupancy, and the
 * trainer roster. Tapping a trainer opens their record.
 *
 * Same hierarchy as the member and trainer detail screens — one thing leads
 * (punctuality), the numbers that need attention sit beside it, and the meters
 * travel to their value.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl } from 'react-native';

import * as api from '../../../src/api/endpoints';
import type { Dashboard, Trainer } from '../../../src/api/types';
import {
  Body,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  PersonRow,
  ProgressBar,
  ProgressCard,
  Row,
  Screen,
  ScreenHeader,
  Section,
  Spacer,
  Staggered,
  StatCard,
  StatRow,
  Text,
  color,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { percent } from '../../../src/utils/format';

export default function BranchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const branchId = Number(id);
  const router = useRouter();

  const dashboard = useApi<Dashboard>((token) => api.dashboard(token, branchId), [branchId]);
  const trainers = useApi<Trainer[]>((token) => api.listTrainers(token, branchId), [branchId]);

  const goBack = () => router.back();

  if (dashboard.loading) return <Loading label="Loading branch" />;
  if (dashboard.error || !dashboard.data?.branches?.length) {
    return (
      <Screen background="owner" backgroundIntensity="subtle">
        <ScreenHeader title="Branch" onBack={goBack} backLabel="All branches" />
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
  const punctualityTone =
    branch.punctuality_pct >= 90
      ? color.status.positive
      : branch.punctuality_pct >= 75
        ? color.status.caution
        : color.status.critical;

  return (
    <Screen background="owner" backgroundIntensity="subtle">
      <ScreenHeader
        title={branch.branch_name}
        subtitle={branch.branch_code}
        onBack={goBack}
        backLabel="All branches"
      />
      <Body
        refreshControl={
          <RefreshControl
            refreshing={dashboard.refreshing}
            onRefresh={() => {
              void dashboard.refresh();
              void trainers.refresh();
            }}
            tintColor={color.brand}
          />
        }
      >
        <Staggered>
          <ProgressCard
            label="Punctuality today"
            value={percent(branch.punctuality_pct)}
            percent={branch.punctuality_pct}
            colorOverride={punctualityTone}
            caption={`${branch.present} of ${branch.scheduled} rostered present`}
          />

          <Section title="Today">
            <StatRow>
              <StatCard
                label="Late"
                value={branch.late}
                hint="past grace"
                tone={branch.late ? 'caution' : undefined}
              />
              <StatCard
                label="Absent"
                value={branch.absent}
                hint="no check-in"
                tone={branch.absent ? 'critical' : undefined}
              />
              <StatCard
                label="Early exit"
                value={branch.early_exit}
                hint="left before end"
                colorOverride={branch.early_exit ? color.status.warning : undefined}
              />
            </StatRow>
          </Section>

          {occupancy ? (
            <Section title="Live occupancy">
              <Card>
                <Row gap="sm">
                  <Eyebrow>Inside now</Eyebrow>
                  <Spacer />
                  <Text variant="mono" tone={color.text}>
                    {occupancy.inside} / {occupancy.capacity}
                  </Text>
                </Row>
                <ProgressBar value={occupancy.occupancy_pct} colorOverride={color.brand} />
                <Text variant="label" tone={color.textTertiary}>
                  {occupancy.crowd_level} · {occupancy.entries_today} in, {occupancy.exits_today} out
                  today
                </Text>
              </Card>
            </Section>
          ) : null}
        </Staggered>

        <Section title="Trainers">
          {trainers.loading ? (
            <Text variant="label" tone={color.textTertiary}>
              Loading roster…
            </Text>
          ) : (trainers.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No trainers at this branch"
              detail="Trainers appear here once your branch adds them in GymFlow."
            />
          ) : (
            trainers.data?.map((trainer, index) => (
              <PersonRow
                key={trainer.id}
                index={index}
                name={trainer.full_name}
                detail={`${trainer.designation ?? 'Trainer'} · ${trainer.employee_code}`}
                onPress={() => router.push(`/(owner)/trainer/${trainer.id}` as never)}
                testID={`trainer-row-${trainer.id}`}
              />
            ))
          )}
        </Section>
      </Body>
    </Screen>
  );
}
