/**
 * The Owner Members roster — the canonical way into a member's detail.
 *
 * Search, status filter, branch filter, and a row that opens the same
 * `/(owner)/member/[id]` screen every other member link uses. Works for a
 * member with no journey, no PT and no current check-in — the shape of a
 * real Yoactiv import.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import OwnerMemberRosterScreen from '../app/(owner)/members/roster';
import type { Branch, MemberRosterPage, MemberRosterRow } from '../src/api/types';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

const mockRoster = jest.fn();
const mockBranches = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  ownerMemberRoster: (...a: unknown[]) => mockRoster(...a),
  listBranches: (...a: unknown[]) => mockBranches(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function aRow(partial: Partial<MemberRosterRow> = {}): MemberRosterRow {
  return {
    member_id: 501,
    member_code: 'SLAM-NGK-M0501',
    full_name: 'Imported Person',
    mobile: '9384626349',
    branch_id: 1,
    branch_name: 'SLAM Nagalkeni',
    is_active: true,
    membership_plan: 'gym workout 14 months',
    membership_status: 'active',
    membership_ends_on: '2027-01-01',
    days_remaining: 62,
    last_visit_on: '2026-09-04',
    ...partial,
  };
}

function aPage(partial: Partial<MemberRosterPage> = {}): MemberRosterPage {
  return { total: 1, members: [aRow()], ...partial };
}

const BRANCHES: Branch[] = [
  { id: 1, name: 'SLAM Nagalkeni', code: 'SLAM-NGK' } as Branch,
  { id: 2, name: 'SLAM Boganhalli', code: 'SLAM-BGH' } as Branch,
  { id: 3, name: 'SLAM Kandigai', code: 'SLAM-KDG' } as Branch,
];

async function draw() {
  const result = render(<OwnerMemberRosterScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRoster.mockResolvedValue(aPage());
  mockBranches.mockResolvedValue(BRANCHES);
});

it('lists a bare imported member with plan, status and last visit', async () => {
  await draw();
  expect(screen.getByText('Imported Person')).toBeTruthy();
  expect(screen.getByText(/SLAM-NGK-M0501 · 9384626349/)).toBeTruthy();
  expect(screen.getByText(/Nagalkeni · last visit/)).toBeTruthy();
  expect(screen.getByText('active')).toBeTruthy();
  expect(screen.getByText('62d left')).toBeTruthy();
});

it('opens the shared member-detail screen when a row is tapped', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('roster-row-501'));
  expect(mockPush).toHaveBeenCalledWith('/(owner)/member/501');
});

it('debounces the search field into a single query', async () => {
  jest.useFakeTimers();
  try {
    render(<OwnerMemberRosterScreen />);
    await act(async () => {});
    mockRoster.mockClear();

    fireEvent.changeText(screen.getByTestId('roster-search'), 'kum');
    fireEvent.changeText(screen.getByTestId('roster-search'), 'kumar');
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    const queries = mockRoster.mock.calls.map((c) => (c[1] as { q?: string }).q);
    expect(queries).toContain('kumar');
    expect(queries).not.toContain('kum');
  } finally {
    jest.useRealTimers();
  }
});

it('passes the status filter through', async () => {
  await draw();
  fireEvent.press(screen.getByLabelText('Expired'));
  await waitFor(() => {
    expect(
      mockRoster.mock.calls.some((c) => (c[1] as { status?: string }).status === 'expired'),
    ).toBe(true);
  });
});

it('narrows to a branch when a branch chip is tapped', async () => {
  await draw();
  fireEvent.press(screen.getByText('Boganhalli'));
  await waitFor(() => {
    expect(
      mockRoster.mock.calls.some((c) => (c[1] as { branchId?: number }).branchId === 2),
    ).toBe(true);
  });
});

it('shows "showing N of total" and a Show more control when the page is partial', async () => {
  mockRoster.mockResolvedValue(aPage({ total: 120, members: [aRow(), aRow({ member_id: 502 })] }));
  await draw();
  expect(screen.getByText('Showing 2 of 120')).toBeTruthy();
  expect(screen.getByText('Show more')).toBeTruthy();
});

it('says plainly when a search matches nobody', async () => {
  mockRoster.mockResolvedValue(aPage({ total: 0, members: [] }));
  jest.useFakeTimers();
  try {
    render(<OwnerMemberRosterScreen />);
    await act(async () => {});
    fireEvent.changeText(screen.getByTestId('roster-search'), 'zzznomatch');
    await act(async () => {
      jest.advanceTimersByTime(350);
    });
    expect(screen.getByText('No members match that search')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

it('renders a member with no visits without crashing', async () => {
  mockRoster.mockResolvedValue(
    aPage({ members: [aRow({ last_visit_on: null, membership_ends_on: null })] }),
  );
  await draw();
  expect(screen.getByText(/no visits recorded/)).toBeTruthy();
});
