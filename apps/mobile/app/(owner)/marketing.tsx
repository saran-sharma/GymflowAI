/**
 * MARKETING ACTIVITY — where members came from, and what happened next.
 *
 * SOURCE → MEMBERS → DAY 45 → PT CONVERSION, counted from real records. When a
 * period has no members, the screen says so rather than drawing an empty funnel
 * that looks like a result.
 */

import React from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { MarketingDashboard } from '../../src/api/types';
import { BarChart, SectionHeader } from '../../src/components/programme';
import {
  Badge,
  Body,
  Card,
  Divider,
  EmptyState,
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
import { dayLabel } from '../../src/utils/format';

export default function OwnerMarketingScreen() {
  const marketing = useApi<MarketingDashboard>((token) => api.marketingDashboard(token), []);

  if (marketing.loading) return <Loading label="Loading marketing activity" />;
  if (marketing.error || !marketing.data) {
    const offline = marketing.error?.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load marketing'}
          detail={offline ? undefined : marketing.error?.message}
          onRetry={marketing.reload}
        />
      </Screen>
    );
  }

  const data = marketing.data;
  const topSource = data.sources[0];

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={marketing.refreshing}
            onRefresh={() => void marketing.refresh()}
            tintColor={colors.brand}
          />
        }
      >
        <Txt variant="title">Marketing activity</Txt>
        <Txt variant="label" color={colors.textMuted}>
          {dayLabel(data.period_start)} – {dayLabel(data.period_end)}
        </Txt>

        {!data.has_data ? (
          <EmptyState
            icon="megaphone-outline"
            title="No new members in this period"
            detail="Source, campaign and referral are captured when a member registers. Numbers appear here as soon as there are records to count."
          />
        ) : (
          <>
            <View style={styles.tiles}>
              <StatTile label="New members" value={data.new_members} accent={colors.brand} />
              <StatTile label="Referrals" value={data.total_referrals} accent={colors.onTime} />
              <StatTile
                label="Top source"
                value={topSource ? topSource.joined : 0}
                hint={topSource?.source_label}
              />
            </View>

            <Card>
              <Eyebrow>Source distribution</Eyebrow>
              <BarChart
                data={data.sources.slice(0, 8).map((source) => ({
                  label: source.source_label.slice(0, 4),
                  value: source.joined,
                }))}
              />
            </Card>

            <SectionHeader title="Source → members → Day 45 → PT" />
            {data.sources.map((source) => (
              <Card key={source.source_key}>
                <Row style={styles.cardHead}>
                  <Txt variant="heading">{source.source_label}</Txt>
                  <Badge label={`${source.joined} joined`} color={colors.brand} />
                </Row>

                <Row style={styles.funnel}>
                  <FunnelStep label="Joined" value={source.joined} color={colors.brand} />
                  <FunnelStep
                    label="Reached Day 45"
                    value={source.reached_day_45}
                    color={colors.info}
                  />
                  <FunnelStep
                    label="PT conversions"
                    value={source.pt_conversions}
                    color={colors.onTime}
                  />
                </Row>

                <Divider />
                <Row style={styles.rate}>
                  <Txt variant="label" color={colors.textMuted}>
                    PT conversion
                  </Txt>
                  <Txt variant="mono" color={colors.onTime}>
                    {source.pt_conversion_pct}%
                  </Txt>
                </Row>
                <Meter value={source.pt_conversion_pct} color={colors.onTime} />

                {source.campaigns.length ? (
                  <Txt variant="label" color={colors.textFaint}>
                    Campaigns: {source.campaigns.join(', ')}
                  </Txt>
                ) : null}
              </Card>
            ))}

            {data.campaigns.length ? (
              <>
                <SectionHeader title="Campaigns" />
                {data.campaigns.map((campaign, index) => (
                  <Card key={String(campaign.campaign_id ?? index)}>
                    <Row style={styles.cardHead}>
                      <Txt variant="body">{String(campaign.name)}</Txt>
                      <Badge
                        label={campaign.is_active ? 'Active' : 'Ended'}
                        color={campaign.is_active ? colors.onTime : colors.textFaint}
                      />
                    </Row>
                    <Row style={styles.rate}>
                      <Txt variant="label" color={colors.textMuted}>
                        Members
                      </Txt>
                      <Txt variant="mono">{String(campaign.members)}</Txt>
                    </Row>
                    <Row style={styles.rate}>
                      <Txt variant="label" color={colors.textMuted}>
                        Reached Day 45
                      </Txt>
                      <Txt variant="mono">{String(campaign.reached_day_45)}</Txt>
                    </Row>
                    <Row style={styles.rate}>
                      <Txt variant="label" color={colors.textMuted}>
                        PT conversions
                      </Txt>
                      <Txt variant="mono" color={colors.onTime}>
                        {String(campaign.pt_conversions)}
                      </Txt>
                    </Row>
                  </Card>
                ))}
              </>
            ) : null}

            {data.referrals.length ? (
              <>
                <SectionHeader title="Who is referring" />
                {data.referrals.map((entry, index) => (
                  <Row key={String(entry.member_id ?? index)} style={styles.referral}>
                    <Txt variant="body" style={styles.grow}>
                      {String(entry.member_name)}
                    </Txt>
                    <Badge label={`${entry.referrals}`} color={colors.brand} />
                  </Row>
                ))}
              </>
            ) : null}
          </>
        )}

        <Txt variant="label" color={colors.textFaint} style={styles.footnote}>
          Counted from member records only. Nothing here is estimated, and referral rewards are not
          set until SLAM confirms a policy.
        </Txt>
      </Body>
    </Screen>
  );
}

function FunnelStep({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.step}>
      <Txt variant="title" color={color}>
        {value}
      </Txt>
      <Txt variant="caption" color={colors.textFaint}>
        {label.toUpperCase()}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  cardHead: { justifyContent: 'space-between' },
  funnel: { justifyContent: 'space-between', paddingVertical: spacing.sm },
  step: { alignItems: 'flex-start', gap: 2, flex: 1 },
  rate: { justifyContent: 'space-between', paddingVertical: 2 },
  referral: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: spacing.lg },
});
