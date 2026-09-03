/**
 * Things a person acts on: buttons, badges, inputs, progress.
 *
 * Every control here meets the 48pt tap target, states its accessibility role,
 * and expresses disabled/busy through the shared motion tokens rather than a
 * per-screen opacity guess.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef, useState } from 'react';
import { useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Motion, usePressMotion, useTravel } from './motion';
import { Row, Spacer, Stack, Text } from './primitives';
import {
  alpha,
  color,
  font,
  control,
  hairline,
  HIT_TARGET,
  motion,
  radii,
  space,
  text as textTokens,
  toneColor,
  type Tone,
} from './tokens';
import { useThemedStyles } from './useThemedStyles';

type IconName = keyof typeof Ionicons.glyphMap;

/** Reanimated drives SVG attributes only through a wrapped component. */
const AnimatedCircle = Motion.createAnimatedComponent(Circle);

/* ----------------------------------------------------------------- button */

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'hero';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconName;
  /** Fills the available width. Buttons in a Stack usually should. */
  block?: boolean;
  style?: ViewStyle;
}

/**
 * Four variants, and no more.
 *
 * `primary` is the one action a screen wants; there should rarely be two on
 * screen. `destructive` is reserved for actions that lose work or money —
 * using it for "cancel" is what teaches people to ignore red.
 */
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  block = true,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const styles = useThemedStyles(buildControlStyles);
  const isDisabled = disabled || loading;

  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: color.brand, fg: color.text, border: 'transparent' },
    secondary: { bg: color.surfaceOverlay, fg: color.text, border: color.border },
    destructive: {
      bg: alpha(color.status.critical, 0.14),
      fg: color.brandAccent,
      border: color.brandDeep,
    },
    ghost: { bg: 'transparent', fg: color.textSecondary, border: 'transparent' },
  };

  const sizing: Record<
    ButtonSize,
    { height: number; font: number; radius: number; tracking: number }
  > = {
    sm: { height: control.height.sm, font: 13, radius: radii.sm, tracking: 0.3 },
    md: { height: control.height.md, font: 15, radius: radii.md, tracking: 0.3 },
    lg: { height: control.height.lg, font: 17, radius: radii.lg, tracking: 0.3 },
    hero: { height: control.heightHero, font: 24, radius: radii.xl, tracking: 1.5 },
  };

  const tone = palette[variant];
  const dimension = sizing[size];
  const press = usePressMotion(!isDisabled);

  return (
    <Motion.View style={[press.style, { alignSelf: block ? 'stretch' : 'flex-start' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !!isDisabled, busy: loading }}
        disabled={isDisabled}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.button,
          {
            height: dimension.height,
            borderRadius: dimension.radius,
            backgroundColor: tone.bg,
            borderColor: tone.border,
            alignSelf: 'stretch',
            opacity: isDisabled ? motion.disabledOpacity : 1,
          },
          style,
        ]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={tone.fg} />
        ) : (
          <Row gap="sm" justify="center">
            {icon ? <Ionicons name={icon} size={dimension.font + 4} color={tone.fg} /> : null}
            <Text
              style={{
                color: tone.fg,
                fontSize: dimension.font,
                fontFamily: font.sansSemi,
                letterSpacing: dimension.tracking,
              }}
            >
              {title}
            </Text>
          </Row>
        )}
      </Pressable>
    </Motion.View>
  );
}

/** A tappable label with no chrome, for tertiary actions inside a card. */
export function LinkButton({
  title,
  tone = color.brandAccent,
  disabled,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { title: string; tone?: string }) {
  const styles = useThemedStyles(buildControlStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.link, { opacity: pressed || disabled ? 0.6 : 1 }]}
      {...rest}
    >
      <Text variant="label" tone={tone}>
        {title}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ badge */

export interface BadgeProps {
  label: string;
  tone?: Tone;
  /** Any token colour, when the tone is data-driven rather than semantic. */
  colorOverride?: string;
  /** Solid rather than tinted. Use sparingly — for the one state that matters. */
  solid?: boolean;
}

/** A compact status marker. Tinted by default so a list of them stays calm. */
export function Badge({ label, tone = 'neutral', colorOverride, solid = false }: BadgeProps) {
  const styles = useThemedStyles(buildControlStyles);
  const hue = colorOverride ?? toneColor[tone];
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: solid ? hue : alpha(hue, 0.12),
          borderColor: solid ? hue : alpha(hue, 0.33),
        },
      ]}
    >
      <Text
        variant="caption"
        caps
        tone={solid ? color.textInverse : hue}
        style={styles.badgeLabel}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/** A small filled dot, for legends and inline status. */
