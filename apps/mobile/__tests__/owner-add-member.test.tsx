/**
 * Add member.
 *
 * What matters: Register stays disabled until the required fields (name,
 * a valid-looking email, a long-enough password, a branch) are filled;
 * skipped intake questions are sent as null, never a guessed default; a
 * failed save leaves the form intact; a single-branch owner never sees a
 * branch picker with nothing to pick.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import AddMemberScreen from '../app/(owner)/members/new';
import type { Branch } from '../src/api/types';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

const mockListBranches = jest.fn();
const mockRegisterMember = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  listBranches: (...a: unknown[]) => mockListBranches(...a),
  registerMember: (...a: unknown[]) => mockRegisterMember(...a),
}));

const mockAuth = {
  user: { id: 2, email: 'owner@slam.demo', full_name: 'Karan Shetty', role: 'owner', branch_id: 1 },
  withToken: (action: (t: string) => Promise<unknown>) => action('token'),
};
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

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

async function draw() {
  const result = render(<AddMemberScreen />);
  await act(async () => {});
  return result;
}

async function fillRequired() {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('new-member-name'), 'Priya Shah');
  });
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('new-member-email'), 'priya.shah@example.com');
  });
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('new-member-password'), 'FreshStart2026!');
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListBranches.mockResolvedValue([aBranch()]);
});

describe('a single-branch owner', () => {
  it('never sees a branch picker with nothing to pick', async () => {
    await draw();
    expect(screen.queryByText('Branch')).toBeNull();
  });
});

describe('validation', () => {
  it('keeps Register disabled until name, email and password are all valid', async () => {
    await draw();
    expect(screen.getByTestId('new-member-save').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('new-member-name'), 'Priya Shah');
    expect(screen.getByTestId('new-member-save').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('new-member-email'), 'not-an-email');
    expect(screen.getByTestId('new-member-save').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('new-member-email'), 'priya.shah@example.com');
    expect(screen.getByTestId('new-member-save').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('new-member-password'), 'short');
    expect(screen.getByTestId('new-member-save').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('new-member-password'), 'FreshStart2026!');
    expect(screen.getByTestId('new-member-save').props.accessibilityState.disabled).toBe(false);
  });

  it('defaults the plan to Monthly with no PT sessions', async () => {
    await draw();
    expect(screen.getByTestId('new-member-plan-Monthly').props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByText('30 days · no PT')).toBeTruthy();
  });
});

describe('registering', () => {
  it('sends skipped intake questions as null, not a guessed default', async () => {
    mockRegisterMember.mockResolvedValue({
      member_id: 9,
      member_code: 'SLAM-NGK-M0009',
      full_name: 'Priya Shah',
      email: 'priya.shah@example.com',
      branch: { id: 1, code: 'SLAM-NGK', name: 'SLAM Nagalkeni' },
      membership: {
        id: 1,
        plan_name: 'Monthly',
        status: 'active',
        starts_on: '2026-08-23',
        ends_on: '2026-09-22',
        pt_sessions_total: 0,
        pt_sessions_used: 0,
      },
      intake: null,
    });
    await draw();
    await fillRequired();
    await act(async () => {
      fireEvent.press(screen.getByTestId('new-member-save'));
    });

    expect(mockRegisterMember).toHaveBeenCalledWith(
      {
        full_name: 'Priya Shah',
        email: 'priya.shah@example.com',
        phone: null,
        password: 'FreshStart2026!',
        branch_id: 1,
        plan_name: 'Monthly',
        intake: {
          fitness_goal: null,
          experience_level: null,
          training_frequency_per_week: null,
          preferred_style: null,
          preferred_time: null,
          wants_pt: null,
          limitations: null,
          contact_preference: null,
        },
      },
      'token',
    );
  });

  it('sends the intake questionnaire when it is filled in', async () => {
    mockRegisterMember.mockResolvedValue({
      member_id: 9,
      member_code: 'SLAM-NGK-M0009',
      full_name: 'Priya Shah',
      email: 'priya.shah@example.com',
      branch: { id: 1, code: 'SLAM-NGK', name: 'SLAM Nagalkeni' },
      membership: {
        id: 1,
        plan_name: 'Elite Annual + PT',
        status: 'active',
        starts_on: '2026-08-23',
        ends_on: '2027-08-23',
        pt_sessions_total: 12,
        pt_sessions_used: 0,
      },
      intake: null,
    });
    await draw();
    await fillRequired();
    fireEvent.press(screen.getByTestId('new-member-plan-Elite Annual + PT'));
    fireEvent.press(screen.getByTestId('new-member-experience-intermediate'));
    fireEvent.press(screen.getByTestId('new-member-frequency-4'));
    fireEvent.press(screen.getByTestId('new-member-style-strength'));
    fireEvent.press(screen.getByTestId('new-member-wants-pt-yes'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('new-member-save'));
    });

    expect(mockRegisterMember).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_name: 'Elite Annual + PT',
        intake: expect.objectContaining({
          experience_level: 'intermediate',
          training_frequency_per_week: 4,
          preferred_style: 'strength',
          wants_pt: true,
        }),
      }),
      'token',
    );
  });

  it('confirms the new member with their member code', async () => {
    mockRegisterMember.mockResolvedValue({
      member_id: 9,
      member_code: 'SLAM-NGK-M0009',
      full_name: 'Priya Shah',
      email: 'priya.shah@example.com',
      branch: { id: 1, code: 'SLAM-NGK', name: 'SLAM Nagalkeni' },
      membership: {
        id: 1,
        plan_name: 'Monthly',
        status: 'active',
        starts_on: '2026-08-23',
        ends_on: '2026-09-22',
        pt_sessions_total: 0,
        pt_sessions_used: 0,
      },
      intake: null,
    });
    await draw();
    await fillRequired();
    await act(async () => {
      fireEvent.press(screen.getByTestId('new-member-save'));
    });

    await waitFor(() =>
      expect(screen.getByText('Priya Shah is registered — SLAM-NGK-M0009.')).toBeTruthy(),
    );
  });

  it('keeps the form intact if registration fails', async () => {
    mockRegisterMember.mockRejectedValue(new Error('network down'));
    await draw();
    await fillRequired();
    await act(async () => {
      fireEvent.press(screen.getByTestId('new-member-save'));
    });

    await waitFor(() =>
      expect(
        screen.getByText('That did not save. Check your connection and try again.'),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId('new-member-name').props.value).toBe('Priya Shah');
  });
});
