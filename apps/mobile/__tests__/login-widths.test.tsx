import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';
import LoginScreen from '../app/(auth)/login';

jest.mock('../src/store/AuthContext', () => ({
  useAuth: () => ({ signIn: jest.fn(), signOut: jest.fn() }),
  homeRouteForRole: () => '/(member)',
  RoleMismatchError: class RoleMismatchError extends Error {},
  roleFamily: (r: string) => (r === 'trainer' ? 'trainer' : r === 'member' ? 'member' : 'owner'),
}));
jest.mock('../src/store/NetworkContext', () => ({
  useNetwork: () => ({ isOnline: true }),
  OFFLINE_MESSAGE: 'offline',
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// Every phone width the brief names, plus a short device.
for (const [w, h, label] of [
  [320, 568, 'iPhone SE'],
  [375, 667, '375'],
  [390, 844, '390'],
  [430, 932, '430 Pro Max'],
] as const) {
  it(`renders the identify step's essential controls at ${label} (${w}x${h})`, async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: w, height: h, scale: 3, fontScale: 1 });
    render(<LoginScreen />);
    await act(async () => {});
    for (const id of ['login-identifier', 'login-continue']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByText('Welcome back.')).toBeTruthy();
    expect(screen.getByText('GymFlow AI')).toBeTruthy();
  });

  it(`renders the password step's essential controls at ${label} (${w}x${h})`, async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: w, height: h, scale: 3, fontScale: 1 });
    render(<LoginScreen />);
    await act(async () => {});
    fireEvent.changeText(screen.getByTestId('login-identifier'), 'owner@slam.demo');
    fireEvent.press(screen.getByTestId('login-continue'));
    await act(async () => {});
    for (const id of ['change-identifier', 'login-password', 'toggle-password', 'forgot-password', 'login-submit']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });
}
