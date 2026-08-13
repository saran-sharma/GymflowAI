/**
 * Bottom navigation.
 *
 * The tab bar is chrome, not content: it sits on `surface` rather than a card,
 * carries a hairline top border instead of a shadow, and uses the accent only
 * for the active tab. Exported as a screen-options factory so all three role
 * layouts configure it identically rather than each repeating the same object.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './primitives';
import { color, HIT_TARGET, radii, space } from './tokens';

type IconName = keyof typeof Ionicons.glyphMap;

/** Height of the bar itself, before the safe-area inset. */
export const TAB_BAR_HEIGHT = 64;

/**
 * The `screenOptions` every role's `<Tabs>` should spread.
 *
 * `compact` drops the label size a step, for the five-tab layouts where six
 * characters of label would otherwise wrap.
 */
export function tabScreenOptions({ compact = false }: { compact?: boolean } = {}) {
  return {
    headerShown: false as const,
    tabBarActiveTintColor: color.brand,
    tabBarInactiveTintColor: color.textTertiary,
    tabBarStyle: {
      backgroundColor: color.surface,
      borderTopColor: color.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      height: TAB_BAR_HEIGHT,
      paddingBottom: space.sm,
      paddingTop: space.sm,
    },
    tabBarLabelStyle: {
      fontSize: compact ? 10 : 11,
      fontWeight: '700' as const,
      letterSpacing: 0.4,
    },
    sceneStyle: { backgroundColor: color.background },
  };
}

/** Builds a tab's icon renderer, so a layout declares the glyph and nothing else. */
export function tabIcon(name: IconName) {
  return function TabIcon({ color: tint, size }: { color: string; size: number }) {
    return <Ionicons name={name} size={size} color={tint} />;
  };
}

/* --------------------------------------------------------- segmented nav */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

/**
 * An in-screen segmented control — period pickers, list filters, role choices.
 *
 * Not a tab bar: this switches what a screen shows, it does not navigate.
 * Keeping the two visually distinct is what stops people expecting a back
 * gesture from something that never pushed a route.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  testIDPrefix?: string;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !selected ? styles.segmentPressed : null,
            ]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={18}
                color={selected ? color.text : color.textTertiary}
              />
            ) : null}
            <Text
              variant="caption"
              caps
              tone={selected ? color.text : color.textTertiary}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', gap: space.sm },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: HIT_TARGET,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surfaceRaised,
  },
  segmentSelected: { borderColor: color.brand, backgroundColor: `${color.brand}1F` },
  segmentPressed: { backgroundColor: color.surfaceOverlay },
});
