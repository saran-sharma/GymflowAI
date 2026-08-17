/**
 * The login screen, rendered.
 *
 * Covers the things that break silently: the submit button's enabled state,
 * whether a failure reaches the user in words they can act on, that the
 * password toggle actually toggles, and that the role chip is a shortcut
 * rather than an authorization decision.
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

function signedInAs(role: string) {
  return {
    user: { id: 1, email: 'owner@slam.demo', full_name: 'Karan Shetty', role },
    tokens: { access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 1800 },
  };
}

async function fillCredentials(identifier = 'owner@slam.demo', password = 'SlamDemo2026!') {
  fireEvent.changeText(screen.getByTestId('login-email'), identifier);
  fireEvent.changeText(screen.getByTestId('login-password'), password);
}

beforeEach(() => {
  mockReplace.mockReset();
  mockLogin.mockReset();
});

it('shows the SLAM logo, the product name and the positioning line', async () => {
  await renderLogin();
  expect(screen.getByTestId('slam-logo')).toBeTruthy();
  expect(screen.getByLabelText('SLAM Fitness Studio')).toBeTruthy();
  expect(screen.getByText('GymFlow AI')).toBeTruthy();
  expect(screen.getByText('Smart operations across every SLAM branch.')).toBeTruthy();
});

it('offers no role selector — the server decides who you are', async () => {
  await renderLogin();
  // The chips were always a lie: signIn never sent the role, and routing has
  // always used the role the server returned. Asking before authenticating is
  // a question the app cannot act on.
  for (const role of ['owner', 'trainer', 'member', 'super_admin']) {
    expect(screen.queryByTestId(`role-${role}`)).toBeNull();
  }
});

it('draws the unbuilt sign-in routes and says why each is unavailable', async () => {
  await renderLogin();

  fireEvent.press(screen.getByTestId('passkey'));
  expect(screen.getByText(/WebAuthn endpoint GymFlow does not have/)).toBeTruthy();

  fireEvent.press(screen.getByTestId('social-google'));
  expect(screen.getByText(/no OAuth client configured/)).toBeTruthy();
});

it('does not offer Email as a social provider, which the password field already is', async () => {
  await renderLogin();
  expect(screen.getByTestId('social-apple')).toBeTruthy();
  expect(screen.getByTestId('social-google')).toBeTruthy();
  expect(screen.queryByTestId('social-email')).toBeNull();
});

it('keeps submit disabled until both fields are usable', async () => {
  await renderLogin();
  const submit = screen.getByTestId('login-submit');
  expect(submit.props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(screen.getByTestId('login-email'), 'owner@slam.demo');
  expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(screen.getByTestId('login-password'), 'short');
  expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(screen.getByTestId('login-password'), 'SlamDemo2026!');
  expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(false);
});

it('accepts a mobile number as well as an email', async () => {
  await renderLogin();
  fireEvent.changeText(screen.getByTestId('login-email'), '9000012345');
  fireEvent.changeText(screen.getByTestId('login-password'), 'SlamDemo2026!');
  expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(false);
});

it('rejects an identifier that is neither an email nor a number', async () => {
  await renderLogin();
  fireEvent.changeText(screen.getByTestId('login-email'), 'not an email');
  fireEvent.changeText(screen.getByTestId('login-password'), 'SlamDemo2026!');
  expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);
});

it('hides the password until the eye is tapped', async () => {
  await renderLogin();
  const field = screen.getByTestId('login-password');
  expect(field.props.secureTextEntry).toBe(true);

  fireEvent.press(screen.getByTestId('toggle-password'));
  expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(false);
  expect(screen.getByLabelText('Hide password')).toBeTruthy();

  fireEvent.press(screen.getByTestId('toggle-password'));
  expect(screen.getByTestId('login-password').props.secureTextEntry).toBe(true);
});

it('routes on the role the server returns', async () => {
  mockLogin.mockResolvedValue(signedInAs('trainer'));
  await renderLogin();

  await fillCredentials();
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(trainer)'));
});

it('explains bad credentials without leaking anything technical', async () => {
  mockLogin.mockRejectedValue(new ApiError(401, 'http_401', 'Incorrect email or password'));
  await renderLogin();
  await fillCredentials();
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() =>
    expect(screen.getByText('That email or password is not right. Try again.')).toBeTruthy(),
  );
  expect(mockReplace).not.toHaveBeenCalled();
});

it('reports a lost connection rather than a network stack trace', async () => {
  mockLogin.mockRejectedValue(new ApiError(0, 'offline', 'No connection to GymFlow.'));
  await renderLogin();
  await fillCredentials();
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() =>
    expect(
      screen.getByText('No connection to GymFlow. Check your network and try again.'),
    ).toBeTruthy(),
  );
});

it('reports a server outage as an outage', async () => {
  mockLogin.mockRejectedValue(new ApiError(503, 'http_503', 'Service Unavailable'));
  await renderLogin();
  await fillCredentials();
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() =>
    expect(screen.getByText('GymFlow is unavailable right now. Try again shortly.')).toBeTruthy(),
  );
});

it('reports a locked account as something the branch can fix', async () => {
  mockLogin.mockRejectedValue(new ApiError(403, 'http_403', 'Account is temporarily locked'));
  await renderLogin();
  await fillCredentials();
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() =>
    expect(screen.getByText('This account is locked. Contact your branch manager.')).toBeTruthy(),
  );
});

it('offers a way to get help without leaving the screen', async () => {
  await renderLogin();
  fireEvent.press(screen.getByTestId('forgot-password'));
  await waitFor(() => expect(screen.getByText(/Ask your SLAM branch manager/)).toBeTruthy());
});

it('points at the branches by name from contact help', async () => {
  await renderLogin();
  fireEvent.press(screen.getByTestId('contact-branch'));
  await waitFor(() => expect(screen.getByText(/Nagalkeni, Boganhalli and Alandur/)).toBeTruthy());
});
