/**
 * Broadcast Center.
 *
 * What matters here: the preview shows exactly the title and message that
 * will be sent (the same AlertCard recipients' own inbox renders), Send stays
 * disabled until there is something to send, and a send failure leaves the
 * form intact rather than losing what was typed.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import OwnerBroadcastScreen from '../app/(owner)/broadcast';
import type { Branch, Dashboard, Trainer } from '../src/api/types';

const mockParams = jest.fn(() => ({}) as { memberId?: string; memberName?: string });
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams(),
}));

const mockListBranches = jest.fn();
const mockDashboard = jest.fn();
const mockListTrainers = jest.fn();
const mockSendBroadcast = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  listBranches: (...a: unknown[]) => mockListBranches(...a),
  dashboard: (...a: unknown[]) => mockDashboard(...a),
  listTrainers: (...a: unknown[]) => mockListTrainers(...a),
  sendBroadcast: (...a: unknown[]) => mockSendBroadcast(...a),
}));

const mockAuth = {
  user: { id: 2, email: 'owner@slam.demo', full_name: 'Karan Shetty', role: 'owner' },
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

function aTrainer(partial: Partial<Trainer> = {}): Trainer {
  return {
    id: 1,
    user_id: 6,
    full_name: 'Vikas Menon',
    email: 'vikas.menon@slam.demo',
    phone: null,
    employee_code: 'SLAM-NGK-T01',
    designation: 'Head Trainer',
    specialty: null,
    branch_id: 1,
    branch_name: 'SLAM Nagalkeni',
    is_active: true,
    ...partial,
  };
}

async function draw() {
  const result = render(<OwnerBroadcastScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({});
  mockListBranches.mockResolvedValue([aBranch({ id: 1 }), aBranch({ id: 2, name: 'SLAM Boganhalli' })]);
  mockDashboard.mockResolvedValue({
    work_date: '2026-08-21',
    server_time: '2026-08-21T10:00:00Z',
    total_trainers: 8,
    total_members: 24,
    scheduled: 8,
    present: 6,
    late: 1,
    absent: 0,
    early_exit: 0,
    missing_checkout: 0,
    punctuality_pct: 92,
    branches: [
      { branch_id: 1, branch_code: 'SLAM-NGK', branch_name: 'SLAM Nagalkeni', scheduled: 3, present: 2, on_time: 2, late: 1, absent: 0, early_exit: 0, missing_checkout: 0, punctuality_pct: 100, member_count: 9, occupancy: null },
    ],
  } satisfies Dashboard);
  mockListTrainers.mockResolvedValue([aTrainer()]);
});

describe('composing a message', () => {
  it('defaults to everyone, all branches, announcement', async () => {
    await draw();
    expect(screen.getByTestId('broadcast-audience-everyone').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('broadcast-branch-all').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('broadcast-type-announcement').props.accessibilityState.selected).toBe(true);
  });

  it('previews exactly what recipients will see', async () => {
    await draw();
    fireEvent.changeText(screen.getByTestId('broadcast-title'), 'New Zumba class');
    fireEvent.changeText(screen.getByTestId('broadcast-message'), 'Friday 6:30pm at SLAM Nagalkeni.');
    expect(screen.getByText('New Zumba class')).toBeTruthy();
    expect(screen.getByText('Friday 6:30pm at SLAM Nagalkeni.')).toBeTruthy();
  });

  it('switches audience and branch selection', async () => {
    await draw();
    fireEvent.press(screen.getByTestId('broadcast-audience-trainers'));
    fireEvent.press(screen.getByTestId('broadcast-branch-1'));
    expect(screen.getByTestId('broadcast-audience-trainers').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('broadcast-branch-1').props.accessibilityState.selected).toBe(true);
  });

  it('offers PT members without inventing a recipient estimate nothing on screen already knows', async () => {
    // Unlike members/trainers, no PT-member count exists anywhere else on
    // this screen — the preview must say nothing about a count rather than
    // guess one.
    await draw();
    fireEvent.changeText(screen.getByTestId('broadcast-title'), 'PT slot opened');
    fireEvent.changeText(screen.getByTestId('broadcast-message'), 'Friday 6pm is free.');
    fireEvent.press(screen.getByTestId('broadcast-audience-pt_members'));
    expect(screen.getByTestId('broadcast-audience-pt_members').props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.queryByText(/recipient.*\(estimate\)/)).toBeNull();
  });

  it('keeps Send disabled until both a title and a message are entered', async () => {
    await draw();
    expect(screen.getByTestId('broadcast-send').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('broadcast-title'), 'Title only');
    expect(screen.getByTestId('broadcast-send').props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByTestId('broadcast-message'), 'And a message.');
    expect(screen.getByTestId('broadcast-send').props.accessibilityState.disabled).toBe(false);
  });
});

describe('sending', () => {
  async function fillAndSend() {
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('broadcast-title'), 'New Zumba class');
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('broadcast-message'), 'Friday 6:30pm.');
    });
    expect(screen.getByTestId('broadcast-send').props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('broadcast-send'));
    });
  }

  it('sends the audience, branch, type and message as composed', async () => {
    mockSendBroadcast.mockResolvedValue({
      recipients: 9,
      audience: 'members',
      branch_id: 1,
      broadcast_type: 'announcement',
      sent_at: '2026-08-21T10:00:00Z',
    });
    await draw();
    fireEvent.press(screen.getByTestId('broadcast-audience-members'));
    fireEvent.press(screen.getByTestId('broadcast-branch-1'));
    await fillAndSend();

    expect(mockSendBroadcast).toHaveBeenCalledWith(
      {
        audience: 'members',
        branch_id: 1,
        broadcast_type: 'announcement',
        title: 'New Zumba class',
        message: 'Friday 6:30pm.',
      },
      'token',
    );
  });

  it('confirms how many people it actually reached', async () => {
    mockSendBroadcast.mockResolvedValue({
      recipients: 9,
      audience: 'everyone',
      branch_id: null,
      broadcast_type: 'announcement',
      sent_at: '2026-08-21T10:00:00Z',
    });
    await draw();
    await fillAndSend();
    await waitFor(() => expect(screen.getByText('Sent to 9 people.')).toBeTruthy());
  });

  it('keeps the message on screen if sending fails', async () => {
    mockSendBroadcast.mockRejectedValue(new Error('network down'));
    await draw();
    await fillAndSend();

    await waitFor(() =>
      expect(
        screen.getByText('That did not go through. Check your connection and try again.'),
      ).toBeTruthy(),
    );
    expect(screen.getByTestId('broadcast-title').props.value).toBe('New Zumba class');
  });
});

describe('reached with one member in mind', () => {
  // The server has supported a single-member audience since Marketing
  // shipped; this deep-link entry point (from Renewals, from Member
  // Intelligence) was the missing client-side half of it.
  beforeEach(() => {
    mockParams.mockReturnValue({ memberId: '13', memberName: 'Rahul Iyer' });
  });

  it('pre-selects that member as the audience, with no branch to choose', async () => {
    await draw();
    expect(screen.getByText(/1 recipient/)).toBeTruthy();
    expect(screen.queryByText('Branch')).toBeNull();
  });

  it('sends to only that member', async () => {
    await draw();
    fireEvent.changeText(screen.getByTestId('broadcast-title'), 'Your renewal is coming up');
    fireEvent.changeText(
      screen.getByTestId('broadcast-message'),
      'Renew this week to keep your rate.',
    );
    fireEvent.press(screen.getByTestId('broadcast-send'));

    await waitFor(() => expect(mockSendBroadcast).toHaveBeenCalledTimes(1));
    expect(mockSendBroadcast).toHaveBeenCalledWith(
      {
        audience: 'member',
        branch_id: null,
        member_id: 13,
        broadcast_type: 'announcement',
        title: 'Your renewal is coming up',
        message: 'Renew this week to keep your rate.',
      },
      'token',
    );
  });
});
