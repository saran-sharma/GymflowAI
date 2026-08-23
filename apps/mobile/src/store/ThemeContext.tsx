/**
 * Theme preference: System / Light / Dark.
 *
 * `applyColorScheme` (src/design/tokens) mutates the live `color` token
 * object in place — dozens of modules hold a direct reference to that exact
 * object, so this never reassigns it. What this provider owns is deciding
 * *which* scheme should be active (system default, or the user's own
 * choice) and making sure every mounted screen re-renders once it changes.
 *
 * The mutation happens synchronously in the render body below, not inside
 * an effect: an effect runs after the first paint, which would show one
 * frame of the wrong theme on every cold start. Calling `applyColorScheme`
 * during render is safe here because it is a pure, side-effect-free
 * assignment (no I/O, no subscription) — safe to invoke twice under
 * StrictMode's double-render, unlike a fetch or a log line would be.
 */

import * as SecureStore from 'expo-secure-store';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { applyColorScheme, type ColorScheme } from '../design/tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'gymflow.theme_preference';

interface ThemeState {
  /** What the user picked — System, Light, or Dark. */
  preference: ThemePreference;
  /** What is actually on screen right now, after resolving System. */
  resolvedScheme: ColorScheme;
  setPreference: (next: ThemePreference) => void;
}

// Defaults to the resolved dark scheme, not null: component tests render
// screens directly, with no `ThemeProvider` ancestor, and every one of them
// must keep rendering exactly as it did before theming existed rather than
// suddenly requiring a provider wrapper just to call `useThemedStyles`.
const ThemeContext = createContext<ThemeState>({
  preference: 'system',
  resolvedScheme: 'dark',
  setPreference: () => {},
});

function resolve(preference: ThemePreference, system: ColorScheme | null): ColorScheme {
  if (preference === 'system') return system ?? 'dark';
  return preference;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  // Read the persisted choice once. Until it lands, "system" is the correct
  // default anyway, so there is nothing to guess at.
  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedScheme = resolve(
    preference,
    systemScheme === 'light' || systemScheme === 'dark' ? systemScheme : null,
  );

  // Mutates the shared `color` object in place — see the module docstring.
  applyColorScheme(resolvedScheme);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {
      // A preference that fails to persist just resets to System next
      // launch — never worth crashing over.
    });
  };

  const value = useMemo<ThemeState>(
    () => ({ preference, resolvedScheme, setPreference }),
    // `hydrated` deliberately not in the dependency list: it exists only to
    // avoid a flash of an unpersisted preference before the read completes,
    // not to change what this context exposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preference, resolvedScheme, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}
