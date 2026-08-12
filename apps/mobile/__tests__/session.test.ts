/** Tokens must reach SecureStore, and sign-out must leave nothing behind. */

import * as SecureStore from 'expo-secure-store';

import { clearSession, loadSession, saveSession, saveTokens } from '../src/store/session';
import type { TokenPair, User } from '../src/api/types';

const tokens: TokenPair = {
  access_token: 'access-token-value',
  refresh_token: 'refresh-token-value',
  token_type: 'bearer',
  expires_in: 1800,
};

const user: User = {
  id: 7,
  email: 'vikas.menon@slam.demo',
  full_name: 'Vikas Menon',
  phone: null,
  role: 'trainer',
  branch_id: 4,
  branch: { id: 4, code: 'SLAM-NGK', name: 'SLAM Nagalkeni', city: 'Chennai', timezone: 'Asia/Kolkata' },
  has_pin: true,
};

beforeEach(async () => {
  await clearSession();
  jest.clearAllMocks();
});

it('round-trips a session', async () => {
  await saveSession(tokens, user);
  const stored = await loadSession();

  expect(stored?.accessToken).toBe(tokens.access_token);
  expect(stored?.refreshToken).toBe(tokens.refresh_token);
  expect(stored?.user.full_name).toBe('Vikas Menon');
});

it('stores tokens in SecureStore, not plain storage', async () => {
  await saveSession(tokens, user);

  const keys = (SecureStore.setItemAsync as jest.Mock).mock.calls.map(([key]) => key);
  expect(keys).toContain('gymflow.access_token');
  expect(keys).toContain('gymflow.refresh_token');
});

it('replaces only the tokens on refresh, keeping the cached profile', async () => {
  await saveSession(tokens, user);
  await saveTokens({ ...tokens, access_token: 'new-access', refresh_token: 'new-refresh' });

  const stored = await loadSession();
  expect(stored?.accessToken).toBe('new-access');
  expect(stored?.user.email).toBe(user.email);
});

it('clears everything on sign out', async () => {
  await saveSession(tokens, user);
  await clearSession();
  expect(await loadSession()).toBeNull();
});

it('returns null rather than a half session when a key is missing', async () => {
  await saveSession(tokens, user);
  await SecureStore.deleteItemAsync('gymflow.refresh_token');
  expect(await loadSession()).toBeNull();
});

it('discards a corrupt cached profile instead of crashing', async () => {
  await saveSession(tokens, user);
  await SecureStore.setItemAsync('gymflow.user', '{not json');

  expect(await loadSession()).toBeNull();
  // And the bad data is gone, so the next launch starts clean.
  expect(await SecureStore.getItemAsync('gymflow.access_token')).toBeNull();
});

it('does not crash when SecureStore is unavailable', async () => {
  (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('no keychain'));
  await expect(saveSession(tokens, user)).resolves.toBeUndefined();
});
