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
 */

import React, { useEffect } from 'react';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { motion } from './tokens';

/* ------------------------------------------------------------------ press */

/**
 * The shared press treatment: a spring on scale, a step on opacity.
 *
 * Returns the style to spread and the two handlers to wire onto a `Pressable`.
 * Callers keep their own `onPress` — this only owns how the press *looks*.
 */
export function usePressMotion(enabled = true) {
  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(pressed.value ? motion.pressScale : 1, motion.press),
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
 */
export function entrance(index = 0, cap = 8) {
  return FadeInDown.duration(motion.enter.duration)
    .delay(Math.min(index, cap) * motion.enter.stagger)
    .easing(Easing.out(Easing.cubic));
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

/** A shared value that springs to `to` — for bars, rings and meters. */
export function useTravel(to: number, duration = motion.slow) {
  const value = useSharedValue(0);
  useEffect(() => {
    value.value = withTiming(Number.isFinite(to) ? to : 0, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [to, duration, value]);
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
 */
export function usePulse() {
  const value = useSharedValue(0.4);

  useEffect(() => {
    // withRepeat(-1, true) reverses on the UI thread forever, so the loop never
    // crosses back to JS. A callback-driven loop would defeat the point.
    value.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(value);
  }, [value]);

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
