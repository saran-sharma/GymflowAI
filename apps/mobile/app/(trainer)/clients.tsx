/**
 * The trainer's clients.
 *
 * Scoped to assignment, not to branch: a trainer sees the people they coach,
 * not everyone who trains in the building. That is enforced server-side by
 * `/trainers/me/clients`, which this screen is the only consumer of.
 *
 * There is still no payment column. Payments exist on the server now, but a
 * trainer chasing a member's bill is a front-desk conversation, not a coaching
 * one — the balance belongs on the owner's screen and the member's own.
 */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { TrainerClient } from '../../src/api/types';
import {
  Badge,
  Body,
  Chips,
  EmptyState,
  ErrorState,
  ProgressBar,
  Row,
  Screen,
  SkeletonScreen,
  Spacer,
  Stack,
  Text,
  color,
  hairline,
  radii,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { dayLabel } from '../../src/utils/format';

type Filter = 'all' | 'journey' | 'pt' | 'low';

/**
 * The four questions a trainer asks of their roster, in the order they ask
 * them. Every one is answered from fields the roster already carries — no
 * filter here needs a request the screen does not already make.
 */
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'journey', label: 'On a journey' },
  { value: 'pt', label: 'PT running' },
  { value: 'low', label: 'Low balance' },
];

function matches(client: TrainerClient, filter: Filter): boolean {
  switch (filter) {
    case 'journey':
      return client.journey?.status === 'active';
    case 'pt':
      // Effective status, not the package's own status: a member whose
      // membership has lapsed still has an "active" package row, but they
      // are not someone this trainer can put on the floor for PT today.
      return client.effective_pt_status === 'pt_active';
    case 'low':
      return Boolean(client.pt_package?.low_balance);
    default:
      return true;
  }
}

/**
 * The roster badge for PT, one of the four states a trainer needs to tell
 * apart at a glance. Reads `effective_pt_status` (the server's combined
 * membership + package truth — see `app.domain.pt_eligibility`), never the
 * package's own `status` alone, so a lapsed membership never displays as
 * "PT ACTIVE" here.
 */
function ptStatusBadge(
  client: TrainerClient,
): { label: string; tone: 'brand' | 'caution' | 'critical' } | null {
  const pack = client.pt_package;
  switch (client.effective_pt_status) {
    case 'pt_active':
      return pack
        ? { label: `${pack.sessions_remaining} left`, tone: pack.low_balance ? 'caution' : 'brand' }
        : null;
    case 'pt_paused_membership_expired':
      return { label: 'PT paused — membership expired', tone: 'caution' };
    case 'pt_expired':
      return { label: 'PT package expired', tone: 'critical' };
    case 'pt_completed':
      return null;
    case 'no_pt':
    default:
      return client.membership_status !== 'active'
        ? { label: 'Membership expired — no PT', tone: 'critical' }
        : null;
  }
}

export default function TrainerClientsScreen() {
  const router = useRouter();
  const clients = useApi<TrainerClient[]>((token) => api.myClients(token), []);
  const [filter, setFilter] = useState<Filter>('all');

  if (clients.loading) return <SkeletonScreen cards={4} stats={false} />;

  if (clients.error) {
    const offline = clients.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your clients'}
          detail={offline ? undefined : clients.error.message}
          onRetry={clients.reload}
        />
      </Screen>
    );
  }

  const all = clients.data ?? [];
  const rows = all.filter((row) => matches(row, filter));

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={clients.refreshing}
            onRefresh={() => void clients.refresh()}
            tintColor={color.brand}
          />
        }
      >
        <Stack gap="xxs">
          <Text variant="title">Clients</Text>
          <Text variant="body" tone={color.textSecondary}>
            {all.length === 0
              ? 'Members assigned to you appear here.'
              : `${all.length} member${all.length === 1 ? '' : 's'} assigned to you.`}
          </Text>
        </Stack>

        {all.length ? (
          <Chips
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            testIDPrefix="clients-filter"
          />
        ) : null}

        {all.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No clients assigned yet"
            detail="Your branch assigns members to you. Once they are, their programme and PT balance appear here."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="funnel-outline"
            title="Nobody matches that filter"
            detail={`None of your ${all.length} clients are ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}.`}
          />
        ) : (
          rows.map((row) => (
            <ClientRow
              key={row.member_id}
              client={row}
              onPress={() => router.push(`/(trainer)/client/${row.member_id}` as never)}
            />
          ))
        )}
      </Body>
    </Screen>
  );
}

function ClientRow({ client, onPress }: { client: TrainerClient; onPress: () => void }) {
  const journey = client.journey;
  const pct = journey?.completion_pct ?? null;
  const ptBadge = ptStatusBadge(client);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${client.full_name}, ${client.membership_plan ?? 'no plan'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <Stack gap="sm">
        <Row gap="sm">
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="body">{client.full_name}</Text>
            <Text variant="label" tone={color.textTertiary}>
              {client.membership_plan ?? 'No membership on file'}
            </Text>
          </Stack>
          {ptBadge ? <Badge label={ptBadge.label} tone={ptBadge.tone} /> : null}
        </Row>

        {pct !== null ? (
          <Stack gap="xxs">
            <Row gap="sm">
              <Text variant="label" tone={color.textTertiary}>
                Day {journey?.current_day} of {journey?.duration_days}
              </Text>
              <Spacer />
              <Text variant="label" tone={color.textSecondary}>
                {Math.round(pct)}%
              </Text>
            </Row>
            <ProgressBar value={pct} tone="brand" height={4} />
          </Stack>
        ) : (
          <Text variant="label" tone={color.textTertiary}>
            No programme started
          </Text>
        )}

        <Row gap="sm">
          <Text variant="label" tone={color.textTertiary}>
            {client.last_seen_on ? `Last seen ${dayLabel(client.last_seen_on)}` : 'Not seen yet'}
          </Text>
          <Spacer />
          <Text variant="label" tone={color.textTertiary}>
            {client.visits_last_30} visit
            {client.visits_last_30 === 1 ? '' : 's'} / 30d
          </Text>
        </Row>
      </Stack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  card: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radii.lg,
    ...hairline,
    padding: space.lg,
  },
  pressed: {
    backgroundColor: color.surfaceOverlay,
    borderColor: color.borderStrong,
  },
});
