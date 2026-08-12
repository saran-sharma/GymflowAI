/**
 * Session storage.
 *
 * Tokens go to SecureStore (Keychain on iOS, EncryptedSharedPreferences on
 * Android) and never to AsyncStorage — a refresh token is a 30-day credential.
 * The cached user profile is not sensitive on its own but lives alongside them
 * so signing out clears everything in one call.
 */

import * as SecureStore from 'expo-secure-store';

import type { TokenPair, User } from '../api/types';

const ACCESS_KEY = 'gymflow.access_token';
const REFRESH_KEY = 'gymflow.refresh_token';
const USER_KEY = 'gymflow.user';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

/**
 * SecureStore is unavailable on web and can throw on a device with no
 * screen lock. Failing to persist must not crash the app — the user simply
 * signs in again next launch.
 */
async function safeSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Intentionally swallowed; see above.
  }
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function safeDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Intentionally swallowed; see above.
  }
}

export async function saveSession(tokens: TokenPair, user: User): Promise<void> {
  await Promise.all([
    safeSet(ACCESS_KEY, tokens.access_token),
    safeSet(REFRESH_KEY, tokens.refresh_token),
    safeSet(USER_KEY, JSON.stringify(user)),
  ]);
}

export async function saveTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    safeSet(ACCESS_KEY, tokens.access_token),
    safeSet(REFRESH_KEY, tokens.refresh_token),
  ]);
}

export async function loadSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, rawUser] = await Promise.all([
    safeGet(ACCESS_KEY),
    safeGet(REFRESH_KEY),
    safeGet(USER_KEY),
  ]);
  if (!accessToken || !refreshToken || !rawUser) return null;

  try {
    return { accessToken, refreshToken, user: JSON.parse(rawUser) as User };
  } catch {
    // A corrupt cached profile is not worth recovering from.
    await clearSession();
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Promise.all([safeDelete(ACCESS_KEY), safeDelete(REFRESH_KEY), safeDelete(USER_KEY)]);
}
