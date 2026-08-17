import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions } from 'react-native';
import LoginScreen from '../app/(auth)/login';

jest.mock('../src/store/AuthContext', () => ({
  useAuth: () => ({ signIn: jest.fn() }),
  homeRouteForRole: () => '/(member)',
}));
jest.mock('../src/store/NetworkContext', () => ({
  useNetwork: () => ({ isOnline: true }),
  OFFLINE_MESSAGE: 'offline',
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

// Every phone width the brief names, plus a short device.
for (const [w, h, label] of [
  [320, 568, 'iPhone SE'],
  [375, 667, '375'],
  [390, 844, '390'],
  [430, 932, '430 Pro Max'],
] as const) {
  it(`renders every essential control at ${label} (${w}x${h})`, async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: w, height: h, scale: 3, fontScale: 1 });
    render(<LoginScreen />);
    await act(async () => {});
    for (const id of [
      'login-email',
      'login-password',
      'login-submit',
      'forgot-password',
      'passkey',
      'social-apple',
      'social-google',
      'contact-branch',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByText('Welcome back.')).toBeTruthy();
    expect(screen.getByText('GymFlow AI')).toBeTruthy();
  });
}
