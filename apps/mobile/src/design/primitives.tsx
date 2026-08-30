/**
 * The layer everything else is built from: text, layout, surfaces.
 *
 * These exist so a screen never reaches for a raw `<View>` with an inline
 * style. If something here does not do what a screen needs, the fix is to
 * extend the primitive — not to restyle in place, which is how design systems
 * quietly stop being systems.
 */

import React from 'react';
import {
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text as RNText,
  type TextProps as RNTextProps,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import {
  ScreenBackground,
  type ScreenBackgroundIntensity,
  type ScreenBackgroundVariant,
} from './screen-background';
import { color, elevation, hairline, radii, space, text, type TextRole } from './tokens';
import { useThemedStyles } from './useThemedStyles';

/* -------------------------------------------------------------------- text */

export interface TextProps extends RNTextProps {
  variant?: TextRole;
  /** Any token colour. Defaults to primary text. */
  tone?: string;
  align?: 'left' | 'center' | 'right';
  /** Renders the content upper-cased. Pairs with `variant="caption"`. */
  caps?: boolean;
}

export function Text({
  variant = 'body',
  tone = color.text,
  align,
  caps,
  style,
  children,
  ...rest
}: TextProps) {
  return (
    <RNText
      style={[
        text[variant],
        { color: tone },
        align ? { textAlign: align } : null,
        caps ? styles.caps : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/**
 * The small all-caps label above a group of content.
 *
 * Its own component rather than a `<Text variant="caption" caps>` because it
 * appears on nearly every surface, and one component means one decision about
 * how a section announces itself.
 */
export function Eyebrow({
  children,
  tone = color.textTertiary,
  style,
  ...rest
}: Omit<TextProps, 'variant' | 'caps'>) {
  return (
    <Text
      variant="caption"
      tone={tone}
      caps
      accessibilityRole="header"
      style={style}
      {...rest}
    >
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ layout */

type Gap = keyof typeof space;

export interface StackProps extends ViewProps {
  gap?: Gap;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
}

/** Vertical rhythm. */
export function Stack({ gap = 'md', align, justify, style, children, ...rest }: StackProps) {
  return (
    <View
      style={[{ gap: space[gap], alignItems: align, justifyContent: justify }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

export interface RowProps extends StackProps {
  wrap?: boolean;
}

/** Horizontal rhythm. Defaults to centre-aligned, which is right far more often than not. */
export function Row({
  gap = 'md',
  align = 'center',
  justify,
  wrap,
  style,
  children,
  ...rest
}: RowProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: space[gap],
          alignItems: align,
          justifyContent: justify,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

/** Pushes whatever follows it to the far edge of a Row. */
export function Spacer() {
  return <View style={styles.spacer} />;
}

export function Divider({ inset = false }: { inset?: boolean }) {
  const themed = useThemedStyles(() => ({ divider: { height: 1, backgroundColor: color.border } }));
  return <View style={[themed.divider, inset && styles.dividerInset]} />;
}

/* ---------------------------------------------------------------- surfaces */

export interface SurfaceProps extends ViewProps {
  /** Which elevation level this sits at. */
  level?: 0 | 1 | 2 | 3;
  padding?: Gap;
  radius?: keyof typeof radii;
  bordered?: boolean;
}

/**
 * The base container. `Card` is this with the defaults the product uses most.
 *
 * Elevation is expressed as surface lightness (see tokens); the border is what
 * separates two surfaces whose lightness is close.
 */
export function Surface({
  level = 1,
  padding = 'lg',
  radius = 'lg',
  bordered = true,
  style,
  children,
  ...rest
}: SurfaceProps) {
  const levels = [elevation.level0, elevation.level1, elevation.level2, elevation.level3];
  return (
    <View
      style={[
        levels[level],
        { padding: space[padding], borderRadius: radii[radius] },
        bordered ? hairline : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

export interface CardProps extends Omit<SurfaceProps, 'level'> {
  gap?: Gap;
}

/** A content container. The default surface for grouped information. */
export function Card({ gap = 'sm', style, children, ...rest }: CardProps) {
  return (
    <Surface level={1} style={[{ gap: space[gap] }, style]} {...rest}>
      {children}
    </Surface>
  );
}

/* ------------------------------------------------------------------ screen */

export interface ScreenProps extends ViewProps {
  edges?: Edge[];
  /**
   * Opt in to a low-opacity editorial photo behind the content. Off by
   * default; only a handful of screens use it. See `ScreenBackground`.
   */
  background?: ScreenBackgroundVariant;
  /** How present that photo is. Defaults per variant when omitted. */
  backgroundIntensity?: ScreenBackgroundIntensity;
}

/** The root of every screen. Owns the background and the safe area. */
export function Screen({
  children,
  edges = ['top'],
  style,
  background,
  backgroundIntensity,
  ...rest
}: ScreenProps) {
  const themed = useThemedStyles(() => ({ screen: { flex: 1, backgroundColor: color.background } }));
  return (
    <SafeAreaView style={themed.screen} edges={edges}>
      {background ? (
        <ScreenBackground variant={background} intensity={backgroundIntensity} />
      ) : null}
      <View style={[styles.screenInner, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

/** The scrolling body of a screen, with the standard page padding and rhythm. */
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

/** A titled section, with an optional action on the right. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Stack gap="sm">
      <Row style={styles.sectionHeader}>
        <Eyebrow>{title}</Eyebrow>
        <Spacer />
        {action}
      </Row>
      {children}
    </Stack>
  );
}

const styles = StyleSheet.create({
  caps: { textTransform: 'uppercase' },
  spacer: { flex: 1 },
  dividerInset: { marginLeft: space.lg },
  screenInner: { flex: 1 },
  body: { flex: 1 },
  bodyContent: { padding: space.lg, paddingBottom: space.xxxl, gap: space.md },
  sectionHeader: { paddingTop: space.xs },
});
