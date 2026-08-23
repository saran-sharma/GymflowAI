/**
 * `ThemeProvider` — the actual state machine behind the Appearance selector.
 *
 * What matters: it defaults to System, a persisted choice from a previous
 * launch is respected on the next one, and choosing Light/Dark both updates
 * what `useTheme()` reports and survives a remount (proving it was actually
 * written to storage, not just held in memory).
 */

import { act, render, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { Text } from 'react-native';

import { color } from '../src/design/tokens';
import { ThemeProvider, useTheme } from '../src/store/ThemeContext';

function Probe() {
  const { preference, resolvedScheme, setPreference } = useTheme();
  return (
    <>
      <Text testID="preference">{preference}</Text>
      <Text testID="resolved">{resolvedScheme}</Text>
      <Text testID="set-light" onPress={() => setPreference('light')}>
        set light
      </Text>
      <Text testID="set-dark" onPress={() => setPreference('dark')}>
        set dark
      </Text>
    </>
  );
}

async function draw() {
  const result = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  await act(async () => {});
  return result;
}

beforeEach(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (SecureStore as any).__store?.clear();
});

it('defaults to System with no persisted preference', async () => {
  await draw();
  expect(screen.getByTestId('preference').props.children).toBe('system');
});

it('choosing Dark updates the resolved scheme and the live color tokens', async () => {
  await draw();
  await act(async () => {
    screen.getByTestId('set-dark').props.onPress();
  });
  expect(screen.getByTestId('resolved').props.children).toBe('dark');
  expect(color.background).toBe('#0A0A0A');
});

it('choosing Light updates the live color tokens to the light palette', async () => {
  await draw();
  await act(async () => {
    screen.getByTestId('set-light').props.onPress();
  });
  expect(screen.getByTestId('resolved').props.children).toBe('light');
  expect(color.background).toBe('#FAF6EF');
  expect(color.text).toBe('#211C15');
});

it('writes the choice to persistent storage, not just in-memory state', async () => {
  await draw();
  await act(async () => {
    screen.getByTestId('set-light').props.onPress();
  });
  expect(await SecureStore.getItemAsync('gymflow.theme_preference')).toBe('light');
});

it('a fresh provider instance reads back a previously persisted preference', async () => {
  await SecureStore.setItemAsync('gymflow.theme_preference', 'dark');
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  await act(async () => {});
  expect(screen.getByTestId('preference').props.children).toBe('dark');
});
