/**
 * The alert centre's one write: acting on an alert.
 *
 * An alert that opens a screen used to navigate there and nothing else,
 * leaving it `OPEN` forever — it would keep reappearing in this list and keep
 * the unread badge on Home lit after the member had already read it and gone
 * where it pointed. The fix is that opening an alert's target is itself the
 * acknowledgement; only an alert with nowhere to go is a true dismissal.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { AlertCentre } from '../src/components/AlertCentre';
import type { AppAlert } from '../src/api/types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockList = jest.fn();
const mockAck = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  listAlerts: (...a: unknown[]) => mockList(...a),
  acknowledgeAlert: (...a: unknown[]) => mockAck(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function anAlert(partial: Partial<AppAlert> = {}): AppAlert {
  return {
    id: 1,
    branch_id: 1,
    key: 'pt.session_reminder',
    severity: 'info',
    status: 'open',
    title: 'Your PT session is tomorrow',
    body: 'Session 5 of 12 with Kiran Prasad.',
    entity_type: null,
    entity_id: null,
    action_route: null,
    payload: {},
    created_at: '2026-08-20T09:00:00Z',
    resolved_at: null,
    ...partial,
  };
}

async function open() {
  const result = render(<AlertCentre />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAck.mockResolvedValue(anAlert({ status: 'acknowledged' }));
  mockList.mockResolvedValue([]);
});

describe('an alert with somewhere to go', () => {
  it('acknowledges it — not dismisses it — on the way to its screen', async () => {
    mockList.mockResolvedValue([anAlert({ action_route: '/member/pt' })]);
    await open();

    await act(async () => {
      fireEvent.press(screen.getByText('Your PT session is tomorrow'));
    });

    expect(mockAck).toHaveBeenCalledWith(1, false, 'token');
    expect(mockPush).toHaveBeenCalledWith('/(member)/pt');
  });
});

describe('an alert with nowhere to go', () => {
  it('is dismissed outright, since there is no screen to act on it', async () => {
    mockList.mockResolvedValue([anAlert({ action_route: null })]);
    await open();

    await act(async () => {
      fireEvent.press(screen.getByText('Your PT session is tomorrow'));
    });

    expect(mockAck).toHaveBeenCalledWith(1, true, 'token');
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('nothing to act on', () => {
  it('says so plainly', async () => {
    await open();
    expect(screen.getByText('Nothing needs you')).toBeTruthy();
  });
});

describe('progressive disclosure', () => {
  // A wall of every open alert stacked in one list is the bug this guards
  // against — each severity collapses to a handful of rows with a count and
  // a "Show N more" toggle, not an unbounded flat list.
  it('groups by severity and collapses a long list behind "Show N more"', async () => {
    mockList.mockResolvedValue([
      ...Array.from({ length: 5 }, (_, i) =>
        anAlert({ id: i + 1, severity: 'critical', title: `Critical ${i + 1}` }),
      ),
      anAlert({ id: 100, severity: 'info', title: 'Just an info row' }),
    ]);
    await open();

    expect(screen.getByText('Needs attention now (5)')).toBeTruthy();
    expect(screen.getByText('Updates (1)')).toBeTruthy();
    expect(screen.getByText('Critical 1')).toBeTruthy();
    expect(screen.getByText('Critical 3')).toBeTruthy();
    expect(screen.queryByText('Critical 4')).toBeNull();
    expect(screen.getByText('Show 2 more')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Show 2 more'));
    });
    expect(screen.getByText('Critical 4')).toBeTruthy();
    expect(screen.getByText('Critical 5')).toBeTruthy();
    expect(screen.queryByText('Show 2 more')).toBeNull();
  });

  it('never shows a "show more" toggle for a group already fully visible', async () => {
    mockList.mockResolvedValue([anAlert({ severity: 'warning' })]);
    await open();
    expect(screen.queryByText(/Show \d+ more/)).toBeNull();
  });
});
