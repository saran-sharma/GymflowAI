/**
 * Push notification abstraction.
 *
 * Nothing in V1 depends on push. This module exists so the alerts the product
 * will want — "trainer late" and "trainer absent" for the owner, shift
 * reminders for trainers, membership reminders for members — have one place to
 * arrive through when the transport is switched on.
 *
 * `PUSH_ENABLED` gates registration entirely, so a build with it off never
 * prompts for permission.
 */

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Event keys the backend emits. Kept in sync with the notification outbox. */
export type NotificationEvent =
  | 'owner.trainer_late'
  | 'owner.trainer_absent'
  | 'trainer.shift_reminder'
  | 'member.membership_reminder'
  | 'member.pt_reminder';

export interface PushRegistration {
  granted: boolean;
  token: string | null;
  reason?: string;
}

export const PUSH_ENABLED = process.env.EXPO_PUBLIC_PUSH_ENABLED === 'true';

export function configureForegroundBehaviour(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Ask for permission and resolve an Expo push token.
 *
 * Returns a reason rather than throwing: a trainer refusing notifications must
 * never block them from checking in.
 */
export async function registerForPush(): Promise<PushRegistration> {
  if (!PUSH_ENABLED) {
    return { granted: false, token: null, reason: 'Push notifications are disabled in this build.' };
  }
  if (!Device.isDevice) {
    return { granted: false, token: null, reason: 'Push requires a physical device.' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('gymflow-alerts', {
      name: 'GymFlow alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#EF2B3C',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== 'granted') {
    finalStatus = (await Notifications.requestPermissionsAsync()).status;
  }
  if (finalStatus !== 'granted') {
    return { granted: false, token: null, reason: 'Notification permission was not granted.' };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return { granted: true, token: token.data };
  } catch (error) {
    return { granted: true, token: null, reason: (error as Error).message };
  }
}
