/**
 * Haptics, in one place.
 *
 * Every buzz the app makes goes through here, for the same reason colour and
 * timing do: so "confirmed" feels the same in the trainer's hand on the shift
 * screen as it does in the member's hand after a set, and so there is one
 * switch to reach for if a build ever needs them off.
 *
 * The vocabulary is deliberately tiny. A gym phone in a pocket does not need
 * ten textures — it needs "that registered", "that worked", "that did not".
 *
 * Calls are fire-and-forget and never throw: haptics are unavailable on some
 * devices and in the simulator, and a missing motor must not break a check-in.
 */

import * as Haptics from 'expo-haptics';

type ImpactWeight = 'light' | 'medium' | 'heavy';
type NotifyKind = 'success' | 'warning' | 'error';

const IMPACT: Record<ImpactWeight, Haptics.ImpactFeedbackStyle | undefined> = {
  light: Haptics.ImpactFeedbackStyle?.Light,
  medium: Haptics.ImpactFeedbackStyle?.Medium,
  heavy: Haptics.ImpactFeedbackStyle?.Heavy,
};

const NOTIFY: Record<NotifyKind, Haptics.NotificationFeedbackType | undefined> = {
  success: Haptics.NotificationFeedbackType?.Success,
  warning: Haptics.NotificationFeedbackType?.Warning,
  error: Haptics.NotificationFeedbackType?.Error,
};

function safe(run: () => Promise<unknown> | undefined): void {
  try {
    void run()?.catch?.(() => undefined);
  } catch {
    /* no haptic motor — nothing to do */
  }
}

export const haptics = {
  /** A light physical tick for a discrete choice — a set logged, a chip picked. */
  impact(weight: ImpactWeight = 'light'): void {
    safe(() => Haptics.impactAsync(IMPACT[weight]));
  },
  /** The outcome of an operation the server just confirmed or refused. */
  notify(kind: NotifyKind): void {
    safe(() => Haptics.notificationAsync(NOTIFY[kind]));
  },
  /** The lightest tick, for moving through a stepper or a segmented control. */
  selection(): void {
    safe(() => Haptics.selectionAsync?.());
  },
};

export type { ImpactWeight, NotifyKind };
