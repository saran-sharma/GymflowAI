/**
 * Things a person acts on: buttons, badges, inputs, progress.
 *
 * Every control here meets the 48pt tap target, states its accessibility role,
 * and expresses disabled/busy through the shared motion tokens rather than a
 * per-screen opacity guess.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef, useState } from 'react';
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

import { Row, Spacer, Stack, Text } from './primitives';
import {
  alpha,
  color,
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

type IconName = keyof typeof Ionicons.glyphMap;

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
  const isDisabled = disabled || loading;

  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: color.brand, fg: color.text, border: 'transparent' },
    secondary: { bg: color.surfaceOverlay, fg: color.text, border: color.border },
    destructive: { bg: alpha(color.status.critical, 0.14), fg: color.brandAccent, border: color.brandDeep },
    ghost: { bg: 'transparent', fg: color.textSecondary, border: 'transparent' },
  };

  const sizing: Record<ButtonSize, { height: number; font: number; radius: number; tracking: number }> = {
    sm: { height: control.height.sm, font: 13, radius: radii.sm, tracking: 0.3 },
    md: { height: control.height.md, font: 15, radius: radii.md, tracking: 0.3 },
    lg: { height: control.height.lg, font: 17, radius: radii.lg, tracking: 0.3 },
    hero: { height: control.heightHero, font: 24, radius: radii.xl, tracking: 1.5 },
  };

  const tone = palette[variant];
  const dimension = sizing[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          height: dimension.height,
          borderRadius: dimension.radius,
          backgroundColor: tone.bg,
          borderColor: tone.border,
          alignSelf: block ? 'stretch' : 'flex-start',
          opacity: isDisabled ? motion.disabledOpacity : pressed ? motion.pressOpacity : 1,
          transform: [{ scale: pressed && !isDisabled ? motion.pressScale : 1 }],
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
              fontWeight: '800',
              letterSpacing: dimension.tracking,
            }}
          >
            {title}
          </Text>
        </Row>
      )}
    </Pressable>
  );
}

/** A tappable label with no chrome, for tertiary actions inside a card. */
export function LinkButton({
  title,
  tone = color.brandAccent,
  disabled,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { title: string; tone?: string }) {
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
  const [revealed, setRevealed] = useState(false);
  const invalid = Boolean(error);

  return (
    <Stack gap="xs">
      {label ? <Text variant="caption" caps tone={color.textTertiary}>{label}</Text> : null}

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

export function ProgressBar({ value, tone = 'brand', colorOverride, height = 6 }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <View
        style={{
          width: `${clamped}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: colorOverride ?? toneColor[tone],
        }}
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

const styles = StyleSheet.create({
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
});
