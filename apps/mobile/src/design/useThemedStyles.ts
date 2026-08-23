import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { useTheme } from '../store/ThemeContext';

/**
 * `StyleSheet.create({...})` at module scope evaluates its argument once,
 * when the file first loads — any `color.X` (or `hairline`, `elevation`,
 * `toneColor`) inside it is read as a plain string at that instant and never
 * again, no matter how many times the component re-renders or how the theme
 * changes afterward. This is the one thing a live-mutated `color` object
 * cannot fix on its own.
 *
 * `useThemedStyles` is the fix: call it inside a component with the same
 * factory you would have passed to `StyleSheet.create` directly, and it
 * re-invokes that factory — re-reading whatever tokens it references —
 * whenever the resolved theme changes, memoised in between.
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<unknown>>(
  factory: () => T,
): T {
  // Reads through `useTheme` rather than a separate export: any test that
  // mocks `ThemeContext` already has to stub `useTheme` for the rest of the
  // screen, and a second, easy-to-forget export is exactly how this hook
  // would end up silently reading `undefined` in exactly that kind of test.
  const { resolvedScheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- factory is re-created every render by design; resolvedScheme alone should invalidate the memo.
  return useMemo(() => StyleSheet.create(factory()), [resolvedScheme]);
}
