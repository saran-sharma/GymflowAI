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
  AttentionItem,
  IntelligenceInsight,
  InsightSeverity,
  MemberIntelligence,
  OwnerDailyBrief,
  OwnerIssue,
  ProgressionRecommendation,
  TrainerAttentionQueue,
  TrainerBrief,
  TrendDirection,
} from '../api/types';
import {
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  Eyebrow,
  LinkButton,
  Row,
  Section,
  Skeleton,
  Spacer,
  Stack,
  TappableCard,
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
      return { tone: 'info', icon: 'information-circle-outline', hue: color.status.info };
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

/* -------------------------------------------------------------- trainer brief */

interface BriefProps {
  data: TrainerBrief | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onNavigate: (route: string) => void;
}

/**
 * The coach's read of one member: where they are today, what is going well,
 * what to watch, and a short list of concrete things to work on. Same
 * `InsightCard` as everywhere else; the framing is the only difference.
 */
export function TrainerBriefSection({ data, loading, error, onRetry, onNavigate }: BriefProps) {
  const styles = useThemedStyles(buildStyles);

  if (loading && !data) {
    return (
      <Section title="Trainer brief">
        <Card gap="sm">
          <Skeleton width="60%" height={14} />
          <Skeleton width="90%" height={12} />
        </Card>
      </Section>
    );
  }

  if (error && !data) {
    const offline = error.code === OFFLINE_CODE;
    return (
      <Section title="Trainer brief">
        <Banner tone="info" icon="cloud-offline-outline">
          {offline
            ? 'The brief will load when you are back online.'
            : 'The brief is unavailable right now.'}
        </Banner>
        {!offline ? <LinkButton title="Try again" onPress={onRetry} /> : null}
      </Section>
    );
  }

  if (!data) return null;

  return (
    <Section title="Trainer brief">
      {data.today.length > 0 ? (
        <Card gap="xs">
          <Eyebrow>Today</Eyebrow>
          {data.today.map((fact) => (
            <Row key={`${fact.label}-${fact.value}`} gap="sm">
              <Text variant="label" tone={color.textTertiary} style={styles.grow}>
                {fact.label}
              </Text>
              <Text variant="mono" tone={color.textSecondary}>
                {fact.value}
              </Text>
            </Row>
          ))}
        </Card>
      ) : null}

      {data.watch.length > 0 ? (
        <Stack gap="sm">
          <Eyebrow tone={color.status.warning}>Watch</Eyebrow>
          {data.watch.map((insight) => (
            <InsightCard key={insight.id} insight={insight} onNavigate={onNavigate} />
          ))}
        </Stack>
      ) : null}

      {data.progress.length > 0 ? (
        <Stack gap="sm">
          <Eyebrow tone={color.status.positive}>Progress</Eyebrow>
          {data.progress.map((insight) => (
            <InsightCard key={insight.id} insight={insight} onNavigate={onNavigate} />
          ))}
        </Stack>
      ) : null}

      {data.suggested_focus.length > 0 ? (
        <Card gap="xs">
          <Eyebrow>Suggested focus</Eyebrow>
          {data.suggested_focus.map((line, index) => (
            <Row key={index} gap="sm" align="flex-start">
              <Text variant="body" tone={color.textTertiary}>
                •
              </Text>
              <Text variant="body" tone={color.textSecondary} style={styles.grow}>
                {line}
              </Text>
            </Row>
          ))}
        </Card>
      ) : null}
    </Section>
  );
}

/* ----------------------------------------------------------- needs attention */

interface AttentionProps {
  data: TrainerAttentionQueue | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onNavigate: (route: string) => void;
  limit?: number;
}

function AttentionRow({
  item,
  onNavigate,
}: {
  item: AttentionItem;
  onNavigate: (route: string) => void;
}) {
  const styles = useThemedStyles(buildStyles);
  const meta = severityMeta(item.severity);
  return (
    <TappableCard
      onPress={() => onNavigate(item.route)}
      accessibilityLabel={`${item.member_name}: ${item.reason}`}
    >
      <Row gap="sm" align="flex-start">
        <View style={[styles.dot, { backgroundColor: meta.hue }]} />
        <Stack gap="xxs" style={styles.grow}>
          <Text variant="heading">{item.member_name}</Text>
          <Text variant="label" tone={color.textSecondary}>
            {item.reason}
          </Text>
          {item.metrics.length > 0 ? (
            <Text variant="mono" tone={color.textTertiary}>
              {item.metrics.map((m) => `${m.label} ${m.value}`).join('  ·  ')}
            </Text>
          ) : null}
        </Stack>
        <Ionicons name="chevron-forward" size={16} color={color.textTertiary} />
      </Row>
    </TappableCard>
  );
}

/**
 * The Trainer Desk triage list: which of a trainer's own clients to look at,
 * why, ranked. Every row is a deep link into that member's detail — never a
 * dead end, and never a bare "AI score".
 */
export function NeedsAttentionSection({
  data,
  loading,
  error,
  onRetry,
  onNavigate,
  limit = 5,
}: AttentionProps) {
  if (loading && !data) {
    return (
      <Section title="Needs attention">
        <Card gap="sm">
          <Skeleton width="50%" height={14} />
          <Skeleton width="80%" height={12} />
        </Card>
      </Section>
    );
  }

  if (error && !data) {
    const offline = error.code === OFFLINE_CODE;
    return (
      <Section title="Needs attention">
        <Banner tone="info" icon="cloud-offline-outline">
          {offline
            ? 'This list will load when you are back online.'
            : 'This list is unavailable right now.'}
        </Banner>
        {!offline ? <LinkButton title="Try again" onPress={onRetry} /> : null}
      </Section>
    );
  }

  if (!data) return null;

  if (data.items.length === 0) {
    return (
      <Section title="Needs attention">
        <Card>
          <Text variant="body" tone={color.textSecondary}>
            {data.considered === 0
              ? 'No members are assigned to you yet.'
              : 'Everyone you coach is on track.'}
          </Text>
        </Card>
      </Section>
    );
  }

  const shown = data.items.slice(0, limit);
  return (
    <Section title="Needs attention">
      {shown.map((item) => (
        <AttentionRow key={item.member_id} item={item} onNavigate={onNavigate} />
      ))}
      {data.items.length > shown.length ? (
        <>
          <Divider />
          <Text variant="label" tone={color.textTertiary} align="center">
            {data.items.length - shown.length} more need a look
          </Text>
        </>
      ) : null}
    </Section>
  );
}

/* --------------------------------------------------------- owner daily brief */

const DIRECTION_ICON: Record<TrendDirection, IconName> = {
  up: 'trending-up-outline',
  down: 'trending-down-outline',
  flat: 'remove-outline',
};

function OwnerIssueCard({
  issue,
  onNavigate,
}: {
  issue: OwnerIssue;
  onNavigate: (route: string) => void;
}) {
  const styles = useThemedStyles(buildStyles);
  const meta = severityMeta(issue.severity);
  return (
    <Card gap="sm" style={[styles.card, { borderColor: alpha(meta.hue, 0.35) }]}>
      <Row gap="sm" align="flex-start">
        <View style={[styles.iconWrap, { backgroundColor: alpha(meta.hue, 0.12) }]}>
          <Ionicons name={meta.icon} size={16} color={meta.hue} />
        </View>
        <Stack gap="xxs" style={styles.grow}>
          <Row gap="xs">
            <Text variant="heading" style={styles.grow}>
              {issue.title}
            </Text>
            {issue.direction ? (
              <Ionicons
                name={DIRECTION_ICON[issue.direction]}
                size={15}
                color={color.textTertiary}
              />
            ) : null}
          </Row>
          <Text variant="body" tone={color.textSecondary}>
            {issue.summary}
          </Text>
        </Stack>
      </Row>

      {issue.evidence.length > 0 ? (
        <Stack gap="xxs" style={styles.evidence}>
          {issue.evidence.map((item) => (
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

      {issue.action?.route ? (
        <Row>
          <Spacer />
          <LinkButton
            title={issue.action.label}
            onPress={() => onNavigate(issue.action!.route!)}
          />
        </Row>
      ) : null}
    </Card>
  );
}

interface OwnerBriefProps {
  data: OwnerDailyBrief | null;
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  onNavigate: (route: string) => void;
  limit?: number;
}

/**
 * "What needs my attention today?" — a compact list of aggregate issues, each
 * with the count it was judged on, a direction where one is meaningful, and a
 * deep link. No revenue figure: GymFlow has no money model.
 */
export function OwnerDailyBriefSection({
  data,
  loading,
  error,
  onRetry,
  onNavigate,
  limit = 4,
}: OwnerBriefProps) {
  const styles = useThemedStyles(buildStyles);

  if (loading && !data) {
    return (
      <Section title="This morning">
        <Card gap="sm">
          <Skeleton width="65%" height={16} />
          <Skeleton width="90%" height={12} />
        </Card>
      </Section>
    );
  }

  if (error && !data) {
    const offline = error.code === OFFLINE_CODE;
    return (
      <Section title="This morning">
        <Banner tone="info" icon="cloud-offline-outline">
          {offline
            ? 'Your brief will load when you are back online.'
            : 'Your brief is unavailable right now.'}
        </Banner>
        {!offline ? <LinkButton title="Try again" onPress={onRetry} /> : null}
      </Section>
    );
  }

  if (!data) return null;

  if (data.issues.length === 0) {
    return (
      <Section title="This morning">
        <Card>
          <Text variant="body" tone={color.textSecondary}>
            {data.headline}
          </Text>
        </Card>
      </Section>
    );
  }

  const shown = data.issues.slice(0, limit);
  return (
    <Section title="This morning">
      <Card gap="xxs" style={styles.headline}>
        <Eyebrow>{data.scope}</Eyebrow>
        <Text variant="body">{data.headline}</Text>
      </Card>
      {shown.map((issue) => (
        <OwnerIssueCard key={issue.id} issue={issue} onNavigate={onNavigate} />
      ))}
      {data.issues.length > shown.length ? (
        <>
          <Divider />
          <Text variant="label" tone={color.textTertiary} align="center">
            {data.issues.length - shown.length} more on the list
          </Text>
        </>
      ) : null}
    </Section>
  );
}

/* ----------------------------------------------------- progression suggestion */

const ACTION_META: Record<
  ProgressionRecommendation['action'],
  { label: string; tone: Tone; hue: string }
> = {
  increase: { label: 'Add load', tone: 'positive', hue: color.status.positive },
  hold: { label: 'Hold', tone: 'info', hue: color.status.info },
  reduce: { label: 'Back off', tone: 'caution', hue: color.status.warning },
  insufficient_data: { label: 'Not yet', tone: 'neutral', hue: color.textTertiary },
};

/**
 * The next-session suggestion for one lift: LAST PERFORMANCE, RECOMMENDED NEXT
 * and WHY. It is advice that sits beside the trainer's programme — the caption
 * says so — never a change to it.
 */
export function RecommendationCard({
  data,
  loading,
  error,
}: {
  data: ProgressionRecommendation | null;
  loading: boolean;
  error: ApiError | null;
}) {
  const styles = useThemedStyles(buildStyles);

  if (loading && !data) {
    return (
      <Card gap="sm">
        <Eyebrow>Recommended next</Eyebrow>
        <Skeleton width="55%" height={14} />
        <Skeleton width="85%" height={12} />
      </Card>
    );
  }
  // A failed suggestion is not worth a visible error — it is an enhancement.
  if ((error && !data) || !data) return null;

  const meta = ACTION_META[data.action];
  const hasLast = data.last_weight_kg != null && data.last_reps != null;
  const deltaLabel =
    data.action === 'insufficient_data' || data.delta_kg == null
      ? null
      : data.delta_kg > 0
        ? `+${data.delta_kg} kg`
        : data.delta_kg < 0
          ? `${data.delta_kg} kg`
          : 'same weight';

  return (
    <Card gap="sm" style={[styles.card, { borderColor: alpha(meta.hue, 0.35) }]}>
      <Row gap="sm">
        <Eyebrow>Recommended next</Eyebrow>
        <Spacer />
        <Badge label={meta.label} tone={meta.tone} />
      </Row>

      {data.action === 'insufficient_data' ? (
        <Text variant="body" tone={color.textSecondary}>
          {data.rationale}
        </Text>
      ) : (
        <>
          <Row gap="lg" align="baseline">
            <Stack gap="xxs">
              <Text variant="label" tone={color.textTertiary}>
                Last performance
              </Text>
              <Text variant="mono" tone={color.textSecondary}>
                {hasLast
                  ? `${data.last_weight_kg} kg × ${data.last_reps}${
                      data.last_rpe != null ? ` · RPE ${data.last_rpe}` : ''
                    }`
                  : '—'}
              </Text>
            </Stack>
            <Spacer />
            <Stack gap="xxs" align="flex-end">
              <Text variant="label" tone={color.textTertiary}>
                Next
              </Text>
              <Text variant="heading" tone={meta.hue}>
                {data.recommended_weight_kg != null ? `${data.recommended_weight_kg} kg` : '—'}
              </Text>
              {deltaLabel ? (
                <Text variant="label" tone={color.textTertiary}>
                  {deltaLabel}
                  {data.target_reps ? ` · ${data.target_reps} reps` : ''}
                </Text>
              ) : null}
            </Stack>
          </Row>
          <Text variant="body" tone={color.textSecondary}>
            {data.rationale}
          </Text>
        </>
      )}

      <Text variant="label" tone={color.textTertiary}>
        A suggestion from your logged sets — not a change to your programme.
      </Text>
    </Card>
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
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 6,
    },
  });
}
