/**
 * The trainer's clients.
 *
 * Scoped to assignment, not to branch: a trainer sees the people they coach,
 * not everyone who trains in the building. That is enforced server-side by
 * `/trainers/me/clients`, which this screen is the only consumer of.
 *
 * There is no payment column. GymFlow has no billing model, and a "Paid"
 * badge a trainer could act on would be describing nothing.
 */

import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { TrainerClient } from '../../src/api/types';
import { NotConnected } from '../../src/components/member';
import {
  Badge,
  Body,
  EmptyState,
  ErrorState,
  Loading,
  ProgressBar,
  Row,
  Screen,
  Section,
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

export default function TrainerClientsScreen() {
  const router = useRouter();
  const clients = useApi<TrainerClient[]>((token) => api.myClients(token), []);

  if (clients.loading) return <Loading label="Loading your clients" />;

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

  const rows = clients.data ?? [];

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
            {rows.length === 0
              ? 'Members assigned to you appear here.'
              : `${rows.length} member${rows.length === 1 ? '' : 's'} assigned to you.`}
          </Text>
        </Stack>

        {rows.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No clients assigned yet"
            detail="Your branch assigns members to you. Once they are, their programme and PT balance appear here."
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

        {rows.length ? (
          <Section title="Not available">
            <NotConnected
              icon="card-outline"
              title="Payment status is not tracked"
              detail="GymFlow has no billing model, so whether a client has paid is not something this app can tell you. It needs an invoice or payment table on the server first."
            />
          </Section>
        ) : null}
      </Body>
    </Screen>
  );
}

function ClientRow({ client, onPress }: { client: TrainerClient; onPress: () => void }) {
  const journey = client.journey;
  const pack = client.pt_package;
  const pct = journey?.completion_pct ?? null;

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
          {pack && pack.status === 'active' ? (
            <Badge
              label={`${pack.sessions_remaining} left`}
              tone={pack.low_balance ? 'caution' : 'brand'}
            />
          ) : null}
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
            {client.visits_last_30} visit{client.visits_last_30 === 1 ? '' : 's'} / 30d
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
  pressed: { backgroundColor: color.surfaceOverlay, borderColor: color.borderStrong },
});
