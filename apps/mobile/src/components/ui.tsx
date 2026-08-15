/**
 * The shared surface of the app.
 *
 * Everything premium about SLAM's look lives here — matte cards, one red
 * accent, big tap targets — so a screen composes rather than restyles.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, HIT_TARGET, radius, spacing, typography } from '../theme';

/* ------------------------------------------------------------------ layout */

export function Screen({
  children,
  edges = ['top'],
  style,
  ...rest
}: ViewProps & { edges?: Edge[] }) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <View style={[styles.screenInner, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function Body({ children, contentContainerStyle, ...rest }: ScrollViewProps) {
  return (
    <ScrollView
      style={styles.body}
      contentContainerStyle={[styles.bodyContent, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function Row({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.row, style]} {...rest}>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

/* -------------------------------------------------------------------- text */

type TypeName = keyof typeof typography;

export function Txt({
  variant = 'body',
  color = colors.text,
  style,
  children,
  ...rest
}: TextProps & { variant?: TypeName; color?: string }) {
  return (
    <Text style={[typography[variant], { color }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Eyebrow({ children, color = colors.textFaint }: { children: React.ReactNode; color?: string }) {
  return (
    <Txt variant="caption" color={color} style={styles.eyebrow}>
      {typeof children === 'string' ? children.toUpperCase() : children}
    </Txt>
  );
}

/* ------------------------------------------------------------------ inputs */

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'hero';
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: colors.brand, fg: colors.text, border: 'transparent' },
    secondary: { bg: colors.raised, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.textMuted, border: 'transparent' },
    danger: { bg: colors.raised, fg: colors.brandSoft, border: colors.brandDeep },
  }[variant];

  const sizing = {
    md: { height: HIT_TARGET, font: 15 as const, radius: radius.md },
    lg: { height: 58, font: 17 as const, radius: radius.lg },
    // The trainer's one job. It must be unmissable and reachable with a thumb.
    hero: { height: 128, font: 24 as const, radius: radius.xl },
  }[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          height: sizing.height,
          borderRadius: sizing.radius,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: isDisabled ? 0.45 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
        },
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Row style={styles.buttonInner}>
          {icon ? (
            <Ionicons name={icon} size={sizing.font + 4} color={palette.fg} style={styles.buttonIcon} />
          ) : null}
          <Text
            style={{
              color: palette.fg,
              fontSize: sizing.font,
              fontWeight: '800',
              letterSpacing: size === 'hero' ? 1.5 : 0.3,
            }}
          >
            {title}
          </Text>
        </Row>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ status */

export function Badge({
  label,
  color = colors.textMuted,
  filled = false,
}: {
  label: string;
  color?: string;
  filled?: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: filled ? color : `${color}1F`,
          borderColor: filled ? color : `${color}55`,
        },
      ]}
    >
      <Text
        style={{
          color: filled ? colors.textInverse : color,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.6,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

export function Dot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/* ------------------------------------------------------------------- tiles */

export function StatTile({
  label,
  value,
  hint,
  accent = colors.text,
  onPress,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <Text style={[styles.tileValue, { color: accent }]}>{value}</Text>
      {hint ? (
        <Txt variant="label" color={colors.textFaint} numberOfLines={1}>
          {hint}
        </Txt>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      {content}
    </View>
  );
}

/** A thin horizontal meter. Used for punctuality and occupancy. */
export function Meter({ value, color = colors.brand }: { value: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, value || 0));
  return (
    <View style={styles.meterTrack}>
      <View style={[styles.meterFill, { width: `${clamped}%`, backgroundColor: color }]} />
    </View>
  );
}

/* ------------------------------------------------------------------ states */

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.centered} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.brand} size="large" />
      <Txt variant="label" color={colors.textFaint} style={styles.stateText}>
        {label}
      </Txt>
    </View>
  );
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  detail,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string;
}) {
  return (
    <View style={styles.centered}>
      <Ionicons name={icon} size={40} color={colors.textFaint} />
      <Txt variant="heading" style={styles.stateText}>
        {title}
      </Txt>
      {detail ? (
        <Txt variant="body" color={colors.textMuted} style={styles.stateDetail}>
          {detail}
        </Txt>
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  detail,
  onRetry,
  offline = false,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  /** Losing signal is not a server fault, and should not look like one. */
  offline?: boolean;
}) {
  return (
    <View style={styles.centered}>
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
        size={40}
        color={colors.brand}
      />
      <Txt variant="heading" style={styles.stateText}>
        {offline ? 'No connection' : title}
      </Txt>
      {detail ? (
        <Txt variant="body" color={colors.textMuted} style={styles.stateDetail}>
          {detail}
        </Txt>
      ) : null}
      {onRetry ? (
        <View style={styles.stateAction}>
          <Button title="Try again" variant="secondary" onPress={onRetry} icon="refresh" />
        </View>
      ) : null}
    </View>
  );
}

/** The offline bar. Shown wherever an action needs the server. */
export function OfflineNotice({ message }: { message: string }) {
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={18} color={colors.brandSoft} />
      <Txt variant="label" color={colors.brandSoft} style={styles.offlineText}>
        {message}
      </Txt>
    </View>
  );
}

export function Banner({
  tone = 'info',
  children,
  testID,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  children: React.ReactNode;
  testID?: string;
}) {
  const tint = {
    info: colors.info,
    warning: colors.late,
    danger: colors.absent,
    success: colors.onTime,
  }[tone];

  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.banner, { borderColor: `${tint}55`, backgroundColor: `${tint}14` }]}
    >
      {typeof children === 'string' ? (
        <Txt variant="label" color={tint}>
          {children}
        </Txt>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenInner: { flex: 1 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  eyebrow: { textTransform: 'uppercase' },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  buttonInner: { gap: spacing.sm },
  buttonIcon: { marginRight: 2 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tile: {
    flex: 1,
    minWidth: 92,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  tilePressed: { backgroundColor: colors.raised, borderColor: colors.borderStrong },
  tileValue: { fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  meterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.raised,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', borderRadius: 3 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  stateText: { marginTop: spacing.sm, textAlign: 'center' },
  stateDetail: { textAlign: 'center', maxWidth: 320 },
  stateAction: { marginTop: spacing.md, minWidth: 180 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: `${colors.brandDeep}22`,
    borderColor: `${colors.brand}55`,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  offlineText: { flex: 1 },
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
