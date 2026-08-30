/**
 * Owner → Feedback → Trainer Reviews.
 *
 * Every member rating lands here `pending`. The owner approves, rejects, or —
 * after the fact — removes an approved testimonial, and can attach a private
 * internal note that only ever shows on this screen. A reported review sorts
 * to the top. A trainer has no route into this screen at all, and the server
 * refuses a moderation action on a review of the acting user.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet } from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type { ModerationReview, TrainerReviewStatus } from '../../src/api/types';
import { StarRatingDisplay } from '../../src/components/star-rating';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Chips,
  EmptyState,
  ErrorState,
  Input,
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

type Filter = 'reported' | 'pending' | 'approved' | 'rejected' | 'removed' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'reported', label: 'Reported' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'removed', label: 'Removed' },
  { value: 'all', label: 'All' },
];

const STATUS_TONE: Record<TrainerReviewStatus, 'neutral' | 'positive' | 'caution' | 'critical'> = {
  pending: 'caution',
  approved: 'positive',
  rejected: 'neutral',
  removed: 'critical',
};

export default function TrainerReviewsScreen() {
  const { withToken } = useAuth();
  const [filter, setFilter] = useState<Filter>('pending');
  const queue = useApi<ModerationReview[]>(
    (token) =>
      api.moderationQueue(
        token,
        filter === 'all'
          ? undefined
          : filter === 'reported'
            ? { reported: true }
            : { status: filter },
      ),
    [filter],
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');

  const act = useCallback(
    async (id: number, fn: (token: string) => Promise<unknown>) => {
      setBusyId(id);
      setError(null);
      try {
        await withToken(fn);
        await queue.reload();
      } catch (caught) {
        setError(
          caught instanceof ApiError && caught.code === OFFLINE_CODE
            ? "We couldn't reach GymFlow. Try again in a moment."
            : caught instanceof ApiError
              ? caught.message
              : 'That did not go through. Please try again.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [withToken, queue],
  );

  const rows = useMemo(() => queue.data ?? [], [queue.data]);

  if (queue.loading && !queue.data) return <Loading label="Loading trainer reviews" />;

  if (queue.error && !queue.data) {
    const offline = queue.error.code === OFFLINE_CODE;
    return (
      <Screen>
        <ErrorState
          offline={offline}
          title={offline ? undefined : 'We could not load the reviews'}
          detail={offline ? undefined : queue.error.message}
          onRetry={queue.reload}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Body
        refreshControl={
          <RefreshControl
            refreshing={queue.refreshing}
            onRefresh={queue.refresh}
            tintColor={color.brand}
          />
        }
      >
        <Stack gap="xxs">
          <Text variant="title">Trainer reviews</Text>
          <Text variant="body" tone={color.textSecondary}>
            Member ratings wait here for your approval. Nothing appears on a trainer profile until
            you approve it.
          </Text>
        </Stack>

        <Chips
          options={FILTERS}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          testIDPrefix="review-filter"
        />

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline" testID="moderation-error">
            {error}
          </Banner>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Nothing here"
            detail="No reviews match this filter."
          />
        ) : (
          rows.map((review) => (
            <Card key={review.id} gap="sm" testID={`moderation-review-${review.id}`}>
              <Row gap="sm">
                <Stack gap="xxs" style={styles.grow}>
                  <Text variant="heading">{review.trainer.name}</Text>
                  <Text variant="label" tone={color.textTertiary}>
                    {review.author_label}
                  </Text>
                </Stack>
                <Stack gap="xxs" style={styles.right}>
                  <Stack gap="xxs" testID={`moderation-status-${review.id}`}>
                    <Badge label={review.status} tone={STATUS_TONE[review.status]} />
                  </Stack>
                  {review.reported ? (
                    <Stack gap="xxs" testID={`moderation-reported-${review.id}`}>
                      <Badge label="Reported" tone="critical" />
                    </Stack>
                  ) : null}
                </Stack>
              </Row>

              <StarRatingDisplay value={review.rating} />

              {review.comment ? (
                <Text variant="body" tone={color.textSecondary}>
                  &ldquo;{review.comment}&rdquo;
                </Text>
              ) : (
                <Text variant="label" tone={color.textTertiary}>
                  No comment — rating only.
                </Text>
              )}

              {review.reported_reason ? (
                <Banner tone="caution" icon="flag-outline">
                  {`Reported: ${review.reported_reason}`}
                </Banner>
              ) : null}

              {review.moderations.length > 0 ? (
                <Stack gap="xxs">
                  {review.moderations.map((m) => (
                    <Text key={m.id} variant="label" tone={color.textTertiary}>
                      {m.actor_role ?? 'owner'} · {m.action}
                      {m.note ? ` — “${m.note}”` : ''}
                    </Text>
                  ))}
                </Stack>
              ) : null}

              <Row gap="sm" style={styles.actions}>
                {review.status !== 'approved' ? (
                  <Button
                    title="Approve"
                    size="sm"
                    block={false}
                    testID={`moderation-approve-${review.id}`}
                    loading={busyId === review.id}
                    onPress={() =>
                      void act(review.id, (token) => api.moderateReview(review.id, 'approve', token))
                    }
                  />
                ) : (
                  <Button
                    title="Remove"
                    variant="destructive"
                    size="sm"
                    block={false}
                    testID={`moderation-remove-${review.id}`}
                    loading={busyId === review.id}
                    onPress={() =>
                      void act(review.id, (token) => api.moderateReview(review.id, 'remove', token))
                    }
                  />
                )}
                {review.status !== 'rejected' && review.status !== 'approved' ? (
                  <Button
                    title="Reject"
                    variant="secondary"
                    size="sm"
                    block={false}
                    testID={`moderation-reject-${review.id}`}
                    loading={busyId === review.id}
                    onPress={() =>
                      void act(review.id, (token) => api.moderateReview(review.id, 'reject', token))
                    }
                  />
                ) : null}
                <Spacer />
                <Button
                  title={noteFor === review.id ? 'Cancel note' : 'Add note'}
                  variant="ghost"
                  size="sm"
                  block={false}
                  testID={`moderation-note-toggle-${review.id}`}
                  onPress={() => {
                    setNoteText('');
                    setNoteFor(noteFor === review.id ? null : review.id);
                  }}
                />
              </Row>

              {noteFor === review.id ? (
                <Stack gap="sm">
                  <Input
                    label="Private internal note"
                    testID={`moderation-note-input-${review.id}`}
                    value={noteText}
                    onChangeText={setNoteText}
                    placeholder="Only visible to management, on this screen."
                    multiline
                    maxLength={2000}
                  />
                  <Button
                    title="Save note"
                    size="sm"
                    block={false}
                    testID={`moderation-note-save-${review.id}`}
                    loading={busyId === review.id}
                    disabled={!noteText.trim()}
                    onPress={() =>
                      void act(review.id, (token) =>
                        api.moderateReview(review.id, 'note', token, noteText.trim()),
                      ).then(() => setNoteFor(null))
                    }
                  />
                </Stack>
              ) : null}
            </Card>
          ))
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  right: { alignItems: 'flex-end' },
  actions: { alignItems: 'center', flexWrap: 'wrap' },
});
