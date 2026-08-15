/**
 * The four card shapes GymFlow actually needs.
 *
 * Four, deliberately. The brief asks not to overuse cards, and the way that
 * happens is a screen inventing a fifth shape for content that was really a
 * row. If information does not fit one of these, it probably belongs in a
 * `Row` under a `Section` heading rather than inside a box of its own.
 *
 * `StatCard`   one number, with optional context
 * `SessionCard` something scheduled, with a time and a status
 * `ProgressCard` a quantity moving toward a target
 * `AlertCard`  something that needs a person to act
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Avatar } from './brand';
import { Badge, ProgressBar } from './controls';
import { Card, Eyebrow, Row, Spacer, Stack, Text } from './primitives';
import { alpha, color, hairline, motion, radii, space, toneColor, type Tone } from './tokens';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * A card that may be tappable.
 *
 * Wrapping the press behaviour once means every card gets the same pressed
 * treatment and the same accessibility role, instead of each screen deciding.
 *
 * Exported as `TappableCard` for the screens whose content fits none of the
 * four card shapes but which still need the press treatment — a `Pressable`
 * wrapped round a `Card` gives no feedback at all, so the row reads as inert.
 */
function Tappable({
  onPress,
  accessibilityLabel,
  style,
  children,
  testID,
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
  testID?: string;
}) {
  if (!onPress) {
    return (
      <View
        style={style}
        testID={testID}
        accessible={accessibilityLabel !== undefined}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [
        style,
        pressed
          ? {
              backgroundColor: color.surfaceOverlay,
              borderColor: color.borderStrong,
            }
          : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

/* -------------------------------------------------------------- stat card */

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Small context under the number: units, a denominator, a date. */
  hint?: string;
  tone?: Tone;
  colorOverride?: string;
  icon?: IconName;
  onPress?: () => void;
  testID?: string;
}

/**
 * One number, stated plainly.
 *
 * The value dominates and the label is quiet, because someone scanning a row
 * of these is reading the figures, not the captions.
 */
export function StatCard({
  label,
  value,
  hint,
  tone,
  colorOverride,
  icon,
  onPress,
  testID,
}: StatCardProps) {
  const valueColor = colorOverride ?? (tone ? toneColor[tone] : color.text);
  return (
    <Tappable
      onPress={onPress}
      accessibilityLabel={`${label}: ${value}`}
      style={styles.statCard}
      testID={testID}
    >
      <Row gap="xs">
        <Eyebrow>{label}</Eyebrow>
        <Spacer />
        {icon ? <Ionicons name={icon} size={14} color={color.textTertiary} /> : null}
      </Row>
      <Text style={[styles.statValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
      {hint ? (
        <Text variant="label" tone={color.textTertiary} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Tappable>
  );
}

/** A row of stat cards that share the available width evenly. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <Row gap="sm" align="stretch">
      {children}
    </Row>
  );
}

/* ----------------------------------------------------------- session card */

export interface SessionCardProps {
  /** The person or class this session is with. */
  title: string;
  subtitle?: string;
  /** Pre-formatted by the caller — the design system does not format times. */
  time?: string;
  /** What kind of session, shown as a quiet eyebrow. */
  kind?: string;
  kindIcon?: IconName;
  status?: { label: string; tone?: Tone; colorOverride?: string };
  onPress?: () => void;
  /** A tertiary action rendered under the row. */
  footer?: React.ReactNode;
  testID?: string;
}

/**
 * Anything scheduled: a PT session, a class, a supervised workout.
 *
 * The time sits in a fixed-width column so a list of these aligns down the
 * left edge and can be scanned without reading each row.
 */
export function SessionCard({
  title,
  subtitle,
  time,
  kind,
  kindIcon,
  status,
  onPress,
  footer,
  testID,
}: SessionCardProps) {
  return (
    <Tappable
      onPress={onPress}
      accessibilityLabel={kind ? `${kind}: ${title}` : title}
      style={styles.card}
      testID={testID}
    >
      <Stack gap="sm">
        {kind || status ? (
          <Row gap="sm">
            {kindIcon ? <Ionicons name={kindIcon} size={16} color={color.textTertiary} /> : null}
            {kind ? <Eyebrow>{kind}</Eyebrow> : null}
            <Spacer />
            {status ? (
              <Badge label={status.label} tone={status.tone} colorOverride={status.colorOverride} />
            ) : null}
          </Row>
        ) : null}

        <Row gap="md">
          {time ? (
            <Text variant="mono" tone={color.textSecondary} style={styles.sessionTime}>
              {time}
            </Text>
          ) : null}
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="body">{title}</Text>
            {subtitle ? (
              <Text variant="label" tone={color.textTertiary}>
                {subtitle}
              </Text>
            ) : null}
          </Stack>
          {onPress ? (
            <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
          ) : null}
        </Row>

        {footer}
      </Stack>
    </Tappable>
  );
}

/* ---------------------------------------------------------- progress card */

export interface ProgressCardProps {
  label: string;
  /** The headline figure, e.g. "12" in "12 / 45". */
  value: string | number;
  /** The denominator, rendered quieter. */
  total?: string | number;
  /** 0–100. */
  percent: number;
  caption?: string;
  tone?: Tone;
  colorOverride?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}

/**
 * A quantity moving toward a target: journey day, PT balance, class capacity.
 *
 * The numerator and denominator are separate props rather than one string so
 * they can carry different weight — which is what makes "12 / 45" read as
 * progress rather than as a fraction.
 */
export function ProgressCard({
  label,
  value,
  total,
  percent,
  caption,
  tone = 'brand',
  colorOverride,
  trailing,
  onPress,
  testID,
}: ProgressCardProps) {
  return (
    <Tappable onPress={onPress} accessibilityLabel={label} style={styles.card} testID={testID}>
      <Stack gap="sm">
        <Row gap="sm">
          <Eyebrow>{label}</Eyebrow>
          <Spacer />
          {trailing}
        </Row>

        <Row gap="sm" align="baseline">
          <Text variant="display">{value}</Text>
          {total !== undefined ? (
            <Text variant="heading" tone={color.textTertiary}>
              / {total}
            </Text>
          ) : null}
        </Row>

        <ProgressBar value={percent} tone={tone} colorOverride={colorOverride} />

        {caption ? (
          <Text variant="label" tone={color.textSecondary}>
            {caption}
          </Text>
        ) : null}
      </Stack>
    </Tappable>
  );
}

/* ------------------------------------------------------------- alert card */

export interface AlertCardProps {
  title: string;
  body?: string;
  tone?: Tone;
  /** Shown to the right of the body — usually a timestamp. */
  meta?: string;
  onPress?: () => void;
  action?: React.ReactNode;
  testID?: string;
}

/**
 * Something that needs a person.
 *
 * The tone is carried by a single vertical rule rather than a tinted fill: a
 * list of ten alerts with ten coloured backgrounds is unreadable, and the rule
 * still lets severity be scanned down the left edge.
 */
export function AlertCard({
  title,
  body,
  tone = 'info',
  meta,
  onPress,
  action,
  testID,
}: AlertCardProps) {
  const hue = toneColor[tone];
  return (
    <Tappable onPress={onPress} accessibilityLabel={title} style={styles.alertCard} testID={testID}>
      <View style={[styles.alertRule, { backgroundColor: hue }]} />
      <Stack gap="xxs" style={styles.grow}>
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        {body ? (
          <Text variant="label" tone={color.textSecondary} numberOfLines={3}>
            {body}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="label" tone={color.textTertiary}>
            {meta}
          </Text>
        ) : null}
        {action}
      </Stack>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={color.textTertiary} /> : null}
    </Tappable>
  );
}

/**
 * An inline message about the state of the screen itself, rather than about a
 * record. Used for offline, validation and confirmation.
 */
export function Banner({
  tone = 'info',
  children,
  icon,
  testID,
}: {
  tone?: Tone;
  children: React.ReactNode;
  icon?: IconName;
  testID?: string;
}) {
  const hue = toneColor[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'critical' ? 'alert' : undefined}
      style={[styles.banner, { borderColor: alpha(hue, 0.33), backgroundColor: alpha(hue, 0.08) }]}
    >
      {icon ? <Ionicons name={icon} size={18} color={hue} /> : null}
      {typeof children === 'string' ? (
        <Text variant="label" tone={hue} style={styles.grow}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tappableCard: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radii.lg,
    backgroundColor: color.surfaceRaised,
    ...hairline,
  },
  personRow: {
    padding: space.md,
    borderRadius: radii.md,
    backgroundColor: color.surfaceRaised,
    ...hairline,
  },
  grow: { flex: 1 },
  card: {
    backgroundColor: color.surfaceRaised,
    borderRadius: radii.lg,
    ...hairline,
    padding: space.lg,
  },
  statCard: {
    flex: 1,
    minWidth: 92,
    backgroundColor: color.surfaceRaised,
    borderRadius: radii.md,
    ...hairline,
    padding: space.md,
    gap: 2,
  },
  statValue: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  sessionTime: { minWidth: 52 },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surfaceRaised,
    borderRadius: radii.md,
    ...hairline,
    padding: space.md,
    minHeight: 64,
  },
  alertRule: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: space.md,
  },
});

/* -------------------------------------------------------------- person row */

export interface PersonRowProps {
  name: string;
  /** The one line of context that identifies this person on this screen. */
  detail?: string | null;
  /** Optional right-hand marker — a status badge, a count, a chevron's peer. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}

/**
 * A person in a list: avatar, name, one line about them, a way in.
 *
 * Rosters appear on several owner and trainer screens and each had grown its
 * own row with the same three parts and different style keys. Keeping it a row
 * rather than a card is deliberate — a roster of twenty trainers as twenty
 * cards is a scroll, not a list.
 */
export function PersonRow({ name, detail, trailing, onPress, testID }: PersonRowProps) {
  return (
    <Tappable
      onPress={onPress}
      accessibilityLabel={onPress ? `Open ${name}` : name}
      style={styles.personRow}
      testID={testID}
    >
      <Row gap="md">
        <Avatar name={name} size={40} />
        <Stack gap="xxs" style={styles.grow}>
          <Text variant="body">{name}</Text>
          {detail ? (
            <Text variant="label" tone={color.textTertiary} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </Stack>
        {trailing}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={color.textTertiary} /> : null}
      </Row>
    </Tappable>
  );
}

/** The shared press treatment, for content that is not one of the four shapes. */
export function TappableCard({
  onPress,
  accessibilityLabel,
  style,
  children,
  testID,
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <Tappable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={[styles.tappableCard, ...(Array.isArray(style) ? style : style ? [style] : [])]}
      testID={testID}
    >
      {children}
    </Tappable>
  );
}