export function Dot({ tone = 'neutral', colorOverride }: { tone?: Tone; colorOverride?: string }) {
  const styles = useThemedStyles(buildControlStyles);
  return <View style={[styles.dot, { backgroundColor: colorOverride ?? toneColor[tone] }]} />;
}

/* ------------------------------------------------------------------ input */

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Shown under the field in the critical tone. Also sets the error border. */
  error?: string | null;
  hint?: string;
  /** Renders the show/hide eye and manages masking. */
  secure?: boolean;
  icon?: IconName;
  /** Test hook for the show/hide control, which is not the field itself. */
  toggleTestID?: string;
}

/**
 * A labelled text field.
 *
 * The error is part of the component rather than something each screen renders
 * beneath it, so the message, the border and the accessibility state can never
 * disagree about whether the field is valid.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, secure = false, icon, toggleTestID, ...rest },
  ref,
) {
  const styles = useThemedStyles(buildControlStyles);
  const [revealed, setRevealed] = useState(false);
  const invalid = Boolean(error);

  return (
    <Stack gap="xs">
      {label ? (
        <Text variant="caption" caps tone={color.textTertiary}>
          {label}
        </Text>
      ) : null}

      <View style={styles.inputWrap}>
        {icon ? (
          <Ionicons name={icon} size={18} color={color.textTertiary} style={styles.inputIcon} />
        ) : null}

        <TextInput
          ref={ref}
          placeholderTextColor={color.textTertiary}
          secureTextEntry={secure && !revealed}
          accessibilityLabel={label}
          accessibilityState={{ disabled: rest.editable === false }}
          style={[
            styles.input,
            icon ? styles.inputWithIcon : null,
            secure ? styles.inputWithAction : null,
            invalid ? styles.inputInvalid : null,
          ]}
          {...rest}
        />

        {secure ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            testID={toggleTestID}
            style={styles.inputAction}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={color.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text variant="label" tone={color.brandAccent}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="label" tone={color.textTertiary}>
          {hint}
        </Text>
      ) : null}
    </Stack>
  );
});

/* --------------------------------------------------------------- progress */

export interface ProgressBarProps {
  /** 0–100. Values outside are clamped rather than overflowing the track. */
  value: number;
  tone?: Tone;
  colorOverride?: string;
  height?: number;
}

export function ProgressBar({
  value,
  tone = 'brand',
  colorOverride,
  height = 6,
}: ProgressBarProps) {
  const styles = useThemedStyles(buildControlStyles);
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const travelled = useTravel(clamped);
  const fill = useAnimatedStyle(() => ({ width: `${travelled.value}%` }));

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      accessible
      accessibilityRole="progressbar"
      /* The announced value is the real one. A screen reader narrating a bar
         sweeping up to 40% would be worse than useless. */
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <Motion.View
        style={[
          fill,
          {
            height: '100%',
            borderRadius: height / 2,
            backgroundColor: colorOverride ?? toneColor[tone],
          },
        ]}
      />
    </View>
  );
}

/** A labelled metric with its own progress track. */
export function MetricRow({
  label,
  value,
  progress,
  tone = 'brand',
  colorOverride,
}: {
  label: string;
  value: string;
  progress?: number;
  tone?: Tone;
  colorOverride?: string;
}) {
  return (
    <Stack gap="xs">
      <Row>
        <Text variant="label" tone={color.textSecondary}>
          {label}
        </Text>
        <Spacer />
        <Text variant="mono" tone={colorOverride ?? color.text}>
          {value}
        </Text>
      </Row>
      {progress !== undefined ? (
        <ProgressBar value={progress} tone={tone} colorOverride={colorOverride} />
      ) : null}
    </Stack>
  );
}

/**
 * One shared factory rather than a module-scope `StyleSheet.create` — see
 * `cards.tsx` for the same pattern and why. `button`/`badge`/`dot` do not
 * strictly need it (no colour token inside), but keeping every control's
 * styles behind one call is simpler to audit than splitting hairs per key.
 */
