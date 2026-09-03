/**
 * Incentive standing for every visible trainer.
 *
 * Eligibility only. There is no payout figure anywhere on this screen, and the
 * SLAM policy disclaimer is always on it.
 *
 * The screen answers one question first — "who needs a decision from me?" — so
 * the trainers that need review are pulled to the top, and each row leads with
 * its verdict and the checks that are failing, not a wall of equal stats.
 */

import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { RefreshControl } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { IncentiveResult } from '../../src/api/types';
import {
  Badge,
  Banner,
  Body,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  ProgressBar,
  Row,
  Screen,
  Section,
  SkeletonScreen,
  Spacer,
  Staggered,
  StatCard,
  StatRow,
  Stack,
  TappableCard,
  Text,
  color,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { incentiveMeta } from '../../src/theme';
import { percent } from '../../src/utils/format';

/** Review first (a decision is owed), then not-eligible, then eligible. */
const ORDER: Record<IncentiveResult['status'], number> = {
  needs_review: 0,
  not_eligible: 1,
  eligible: 2,
};

export default function OwnerIncentivesScreen() {
  const router = useRouter();
  const results = useApi<IncentiveResult[]>((token) => api.listIncentives(token), []);

  const rows = useMemo(
    () => [...(results.data ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status]),
    [results.data],
  );

  const tally = useMemo(() => {
    const all = results.data ?? [];
    return {
      total: all.length,
      eligible: all.filter((r) => r.status === 'eligible').length,
      review: all.filter((r) => r.status === 'needs_review').length,
      not: all.filter((r) => r.status === 'not_eligible').length,
    };
  }, [results.data]);

  if (results.loading) return <SkeletonScreen cards={4} />;
  if (results.error) {
    const offline = results.error?.code === OFFLINE_CODE;
    return (
      <Screen background="owner" backgroundIntensity="subtle">
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load incentives'}
          detail={offline ? undefined : results.error?.message}
          onRetry={results.reload}
        />
      </Screen>
    );
  }

  return (
    <Screen background="owner" backgroundIntensity="subtle">
      <Body
        refreshControl={
          <RefreshControl
            refreshing={results.refreshing}
            onRefresh={results.refresh}
            tintColor={color.brand}
          />
        }
      >
        <Stack gap="xxs">
          <Text variant="title">Incentives</Text>
          <Text variant="body" tone={color.textSecondary}>
            Eligibility against the thresholds you configured — not a payout calculation.
          </Text>
        </Stack>

        {rows.length === 0 ? (
          <EmptyState
            icon="ribbon-outline"
            title="Nothing to evaluate yet"
            detail="Incentive standing appears here once your trainers have shifts on record this period."
          />
        ) : (
          <>
            {/* Where things stand, and what is owed a decision. */}
            <Staggered>
              <StatRow>
                <StatCard
                  label="Eligible"
                  value={`${tally.eligible}/${tally.total}`}
                  tone="positive"
                />
                <StatCard
                  label="Need review"
                  value={tally.review}
                  tone={tally.review ? 'caution' : undefined}
                />
                <StatCard
                  label="Not eligible"
                  value={tally.not}
                  tone={tally.not ? 'critical' : undefined}
                />
              </StatRow>

              {tally.review > 0 ? (
                <Banner tone="caution" icon="alert-circle-outline">
                  {tally.review === 1
                    ? '1 trainer needs a decision from you.'
                    : `${tally.review} trainers need a decision from you.`}
                </Banner>
              ) : null}
            </Staggered>

            {/* The roster — rows stagger themselves, so it stays out of the
                block-level <Staggered> above. */}
            <Section title="Trainers">
              {rows.map((row, index) => (
                <IncentiveRow
                  key={row.trainer_id}
                  row={row}
                  index={index}
                  onPress={() => router.push(`/(owner)/trainer/${row.trainer_id}` as never)}
                />
              ))}
            </Section>

            <Banner tone="info">
              {rows[0]?.disclaimer ??
                'Final payroll/incentive calculation is subject to SLAM policy.'}
            </Banner>
          </>
        )}
      </Body>
    </Screen>
  );
}

/**
 * One trainer's standing: the verdict, a bar for the composite score, and the
 * checks that are actually failing — the thing the owner acts on.
 */
function IncentiveRow({
  row,
  index,
  onPress,
}: {
  row: IncentiveResult;
  index: number;
  onPress: () => void;
}) {
  const meta = incentiveMeta[row.status];
  const failing = row.checks.filter((check) => !check.passed);
  const summary =
    row.status === 'eligible'
      ? 'All checks passing'
      : failing.length === 0
        ? 'Under review'
        : `${failing.length} to fix · ${failing.map((c) => c.label).join(' · ')}`;

  return (
    <TappableCard
      onPress={onPress}
      index={index}
      accessibilityLabel={`${row.trainer_name}, ${meta.label}`}
      testID={`incentive-row-${row.trainer_id}`}
    >
      <Row gap="sm">
        <Stack gap="xxs" style={{ flex: 1 }}>
          <Text variant="heading" numberOfLines={1}>
            {row.trainer_name}
          </Text>
          <Eyebrow>{row.branch_name}</Eyebrow>
        </Stack>
        <Badge label={meta.label} colorOverride={meta.color} />
      </Row>

      <ProgressBar value={row.score} colorOverride={meta.color} />

      <Row gap="sm">
        <Text variant="label" tone={color.textSecondary} numberOfLines={1} style={{ flex: 1 }}>
          {summary}
        </Text>
        <Text variant="mono" tone={color.textTertiary}>
          {percent(row.punctuality_pct)}
        </Text>
      </Row>
    </TappableCard>
  );
}
