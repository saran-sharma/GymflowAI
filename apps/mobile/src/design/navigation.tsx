/**
 * Bottom navigation.
 *
 * The tab bar is chrome, not content: it sits on `surface` rather than a card,
 * carries a hairline top border instead of a shadow, and uses the accent only
 * for the active tab. Exported as a screen-options factory so all three role
 * layouts configure it identically rather than each repeating the same object.
 */

import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import React, { useState } from 'react';
import { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ColorValue, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Motion } from './motion';
import { Row, Text } from './primitives';
import { alpha, color, font, hairline, HIT_TARGET, motion, radii, space } from './tokens';

type IconName = keyof typeof Ionicons.glyphMap;

/** Height of the bar itself, before the safe-area inset. */
export const TAB_BAR_HEIGHT = 64;

/**
 * The `screenOptions` every role's `<Tabs>` should spread.
 *
 * `compact` drops the label size a step, for the five-tab layouts where six
 * characters of label would otherwise wrap.
 */
export function tabScreenOptions({
  compact = false,
  accent = color.brand,
}: { compact?: boolean; accent?: string } = {}) {
  return {
    headerShown: false as const,
    // All three role layouts already call this factory, so wiring the animated
    // bar here rather than per layout is what keeps them from drifting apart.
    // `accent` is how a role's colour reaches the bar without any component
    // below needing to know that roles exist.
    tabBar: (props: BottomTabBarProps) => <AnimatedTabBar {...props} accent={accent} />,
    tabBarActiveTintColor: accent,
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
      fontFamily: font.sansMedium,
      letterSpacing: 0.4,
    },
    sceneStyle: { backgroundColor: color.background },
  };
}

/**
 * Builds a tab's icon renderer, so a layout declares the glyph and nothing else.
 *
 * The tint arrives as React Native's `ColorValue` — navigators may hand back an
 * opaque platform colour rather than a string — so it is passed through to
 * Ionicons untouched instead of being narrowed.
 */
export function tabIcon(name: IconName) {
  return function TabIcon({ color: tint, size }: { color: ColorValue; size: number }) {
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
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    minHeight: HIT_TARGET,
    paddingRight: space.sm,
  },
  backPressed: { opacity: 0.6 },
  chipRow: { gap: space.sm, paddingVertical: space.xs, paddingRight: space.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 38,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    backgroundColor: color.surfaceRaised,
    ...hairline,
  },
  chipSelected: { backgroundColor: alpha(color.brand, 0.2), borderColor: color.brand },
  chipPressed: { backgroundColor: color.surfaceOverlay },
  dayRow: { gap: space.sm, paddingVertical: space.xs, paddingRight: space.lg },
  day: {
    alignItems: 'center',
    gap: 2,
    minWidth: 48,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
    backgroundColor: color.surfaceRaised,
    ...hairline,
  },
  daySelected: { backgroundColor: color.brand, borderColor: color.brand },
  dayPressed: { backgroundColor: color.surfaceOverlay },
  dayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
  header: { minHeight: HIT_TARGET },
  headerSide: { width: 44 },
  headerTrailing: { alignItems: 'flex-end' },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -space.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  pill: { position: 'absolute', top: 0, left: 0, bottom: 0, alignItems: 'center' },
  pillInner: {
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: color.brand,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: HIT_TARGET,
    paddingTop: space.xs,
  },
  tabLabel: { fontSize: 10 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: HIT_TARGET,
    paddingVertical: space.sm,
  },
  navRowPressed: { opacity: 0.6 },
  navRowText: { flex: 1, gap: 2 },
  headerTitle: { flex: 1, gap: 1 },
  headerCentre: { textAlign: 'center' },
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
  segmentSelected: {
    borderColor: color.brand,
    backgroundColor: `${color.brand}1F`,
  },
  segmentPressed: { backgroundColor: color.surfaceOverlay },
});

/* ------------------------------------------------------------- back link */

/**
 * The "go back" affordance on pushed detail screens.
 *
 * Detail routes are pushed over a tab, so the tab bar stays visible and there
 * is no header — which leaves the screen itself responsible for the way out.
 * Two screens had grown their own version of this row; the target here is a
 * full `HIT_TARGET`, which neither of theirs was.
 */
