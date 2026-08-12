/**
 * The login screen, rendered.
 *
 * Covers the two things that break silently: the submit button's enabled
 * state, and whether a server error actually reaches the user.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { ApiError } from '../src/api/client';
import LoginScreen from '../app/(auth)/login';
import { AuthProvider } from '../src/store/AuthContext';
import { NetworkProvider } from '../src/store/NetworkContext';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

const mockLogin = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  logout: jest.fn(),
  refresh: jest.fn(),
  me: jest.fn(),
}));

async function renderLogin() {
  const result = render(
    <NetworkProvider>
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>
    </NetworkProvider>,
  );
  // AuthProvider hydrates any stored session on mount. Letting that settle
  // before the test drives the screen keeps React from warning about an
  // update outside act().
  await act(async () => {});
  return result;
}

beforeEach(() => {
  mockReplace.mockReset();
  mockLogin.mockReset();
});

it('shows the SLAM branding and the product name', async () => {
  await renderLogin();
  expect(screen.getByText('SLAM')).toBeTruthy();
  expect(screen.getByText('GymFlow AI')).toBeTruthy();
});

it('keeps submit disabled until both fields are usable', async () => {
  await renderLogin();
  const submit = screen.getByTestId('login-submit');
  expect(submit.props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(screen.getByTestId('login-email'), 'owner@slam.demo');
  expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

  // Eight characters is the backend's minimum; a shorter one is not sent.
  fireEvent.changeText(screen.getByTestId('login-password'), 'short');
  expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(screen.getByTestId('login-password'), 'SlamDemo2026!');
  expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(false);
});

it('routes an owner to the owner app', async () => {
  mockLogin.mockResolvedValueOnce({
    user: { id: 1, role: 'owner', full_name: 'Karan Shetty', email: 'owner@slam.demo', branch: null, branch_id: null, phone: null, has_pin: false },
    tokens: { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 1800 },
  });

  await renderLogin();
  fireEvent.changeText(screen.getByTestId('login-email'), 'owner@slam.demo');
  fireEvent.changeText(screen.getByTestId('login-password'), 'SlamDemo2026!');
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(owner)'));
});

it('routes a trainer to the trainer app', async () => {
  mockLogin.mockResolvedValueOnce({
    user: { id: 2, role: 'trainer', full_name: 'Vikas Menon', email: 'v@slam.demo', branch: null, branch_id: 4, phone: null, has_pin: true },
    tokens: { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 1800 },
  });

  await renderLogin();
  fireEvent.changeText(screen.getByTestId('login-email'), 'v@slam.demo');
  fireEvent.changeText(screen.getByTestId('login-password'), 'SlamDemo2026!');
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(trainer)'));
});

it('shows the server message when sign-in is refused', async () => {
  mockLogin.mockRejectedValueOnce(new ApiError(401, 'http_401', 'Incorrect email or password'));

  await renderLogin();
  fireEvent.changeText(screen.getByTestId('login-email'), 'owner@slam.demo');
  fireEvent.changeText(screen.getByTestId('login-password'), 'WrongPassword1!');
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() => expect(screen.getByText('Incorrect email or password')).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalled();
});

it('explains an unreachable server rather than showing a raw fetch error', async () => {
  mockLogin.mockRejectedValueOnce(new ApiError(0, 'offline', 'No connection to GymFlow.'));

  await renderLogin();
  fireEvent.changeText(screen.getByTestId('login-email'), 'owner@slam.demo');
  fireEvent.changeText(screen.getByTestId('login-password'), 'SlamDemo2026!');
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() =>
    expect(screen.getByText('Cannot reach GymFlow. Check your connection.')).toBeTruthy(),
  );
});
