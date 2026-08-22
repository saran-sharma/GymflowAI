/**
 * Members, from the owner's side: every row that names a member opens the
 * same Member Intelligence screen, whether it's an in-progress journey, a
 * completed one, or an active PT package.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import OwnerMembersScreen from '../app/(owner)/members';
import type { Branch, Journey, PTPackage, WhoIsInside } from '../src/api/types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

const mockJourneys = jest.fn();
const mockPackages = jest.fn();
const mockBranches = jest.fn();
const mockInside = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  journeys: (...a: unknown[]) => mockJourneys(...a),
  ptPackages: (...a: unknown[]) => mockPackages(...a),
  listBranches: (...a: unknown[]) => mockBranches(...a),
  whoIsInside: (...a: unknown[]) => mockInside(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function aJourney(partial: Partial<Journey> = {}): Journey {
  return {
    id: 4,
    member_id: 41,
    member_name: 'Ritu Balan',
    branch_id: 1,
    journey_type: 'general_training',
    status: 'active',
    start_date: '2026-07-08',
    end_date: '2026-08-21',
    duration_days: 45,
    assessment_days: 3,
    current_day: 40,
    phase: 'training',
    split_today: 'legs',
    assessment_status: 'completed',
    cardio_completed: 2,
    cardio_required: 3,
    days_completed: 35,
    workouts_completed: 32,
    completion_pct: 88.9,
    completed_on: null,
    completion_summary: null,
    assigned_trainer_id: 1,
    assigned_trainer_name: 'Vikas Menon',
    pt_converted: false,
    is_demo: true,
    ...partial,
  };
}

function aPackage(partial: Partial<PTPackage> = {}): PTPackage {
  return {
    id: 9,
    member_id: 13,
    member_name: 'Rahul Iyer',
    branch_id: 1,
    trainer_id: 1,
    trainer_name: 'Vikas Menon',
    sessions_total: 12,
    sessions_used: 4,
    sessions_remaining: 8,
    status: 'active',
    start_date: '2026-08-13',
    expiry_date: null,
    origin: 'trainer_conversion',
    price_amount: null,
    currency: null,
    low_balance: false,
    effective_status: 'pt_active',
    effective_status_label: 'PT active',
    ...partial,
  };
}

function aBranch(partial: Partial<Branch> = {}): Branch {
  return {
    id: 1,
    code: 'SLAM-NGK',
    name: 'SLAM Nagalkeni',
    city: 'Chennai',
    timezone: 'Asia/Kolkata',
    address: null,
    ...partial,
  } as Branch;
}

function aWhoIsInside(): WhoIsInside {
  return { branch_id: 1, branch_name: 'SLAM Nagalkeni', count: 0, capacity: 90, members: [] };
}

async function draw() {
  const result = render(<OwnerMembersScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockJourneys.mockResolvedValue([
    aJourney(),
    aJourney({
      id: 5,
      member_id: 42,
      member_name: 'Priyanka Das',
      status: 'completed',
      completed_on: '2026-08-14',
      pt_converted: false,
    }),
  ]);
  mockPackages.mockResolvedValue([aPackage()]);
  mockBranches.mockResolvedValue([aBranch({ id: 1 }), aBranch({ id: 2, name: 'SLAM Boganhalli' })]);
  mockInside.mockResolvedValue(aWhoIsInside());
});

describe('branch selection for who is in the gym', () => {
  it('re-fetches who is inside when a different branch is picked', async () => {
    await draw();
    await waitFor(() => expect(mockInside).toHaveBeenCalledWith('token', 1));

    await act(async () => {
      fireEvent.press(screen.getByTestId('inside-branch-2'));
    });

    await waitFor(() => expect(mockInside).toHaveBeenCalledWith('token', 2));
  });
});

describe('member navigation', () => {
  it('opens Member Intelligence from an in-progress journey', async () => {
    await draw();
    fireEvent.press(screen.getByTestId('member-journey-41'));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/member/41');
  });

  it('opens Member Intelligence from a completed journey', async () => {
    await draw();
    fireEvent.press(screen.getByTestId('member-completed-42'));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/member/42');
  });

  it('opens Member Intelligence from an active PT package', async () => {
    await draw();
    fireEvent.press(screen.getByTestId('members-tab-pt'));
    await act(async () => {});
    fireEvent.press(screen.getByTestId('member-pt-13'));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/member/13');
  });
});
