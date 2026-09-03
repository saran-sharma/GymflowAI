/**
 * What a screen shows when it has nothing to show: loading, skeletons, empty
 * and error.
 *
 * These are the states most likely to be improvised per screen, which is why
 * they are components rather than guidance. An empty list and a failed request
 * look different here on purpose — conflating them is how "no classes yet"
 * ends up looking like a bug.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button } from './controls';
import { Motion, useReducedMotion, usePulse } from './motion';
import { Card, Row, Screen, Stack, Text } from './primitives';
import { alpha, color, motion as motionTokens, radii, space, toneColor, type Tone } from './tokens';
import { useThemedStyles } from './useThemedStyles';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

type IconName = keyof typeof Ionicons.glyphMap;

/* ---------------------------------------------------------------- loading */

/** A centred spinner for a screen that has not rendered anything yet. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <Screen>
      <View style={styles.centred} accessibilityRole="progressbar" accessibilityLabel={label}>
        <ActivityIndicator color={color.brand} size="large" />
        <Text variant="label" tone={color.textTertiary} align="center">
          {label}
        </Text>
      </View>
    </Screen>
  );
}

/* --------------------------------------------------------------- skeleton */

/**
 * A pulsing placeholder block.
 *
 * Skeletons are preferable to a spinner where the shape of the result is known
 * — the page does not reflow when the data lands, which is the actual cost of
 * a spinner. Where the shape is unknown, use `Loading`.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = radii.sm,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  // The pulse runs on the UI thread. A placeholder driven from JS stops
  // animating exactly when the app is busiest — parsing the response it stands
  // in for — so the one animation whose entire job is to say "something is
  // happening" was the one guaranteed to freeze.
  const pulse = usePulse();

  return (
    <Motion.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: color.surfaceOverlay },
        pulse,
        style,
      ]}
    />
  );
}

/** A placeholder shaped like a stat card. */
export function SkeletonStat() {
  const themed = useThemedStyles(() => ({
    skeletonStat: {
      flex: 1,
      gap: space.sm,
      padding: space.md,
      borderRadius: radii.md,
      backgroundColor: color.surfaceRaised,
      borderWidth: 1,
      borderColor: color.border,
    },
  }));
  return (
    <View style={themed.skeletonStat}>
      <Skeleton width="60%" height={10} />
      <Skeleton width="45%" height={26} />
    </View>
  );
}

/** A placeholder shaped like a session or alert row. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <Card gap="sm">
      <Skeleton width="35%" height={10} />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '55%' : '85%'} height={14} />
      ))}
    </Card>
  );
}

/**
 * A whole-screen placeholder: an optional row of stats over a few cards.
 *
 * `stats` matches the screen being waited on — a list that opens with three
 * tiles should reserve them, and one that opens straight into rows should not,
 * or the placeholder promises a shape the real screen never fills.
 */
