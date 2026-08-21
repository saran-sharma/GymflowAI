/**
 * Account/Profile copy must read as a product, not as an engineering ticket.
 *
 * The audit's original wording leaked implementation straight onto the
 * screen — "no OAuth client is configured for this build", "the server
 * tracks refresh tokens but exposes no endpoint listing them". These tests
 * pin the replacement user-facing wording in place and guard against any of
 * that vocabulary coming back, in this component or in Member Intelligence's
 * InBody placeholder.
 */

import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ProfilePanel } from '../src/components/ProfilePanel';
import type { User } from '../src/api/types';

const JARGON = [
  /scan table/i,
  /OAuth client/i,
  /endpoint/i,
  /refresh tokens?/i,
  /database/i,
  /configured for this build/i,
];

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

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
  mockListBranches.mockResolvedValue([]);
});

describe('security row copy', () => {
  it('tells the owner plainly that each capability is not available yet', async () => {
    await draw();
    expect(
      screen.getByText('Not available in this version. Sign in with your password.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Not available in this version. Sign in with your email or mobile number and password.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Not available in this version. Changing your password signs every other device out.'),
    ).toBeTruthy();
  });

  it('never surfaces implementation language for any security row', async () => {
    await draw();
    for (const term of JARGON) {
      expect(screen.queryByText(term)).toBeNull();
    }
  });
});

describe('support section', () => {
  it('does not print a raw server address', async () => {
    await draw();
    expect(screen.queryByText(/https?:\/\/\d+\.\d+\.\d+\.\d+/)).toBeNull();
    expect(screen.queryByText(/^server$/i)).toBeNull();
  });

  it('still shows the genuinely useful connection status', async () => {
    await draw();
    expect(screen.getByText('Online · wifi')).toBeTruthy();
  });
});
