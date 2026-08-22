/**
 * The Renewals list — the detail behind the Dashboard's "Renewals due" tile.
 *
 * Before this screen, `Renewals.items` (member name, plan, expiry, days
 * remaining) came back from the server on every dashboard load and was never
 * rendered anywhere; the tile's tap target landed on the Members screen,
 * which has no renewal or expiry view at all. This is that list, plus the
 * two actions an owner wants from it.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import OwnerRenewalsScreen from '../app/(owner)/renewals';
import type { Renewals } from '../src/api/types';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const mockRenewalsDue = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  renewalsDue: (...a: unknown[]) => mockRenewalsDue(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function aRenewals(partial: Partial<Renewals> = {}): Renewals {
  return {
    window_days: 30,
    count: 2,
    items: [
      {
        member_id: 13,
        member_name: 'Rahul Iyer',
        branch_id: 1,
        plan_name: 'Annual',
        ends_on: '2026-08-25',
        days_remaining: 3,
      },
      {
        member_id: 14,
        member_name: 'Sana Kapoor',
        branch_id: 1,
        plan_name: 'Quarterly',
        ends_on: '2026-08-15',
        days_remaining: -7,
      },
    ],
    ...partial,
  };
}

async function draw() {
  const result = render(<OwnerRenewalsScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRenewalsDue.mockResolvedValue(aRenewals());
});

it('lists each expiring membership with its plan and expiry', async () => {
  await draw();
  expect(screen.getByText('Rahul Iyer')).toBeTruthy();
  expect(screen.getByText(/Annual/)).toBeTruthy();
  expect(screen.getByText('3d left')).toBeTruthy();
  expect(screen.getByText('Sana Kapoor')).toBeTruthy();
  expect(screen.getByText('Expired 7d ago')).toBeTruthy();
});

it('says plainly when nothing is expiring soon', async () => {
  mockRenewalsDue.mockResolvedValue(aRenewals({ items: [], count: 0 }));
  await draw();
  expect(screen.getByText('All caught up')).toBeTruthy();
});

it('opens the member on "Review member"', async () => {
  // Sorted soonest-to-expire first, which puts the already-expired member
  // (days_remaining -7) ahead of the one with 3 days left.
  await draw();
  fireEvent.press(screen.getAllByText('Review member')[0]);
  expect(mockPush).toHaveBeenCalledWith('/(owner)/member/14');
});

it('opens Broadcast pre-filled to that one member on "Notify"', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('renewal-notify-13'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(owner)/broadcast',
    params: { memberId: '13', memberName: 'Rahul Iyer' },
  });
});
