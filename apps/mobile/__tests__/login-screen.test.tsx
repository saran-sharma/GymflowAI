/**
 * The two-step login screen, rendered.
 *
 * Identify then authenticate: the first step only validates the shape of an
 * email/mobile identifier and never claims an account exists, the second is
 * the one call that actually authenticates. Error copy stays deliberately
 * generic across bad-password and locked-account responses so neither
 * account existence nor account state leaks before authentication succeeds.
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

async function goToPasswordStep(identifier = 'owner@slam.demo') {
  fireEvent.changeText(screen.getByTestId('login-identifier'), identifier);
  fireEvent.press(screen.getByTestId('login-continue'));
  await waitFor(() => expect(screen.getByTestId('login-password')).toBeTruthy());
}

async function fillCredentials(identifier = 'owner@slam.demo', password = 'SlamDemo2026!') {
  await goToPasswordStep(identifier);
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
  expect(screen.getByText('Your fitness journey, all in one place.')).toBeTruthy();
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

it('keeps Continue disabled until the identifier is valid', async () => {
  await renderLogin();
  expect(screen.getByTestId('login-continue').props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(screen.getByTestId('login-identifier'), 'owner@slam.demo');
  expect(screen.getByTestId('login-continue').props.accessibilityState.disabled).toBe(false);
});

it('accepts a mobile number as well as an email', async () => {
  await renderLogin();
  fireEvent.changeText(screen.getByTestId('login-identifier'), '9000012345');
  expect(screen.getByTestId('login-continue').props.accessibilityState.disabled).toBe(false);
});

it('rejects an identifier that is neither an email nor a number', async () => {
  await renderLogin();
  fireEvent.changeText(screen.getByTestId('login-identifier'), 'not an email');
  expect(screen.getByTestId('login-continue').props.accessibilityState.disabled).toBe(true);
});

it('keeps Sign in disabled until the password is long enough', async () => {
  await renderLogin();
  await goToPasswordStep();
  const submit = screen.getByTestId('login-submit');
  expect(submit.props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(screen.getByTestId('login-password'), 'short');
  expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(screen.getByTestId('login-password'), 'SlamDemo2026!');
  expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(false);
});

it('lets you change the identifier from the password step, clearing what was typed', async () => {
  await renderLogin();
  await goToPasswordStep('owner@slam.demo');
  fireEvent.changeText(screen.getByTestId('login-password'), 'SlamDemo2026!');

  fireEvent.press(screen.getByTestId('change-identifier'));

  await waitFor(() => expect(screen.getByTestId('login-continue')).toBeTruthy());
  expect(screen.queryByTestId('login-password')).toBeNull();
});

it('hides the password until the eye is tapped', async () => {
  await renderLogin();
  await goToPasswordStep();
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

  // A brief success screen shows before the redirect fires.
  await waitFor(() => expect(screen.getByText(/Karan/)).toBeTruthy());
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(trainer)'), { timeout: 2000 });
});

it('explains bad credentials without leaking anything technical', async () => {
  mockLogin.mockRejectedValue(new ApiError(401, 'http_401', 'Incorrect email or password'));
  await renderLogin();
  await fillCredentials();
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() =>
    expect(screen.getByText('Invalid email/mobile number or password.')).toBeTruthy(),
  );
  expect(mockReplace).not.toHaveBeenCalled();
});

it('treats a locked account the same as bad credentials, so account state is not leaked', async () => {
  mockLogin.mockRejectedValue(new ApiError(403, 'http_403', 'Account is temporarily locked'));
  await renderLogin();
  await fillCredentials();
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() =>
    expect(screen.getByText('Invalid email/mobile number or password.')).toBeTruthy(),
  );
});

it('reports a lost connection rather than a network stack trace', async () => {
  mockLogin.mockRejectedValue(new ApiError(0, 'offline', 'No connection to GymFlow.'));
  await renderLogin();
  await fillCredentials();
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() =>
    expect(
      screen.getByText("We couldn't reach GymFlow right now. Check your connection and try again."),
    ).toBeTruthy(),
  );
});

it('folds a server outage into the same connection message', async () => {
  mockLogin.mockRejectedValue(new ApiError(503, 'http_503', 'Service Unavailable'));
  await renderLogin();
  await fillCredentials();
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() =>
    expect(
      screen.getByText("We couldn't reach GymFlow right now. Check your connection and try again."),
    ).toBeTruthy(),
  );
});

it('reports rate limiting distinctly from bad credentials', async () => {
  mockLogin.mockRejectedValue(new ApiError(429, 'http_429', 'Too Many Requests'));
  await renderLogin();
  await fillCredentials();
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() =>
    expect(
      screen.getByText('Too many attempts. Please wait a few minutes before trying again.'),
    ).toBeTruthy(),
  );
});

it('sends Forgot password to a reset step that is honest about not being wired up yet', async () => {
  await renderLogin();
  await goToPasswordStep();
  fireEvent.press(screen.getByTestId('forgot-password'));

  await waitFor(() => expect(screen.getByTestId('reset-identifier')).toBeTruthy());
  expect(
    screen.getByText(/Password resets are arranged by your SLAM branch/),
  ).toBeTruthy();
});

it('gets back to sign in from the reset step', async () => {
  await renderLogin();
  await goToPasswordStep();
  fireEvent.press(screen.getByTestId('forgot-password'));
  await waitFor(() => expect(screen.getByTestId('reset-back')).toBeTruthy());

  fireEvent.press(screen.getByTestId('reset-back'));
  await waitFor(() => expect(screen.getByTestId('login-continue')).toBeTruthy());
});

it('names the branch as the way to create an account, without a fake button', async () => {
  await renderLogin();
  expect(screen.getByText('Contact your SLAM branch')).toBeTruthy();
  // Accounts are created by the branch, not from the app — there is nothing
  // here for a member to press, unlike the old "Create account" affordance.
  expect(screen.queryByTestId('contact-branch')).toBeNull();
});
