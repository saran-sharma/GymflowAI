/**
 * A trainer's client testimonials, as shown on their own profile and on the
 * owner's trainer-detail screen.
 *
 * Only approved testimonials are ever returned by the API, so this component
 * never has to filter. The author line is whatever the server decided —
 * "Aditya R." if the member consented, "Verified GymFlow Member" otherwise —
 * and this component does not have the raw name to leak.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import * as api from '../api/endpoints';
import type { RatingSummary, TrainerTestimonials } from '../api/types';
import {
  Card,
  EmptyState,
  Row,
  Section,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../design';
import { useApi } from '../hooks/useApi';
import { StarRatingDisplay } from './star-rating';

function SummaryRow({ summary }: { summary: RatingSummary }) {
  const trendUp = (summary.trend ?? 0) > 0;
  const trendDown = (summary.trend ?? 0) < 0;
  return (
    <Row gap="md" style={styles.summary}>
      <Stack gap="xxs">
        <Text variant="display">
          {summary.average_rating != null ? summary.average_rating.toFixed(1) : '—'}
        </Text>
        <Text variant="label" tone={color.textTertiary}>
          {summary.review_count} review{summary.review_count === 1 ? '' : 's'}
        </Text>
      </Stack>
      <Spacer />
      <Stack gap="xxs" style={styles.right}>
        {summary.average_rating != null ? (
          <StarRatingDisplay value={summary.average_rating} size={14} />
        ) : null}
        {summary.trend != null && summary.trend !== 0 ? (
          <Row gap="xxs">
            <Ionicons
              name={trendUp ? 'trending-up' : 'trending-down'}
              size={14}
              color={trendUp ? color.status.positive : color.status.critical}
            />
            <Text
              variant="label"
              tone={trendUp ? color.status.positive : color.status.critical}
            >
              {trendDown ? '' : '+'}
              {summary.trend.toFixed(1)} recent
            </Text>
          </Row>
        ) : null}
      </Stack>
    </Row>
  );
}

export function TrainerTestimonialsSection({
  trainerId,
  self = false,
  title = 'Client testimonials',
}: {
  trainerId?: number;
  self?: boolean;
  title?: string;
}) {
  // A trainer viewing their own profile doesn't carry their trainer id — ask
  // the summary endpoint for it, then load the testimonials.
  const summaryOnly = useApi<RatingSummary | null>(
    (token) => (self && trainerId == null ? api.myRatingSummary(token) : Promise.resolve(null)),
    [self, trainerId],
  );
  const resolvedId = trainerId ?? summaryOnly.data?.trainer_id ?? null;

  const data = useApi<TrainerTestimonials | null>(
    (token) =>
      resolvedId != null ? api.trainerTestimonials(resolvedId, token) : Promise.resolve(null),
    [resolvedId],
  );

  if (data.loading || summaryOnly.loading) {
    return (
      <Section title={title}>
        <Text variant="label" tone={color.textTertiary}>
          Loading…
        </Text>
      </Section>
    );
  }

  if (data.error || !data.data) {
    return (
      <Section title={title}>
        <Text variant="label" tone={color.textTertiary}>
          Testimonials are unavailable right now.
        </Text>
      </Section>
    );
  }

  const { summary, testimonials } = data.data;

  return (
    <Section title={title}>
      <Card gap="md" testID="testimonials-card">
        <SummaryRow summary={summary} />
        {self && summary.pending_count > 0 ? (
          <Text variant="label" tone={color.textTertiary}>
            {summary.pending_count} more{' '}
            {summary.pending_count === 1 ? 'is' : 'are'} waiting for owner approval.
          </Text>
        ) : null}

        {testimonials.length === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No testimonials yet"
            detail={
              self
                ? 'Approved member feedback with a comment will appear here.'
                : 'This trainer has no approved testimonials yet.'
            }
          />
        ) : (
          <Stack gap="md">
            {testimonials.map((t) => (
              <View key={t.id} style={styles.item} testID={`testimonial-${t.id}`}>
                <StarRatingDisplay value={t.rating} size={13} />
                {t.comment ? (
                  <Text variant="body" tone={color.textSecondary} style={styles.quote}>
                    &ldquo;{t.comment}&rdquo;
                  </Text>
                ) : null}
                <Text variant="label" tone={color.textTertiary}>
                  — {t.author_label}
                </Text>
              </View>
            ))}
          </Stack>
        )}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  summary: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  item: { gap: space.xs },
  quote: { lineHeight: 20 },
});
