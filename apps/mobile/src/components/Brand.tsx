/**
 * SLAM's mark.
 *
 * This is the studio's real logo — the artwork supplied by SLAM, exported for
 * dark surfaces (white wordmark, brand-red "L") and bundled with the app. It
 * is never redrawn or substituted; `SlamMark` is the geometric fallback used
 * only where a square glyph is needed and the full lockup will not fit.
 */

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors, spacing } from '../theme';
import { Txt } from './ui';

/** The supplied artwork. 484 × 226 in the source, so height follows width. */
const LOGO = require('../../assets/slam-logo.png');
const LOGO_ASPECT = 484 / 226;

export function SlamLogo({ width = 200 }: { width?: number }) {
  return (
    <Image
      source={LOGO}
      style={{ width, height: width / LOGO_ASPECT }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="SLAM Fitness Studio"
      testID="slam-logo"
    />
  );
}

export function SlamMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="SLAM Fitness Studio">
      <Rect x="0" y="0" width="64" height="64" rx="16" fill={colors.card} />
      {/* A plate loaded on a bar — the shorthand used where the lockup cannot fit. */}
      <Path d="M14 40 L38 14 L50 14 L26 40 Z" fill={colors.brand} />
      <Rect x="14" y="44" width="36" height="6" rx="3" fill={colors.text} />
    </Svg>
  );
}

/** The signed-in header lockup: the mark, the studio name, and a subtitle. */
export function Wordmark({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.wordmark}>
      <View style={styles.lockup}>
        <SlamMark size={44} />
        <View>
          <Txt variant="title" style={styles.slam}>
            SLAM
          </Txt>
          <Txt variant="caption" color={colors.brand}>
            FITNESS STUDIO
          </Txt>
        </View>
      </View>
      {subtitle ? (
        <Txt variant="label" color={colors.textFaint}>
          {subtitle}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { gap: spacing.xs },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  slam: { lineHeight: 28 },
});
