/**
 * The New Members list — the detail behind the Dashboard's "New members" tile.
 *
 * That tile used to open onto the marketing overview, a source-by-source
 * funnel view, not a list of people. This is that list: name, when, plan,
 * source, trainer, status, each row opening Member Intelligence.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import OwnerNewMembersScreen from '../app/(owner)/new-members';
import type { NewMembers } from '../src/api/types';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const mockNewMembers = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  newMembers: (...a: unknown[]) => mockNewMembers(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function aNewMembers(partial: Partial<NewMembers> = {}): NewMembers {
  return {
    window_days: 90,
    count: 2,
    items: [
      {
        member_id: 21,
        member_name: 'Isha Patel',
        branch_id: 1,
        registered_on: '2026-08-20',
        plan_name: 'Annual',
        source_label: 'Instagram',
        assigned_trainer_name: 'Vikas Menon',
        status: 'active',
      },
      {
        member_id: 22,
        member_name: 'Dev Anand',
        branch_id: 1,
        registered_on: '2026-08-01',
        plan_name: 'Monthly',
        source_label: null,
        assigned_trainer_name: null,
        status: 'expired',
      },
    ],
    ...partial,
  };
}

async function draw() {
  const result = render(<OwnerNewMembersScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNewMembers.mockResolvedValue(aNewMembers());
});

it('lists each new member with when they joined, their plan, source and trainer', async () => {
  await draw();
  expect(screen.getByText('Isha Patel')).toBeTruthy();
  expect(screen.getByText(/Annual/)).toBeTruthy();
  expect(screen.getByText(/Instagram.*Vikas Menon/)).toBeTruthy();
});

it('says plainly when there is no source or trainer recorded', async () => {
  await draw();
  expect(screen.getByText('No source or trainer recorded')).toBeTruthy();
});

it('says plainly when nobody has joined recently', async () => {
  mockNewMembers.mockResolvedValue(aNewMembers({ items: [], count: 0 }));
  await draw();
  expect(screen.getByText('Nothing to show yet')).toBeTruthy();
});

it('opens Member Intelligence when a row is tapped', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('new-member-row-21'));
  expect(mockPush).toHaveBeenCalledWith('/(owner)/member/21');
});
