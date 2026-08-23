/**
 * SLAM's identity in the app.
 *
 * These use the studio's real artwork, already in the repository and bundled
 * with the build — `assets/slam-logo.png` is the supplied logo exported for
 * dark surfaces (white wordmark, brand-red "L"). Nothing here redraws or
 * approximates the mark.
 */

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Stack, Text } from './primitives';
import { color, radii, space } from './tokens';
import { useThemedStyles } from './useThemedStyles';
import { useTheme } from '../store/ThemeContext';

/** The supplied artwork: 484 × 226 in the source, so height follows width. */
const LOGO = require('../../assets/slam-logo.png');
const LOGO_ASPECT = 484 / 226;

export interface SlamLogoProps {
  width?: number;
  testID?: string;
}

/**
 * The full lockup. Use on sign-in, splash and anywhere SLAM is being named.
 *
 * The supplied artwork is a white wordmark — built for a dark ground, and
 * there is no separate light-mode export to swap in. Rather than invent one,
 * light mode sits it on a small dark plate sized to the mark itself, the
 * same near-black the artwork was always designed against; dark mode is
 * unchanged, with nothing behind it.
 */
export function SlamLogo({ width = 200, testID = 'slam-logo' }: SlamLogoProps) {
  const { resolvedScheme } = useTheme();
  const height = width / LOGO_ASPECT;
  const image = (
    <Image
      source={LOGO}
      style={{ width, height }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="SLAM Fitness Studio"
      testID={testID}
    />
  );
  if (resolvedScheme !== 'light') return image;
  return (
    <View
      style={{
        width: width + space.md,
        height: height + space.md,
        borderRadius: radii.md,
        backgroundColor: '#0A0A0A',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {image}
    </View>
  );
}

/**
 * A square glyph, for places the full lockup will not fit — a header row, an
 * avatar slot, a tab. Drawn rather than bitmapped so it stays crisp at 24pt.
 */
export function SlamMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="SLAM Fitness Studio">
      <Rect x="0" y="0" width="64" height="64" rx="16" fill={color.surfaceRaised} />
      {/* A plate loaded on a bar — the shorthand used where the lockup cannot fit. */}
      <Path d="M14 40 L38 14 L50 14 L26 40 Z" fill={color.brand} />
      <Rect x="14" y="44" width="36" height="6" rx="3" fill={color.text} />
    </Svg>
  );
}

/** The signed-in header: mark, studio name, and an optional line beneath. */
export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <Stack gap="xs">
      <View style={styles.lockup}>
        <SlamMark size={44} />
        <View>
          <Text variant="title" style={styles.slam}>
            SLAM
          </Text>
          <Text variant="caption" caps tone={color.brand}>
            Fitness Studio
          </Text>
        </View>
      </View>
      {subtitle ? (
        <Text variant="label" tone={color.textTertiary}>
          {subtitle}
        </Text>
      ) : null}
    </Stack>
  );
}

/**
 * A person's initials in a circle.
 *
 * The app shows no member photographs, so this is the avatar — quiet by
 * default, accented when the person is the subject of the screen.
 */
export function Avatar({
  name,
  size = 52,
  accent = false,
}: {
  name: string;
  size?: number;
  accent?: boolean;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?';
  const themed = useThemedStyles(() => ({
    avatar: {
      backgroundColor: color.surfaceOverlay,
      borderWidth: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
  }));

  return (
    <View
      style={[
        themed.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: accent ? color.brand : color.border,
        },
      ]}
      accessible
      accessibilityLabel={name}
    >
      <Text variant={size >= 48 ? 'heading' : 'label'} tone={accent ? color.brand : color.text}>
        {initials}
      </Text>
    </View>
  );
}

/**
 * Marks seeded data on screen.
 *
 * Demo rows must never be mistaken for a real SLAM employee or customer, so
 * anything the seeder produced says so where it is shown.
 */
export function DemoTag() {
  const themed = useThemedStyles(() => ({
    demo: {
      paddingHorizontal: space.sm,
      paddingVertical: 3,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: color.border,
      backgroundColor: color.surfaceOverlay,
    },
  }));
  return (
    <View style={themed.demo}>
      <Text variant="caption" caps tone={color.textTertiary}>
        Demo
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  slam: { lineHeight: 28 },
});
