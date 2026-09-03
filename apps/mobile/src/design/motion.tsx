/**
 * Motion, on the UI thread.
 *
 * Reanimated was already a dependency of this app and was imported by nothing.
 * That matters: its animations run on the UI thread, so a card that springs
 * under a thumb keeps springing while the JS thread is busy parsing a dashboard
 * response — which is exactly when a list is being scrolled. The `Animated` API
 * built into React Native cannot do that for layout properties, and it is the
 * difference between an app that feels expensive and one that feels cheap on a
 * mid-range Android phone, which is what SLAM's trainers carry.
 *
 * Everything here is small and shared. Motion invented per screen is how an app
 * ends up with four different press feels, and a design system that owns colour
 * and spacing but not timing is only two thirds of one.
 *
 * The rules this file encodes:
 *
 *   - One press spring, critically damped. No overshoot on operational data.
 *   - Entrances are short and staggered, never longer than the eye takes to
 *     reach the row.
 *   - Bars and rings travel to their value rather than snapping to it. Numbers
 *     deliberately do not — see the note under "numbers" for why.
 *   - Nothing here blocks interaction. Every animation is decorative in the
 *     literal sense: remove it and the screen still works.
 *   - Reduced motion is honoured. Every primitive below routes through
 *     `useReducedMotion()` / `reduceMotionActive()` and falls back to an
 *     instant state change or a single short cross-fade when it is on.
 */

import React, { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  SlideInLeft,
  SlideInRight,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { motion } from './tokens';

/* -------------------------------------------------------- reduced motion */

/**
 * One place the whole app learns whether the OS "remove animations" setting
 * is on. A module-scope flag rather than only a hook, because `entrance()` is
 * a plain function called inside a `.map()` and has no React context to read
 * from — it consults `reduceMotionActive()` instead.
 *
 * Set once at import from `AccessibilityInfo`, then kept live by the
 * `reduceMotionChanged` subscription. Guarded: on a platform where the API is
 * missing, motion simply stays on rather than throwing at load.
 */
let reduceMotionEnabled = false;
const reduceMotionListeners = new Set<(value: boolean) => void>();

function publishReduceMotion(value: boolean) {
  if (value === reduceMotionEnabled) return;
  reduceMotionEnabled = value;
  for (const listener of reduceMotionListeners) listener(value);
}

try {
  void AccessibilityInfo.isReduceMotionEnabled?.()
    .then(publishReduceMotion)
    .catch(() => undefined);
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', publishReduceMotion);
} catch {
  /* Accessibility API unavailable on this platform — leave motion enabled. */
}

/** The current value, for non-hook call sites like `entrance()`. */
export function reduceMotionActive(): boolean {
  return reduceMotionEnabled;
}

/**
 * Subscribe a component to the OS reduced-motion setting.
 *
 * Returns a boolean that updates if the user toggles the setting while the app
 * is open. Branch rendering on it, or feed it into a primitive that needs to
 * choose between an animation and an instant change.
 */
export function useReducedMotion(): boolean {
  const [enabled, setEnabled] = useState(reduceMotionEnabled);
  useEffect(() => {
    setEnabled(reduceMotionEnabled);
    reduceMotionListeners.add(setEnabled);
    return () => {
      reduceMotionListeners.delete(setEnabled);
    };
  }, []);
  return enabled;
}

/* ------------------------------------------------------------------ press */

/**
 * The shared press treatment: a spring on scale, a step on opacity.
 *
 * Returns the style to spread and the two handlers to wire onto a `Pressable`.
 * Callers keep their own `onPress` — this only owns how the press *looks*.
 *
 * With reduced motion on, the scale spring is dropped entirely; the opacity
 * step stays, because a ≤120ms cross-fade is the sanctioned fallback and a
 * pressable with no feedback at all reads as broken.
 */
export function usePressMotion(enabled = true) {
  const pressed = useSharedValue(0);
  const reduce = useReducedMotion();

  const style = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduce
          ? 1
          : withSpring(pressed.value ? motion.pressScale : 1, motion.press),
      },
    ],
    opacity: withTiming(pressed.value ? motion.pressOpacity : 1, {
      duration: motion.fast,
    }),
  }));

  return {
    style: enabled ? style : undefined,
    onPressIn: () => {
      if (enabled) pressed.value = 1;
    },
    onPressOut: () => {
      if (enabled) pressed.value = 0;
    },
  };
}

/* -------------------------------------------------------------- entrances */

/**
 * The entrance for an item in a list.
 *
 * `index` is its position, and the delay comes from that — so a screen writes
 * `index={i}` in its `.map()` and gets a stagger, rather than each screen
 * inventing a delay. Past `cap` items the delay stops growing: row twenty
 * arriving three hundred milliseconds late is a bug, not a flourish.
 *
 * Reduced motion collapses it to a single plain fade with no travel and no
 * stagger — the content still arrives softly, nothing slides.
 */
