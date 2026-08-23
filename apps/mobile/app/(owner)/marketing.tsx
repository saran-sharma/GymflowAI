/**
 * MARKETING ACTIVITY — where members came from, and what happened next.
 *
 * SOURCE → MEMBERS → DAY 45 → PT CONVERSION, counted from real records. When a
 * period has no members, the screen says so rather than drawing an empty funnel
 * that looks like a result.
 */

import { useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { MarketingDashboard, SourceFunnel } from '../../src/api/types';
import {
  Badge,
  Body,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  ProgressBar,
  Row,
  Screen,
  Section,
  Stack,
  StatCard,
  TappableCard,
  Text,
  color,
  space,
  useThemedStyles,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { dayLabel } from '../../src/utils/format';

export default function OwnerMarketingScreen() {
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
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
            tintColor={color.brand}
          />
        }
      >
        <Text variant="title">Marketing activity</Text>
        <Text variant="label" tone={color.textSecondary}>
          {dayLabel(data.period_start)} – {dayLabel(data.period_end)}
        </Text>

        {!data.has_data ? (
          <EmptyState
            icon="megaphone-outline"
            title="No new members in this period"
            detail="Source, campaign and referral are captured when a member registers. Numbers appear here as soon as there are records to count."
          />
        ) : (
          <>
            <View style={styles.tiles}>
              <StatCard label="New members" value={data.new_members} colorOverride={color.brand} />
              <StatCard
                label="Referrals"
                value={data.total_referrals}
                colorOverride={color.status.positive}
              />
              <StatCard
                label="Top source"
                value={topSource ? topSource.joined : 0}
                hint={topSource?.source_label}
              />
            </View>

            <Card>
              <Eyebrow>Source distribution</Eyebrow>
              <SourceDistribution sources={data.sources.slice(0, 8)} />
            </Card>

            <Section title="Source → members → Day 45 → PT">
              {data.sources.map((source) => (
                <TappableCard
                  key={source.source_key}
                  testID={`marketing-source-${source.source_key}`}
                  accessibilityLabel={`Open ${source.source_label}`}
                  onPress={() =>
                    router.push(`/(owner)/marketing/${source.source_key}` as never)
                  }
                >
                  <Row style={styles.cardHead}>
                    <Text variant="heading">{source.source_label}</Text>
                    <Badge label={`${source.joined} joined`} colorOverride={color.brand} />
                  </Row>

                  <Row style={styles.funnel}>
                    <FunnelStep label="Joined" value={source.joined} tint={color.brand} />
                    <FunnelStep
                      label="Reached Day 45"
                      value={source.reached_day_45}
                      tint={color.status.info}
                    />
                    <FunnelStep
                      label="PT conversions"
                      value={source.pt_conversions}
                      tint={color.status.positive}
                    />
                  </Row>

                  <Divider />
                  <Row style={styles.rate}>
                    <Text variant="label" tone={color.textSecondary}>
                      PT conversion
                    </Text>
                    <Text variant="mono" tone={color.status.positive}>
                      {source.pt_conversion_pct}%
                    </Text>
                  </Row>
                  <ProgressBar
                    value={source.pt_conversion_pct}
                    colorOverride={color.status.positive}
                  />

                  {source.campaigns.length ? (
                    <Text variant="label" tone={color.textTertiary}>
                      Campaigns: {source.campaigns.join(', ')}
                    </Text>
                  ) : null}
                </TappableCard>
              ))}
            </Section>

            {data.campaigns.length ? (
              <Section title="Campaigns">
                {data.campaigns.map((campaign, index) => (
                  <Card key={String(campaign.campaign_id ?? index)}>
                    <Row style={styles.cardHead}>
                      <Text variant="body">{String(campaign.name)}</Text>
                      <Badge
                        label={campaign.is_active ? 'Active' : 'Ended'}
                        colorOverride={
                          campaign.is_active ? color.status.positive : color.textTertiary
                        }
                      />
                    </Row>
                    <Row style={styles.rate}>
                      <Text variant="label" tone={color.textSecondary}>
                        Members
                      </Text>
                      <Text variant="mono">{String(campaign.members)}</Text>
                    </Row>
                    <Row style={styles.rate}>
                      <Text variant="label" tone={color.textSecondary}>
                        Reached Day 45
                      </Text>
                      <Text variant="mono">{String(campaign.reached_day_45)}</Text>
                    </Row>
                    <Row style={styles.rate}>
                      <Text variant="label" tone={color.textSecondary}>
                        PT conversions
                      </Text>
                      <Text variant="mono" tone={color.status.positive}>
                        {String(campaign.pt_conversions)}
                      </Text>
                    </Row>
                  </Card>
                ))}
              </Section>
            ) : null}

            {data.referrals.length ? (
              <Section title="Who is referring">
                {data.referrals.map((entry, index) => (
                  <Row key={String(entry.member_id ?? index)} style={styles.referral}>
                    <Text variant="body" style={styles.grow}>
                      {String(entry.member_name)}
                    </Text>
                    <Badge label={`${entry.referrals}`} colorOverride={color.brand} />
                  </Row>
                ))}
              </Section>
            ) : null}
          </>
        )}

        <Text variant="label" tone={color.textTertiary} style={styles.footnote}>
          Counted from member records only. Nothing here is estimated, and referral rewards are not
          set until SLAM confirms a policy.
        </Text>
      </Body>
    </Screen>
  );
}

