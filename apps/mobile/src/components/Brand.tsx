/**
 * SLAM's mark, drawn rather than shipped as a bitmap so it stays crisp at any
 * size and needs no asset pipeline. The wordmark is the demo's lockup: heavy
 * white "SLAM", a red slash, and the product name underneath.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors, spacing } from '../theme';
import { Txt } from './ui';

export function SlamMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="SLAM Fitness Studio">
      <Rect x="0" y="0" width="64" height="64" rx="16" fill={colors.card} />
      {/* The angled bar is the demo's signature — a plate loaded on a bar. */}
      <Path d="M14 40 L38 14 L50 14 L26 40 Z" fill={colors.brand} />
      <Rect x="14" y="44" width="36" height="6" rx="3" fill={colors.text} />
    </Svg>
  );
}

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
