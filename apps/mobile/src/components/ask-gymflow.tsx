/**
 * Ask GymFlow — a focused question surface, not a chat.
 *
 * A sheet with the "ASK GYMFLOW" heading, a row of suggestion chips, one text
 * field, and a single response area. No gradient, no robot, no bubbles, no
 * floating button: it opens from a plain row on the screen it belongs to and
 * answers with figures GymFlow already computed. Every answer is deterministic
 * (no model in V1) and carries the data it was built from plus a follow-up
 * chip set.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ApiError } from '../api/client';
import * as api from '../api/endpoints';
import type { AskAnswer } from '../api/types';
import {
  Banner,
  Button,
  Eyebrow,
  Input,
  LinkButton,
  Row,
  Sheet,
  Skeleton,
  Spacer,
  Stack,
  Text,
  alpha,
  color,
  radii,
  space,
  useThemedStyles,
} from '../design';
import { useAuth } from '../store/AuthContext';

function SuggestionChip({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useThemedStyles(buildStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.chip, pressed ? styles.chipPressed : null]}
    >
      <Text variant="label" tone={color.textSecondary}>
        {label}
      </Text>
    </Pressable>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** A client a trainer/owner is asking about; omitted for a member's own. */
  memberId?: number;
  /**
   * A question to ask the moment the sheet opens — for a contextual entry
   * point like "Tell me more" on an owner issue. The member/branch context
   * still comes from `memberId` + the caller's role, server-side; the question
   * is just text.
   */
  initialQuestion?: string;
  onNavigate?: (route: string) => void;
}

export function AskGymFlowSheet({
  visible,
  onClose,
  memberId,
  initialQuestion,
  onNavigate,
}: Props) {
  const styles = useThemedStyles(buildStyles);
  const { withToken } = useAuth();

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askedOnOpen = React.useRef<string | null>(null);

  useEffect(() => {
    if (!visible) {
      askedOnOpen.current = null;
      return;
    }
    let alive = true;
    void withToken((token) => api.askSuggestions(token, memberId))
      .then((res) => {
        if (alive) setSuggestions(res.suggestions);
      })
      .catch(() => {
        /* chips are optional */
      });
    return () => {
      alive = false;
    };
  }, [visible, memberId, withToken]);

  const submit = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError(null);
      setQuestion(trimmed);
      try {
        const res = await withToken((token) => api.askGymFlow(trimmed, token, memberId));
        setAnswer(res);
        if (res.suggestions.length) setSuggestions(res.suggestions);
      } catch (caught) {
        setAnswer(null);
        setError(
          (caught as ApiError)?.message ??
            'GymFlow could not answer that just now. Try again in a moment.',
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, memberId, withToken],
  );

  // Fire the contextual question once per open, after `submit` is defined.
  useEffect(() => {
    if (visible && initialQuestion && askedOnOpen.current !== initialQuestion) {
      askedOnOpen.current = initialQuestion;
      void submit(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialQuestion, submit]);

  const reset = () => {
    setQuestion('');
    setAnswer(null);
    setError(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={reset} title="Ask GymFlow" testID="ask-gymflow">
      <Stack gap="md">
        <Text variant="label" tone={color.textTertiary}>
          Answers come from your own GymFlow data — training, attendance, progress. Not a chat.
        </Text>

        {suggestions.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {suggestions.map((s) => (
              <SuggestionChip key={s} label={s} onPress={() => void submit(s)} />
            ))}
          </ScrollView>
        ) : null}

        <Row gap="sm" align="flex-end">
          <View style={styles.grow}>
            <Input
              placeholder="Ask about your training…"
              value={question}
              onChangeText={setQuestion}
              onSubmitEditing={() => void submit(question)}
              returnKeyType="search"
              testID="ask-input"
            />
          </View>
          <Button
            title="Ask"
            size="sm"
            onPress={() => void submit(question)}
            loading={busy}
            disabled={!question.trim()}
          />
        </Row>

        {error ? (
          <Banner tone="info" icon="cloud-offline-outline">
            {error}
          </Banner>
        ) : null}

        {busy && !answer ? (
          <Stack gap="sm" style={styles.answer}>
            <Skeleton width="90%" height={12} />
            <Skeleton width="70%" height={12} />
          </Stack>
        ) : null}

        {answer && !busy ? (
          <Stack gap="sm" style={styles.answer}>
            <Eyebrow>GymFlow</Eyebrow>
            {answer.answer.split('\n').map((line, i) => (
              <Text key={i} variant="body" tone={color.text}>
                {line}
              </Text>
            ))}

            {answer.data.length > 0 ? (
              <Stack gap="xxs" style={styles.data}>
                {answer.data.map((d) => (
                  <Row key={`${d.label}-${d.value}`} gap="sm">
                    <Text variant="label" tone={color.textTertiary} style={styles.grow}>
                      {d.label}
                    </Text>
                    <Text variant="mono" tone={color.textSecondary}>
                      {d.value}
                    </Text>
                  </Row>
                ))}
              </Stack>
            ) : null}

            {answer.action?.route && onNavigate ? (
              <Row>
                <Spacer />
                <LinkButton
                  title={answer.action.label}
                  onPress={() => {
                    onNavigate(answer.action!.route!);
                    reset();
                  }}
                />
              </Row>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Sheet>
  );
}

/**
 * The entry point: a quiet row, never a floating button. Drops onto Progress,
 * a trainer's client detail, the owner dashboard.
 */
export function AskGymFlowRow({
  onPress,
  detail = 'Ask about your training',
}: {
  onPress: () => void;
  detail?: string;
}) {
  const styles = useThemedStyles(buildStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Ask GymFlow"
      style={({ pressed }) => [styles.entry, pressed ? styles.chipPressed : null]}
      testID="ask-gymflow-row"
    >
      <Ionicons name="sparkles-outline" size={18} color={color.textSecondary} />
      <Stack gap="xxs" style={styles.grow}>
        <Eyebrow>Ask GymFlow</Eyebrow>
        <Text variant="body" tone={color.textSecondary}>
          {detail}
        </Text>
      </Stack>
      <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
    </Pressable>
  );
}

function buildStyles() {
  return StyleSheet.create({
    grow: { flex: 1 },
    chipRow: { gap: space.xs, paddingVertical: space.xxs },
    chip: {
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: radii.pill,
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
      backgroundColor: color.surfaceRaised,
    },
    chipPressed: { opacity: 0.6 },
    answer: {
      borderTopWidth: 1,
      borderTopColor: color.border,
      paddingTop: space.md,
    },
    data: {
      borderTopWidth: 1,
      borderTopColor: color.border,
      paddingTop: space.xs,
    },
    entry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: radii.lg,
      padding: space.lg,
      backgroundColor: alpha(color.surfaceRaised, 0.6),
    },
  });
}
