/**
 * Members who joined recently — the list behind the Dashboard's "New
 * members" number.
 *
 * That tile used to open onto the marketing overview, which answers "how is
 * acquisition trending" a source at a time — not "who are they," which is
 * what tapping a count on a dashboard means. This is that flat list: name,
 * when, plan, source, trainer, status, each row opening onto Member
 * Intelligence — the same screen every other member row in the app opens
 * onto, so there is nothing new to learn here beyond the list itself.
 */

import { useRouter } from 'expo-router';
import React from 'react';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { NewMembers } from '../../src/api/types';
import {
  Badge,
  Body,
  EmptyState,
  ErrorState,
  Loading,
  Row,
  Screen,
  ScreenHeader,
  Stack,
  TappableCard,
  Text,
  color,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { dayLabel } from '../../src/utils/format';

const STATUS_TONE: Record<string, 'positive' | 'caution' | 'neutral' | 'critical'> = {
  active: 'positive',
  expired: 'critical',
  frozen: 'caution',
  cancelled: 'neutral',
};

export default function OwnerNewMembersScreen() {
  const router = useRouter();
  const newMembers = useApi<NewMembers>((token) => api.newMembers(token, 90), []);

  if (newMembers.loading) return <Loading />;
  if (newMembers.error) {
    const offline = newMembers.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'Could not load new members'}
          detail={offline ? undefined : newMembers.error.message}
          onRetry={newMembers.reload}
        />
      </Screen>
    );
  }

  const items = newMembers.data?.items ?? [];

  return (
    <Screen>
      <ScreenHeader title="New members" onBack={() => router.back()} />
      <Body>
        <Text variant="body" tone={color.textSecondary}>
          {items.length === 0
            ? 'No new members in the last 90 days.'
            : `${items.length} member${items.length === 1 ? '' : 's'} joined in the last ${
                newMembers.data?.window_days ?? 90
              } days.`}
        </Text>

        {items.length === 0 ? (
          <EmptyState icon="person-add-outline" title="Nothing to show yet" />
        ) : (
          items.map((item, index) => (
            <TappableCard
              key={item.member_id}
              index={index}
              testID={`new-member-row-${item.member_id}`}
              accessibilityLabel={item.member_name}
              onPress={() => router.push(`/(owner)/member/${item.member_id}` as never)}
            >
              <Row gap="sm">
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="body">{item.member_name}</Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {item.registered_on ? `Joined ${dayLabel(item.registered_on)}` : 'Joined'}
                    {item.plan_name ? ` · ${item.plan_name}` : ''}
                  </Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {[item.source_label, item.assigned_trainer_name].filter(Boolean).join(' · ') ||
                      'No source or trainer recorded'}
                  </Text>
                </Stack>
                {item.status ? (
                  <Badge label={item.status} tone={STATUS_TONE[item.status] ?? 'neutral'} />
                ) : null}
              </Row>
            </TappableCard>
          ))
        )}
      </Body>
    </Screen>
  );
}
