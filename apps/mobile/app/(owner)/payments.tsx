/**
 * Payments.
 *
 * Outstanding first, then what came in. That ordering is the whole point of
 * the screen: an owner opens it to find money that has not arrived, not to
 * admire money that has.
 *
 * Nothing here raises or settles a charge. Recording money is a front-desk act
 * with a receipt behind it, and doing it from a phone in a car is how a
 * payment ends up with no paper trail.
 */

import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { Payment, PaymentStatus, RevenueSummary } from '../../src/api/types';
import {
  Badge,
  Body,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  Row,
  Screen,
  Section,
  Segmented,
  SkeletonScreen,
  Spacer,
  StatCard,
  StatRow,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { dayLabel, money } from '../../src/utils/format';

const KIND_LABEL: Record<string, string> = {
  membership: 'Membership',
  pt: 'Personal training',
  group_class: 'Group class',
  renewal: 'Renewal',
  addon: 'Add-on',
};

const STATUS_TONE: Record<PaymentStatus, 'positive' | 'caution' | 'critical' | 'neutral'> = {
  paid: 'positive',
  pending: 'caution',
  refunded: 'neutral',
  cancelled: 'neutral',
};

const FILTERS = [
  { value: 'pending' as const, label: 'Outstanding' },
  { value: 'paid' as const, label: 'Collected' },
];

export default function OwnerPaymentsScreen() {
  const [filter, setFilter] = useState<PaymentStatus>('pending');

  const summary = useApi<RevenueSummary>((token) => api.revenueSummary(token, 30), []);
  const payments = useApi<Payment[]>(
    (token) => api.listPayments(token, { status: filter }),
    [filter],
  );

  const refreshAll = useCallback(() => {
    void summary.refresh();
    void payments.refresh();
  }, [summary, payments]);

  if (summary.loading && payments.loading) return <SkeletonScreen cards={4} />;

  if (payments.error) {
    const offline = payments.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load payments'}
          detail={offline ? undefined : payments.error.message}
          onRetry={refreshAll}
        />
      </Screen>
    );
  }

  const rows = payments.data ?? [];
  const currency = summary.data?.currency;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={payments.refreshing}
            onRefresh={refreshAll}
            tintColor={color.brand}
          />
        }
      >
        <Stack gap="xxs">
          <Text variant="title">Payments</Text>
          <Text variant="body" tone={color.textSecondary}>
            What is owed, and what has come in.
          </Text>
        </Stack>

        <StatRow>
          <StatCard
            label="Outstanding"
            value={money(summary.data?.pending_total, currency)}
            hint="all unpaid"
            tone={(summary.data?.pending_total ?? 0) > 0 ? 'caution' : 'positive'}
            icon="alert-circle-outline"
          />
          <StatCard
            label="Collected"
            value={money(summary.data?.collected_total, currency)}
            hint="last 30 days"
            tone="positive"
            icon="cash-outline"
          />
        </StatRow>

        {summary.data && summary.data.lines.length ? (
          <Card>
            <Eyebrow>By what was sold</Eyebrow>
            <Divider />
            {summary.data.lines.map((line) => (
              <Row key={line.kind} gap="sm">
                <Text variant="label" tone={color.textSecondary} style={styles.grow}>
                  {KIND_LABEL[line.kind] ?? line.kind}
                </Text>
                <Text variant="mono" tone={color.status.positive}>
                  {money(line.collected, currency)}
                </Text>
                {line.pending > 0 ? (
                  <Text variant="mono" tone={color.status.caution}>
                    +{money(line.pending, currency)}
                  </Text>
                ) : null}
              </Row>
            ))}
          </Card>
        ) : null}

        <Section title="Charges">
          <Segmented
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            testIDPrefix="payment-filter"
          />

          {rows.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title={filter === 'pending' ? 'Nothing outstanding' : 'Nothing collected yet'}
              detail={
                filter === 'pending'
                  ? 'Every charge raised has been settled.'
                  : 'Payments recorded at the front desk appear here.'
              }
            />
          ) : (
            rows.map((payment) => (
              <Row key={payment.id} gap="md" style={styles.row}>
                <Stack gap="xxs" style={styles.grow}>
                  <Text variant="body">{payment.member_name ?? 'Member'}</Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {KIND_LABEL[payment.kind] ?? payment.kind}
                    {payment.trainer_name ? ` · ${payment.trainer_name}` : ''}
                    {payment.due_on ? ` · due ${dayLabel(payment.due_on)}` : ''}
                    {payment.paid_at ? ` · ${dayLabel(payment.paid_at)}` : ''}
                  </Text>
                </Stack>
                <Stack gap="xxs" align="flex-end">
                  <Text variant="mono">{money(payment.amount, payment.currency)}</Text>
                  <Badge label={payment.status} tone={STATUS_TONE[payment.status]} />
                </Stack>
              </Row>
            ))
          )}
        </Section>

        <Text variant="label" tone={color.textTertiary}>
          Charges are raised and settled at the branch, where the receipt is. This screen is
          read-only on purpose.
        </Text>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: {
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
});
