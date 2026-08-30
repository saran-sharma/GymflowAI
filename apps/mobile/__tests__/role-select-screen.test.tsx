/**
 * The pre-login "How are you using GymFlow?" screen.
 *
 * Routing + context only. Every option lands on the same `/(auth)/login`
 * route; the chosen role rides along as an `expected` param that the login
 * screen uses ONLY to refuse an obvious mismatch after the backend has
 * authenticated. The authoritative role is always `user.role` from the
 * session — a tap here never grants anything and is never sent to the server.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import RoleSelectScreen from '../app/(auth)/role-select';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

beforeEach(() => {
  mockPush.mockClear();
});

test('shows all three role options', () => {
  render(<RoleSelectScreen />);
  expect(screen.getByText(/I'm a Member/)).toBeTruthy();
  expect(screen.getByText(/I'm a Trainer/)).toBeTruthy();
  expect(screen.getByText(/I'm a Gym Owner/)).toBeTruthy();
});

test.each([
  ["I'm a Member", 'member'],
  ["I'm a Trainer", 'trainer'],
  ["I'm a Gym Owner", 'owner'],
])('tapping %s goes to the login route with expected=%s as context only', (label, expected) => {
  render(<RoleSelectScreen />);
  fireEvent.press(screen.getByLabelText(label));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/login', params: { expected } });
  expect(mockPush).toHaveBeenCalledTimes(1);
});

test('the expected param is one of exactly the three role families — nothing else', () => {
  render(<RoleSelectScreen />);
  for (const label of ["I'm a Member", "I'm a Trainer", "I'm a Gym Owner"]) {
    fireEvent.press(screen.getByLabelText(label));
  }
  const params = mockPush.mock.calls.map((c) => c[0].params.expected);
  expect(new Set(params)).toEqual(new Set(['member', 'trainer', 'owner']));
});