export function entrance(index = 0, cap = 8) {
  if (reduceMotionEnabled) return FadeIn.duration(motion.fast);
  return FadeInDown.duration(motion.enter.duration)
    .delay(Math.min(index, cap) * motion.enter.stagger)
    .easing(Easing.out(Easing.cubic));
}

/**
 * A step in a guided sequence entering from the direction of travel.
 *
 * Forward ("Next") slides in from the right; back ("Previous") from the left —
 * the motion carries which way through the flow you just moved. Keep the
 * stepped content keyed by the step index so this fires on every change.
 * Reduced motion drops the slide for a short fade with no travel.
 */
export function slide(direction: 'forward' | 'back' = 'forward') {
  if (reduceMotionEnabled) return FadeIn.duration(motion.fast);
  const anim = direction === 'back' ? SlideInLeft : SlideInRight;
  return anim.duration(motion.base).easing(Easing.out(Easing.cubic));
}

/** Re-exported so screens never import Reanimated directly. */
export { Animated as Motion };

/* ---------------------------------------------------------------- numbers */

/*
 * There is deliberately no count-up here.
 *
 * A figure animating from 0 to 12 is the one effect on the SmoothUI reference
 * that cannot be done on the UI thread. React Native's `Text` takes a string,
 * so the value has to cross back to JS on every frame — one `setState` per
 * frame, per figure. Three stat cards on a dashboard is a hundred and eighty
 * renders a second, which costs more than the effect is worth and is the exact
 * jank the rest of this file exists to avoid.
 *
 * The usual workaround drives a disabled `TextInput` through `animatedProps`.
 * That does stay on the UI thread, but it swaps a `Text` for a `TextInput` and
 * with it the typography, the line-height handling and the accessibility role
 * of every number in the app. Not a trade worth making for a flourish.
 *
 * Bars and rings travel instead — see `useTravel`. Those are real style
 * properties and animate natively, so the sense of a value arriving is kept
 * where it can be had honestly.
 */

/* ------------------------------------------------------------------ value */

/**
 * A shared value that springs to `to` — for bars, rings and meters.
 *
 * With reduced motion on it jumps straight to the target: a meter still shows
 * the right proportion, it just does not sweep there.
 */
export function useTravel(to: number, duration: number = motion.slow) {
  const value = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const target = Number.isFinite(to) ? to : 0;
    if (reduce) {
      value.value = target;
      return;
    }
    value.value = withTiming(target, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [to, duration, value, reduce]);
  return value;
}

/* ------------------------------------------------------------------ pulse */

/**
 * The skeleton pulse, on the UI thread.
 *
 * A loading placeholder animating on the JS thread stops animating exactly when
 * the app is busiest — parsing the response it is a placeholder for — so the
 * one animation guaranteed to stutter was the one whose whole job is to say
 * "something is happening".
 *
 * Reduced motion holds it at a flat mid opacity: the placeholder still reads
 * as "not content", it just does not breathe.
 */
export function usePulse() {
  const value = useSharedValue(0.4);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      cancelAnimation(value);
      value.value = 0.6;
      return;
    }
    // withRepeat(-1, true) reverses on the UI thread forever, so the loop never
    // crosses back to JS. A callback-driven loop would defeat the point.
    value.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(value);
  }, [value, reduce]);

  return useAnimatedStyle(() => ({ opacity: value.value }));
}

/* ---------------------------------------------------------------- helpers */

/**
 * Wrap children in a staggered entrance without touching their markup.
 *
 * For lists whose rows are not design-system cards and so have nowhere to take
 * an `index` prop.
 */
export function Entering({ index = 0, children }: { index?: number; children: React.ReactNode }) {
  return <Animated.View entering={entrance(index)}>{children}</Animated.View>;
}

/**
 * A screen's sections arriving once, in order, on mount.
 *
 * Direct children are indexed top to bottom; `null` / `false` children are
 * dropped by `React.Children.toArray`, so a conditional section that is not
 * rendered does not leave a hole in the stagger. The entrance fires on mount
 * only — a later data refresh that swaps a section's content in place does not
 * replay it, because the wrapper keeps its key. Reduced motion collapses each
 * to a plain fade (through `entrance`).
 *
 * Use it around the body of a screen that is one column of sections, not for a
 * `FlatList` (rows there take `index` directly) and not to animate an element
 * that changes while the screen is open.
 */
export function Staggered({
  children,
  from = 0,
}: {
  children: React.ReactNode;
  /** Start the count later, e.g. when a static header sits above at index 0. */
  from?: number;
}) {
  const items = React.Children.toArray(children);
  return (
    <>
      {items.map((child, index) => (
        <Animated.View
          key={(child as { key?: React.Key }).key ?? index}
          entering={entrance(from + index)}
        >
          {child}
        </Animated.View>
      ))}
    </>
  );
}