/**
 * Where members came from, as a horizontal bar per source.
 *
 * A column chart cannot hold a real label at eight-across width — "Instagram"
 * and "Facebook" cannot both fit under a 40px bar without truncating past
 * recognition. A horizontal bar has nowhere to hide the label: it is read
 * before the bar is, so every source is legible at any name length.
 */
function SourceDistribution({ sources }: { sources: SourceFunnel[] }) {
  const styles = useThemedStyles(buildStyles);
  const max = Math.max(1, ...sources.map((source) => source.joined));
  return (
    <Stack gap="sm" style={styles.distribution}>
      {sources.map((source) => (
        <Row key={source.source_key} gap="md" align="center">
          <Text variant="label" tone={color.textSecondary} style={styles.distributionLabel}>
            {source.source_label}
          </Text>
          <View style={styles.distributionTrack}>
            <View
              style={[
                styles.distributionBar,
                {
                  width: `${Math.max(source.joined ? 4 : 0, (source.joined / max) * 100)}%`,
                  backgroundColor: source.joined ? color.brand : color.surfaceOverlay,
                },
              ]}
            />
          </View>
          <Text variant="mono" tone={color.textTertiary} style={styles.distributionValue}>
            {source.joined}
          </Text>
        </Row>
      ))}
    </Stack>
  );
}

function FunnelStep({ label, value, tint }: { label: string; value: number; tint: string }) {
  const styles = useThemedStyles(buildStyles);
  return (
    <View style={styles.step}>
      <Text variant="title" tone={tint}>
        {value}
      </Text>
      <Text variant="caption" tone={color.textTertiary}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function buildStyles() {
  return StyleSheet.create({
  grow: { flex: 1 },
  tiles: { flexDirection: 'row', gap: space.sm },
  distribution: { paddingTop: space.xs },
  distributionLabel: { width: 88 },
  distributionTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.surfaceOverlay,
    overflow: 'hidden',
  },
  distributionBar: { height: '100%', borderRadius: 4 },
  distributionValue: { width: 28, textAlign: 'right' },
  cardHead: { justifyContent: 'space-between' },
  funnel: { justifyContent: 'space-between', paddingVertical: space.sm },
  step: { alignItems: 'flex-start', gap: 2, flex: 1 },
  rate: { justifyContent: 'space-between', paddingVertical: 2 },
  referral: {
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  footnote: { textAlign: 'center', lineHeight: 18, marginTop: space.lg },
});
}
