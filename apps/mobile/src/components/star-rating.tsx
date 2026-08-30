/**
 * Five stars — an input, or a read-only display of an existing rating.
 *
 * The input is deliberately large-target: `HIT_TARGET`-tall pressables so a
 * star is easy to hit on a gym floor. Each star carries `testID="star-{n}"`
 * under the given prefix so a test can tap "give it 4".
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HIT_TARGET, Text, color, space } from '../design';

const STARS = [1, 2, 3, 4, 5] as const;

export function StarRatingInput({
  value,
  onChange,
  testIDPrefix = 'review-star',
  size = 40,
}: {
  value: number;
  onChange: (next: number) => void;
  testIDPrefix?: string;
  size?: number;
}) {
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel="Star rating">
      {STARS.map((n) => (
        <Pressable
          key={n}
          testID={`${testIDPrefix}-${n}`}
          accessibilityRole="button"
          accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
          accessibilityState={{ selected: value >= n }}
          onPress={() => onChange(n)}
          hitSlop={space.xs}
          style={styles.target}
        >
          <Ionicons
            name={value >= n ? 'star' : 'star-outline'}
            size={size}
            color={value >= n ? color.brandAccent : color.textTertiary}
          />
        </Pressable>
      ))}
    </View>
  );
}

export function StarRatingDisplay({
  value,
  size = 16,
  testID,
}: {
  value: number;
  size?: number;
  testID?: string;
}) {
  const rounded = Math.round(value);
  return (
    <View style={styles.displayRow} testID={testID} accessibilityLabel={`${value} out of 5 stars`}>
      {STARS.map((n) => (
        <Ionicons
          key={n}
          name={rounded >= n ? 'star' : 'star-outline'}
          size={size}
          color={rounded >= n ? color.brandAccent : color.textTertiary}
        />
      ))}
      <Text variant="label" tone={color.textTertiary} style={styles.displayValue}>
        {value.toFixed(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xs, alignSelf: 'center' },
  target: {
    minHeight: HIT_TARGET,
    minWidth: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  displayValue: { marginLeft: space.xs },
});
