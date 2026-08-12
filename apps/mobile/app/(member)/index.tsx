/**
 * Member V1 — deliberately small.
 *
 * Membership status, live occupancy at their branch, and their assigned
 * trainer. No CRM, no diet platform, no PT booking; those are later phases.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { MemberMe, Occupancy } from '../../src/api/types';
import {
  Badge,
  Body,
  Card,
  Divider,
  ErrorState,
  Eyebrow,
  Loading,
  Meter,
  Row,
  Screen,
  StatTile,
  Txt,
} from '../../src/components/ui';
import { useApi } from '../../src/hooks/useApi';
import { colors, spacing } from '../../src/theme';
import { initials, longDate } from '../../src/utils/format';

export default function MemberHomeScreen() {
  const profile = useApi<MemberMe>((token) => api.memberMe(token), []);
  const occupancy = useApi<Occupancy>((token) => api.memberOccupancy(token), []);

  if (profile.loading) return <Loading label="Loading your membership" />;
  if (profile.error || !profile.data) {
    return (
      <Screen>
        <ErrorState
          title={profile.error?.code === OFFLINE_CODE ? 'No connection' : 'Could not load your membership'}
          detail={profile.error?.message}
          onRetry={profile.reload}
        />
      </Screen>
    );
  }

  const member = profile.data;
  const membership = member.membership;
  const expiring = (member.days_remaining ?? 999) <= 30;
  const crowd = occupancy.data;

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={profile.refreshing}
            onRefresh={() => {
              void profile.refresh();
              void occupancy.refresh();
            }}
            tintColor={colors.brand}
          />
        }
      >
        <Row style={styles.identity}>
          <View style={styles.avatar}>
            <Txt variant="heading">{initials(member.full_name)}</Txt>
          </View>
          <View style={styles.identityText}>
            <Txt variant="heading">{member.full_name}</Txt>
            <Txt variant="label" color={colors.textMuted}>
              {member.branch.name} · {member.member_code}
            </Txt>
          </View>
          {member.is_inside ? <Badge label="Inside" color={colors.onTime} filled /> : null}
        </Row>

        <Card>
          <Row style={styles.cardHead}>
            <Eyebrow>Membership</Eyebrow>
            {membership ? (
              <Badge
                label={membership.status}
                color={membership.status === 'active' ? colors.onTime : colors.absent}
              />
            ) : null}
          </Row>
          <Divider />
          {membership ? (
            <>
              <Txt variant="heading">{membership.plan_name}</Txt>
              <Row style={styles.detail}>
                <Txt variant="label" color={colors.textMuted}>
                  Valid until
                </Txt>
                <Txt variant="mono">{longDate(membership.ends_on)}</Txt>
              </Row>
              <Row style={styles.detail}>
                <Txt variant="label" color={colors.textMuted}>
                  Days remaining
                </Txt>
                <Txt variant="mono" color={expiring ? colors.late : colors.text}>
                  {member.days_remaining ?? '—'}
                </Txt>
              </Row>
              {membership.pt_sessions_total > 0 ? (
                <Row style={styles.detail}>
                  <Txt variant="label" color={colors.textMuted}>
                    PT sessions left
                  </Txt>
                  <Txt variant="mono">
                    {membership.pt_sessions_total - membership.pt_sessions_used} of{' '}
                    {membership.pt_sessions_total}
                  </Txt>
                </Row>
              ) : null}
            </>
          ) : (
            <Txt variant="body" color={colors.textMuted}>
              No membership on file. Speak to the front desk.
            </Txt>
          )}
        </Card>

        <View style={styles.tiles}>
          <StatTile label="Visits this month" value={member.visits_this_month} />
          <StatTile
            label="Inside now"
            value={crowd ? `${crowd.inside}` : '—'}
            hint={crowd ? `of ${crowd.capacity}` : undefined}
            accent={colors.brand}
          />
        </View>

        {crowd ? (
          <Card>
            <Row style={styles.cardHead}>
              <Eyebrow>How busy is {member.branch.name}</Eyebrow>
              <Badge
                label={crowd.crowd_level}
                color={
                  crowd.crowd_level === 'High'
                    ? colors.absent
                    : crowd.crowd_level === 'Medium'
                      ? colors.late
                      : colors.onTime
                }
              />
            </Row>
            <Meter value={crowd.occupancy_pct} color={colors.brand} />
            <Txt variant="label" color={colors.textFaint}>
              {crowd.inside} members inside · {crowd.entries_today} entries today
            </Txt>
          </Card>
        ) : null}

        {member.assigned_trainer ? (
          <Card>
            <Eyebrow>Your trainer</Eyebrow>
            <Divider />
            <Row style={styles.trainer}>
              <View style={styles.avatarSmall}>
                <Txt variant="label">{initials(member.assigned_trainer.full_name)}</Txt>
              </View>
              <View style={styles.identityText}>
                <Txt variant="body">{member.assigned_trainer.full_name}</Txt>
                <Txt variant="label" color={colors.textFaint}>
                  {member.assigned_trainer.specialty ?? member.assigned_trainer.designation ?? 'Trainer'}
                </Txt>
              </View>
              <Ionicons name="fitness-outline" size={20} color={colors.textFaint} />
            </Row>
          </Card>
        ) : null}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { gap: spacing.md },
  identityText: { flex: 1, gap: 2 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHead: { justifyContent: 'space-between' },
  detail: { justifyContent: 'space-between', paddingVertical: 3 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  trainer: { gap: spacing.md },
});
