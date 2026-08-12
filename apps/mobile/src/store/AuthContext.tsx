/**
 * Who is signed in, and the one place that knows how to get a valid token.
 *
 * `withToken` refreshes transparently on a 401 and retries once, so no screen
 * has to think about token lifetime. If the refresh also fails the session is
 * cleared and the router falls back to the login screen.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as api from '../api/endpoints';
import { ApiError } from '../api/client';
import type { Role, User } from '../api/types';
import { clearSession, loadSession, saveSession, saveTokens } from './session';

interface AuthState {
  user: User | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Run an API call with a valid access token, refreshing once if needed. */
  withToken: <T>(call: (token: string) => Promise<T>) => Promise<T>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');

  // Kept in refs rather than state: `withToken` must read the current value
  // without waiting for a re-render.
  const accessToken = useRef<string | null>(null);
  const refreshToken = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadSession();
      if (cancelled) return;
      if (stored) {
        accessToken.current = stored.accessToken;
        refreshToken.current = stored.refreshToken;
        setUser(stored.user);
        setStatus('authenticated');
      } else {
        setStatus('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const forgetSession = useCallback(async () => {
    accessToken.current = null;
    refreshToken.current = null;
    await clearSession();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const renew = useCallback(async (): Promise<string | null> => {
    if (!refreshToken.current) return null;

    // Several screens can hit a 401 at once on a cold start; only one of them
    // should spend the refresh token, or the rest will present a retired one.
    if (!refreshInFlight.current) {
      refreshInFlight.current = (async () => {
        try {
          const tokens = await api.refresh(refreshToken.current as string);
          accessToken.current = tokens.access_token;
          refreshToken.current = tokens.refresh_token;
          await saveTokens(tokens);
          return tokens.access_token;
        } catch {
          return null;
        } finally {
          refreshInFlight.current = null;
        }
      })();
    }
    return refreshInFlight.current;
  }, []);

  const withToken = useCallback(
    async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
      const token = accessToken.current;
      if (!token) throw new ApiError(401, 'no_session', 'Please sign in again.');

      try {
        return await call(token);
      } catch (error) {
        if (!(error instanceof ApiError) || !error.isAuthError) throw error;

        const renewed = await renew();
        if (!renewed) {
          await forgetSession();
          throw new ApiError(401, 'session_expired', 'Your session expired. Please sign in again.');
        }
        return call(renewed);
      }
    },
    [forgetSession, renew],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password, 'GymFlow Mobile');
    accessToken.current = result.tokens.access_token;
    refreshToken.current = result.tokens.refresh_token;
    await saveSession(result.tokens, result.user);
    setUser(result.user);
    setStatus('authenticated');
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    const token = accessToken.current;
    const refresh = refreshToken.current;
    // Revoke server-side when we can, but never block the user from leaving.
    if (token && refresh) {
      try {
        await api.logout(refresh, token);
      } catch {
        // Offline sign-out still clears the device.
      }
    }
    await forgetSession();
  }, [forgetSession]);

  const refreshUser = useCallback(async () => {
    try {
      const fresh = await withToken((token) => api.me(token));
      setUser(fresh);
    } catch {
      // A failed profile refresh is not a reason to sign the user out.
    }
  }, [withToken]);

  const value = useMemo<AuthState>(
    () => ({ user, status, signIn, signOut, refreshUser, withToken }),
    [user, status, signIn, signOut, refreshUser, withToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Where a role lands after signing in. */
export function homeRouteForRole(role: Role): string {
  switch (role) {
    case 'trainer':
      return '/(trainer)';
    case 'member':
      return '/(member)';
    default:
      return '/(owner)';
  }
}
