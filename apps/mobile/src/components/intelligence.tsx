/**
 * The intelligence surface, rendered.
 *
 * One `InsightCard` shape serves every role; the member's Progress screen uses
 * `MemberIntelligenceSection`, which is deliberately restrained — one headline
 * sentence, at most three insights, one next action. Nothing here is styled as
 * an "AI" feature: no gradient, no robot, no chat bubble. It reads like the
 * rest of GymFlow because the figures behind it are GymFlow's own.
 *
 * Every state is handled so a slow or failed intelligence read never takes the
 * Progress screen down with it (§21): loading, insufficient data, provider
 * error, and the calm "nothing needs attention" case each have their own
 * treatment, and the deterministic content renders even when narration is a
 * plain template sentence.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ApiError } from '../api/client';
import { OFFLINE_CODE } from '../api/client';
import type {
  IntelligenceInsight,
  InsightSeverity,
  MemberIntelligence,
} from '../api/types';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Eyebrow,
  LinkButton,
  Row,
  Section,
  Skeleton,
  Spacer,
  Stack,
  Text,
  alpha,
  color,
  space,
  useThemedStyles,
  type Tone,
} from '../design';

type IconName = keyof typeof Ionicons.glyphMap;

/** How each severity reads: a calm tint and a plain icon, never an alarm. */
export function severityMeta(severity: InsightSeverity): {
  tone: Tone;
  icon: IconName;
  hue: string;
} {
  switch (severity) {
    case 'critical':
      return { tone: 'critical', icon: 'alert-circle-outline', hue: color.status.critical };
    case 'attention':
      return { tone: 'caution', icon: 'flag-outline', hue: color.status.warning };
    case 'positive':
      return { tone: 'positive', icon: 'trending-up-outline', hue: color.status.positive };
    default:
      return { tone: 'info', icon: 'ellipse-outline', hue: color.status.info };
  }
}

/**
 * One explained observation: an icon and title, a sentence, the figures that
 * back it, and — when there is one — the step that acts on it.
 */
export function InsightCard({
  insight,
  onNavigate,
}: {
  insight: IntelligenceInsight;
  onNavigate?: (route: string) => void;
}) {
  const styles = useThemedStyles(buildStyles);
  const meta = severityMeta(insight.severity);
  const hue = meta.hue;

  return (
    <Card gap="sm" style={[styles.card, { borderColor: alpha(hue, 0.35) }]}>
      <Row gap="sm" align="flex-start">
        <View style={[styles.iconWrap, { backgroundColor: alpha(hue, 0.12) }]}>
          <Ionicons name={meta.icon} size={16} color={hue} />
        </View>
        <Stack gap="xxs" style={styles.grow}>
          <Text variant="heading">{insight.title}</Text>
          <Text variant="body" tone={color.textSecondary}>
            {insight.summary}
          </Text>
        </Stack>
      </Row>

      {insight.evidence.length > 0 ? (
        <Stack gap="xxs" style={styles.evidence}>
          {insight.evidence.map((item) => (
            <Row key={`${item.label}-${item.value}`} gap="sm">
              <Text variant="label" tone={color.textTertiary} style={styles.grow}>
                {item.label}
              </Text>
              <Text variant="mono" tone={color.textSecondary}>
                {item.value}
              </Text>
            </Row>
          ))}
        </Stack>
      ) : null}

      {insight.action?.route && onNavigate ? (
        <Row>
          <Spacer />
          <LinkButton
            title={insight.action.label}
            onPress={() => onNavigate(insight.action!.route!)}
          />
        </Row>
      ) : null}
    </Card>
  );
}

interface SectionProps {
  data: MemberIntelligence | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onNavigate: (route: string) => void;
  /** How many insights to show. The rest stay in the payload for a trainer. */
  limit?: number;
  title?: string;
}

/**
 * The member's read of their own training: what stands out, and the one thing
 * to do next.
 */
export function MemberIntelligenceSection({
  data,
  loading,
  error,
  onRetry,
  onNavigate,
  limit = 3,
  title = 'What stands out',
}: SectionProps) {
  const styles = useThemedStyles(buildStyles);

  // First load, nothing to show yet — a couple of quiet bars, not a spinner
  // that implies the whole screen is blocked.
  if (loading && !data) {
    return (
      <Section title={title}>
        <Card gap="sm">
          <Skeleton width="70%" height={16} />
          <Skeleton width="90%" height={12} />
          <Skeleton width="50%" height={12} />
        </Card>
      </Section>
    );
  }

  // The intelligence read failed. Say so in one line and keep going — the rest
  // of Progress is unaffected.
  if (error && !data) {
    const offline = error.code === OFFLINE_CODE;
    return (
      <Section title={title}>
        <Banner tone="info" icon="cloud-offline-outline">
          {offline
            ? 'Progress insights will load when you are back online.'
            : 'Progress insights are unavailable right now.'}
        </Banner>
        {!offline ? <LinkButton title="Try again" onPress={onRetry} /> : null}
      </Section>
    );
  }

  if (!data) return null;

  if (data.state === 'insufficient_data') {
    return (
      <Section title={title}>
        <EmptyState
          icon="analytics-outline"
          title="Not enough history yet"
          detail={data.headline}
          action={
            data.next_action?.route
              ? {
                  label: data.next_action.label,
                  onPress: () => onNavigate(data.next_action!.route!),
                }
              : undefined
          }
        />
      </Section>
    );
  }

  const shown = data.insights.slice(0, limit);
  // The next action is only worth a button of its own when it is not already
  // the action on one of the insights on screen.
  const nextRoute = data.next_action?.route ?? null;
  const nextAlreadyShown = shown.some((i) => i.action?.route === nextRoute);

  return (
    <Section title={title}>
      <Card gap="xxs" style={styles.headline}>
        <Eyebrow>GymFlow read</Eyebrow>
        <Text variant="body">{data.headline}</Text>
      </Card>

      {shown.map((insight) => (
        <InsightCard key={insight.id} insight={insight} onNavigate={onNavigate} />
      ))}

      {shown.length === 0 ? (
        <Text variant="body" tone={color.textSecondary}>
          You are on track — nothing needs attention this week.
        </Text>
      ) : null}

      {data.next_action?.route && !nextAlreadyShown ? (
        <Button
          title={data.next_action.label}
          variant="secondary"
          size="sm"
          onPress={() => onNavigate(data.next_action!.route!)}
        />
      ) : null}
    </Section>
  );
}

function buildStyles() {
  return StyleSheet.create({
    grow: { flex: 1 },
    card: { borderWidth: 1 },
    headline: { backgroundColor: color.surfaceRaised },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    evidence: {
      borderTopWidth: 1,
      borderTopColor: color.border,
      paddingTop: space.xs,
    },
  });
}
