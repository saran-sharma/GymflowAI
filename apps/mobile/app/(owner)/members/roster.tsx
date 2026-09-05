/**
 * The owner's searchable member roster — the canonical way into a member's
 * detail screen.
 *
 * Journeys, PT packages and "who's inside" each open onto member detail too,
 * but only for the members who happen to be in those lists. A real roster
 * (a Yoactiv import is thousands of members, almost none on a GymFlow
 * journey) needs one flat, searchable list. Every row opens
 * `/(owner)/member/[id]` — the same detail screen every other member link in
 * the app uses; nothing new is built here beyond the list.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { OFFLINE_CODE } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type { Branch, MemberRosterPage, RosterStatus } from '../../../src/api/types';
import {
  Badge,
  Body,
  Button,
  EmptyState,
  ErrorState,
  Eyebrow,
  Input,
  Row,
  Screen,
  ScreenHeader,
  Segmented,
  SkeletonScreen,
  Stack,
  TappableCard,
  Text,
  color,
  radii,
  space,
  useThemedStyles,
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { dayLabel } from '../../../src/utils/format';

const STATUS_TABS: { value: RosterStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All' },
];

const STATUS_TONE: Record<string, 'positive' | 'caution' | 'neutral' | 'critical'> = {  // Tone subset
  active: 'positive',
  expired: 'critical',
  frozen: 'caution',
  cancelled: 'neutral',
};

const PAGE = 50;

export default function OwnerMemberRosterScreen() {
  const router = useRouter();
  const styles = useThemedStyles(buildStyles);
  const params = useLocalSearchParams<{ branch_id?: string }>();

  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<RosterStatus>('active');
  const [branchId, setBranchId] = useState<number | null>(
    params.branch_id ? Number(params.branch_id) : null,
  );
  const [limit, setLimit] = useState(PAGE);

  // Debounce the field so a search is one request per pause, not per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQ(raw.trim()), 300);
    return () => clearTimeout(id);
  }, [raw]);

  // A new search or filter always starts from the first page.
  useEffect(() => {
    setLimit(PAGE);
  }, [q, status, branchId]);

  const branches = useApi<Branch[]>((token) => api.listBranches(token), []);
  const roster = useApi<MemberRosterPage>(
    (token) => api.ownerMemberRoster(token, { q, status, branchId, limit }),
    [q, status, branchId, limit],
  );

  const branchOptions = useMemo(
    () => [{ id: null as number | null, name: 'All branches' }, ...(branches.data ?? [])],
    [branches.data],
  );

  const rows = roster.data?.members ?? [];
  const total = roster.data?.total ?? 0;

  return (
    <Screen>
      <ScreenHeader title="Members" onBack={() => router.back()} />
      <Body
        refreshControl={
          <RefreshControl refreshing={roster.refreshing} onRefresh={roster.refresh} />
        }
      >
        <Stack gap="md">
          <Input
            icon="search-outline"
            placeholder="Name, mobile, member code or Yoactiv ID"
            value={raw}
            onChangeText={setRaw}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            testID="roster-search"
          />

          <Segmented options={STATUS_TABS} value={status} onChange={(v) => setStatus(v)} />

          {branchOptions.length > 2 ? (
            <Row wrap gap="xs">
              {branchOptions.map((b) => {
                const on = branchId === b.id;
                return (
                  <Text
                    key={String(b.id)}
                    onPress={() => setBranchId(b.id)}
                    style={[styles.chip, on ? styles.chipOn : null]}
                    variant="label"
                    tone={on ? color.text : color.textSecondary}
                  >
                    {b.name.replace('SLAM ', '')}
                  </Text>
                );
              })}
            </Row>
          ) : null}

          {roster.loading && !roster.data ? (
            <SkeletonScreen cards={4} stats={false} />
          ) : roster.error && !roster.data ? (
            <ErrorState
              offline={roster.error.code === OFFLINE_CODE}
              title={
                roster.error.code === OFFLINE_CODE ? undefined : 'Could not load members'
              }
              detail={roster.error.code === OFFLINE_CODE ? undefined : roster.error.message}
              onRetry={roster.reload}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={q ? 'No members match that search' : 'No members here yet'}
              detail={
                q
                  ? 'Try a different name, mobile number or member code.'
                  : 'Members appear here once they are registered or imported.'
              }
            />
          ) : (
            <Stack gap="xs">
              <Eyebrow>
                {rows.length < total
                  ? `Showing ${rows.length} of ${total}`
                  : `${total} member${total === 1 ? '' : 's'}`}
              </Eyebrow>

              {rows.map((m) => (
                <TappableCard
                  key={m.member_id}
                  onPress={() => router.push(`/(owner)/member/${m.member_id}` as never)}
                  testID={`roster-row-${m.member_id}`}
                >
                  <Row justify="space-between" align="flex-start" gap="sm">
                    <Stack gap="xxs" style={styles.grow}>
                      <Text variant="heading">{m.full_name}</Text>
                      <Text variant="label" tone={color.textTertiary}>
                        {m.member_code}
                        {m.mobile ? ` · ${m.mobile}` : ''}
                      </Text>
                      <Text variant="label" tone={color.textSecondary}>
                        {m.branch_name.replace('SLAM ', '')}
                        {m.last_visit_on
                          ? ` · last visit ${dayLabel(m.last_visit_on)}`
                          : ' · no visits recorded'}
                      </Text>
                    </Stack>

                    <Stack gap="xxs" align="flex-end">
                      {m.membership_status ? (
                        <Badge
                          label={m.membership_status}
                          tone={STATUS_TONE[m.membership_status] ?? 'neutral'}
                        />
                      ) : null}
                      {m.membership_ends_on ? (
                        <Text variant="label" tone={color.textTertiary}>
                          {m.days_remaining != null && m.days_remaining >= 0
                            ? `${m.days_remaining}d left`
                            : `ended ${dayLabel(m.membership_ends_on)}`}
                        </Text>
                      ) : null}
                    </Stack>
                  </Row>
                </TappableCard>
              ))}

              {rows.length < total ? (
                <Button
                  title="Show more"
                  variant="secondary"
                  size="sm"
                  onPress={() => setLimit((n) => n + PAGE)}
                />
              ) : null}
            </Stack>
          )}
        </Stack>
      </Body>
    </Screen>
  );
}

function buildStyles() {
  return StyleSheet.create({
    grow: { flexShrink: 1 },
    chip: {
      paddingHorizontal: space.sm,
      paddingVertical: space.xxs,
      borderRadius: radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: color.border,
      overflow: 'hidden',
    },
    chipOn: {
      backgroundColor: color.surface,
      borderColor: color.text,
    },
  });
}