export function BackLink({
  label = 'Back',
  onPress,
  testID,
}: {
  label?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={space.sm}
      style={({ pressed }) => [styles.back, pressed ? styles.backPressed : null]}
    >
      <Ionicons name="chevron-back" size={20} color={color.textSecondary} />
      <Text variant="label" tone={color.textSecondary}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ----------------------------------------------------------------- chips */

/**
 * A scrolling row of filter pills.
 *
 * `Segmented` divides a fixed width between its options, which stops working
 * somewhere past three — the labels start truncating. Chips scroll instead, so
 * a category list can grow without the control degrading. The selected chip is
 * filled; the rest are outlines, so the current filter is readable without
 * comparing every pill to its neighbour.
 */
export function Chips<T extends string>({
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      accessibilityRole="tablist"
    >
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
              styles.chip,
              selected ? styles.chipSelected : null,
              pressed && !selected ? styles.chipPressed : null,
            ]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={15}
                color={selected ? color.text : color.textTertiary}
              />
            ) : null}
            <Text variant="label" tone={selected ? color.text : color.textSecondary}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ------------------------------------------------------------- day strip */

export interface DayStripItem {
  /** ISO date, `YYYY-MM-DD`. Also the key. */
  date: string;
  /** One or two letters: S, M, T… */
  weekday: string;
  /** The day of the month. */
  day: string;
  /** Draws a dot under the number — "something is on this day". */
  marked?: boolean;
}

/**
 * A horizontal week, with the chosen day filled.
 *
 * Two screens had grown their own version of this. The filled pill rather than
 * an underline is deliberate: on a dark ground an underline on a two-character
 * label is nearly invisible, and this control is often the only way to tell
 * which day you are looking at.
 */
export function DayStrip({
  days,
  value,
  onChange,
  testIDPrefix,
}: {
  days: DayStripItem[];
  value: string;
  onChange: (date: string) => void;
  testIDPrefix?: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.dayRow}
    >
      {days.map((item) => {
        const selected = item.date === value;
        return (
          <Pressable
            key={item.date}
            onPress={() => onChange(item.date)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${item.weekday} ${item.day}${item.marked ? ', has entries' : ''}`}
            testID={testIDPrefix ? `${testIDPrefix}-${item.date}` : undefined}
            style={({ pressed }) => [
              styles.day,
              selected ? styles.daySelected : null,
              pressed && !selected ? styles.dayPressed : null,
            ]}
          >
            <Text variant="caption" caps tone={selected ? color.textInverse : color.textTertiary}>
              {item.weekday}
            </Text>
            <Text variant="heading" tone={selected ? color.textInverse : color.text}>
              {item.day}
            </Text>
            <View
              style={[
                styles.dayDot,
                {
                  backgroundColor: item.marked
                    ? selected
                      ? color.textInverse
                      : color.brandAccent
                    : 'transparent',
                },
              ]}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* --------------------------------------------------------- screen header */

/**
 * The header a pushed screen draws for itself.
 *
 * Detail routes are pushed over a tab and run headerless, so the way back and
 * the screen's name are the screen's own job. Centring the title and reserving
 * the trailing slot keeps that name in the same place on every detail screen,
 * whether or not there is an action on the right.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  action,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <Row gap="sm" align="center" style={styles.header}>
      <View style={styles.headerSide}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={space.md}
            style={({ pressed }) => [styles.headerButton, pressed ? styles.backPressed : null]}
          >
            <Ionicons name="chevron-back" size={22} color={color.text} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.headerTitle}>
        <Text variant="heading" numberOfLines={1} style={styles.headerCentre}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="label"
            tone={color.textTertiary}
            numberOfLines={1}
            style={styles.headerCentre}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.headerSide, styles.headerTrailing]}>{action}</View>
    </Row>
  );
}

/* -------------------------------------------------------------- nav row */

/**
 * A row that goes somewhere: icon, label, one line of context, chevron.
 *
 * The "More" tabs are lists of these, and each role had been building them
 * inline. Keeping it here is what guarantees the 48pt target — the hand-rolled
 * versions relied on padding adding up to roughly that, which it did not
 * always do once a row had no detail line.
 */
export function NavRow({
  label,
  detail,
  icon,
  onPress,
  trailing,
  testID,
}: {
  label: string;
  detail?: string;
  icon?: IconName;
  onPress: () => void;
  /** Replaces the chevron — a badge or a count. */
  trailing?: React.ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      testID={testID}
      style={({ pressed }) => [styles.navRow, pressed ? styles.navRowPressed : null]}
    >
      {icon ? <Ionicons name={icon} size={20} color={color.textSecondary} /> : null}
      <View style={styles.navRowText}>
        <Text variant="body">{label}</Text>
        {detail ? (
          <Text variant="label" tone={color.textTertiary} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ?? <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />}
    </Pressable>
  );
}

/* ------------------------------------------------------------ animated bar */

/**
 * The bottom bar, with the selection animated.
 *
 * A pill slides between tabs on the UI thread and the chosen icon lifts
 * slightly. That is the whole effect — a bar someone taps forty times a shift
 * is the wrong place for anything that has to finish before the next tap can
 * land, so the pill is short and nothing waits on it.
 *
 * What it must not lose, and does not: the 48pt targets, the safe-area inset
 * that keeps the bar clear of the Android navigation bar, and the tab
 * accessibility roles a screen reader navigates by.
 */
export function AnimatedTabBar({
  state,
  descriptors,
  navigation,
  accent = color.brand,
}: BottomTabBarProps & { accent?: string }) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);

  const visible = state.routes.filter(
    (route) => descriptors[route.key]?.options.tabBarButton !== null,
  );
  const activeIndex = visible.findIndex((route) => route.key === state.routes[state.index]?.key);
  const slot = visible.length ? width / visible.length : 0;

  const pill = useAnimatedStyle(() => ({
    width: slot,
    transform: [{ translateX: withSpring(Math.max(0, activeIndex) * slot, motion.press) }],
  }));

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {/* Decorative: the selected state is announced by each tab, not by this. */}
      {slot > 0 ? (
        <Motion.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.pill, pill]}
        >
          <View style={[styles.pillInner, { backgroundColor: accent }]} />
        </Motion.View>
      ) : null}

      {visible.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = (options.title ?? route.name) as string;
        const focused = index === activeIndex;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            testID={`tab-${route.name}`}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            style={styles.tab}
          >
            {options.tabBarIcon?.({
              focused,
              color: focused ? accent : color.textQuiet,
              size: 22,
            })}
            <Text
              variant="caption"
              caps
              tone={focused ? accent : color.textQuiet}
              numberOfLines={1}
              style={styles.tabLabel}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
