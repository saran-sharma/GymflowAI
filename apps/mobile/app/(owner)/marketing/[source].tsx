/**
 * One marketing source, opened up: who it actually brought in.
 *
 * The funnel row on the Marketing tab answers "how is this source doing";
 * this answers "who, specifically" — the list `GET /marketing/sources/{key}/members`
 * exists for, reusing the same client-row builder the trainer desk and the
 * owner's Member Intelligence screen already read.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl } from 'react-native';

import { OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type { MarketingDashboard, TrainerClient } from '../../../src/api/types';
import {
  Badge,
  Body,
  EmptyState,
  ErrorState,
  Loading,
  PersonRow,
  Row,
  Screen,
  ScreenHeader,
  Section,
  StatCard,
  StatRow,
  Text,
  color,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { dayLabel } from '../../../src/utils/format';

export default function MarketingSourceScreen() {
  const { source } = useLocalSearchParams<{ source: string }>();
  const router = useRouter();
  const sourceKey = source ?? '';

  // The dashboard is already fetched by the Marketing tab; re-fetching here
  // (cheap, cached-feeling on a warm connection) is what gives this screen
  // the source's label and funnel numbers without a second endpoint.
  const dashboard = useApi<MarketingDashboard>((token) => api.marketingDashboard(token), []);
  const members = useApi<TrainerClient[]>(
    (token) => api.sourceMembers(sourceKey, token),
    [sourceKey],
  );

  const funnel = dashboard.data?.sources.find((row) => row.source_key === sourceKey);
  const title = funnel?.source_label ?? (sourceKey === 'unrecorded' ? 'Not recorded' : sourceKey);

  // Opened from the Marketing tab, so `back()` already returns there via its
  // own history. The `canGoBack` guard only covers arriving here directly.
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace('/(owner)/marketing' as never);

  if (members.loading) return <Loading label="Loading source" />;

  if (members.error || !members.data) {
    const offline = members.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ScreenHeader title={title} onBack={goBack} />
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load this source'}
          detail={offline ? undefined : members.error?.message}
          onRetry={members.reload}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={title} onBack={goBack} />
      <Body
        refreshControl={
          <RefreshControl
            refreshing={members.refreshing}
            onRefresh={() => {
              void members.refresh();
              void dashboard.refresh();
            }}
            tintColor={color.brand}
          />
        }
      >
        {funnel ? (
          <StatRow>
            <StatCard label="Joined" value={funnel.joined} icon="people-outline" />
            <StatCard
              label="Reached Day 45"
              value={funnel.reached_day_45}
              hint={`${funnel.day45_pct}%`}
              icon="flag-outline"
            />
            <StatCard
              label="Converted to PT"
              value={funnel.pt_conversions}
              hint={`${funnel.pt_conversion_pct}%`}
              icon="trending-up-outline"
              tone={funnel.pt_conversions ? 'positive' : 'neutral'}
            />
          </StatRow>
        ) : null}

        <Section title={`Members acquired (${members.data.length})`}>
          {members.data.length === 0 ? (
            <EmptyState
              icon="person-outline"
              title="No members from this source"
              detail="Members acquired through this source will appear here."
            />
          ) : (
            members.data.map((member, index) => (
              <PersonRow
                key={member.member_id}
                index={index}
                testID={`source-member-${member.member_id}`}
                name={member.full_name}
                detail={[
                  member.branch_id ? `Branch ${member.branch_id}` : null,
                  member.joined_on ? `joined ${dayLabel(member.joined_on)}` : null,
                  member.membership_plan,
                  member.journey?.pt_converted ? 'PT' : member.journey ? 'GT' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  member.journey?.pt_converted ? (
                    <Badge label="PT" tone="brand" solid />
                  ) : member.journey ? (
                    <Badge label="GT" tone="neutral" />
                  ) : undefined
                }
                onPress={() => router.push(`/(owner)/member/${member.member_id}` as never)}
              />
            ))
          )}
        </Section>
      </Body>
    </Screen>
  );
}
