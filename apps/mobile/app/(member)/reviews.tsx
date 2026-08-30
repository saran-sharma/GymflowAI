/**
 * "My feedback" — the ratings a member left their trainers, and where each one
 * stands.
 *
 * A rating never appears on a trainer profile until the gym owner approves it,
 * so the status is the important column here. While a rating is still
 * `pending` the member can withdraw it entirely; at any time they can turn the
 * "show my name" consent on or off — turning it off re-anonymises an
 * already-approved testimonial without un-publishing it.
 */

import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Switch } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { MemberReview, TrainerReviewStatus } from '../../src/api/types';
import { StarRatingDisplay } from '../../src/components/star-rating';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Row,
  Screen,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';

const STATUS_LABEL: Record<TrainerReviewStatus, string> = {
  pending: 'Awaiting owner review',
  approved: 'Published',
  rejected: 'Not published',
  removed: 'Removed by owner',
};

const STATUS_TONE: Record<TrainerReviewStatus, 'neutral' | 'positive' | 'caution' | 'critical'> = {
  pending: 'caution',
  approved: 'positive',
  rejected: 'neutral',
  removed: 'critical',
};

export default function MyFeedbackScreen() {
  const { withToken } = useAuth();
  const reviews = useApi<MemberReview[]>((token) => api.myTrainerReviews(token), []);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = useCallback(
    async (id: number, fn: (token: string) => Promise<unknown>) => {
      setBusyId(id);
      setError(null);
      try {
        await withToken(fn);
        await reviews.reload();
      } catch (caught) {
        setError(
          caught instanceof ApiError && caught.code === OFFLINE_CODE
            ? "We couldn't reach GymFlow. Try again in a moment."
            : 'That did not go through. Please try again.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [withToken, reviews],
  );

  if (reviews.loading) return <Loading label="Loading your feedback" />;

  if (reviews.error) {
    const offline = reviews.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load your feedback'}
          detail={offline ? undefined : reviews.error.message}
          onRetry={reviews.reload}
        />
      </Screen>
    );
  }

  const rows = reviews.data ?? [];

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={reviews.refreshing}
            onRefresh={reviews.refresh}
            tintColor={color.brand}
          />
        }
      >
        <Stack gap="xxs">
          <Text variant="title">My feedback</Text>
          <Text variant="body" tone={color.textSecondary}>
            Ratings you left your trainers. Nothing is shown on a trainer&rsquo;s profile until the
            gym owner approves it.
          </Text>
        </Stack>

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline" testID="reviews-error">
            {error}
          </Banner>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon="star-outline"
            title="No feedback yet"
            detail="After a session your trainer supervised, you can rate how it went."
          />
        ) : (
          rows.map((review) => (
            <Card key={review.id} gap="sm" testID={`my-review-${review.id}`}>
              <Row gap="sm">
                <Text variant="heading">{review.trainer.name}</Text>
                <Spacer />
                <Stack gap="xxs" testID={`my-review-status-${review.id}`}>
                  <Badge label={STATUS_LABEL[review.status]} tone={STATUS_TONE[review.status]} />
                </Stack>
              </Row>

              <StarRatingDisplay value={review.rating} />

              {review.comment ? (
                <Text variant="body" tone={color.textSecondary}>
                  &ldquo;{review.comment}&rdquo;
                </Text>
              ) : null}

              <Row gap="sm" style={styles.consentRow}>
                <Stack gap="xxs" style={styles.grow}>
                  <Text variant="label">Show my name on this testimonial</Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {review.display_name_consent
                      ? 'Shown as your first name and last initial.'
                      : 'Shown as “Verified GymFlow Member”.'}
                  </Text>
                </Stack>
                <Switch
                  testID={`my-review-consent-${review.id}`}
                  value={review.display_name_consent}
                  disabled={busyId === review.id}
                  onValueChange={(next) =>
                    void act(review.id, (token) => api.setReviewConsent(review.id, next, token))
                  }
                  trackColor={{ true: color.brand, false: color.border }}
                />
              </Row>

              {review.can_retract ? (
                <Button
                  title="Withdraw this review"
                  variant="ghost"
                  size="sm"
                  block={false}
                  testID={`my-review-withdraw-${review.id}`}
                  loading={busyId === review.id}
                  onPress={() =>
                    void act(review.id, (token) => api.retractReview(review.id, token))
                  }
                />
              ) : null}
            </Card>
          ))
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  consentRow: { alignItems: 'center' },
  grow: { flex: 1 },
});
