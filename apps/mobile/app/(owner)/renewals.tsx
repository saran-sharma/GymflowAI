/**
 * Memberships approaching expiry — the list behind the Dashboard's
 * "Renewals due" number.
 *
 * The dashboard already fetched `Renewals.count`; `Renewals.items` carried
 * the same request's per-member detail (name, plan, expiry, days remaining)
 * the whole time, unrendered anywhere. This screen is that list, with the
 * two actions an owner actually wants from it: open the member's full record
 * (payments included — Member Intelligence already shows those), or notify
 * them directly.
 */

import { useRouter } from 'expo-router';
import React from 'react';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Renewals } from '../../src/api/types';
import {
  Badge,
  Body,
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  Loading,
  Row,
  Screen,
  ScreenHeader,
  Spacer,
  Stack,
  Text,
  color,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { dayLabel } from '../../src/utils/format';

export default function OwnerRenewalsScreen() {
  const router = useRouter();
  const renewals = useApi<Renewals>((token) => api.renewalsDue(token, 30), []);

  if (renewals.loading) return <Loading />;
  if (renewals.error) {
    const offline = renewals.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'Could not load renewals'}
          detail={offline ? undefined : renewals.error.message}
          onRetry={renewals.reload}
        />
      </Screen>
    );
  }

  const items = [...(renewals.data?.items ?? [])].sort((a, b) => a.days_remaining - b.days_remaining);

  return (
    <Screen>
      <ScreenHeader title="Renewals due" onBack={() => router.back()} />
      <Body>
        <Text variant="body" tone={color.textSecondary}>
          {items.length === 0
            ? 'Nothing expiring in the next 30 days.'
            : `${items.length} membership${items.length === 1 ? '' : 's'} expiring in the next ${
                renewals.data?.window_days ?? 30
              } days.`}
        </Text>

        {items.length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" title="All caught up" />
        ) : (
          items.map((item) => (
            <Card key={item.member_id} testID={`renewal-row-${item.member_id}`}>
              <Row gap="sm">
                <Stack gap="xxs" style={{ flex: 1 }}>
                  <Text variant="body">{item.member_name}</Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {item.plan_name} · expires {dayLabel(item.ends_on)}
                  </Text>
                </Stack>
                <Badge
                  label={
                    item.days_remaining < 0
                      ? `Expired ${Math.abs(item.days_remaining)}d ago`
                      : `${item.days_remaining}d left`
                  }
                  tone={item.days_remaining <= 7 ? 'critical' : 'caution'}
                />
              </Row>
              <Row gap="sm">
                <LinkButton
                  title="Review member"
                  onPress={() => router.push(`/(owner)/member/${item.member_id}` as never)}
                />
                <Spacer />
                <LinkButton
                  title="Notify"
                  onPress={() =>
                    router.push({
                      pathname: '/(owner)/broadcast',
                      params: { memberId: String(item.member_id), memberName: item.member_name },
                    } as never)
                  }
                  testID={`renewal-notify-${item.member_id}`}
                />
              </Row>
            </Card>
          ))
        )}
      </Body>
    </Screen>
  );
}
