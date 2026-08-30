/**
 * The post-workout "How was your experience with [Trainer]?" prompt.
 *
 * Shown as a sheet right after a supervised workout (or PT session) is marked
 * complete. It asks the server whether there is anything to review first
 * (`reviewPrompt`) and quietly closes if not — an unsupervised workout, or one
 * already reviewed, never shows this.
 *
 * The comment is optional. The rating goes to the gym owner for moderation,
 * never straight onto a trainer profile — the closing message says so.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '../api/client';
import * as api from '../api/endpoints';
import type { ReviewPrompt } from '../api/types';
import {
  Banner,
  Button,
  Input,
  Row,
  Sheet,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../design';
import { useAuth } from '../store/AuthContext';
import { StarRatingInput } from './star-rating';

type Props = {
  visible: boolean;
  onClose: () => void;
  workoutSessionId?: number;
  ptSessionId?: number;
};

export function TrainerReviewPrompt({ visible, onClose, workoutSessionId, ptSessionId }: Props) {
  const { withToken } = useAuth();
  const [prompt, setPrompt] = useState<ReviewPrompt | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPrompt(null);
    setRating(0);
    setComment('');
    setAck(false);
    setError(null);
    setDone(false);
    let alive = true;
    Promise.resolve()
      .then(() => withToken((token) => api.reviewPrompt({ workoutSessionId, ptSessionId }, token)))
      .then((result) => {
        if (!alive) return;
        setPrompt(result);
        // Nothing to review — don't leave an empty sheet sitting there.
        if (!result.eligible) onClose();
      })
      .catch(() => {
        if (alive) onClose();
      });
    return () => {
      alive = false;
    };
    // `withToken` / `onClose` are called but must not re-trigger the fetch —
    // a fresh `onClose` arrow from the parent on every render otherwise
    // re-asks the server on each keystroke elsewhere on the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, workoutSessionId, ptSessionId]);

  async function submit() {
    if (rating < 1) {
      setError('Tap a star to rate the session first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await withToken((token) =>
        api.submitTrainerReview(
          {
            workout_session_id: workoutSessionId ?? null,
            pt_session_id: ptSessionId ?? null,
            rating,
            comment: comment.trim() || null,
            display_name_consent: false,
            policy_ack: true,
          },
          token,
        ),
      );
      setDone(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'offline'
          ? "We couldn't reach GymFlow. Your feedback wasn't sent — try again later."
          : 'Could not send your feedback. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!visible || !prompt || !prompt.eligible) return null;

  const trainerName = prompt.trainer?.name ?? 'your trainer';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      testID="review-prompt"
      title={done ? 'Thanks!' : `How was your session with ${trainerName}?`}
      footer={
        done ? (
          <Button title="Done" testID="review-done" onPress={onClose} />
        ) : (
          <Row gap="sm">
            <Button
              title="Skip"
              variant="ghost"
              testID="review-skip"
              disabled={busy}
              onPress={onClose}
            />
            <Spacer />
            <Button
              title="Submit review"
              testID="review-submit"
              loading={busy}
              disabled={!ack}
              onPress={() => void submit()}
            />
          </Row>
        )
      }
    >
      {done ? (
        <Stack gap="sm">
          <Text testID="review-thanks">
            Your feedback was sent to the gym owner for review. It only appears on {trainerName}
            &rsquo;s profile if the owner approves it.
          </Text>
        </Stack>
      ) : (
        <Stack gap="lg">
          <StarRatingInput value={rating} onChange={setRating} />

          <Input
            label="Add a comment (optional)"
            testID="review-comment"
            value={comment}
            onChangeText={setComment}
            placeholder="What went well? Anything to improve?"
            multiline
            maxLength={1000}
          />

          {error ? (
            <Banner tone="critical" icon="alert-circle-outline" testID="review-error">
              {error}
            </Banner>
          ) : null}

          <Pressable
            testID="review-policy-ack"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ack }}
            onPress={() => setAck((v) => !v)}
            style={styles.ackRow}
          >
            <Ionicons
              name={ack ? 'checkbox' : 'square-outline'}
              size={22}
              color={ack ? color.brand : color.textTertiary}
            />
            <Text variant="label" tone={color.textSecondary} style={styles.ackText}>
              I agree to the review guidelines: this is my own honest experience, no abusive or
              personal content. Questions? {prompt.support_contact}
            </Text>
          </Pressable>
        </Stack>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  ackRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  ackText: { flexShrink: 1, lineHeight: 18 },
});
