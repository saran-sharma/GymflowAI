/**
 * The Appearance selector in Account/Preferences.
 *
 * Shared across all three roles via `ProfilePanel`, so this only needs
 * testing once. What matters: the current preference (System/Light/Dark) is
 * shown as selected, and choosing a different one calls through to
 * `setPreference` rather than just updating local component state.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ProfilePanel } from '../src/components/ProfilePanel';
import type { User } from '../src/api/types';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockAuth = {
  user: {
    id: 2,
    email: 'owner@slam.demo',
    full_name: 'Karan Shetty',
    phone: null,
    role: 'owner',
    branch_id: null,
    branch: null,
    has_pin: false,
  } as User,
  signOut: jest.fn(),
  withToken: (action: (t: string) => Promise<unknown>) => action('token'),
  refreshUser: jest.fn(),
};
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/store/NetworkContext', () => ({
  useNetwork: () => ({ isOnline: true, type: 'wifi' }),
}));

const mockSetPreference = jest.fn();
let mockPreference: 'system' | 'light' | 'dark' = 'system';
jest.mock('../src/store/ThemeContext', () => ({
  useTheme: () => ({
    preference: mockPreference,
    resolvedScheme: 'dark',
    setPreference: mockSetPreference,
  }),
}));

const mockListBranches = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  listBranches: (...a: unknown[]) => mockListBranches(...a),
}));

async function draw() {
  const result = render(<ProfilePanel />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPreference = 'system';
  mockListBranches.mockResolvedValue([]);
});

it('shows System selected by default', async () => {
  await draw();
  expect(screen.getByTestId('theme-preference-system').props.accessibilityState.selected).toBe(
    true,
  );
});

it('shows the persisted preference as selected, not always System', async () => {
  mockPreference = 'dark';
  await draw();
  expect(screen.getByTestId('theme-preference-dark').props.accessibilityState.selected).toBe(
    true,
  );
  expect(screen.getByTestId('theme-preference-system').props.accessibilityState.selected).toBe(
    false,
  );
});

it('calls setPreference when Light is chosen', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('theme-preference-light'));
  expect(mockSetPreference).toHaveBeenCalledWith('light');
});

it('calls setPreference when Dark is chosen', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('theme-preference-dark'));
  expect(mockSetPreference).toHaveBeenCalledWith('dark');
});

it('explains that System follows the device setting', async () => {
  await draw();
  expect(screen.getByText("System follows your device's own Light/Dark setting.")).toBeTruthy();
});