export function SkeletonScreen({ cards = 3, stats = true }: { cards?: number; stats?: boolean }) {
  return (
    <Screen>
      <View style={styles.skeletonScreen}>
        {stats ? (
          <Row gap="sm" align="stretch">
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </Row>
        ) : null}
        {Array.from({ length: cards }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ empty */

export interface EmptyStateProps {
  title: string;
  detail?: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
}

/**
 * Nothing here yet — and that is fine.
 *
 * Always says *why* it is empty and what would fill it, because "No data" tells
 * someone standing in a gym nothing they can act on.
 */
export function EmptyState({ title, detail, icon = 'file-tray-outline', action }: EmptyStateProps) {
  return (
    <View style={styles.centred}>
      <Ionicons name={icon} size={40} color={color.textTertiary} />
      <Text variant="heading" align="center">
        {title}
      </Text>
      {detail ? (
        <Text variant="body" tone={color.textSecondary} align="center" style={styles.detail}>
          {detail}
        </Text>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <Button title={action.label} variant="secondary" onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ error */

export interface ErrorStateProps {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  /** Offline reads differently from a server fault, so it gets its own icon. */
  offline?: boolean;
}

/**
 * Something failed.
 *
 * Distinct from `EmptyState` because the recovery differs: an empty list needs
 * data to exist, a failure needs a retry.
 */
export function ErrorState({
  title = 'Something went wrong',
  detail,
  onRetry,
  offline = false,
}: ErrorStateProps) {
  return (
    <View style={styles.centred}>
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
        size={40}
        color={color.brand}
      />
      <Text variant="heading" align="center">
        {offline ? 'No connection' : title}
      </Text>
      {detail ? (
        <Text variant="body" tone={color.textSecondary} align="center" style={styles.detail}>
          {detail}
        </Text>
      ) : null}
      {onRetry ? (
        <View style={styles.action}>
          <Button title="Try again" variant="secondary" icon="refresh" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

/** The persistent offline bar, shown above content that needs the server. */
export function OfflineNotice({ message }: { message: string }) {
  const themed = useThemedStyles(() => ({
    offline: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.sm,
      backgroundColor: `${color.brandDeep}22`,
      borderColor: `${color.brand}55`,
      borderWidth: 1,
      borderRadius: radii.md,
      padding: space.md,
    },
  }));
  return (
    <View style={themed.offline} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={18} color={color.brandAccent} />
      <Text variant="label" tone={color.brandAccent} style={styles.grow}>
        {message}
      </Text>
    </View>
  );
}

/* ---------------------------------------------------------- success check */

export interface SuccessCheckProps {
  size?: number;
  tone?: Tone;
  colorOverride?: string;
  /** Announced to a screen reader. The moment, not the shape: "Checked in". */
  accessibilityLabel?: string;
}

/**
 * A circle that closes and a tick that draws inside it, once.
 *
 * The one "something good just happened" mark in the app — a valid QR scan, a
 * recorded check-in, a finished workout. It is a confirmation, not a
 * celebration: no confetti, no bounce, nothing to dismiss. The stroke sweep is
 * ~260ms and the tick follows it; the whole thing is under `motion.slow` and
 * never gates a tap.
 *
 * One-shot by construction — it animates on mount. To replay it, remount with
 * a changing `key`. Reduced motion draws it complete with no sweep.
 */
export function SuccessCheck({
  size = 64,
  tone = 'positive',
  colorOverride,
  accessibilityLabel,
}: SuccessCheckProps) {
  const reduce = useReducedMotion();
  const progress = useSharedValue(reduce ? 1 : 0);
  const hue = colorOverride ?? toneColor[tone];

  const thickness = Math.max(3, size * 0.075);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  // A tick sitting in the lower-left third of the box, drawn as one stroke.
  const tickPath = `M ${size * 0.3} ${size * 0.52} L ${size * 0.44} ${size * 0.66} L ${size * 0.7} ${size * 0.36}`;
  const tickLength = size * 0.62;

  useEffect(() => {
    if (reduce) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: motionTokens.slow + 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, reduce]);

  const ringProps = useAnimatedProps(() => {
    const swept = Math.min(1, progress.value / 0.6);
    return { strokeDashoffset: circumference * (1 - swept) };
  });
  const tickProps = useAnimatedProps(() => {
    const drawn = Math.max(0, (progress.value - 0.5) / 0.5);
    return { strokeDashoffset: tickLength * (1 - drawn) };
  });

  return (
    <View
      style={{ width: size, height: size }}
      accessible={accessibilityLabel !== undefined}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={alpha(hue, 0.18)}
          strokeWidth={thickness}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={hue}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={ringProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <AnimatedPath
          d={tickPath}
          stroke={hue}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={`${tickLength} ${tickLength}`}
          animatedProps={tickProps}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.sm,
  },
  detail: { maxWidth: 320 },
  action: { marginTop: space.md, minWidth: 180 },
  skeletonScreen: { padding: space.lg, gap: space.md },
});