function buildControlStyles() {
  return StyleSheet.create({
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      paddingHorizontal: space.lg,
    },
    link: { paddingVertical: space.sm, alignSelf: 'flex-start' },
    badge: {
      paddingHorizontal: space.sm,
      paddingVertical: 4,
      borderRadius: radii.pill,
      borderWidth: 1,
      alignSelf: 'flex-start',
      maxWidth: 180,
    },
    badgeLabel: { letterSpacing: 0.6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    inputWrap: { justifyContent: 'center' },
    input: {
      ...textTokens.body,
      color: color.text,
      backgroundColor: color.surfaceInput,
      ...hairline,
      borderRadius: radii.md,
      paddingHorizontal: space.lg,
      height: control.height.lg,
    },
    inputWithIcon: { paddingLeft: space.xxl + space.xs },
    inputWithAction: { paddingRight: HIT_TARGET },
    inputInvalid: { borderColor: color.brandDeep },
    inputIcon: { position: 'absolute', left: space.lg, zIndex: 1 },
    inputAction: {
      position: 'absolute',
      right: space.xs,
      height: HIT_TARGET,
      width: HIT_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    track: { width: '100%', backgroundColor: color.surfaceOverlay, overflow: 'hidden' },
    ringCentre: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 1 },
  });
}

/* -------------------------------------------------------------- progress ring */

export interface ProgressRingProps {
  /** 0–100. Values outside the range are clamped rather than drawn wrong. */
  value: number;
  /** The figure inside the ring — usually a fraction, e.g. "7/9". */
  label?: string;
  /** One quiet word under it, e.g. "workout". */
  caption?: string;
  size?: number;
  thickness?: number;
  tone?: Tone;
  colorOverride?: string;
  accessibilityLabel?: string;
}

/**
 * A closed progress track, for the one figure a screen is really about.
 *
 * A bar says "how far along"; a ring says "how much of the whole", and reads
 * at a glance from arm's length, which is how a trainer looks at a phone
 * between sets. Use it once per screen — a page of rings is a dashboard nobody
 * can rank.
 */
export function ProgressRing({
  value,
  label,
  caption,
  size = 84,
  thickness = 7,
  tone = 'brand',
  colorOverride,
  accessibilityLabel,
}: ProgressRingProps) {
  const styles = useThemedStyles(buildControlStyles);
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const hue = colorOverride ?? toneColor[tone];

  // Moving the dash offset is what makes the arc fill round the circle rather
  // than appear already complete.
  const travelled = useTravel(clamped);
  const sweep = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - travelled.value / 100),
  }));

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color.surfaceOverlay}
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
          animatedProps={sweep}
          /* Start at twelve o'clock rather than three. */
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {label || caption ? (
        <View style={[styles.ringCentre, { width: size, height: size }]}>
          {label ? (
            <Text variant="heading" numberOfLines={1}>
              {label}
            </Text>
          ) : null}
          {caption ? (
            <Text variant="caption" caps tone={color.textTertiary} numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- countdown */

export interface CountdownProps {
  /** Seconds left. */
  remaining: number;
  /** The full duration this countdown started from, for the arc proportion. */
  total: number;
  size?: number;
  thickness?: number;
  tone?: Tone;
  colorOverride?: string;
  /** Overrides the centre figure. Defaults to `m:ss` of `remaining`. */
  label?: string;
  caption?: string;
  accessibilityLabel?: string;
}

/** `1:30` — a countdown reads as a clock, so it is formatted as one. */
function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * A ring that empties as a timer runs down.
 *
 * The arc travels — it does not tick in steps — so the eye reads "time
 * draining" rather than "number changed". The centre figure is the real clock
 * value and simply updates; it is a measurement, not a count-up. When the
 * timer reaches zero the ring is empty and the colour turns positive: the rest
 * is over, not failed.
 *
 * Reduced motion snaps the arc to each value instead of sweeping.
 */
export function Countdown({
  remaining,
  total,
  size = 72,
  thickness = 6,
  tone = 'brand',
  colorOverride,
  label,
  caption,
  accessibilityLabel,
}: CountdownProps) {
  const styles = useThemedStyles(buildControlStyles);
  const finished = remaining <= 0;
  const fraction =
    total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const hue = finished
    ? toneColor.positive
    : (colorOverride ?? toneColor[tone]);

  const travelled = useTravel(fraction, motion.base);
  const sweep = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - travelled.value / 100),
  }));

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={accessibilityLabel ?? `${clock(remaining)} remaining`}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color.surfaceOverlay}
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
          animatedProps={sweep}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[styles.ringCentre, { width: size, height: size }]}>
        <Text variant="mono" tone={finished ? color.status.positive : color.text} numberOfLines={1}>
          {label ?? clock(remaining)}
        </Text>
        {caption ? (
          <Text variant="caption" caps tone={color.textTertiary} numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
