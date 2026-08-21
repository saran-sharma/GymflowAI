/**
 * The Owner Command Center dashboard.
 *
 * What's pinned here: the greeting reads the clock, not a hardcoded string;
 * the snapshot metrics come from real endpoint data, not placeholders; the
 * live-gym branch picker actually re-fetches for the branch tapped; and a
 * failed load says so instead of showing a blank or half-drawn screen.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import OwnerDashboardScreen from '../app/(owner)/index';
import type {
  Branch,
  BranchPerformanceResponse,
  Dashboard,
  MarketingDashboard,
  NeedsAttention,
  Renewals,
  RevenueSummary,
  WhoIsInside,
} from '../src/api/types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
}));

const mockDashboard = jest.fn();
const mockOccupancy = jest.fn();
const mockRenewals = jest.fn();
const mockPerformance = jest.fn();
const mockAttention = jest.fn();
const mockInsights = jest.fn();
const mockRevenue = jest.fn();
const mockMarketing = jest.fn();
const mockBranches = jest.fn();
const mockInside = jest.fn();

jest.mock('../src/api/endpoints', () => ({
  dashboard: (...a: unknown[]) => mockDashboard(...a),
  allOccupancy: (...a: unknown[]) => mockOccupancy(...a),
  renewalsDue: (...a: unknown[]) => mockRenewals(...a),
  branchPerformance: (...a: unknown[]) => mockPerformance(...a),
  needsAttention: (...a: unknown[]) => mockAttention(...a),
  insights: (...a: unknown[]) => mockInsights(...a),
  revenueSummary: (...a: unknown[]) => mockRevenue(...a),
  marketingDashboard: (...a: unknown[]) => mockMarketing(...a),
  listBranches: (...a: unknown[]) => mockBranches(...a),
  whoIsInside: (...a: unknown[]) => mockInside(...a),
}));

const mockAuth = {
  user: { id: 2, email: 'owner@slam.demo', full_name: 'Karan Shetty', role: 'owner' },
  withToken: (action: (t: string) => Promise<unknown>) => action('token'),
};
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/components/account', () => ({ AccountAvatar: () => null }));

function aDashboard(partial: Partial<Dashboard> = {}): Dashboard {
  return {
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
      {
        branch_id: 1,
        branch_code: 'SLAM-NGK',
        branch_name: 'SLAM Nagalkeni',
        scheduled: 3,
        present: 2,
        on_time: 2,
        late: 1,
        absent: 0,
        early_exit: 0,
        missing_checkout: 0,
        punctuality_pct: 100,
        member_count: 9,
        occupancy: null,
      },
    ],
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

function aWhoIsInside(partial: Partial<WhoIsInside> = {}): WhoIsInside {
  return {
    branch_id: 1,
    branch_name: 'SLAM Nagalkeni',
    count: 0,
    capacity: 90,
    members: [],
    ...partial,
  };
}

async function draw() {
  const result = render(<OwnerDashboardScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDashboard.mockResolvedValue(aDashboard());
  mockOccupancy.mockResolvedValue([
    { branch_id: 1, branch_name: 'SLAM Nagalkeni', inside: 5, capacity: 90, occupancy_pct: 5.6, crowd_level: 'Low', entries_today: 5, exits_today: 0, as_of: '2026-08-21T10:00:00Z' },
  ]);
  mockRenewals.mockResolvedValue({ window_days: 30, count: 3, items: [] } satisfies Renewals);
  mockPerformance.mockResolvedValue({
    period: 'week',
    period_start: '2026-08-14',
    period_end: '2026-08-21',
    comparison_start: null,
    comparison_end: null,
    has_comparison: false,
    branches: [],
    note: null,
  } satisfies BranchPerformanceResponse);
  mockAttention.mockResolvedValue({
    items: [],
    pt_ready_count: 2,
    pending_corrections: 1,
  } satisfies NeedsAttention);
  mockInsights.mockResolvedValue([]);
  mockRevenue.mockResolvedValue({
    period_start: '2026-07-22',
    period_end: '2026-08-21',
    currency: 'INR',
    collected_total: 100000,
    pending_total: 5000,
    lines: [],
  } satisfies RevenueSummary);
  mockMarketing.mockResolvedValue({
    period_start: '2026-05-23',
    period_end: '2026-08-21',
    new_members: 10,
    sources: [{ source_key: 'instagram', source_label: 'Instagram', joined: 5, reached_day_45: 3, pt_conversions: 2, referrals: 0, day45_pct: 60, pt_conversion_pct: 40, campaigns: [] }],
    campaigns: [],
    referrals: [],
    total_referrals: 0,
    has_data: true,
  } satisfies MarketingDashboard);
  mockBranches.mockResolvedValue([aBranch({ id: 1, name: 'SLAM Nagalkeni' }), aBranch({ id: 2, name: 'SLAM Boganhalli' })]);
  mockInside.mockResolvedValue(aWhoIsInside());
});

describe('greeting', () => {
  it('greets by time of day and first name', async () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9);
    await draw();
    expect(screen.getByText('Good morning, Karan')).toBeTruthy();
    expect(screen.getByText("Here's what needs your attention today.")).toBeTruthy();
  });

  it('says good afternoon at midday', async () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14);
    await draw();
    expect(screen.getByText('Good afternoon, Karan')).toBeTruthy();
  });

  it('says good evening at night', async () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(20);
    await draw();
    expect(screen.getByText('Good evening, Karan')).toBeTruthy();
  });
});

describe('the operational snapshot', () => {
  it('shows members, who is inside, renewals and PT-ready counts from real data', async () => {
    await draw();
    expect(screen.getByLabelText('Members: 24')).toBeTruthy();
    expect(screen.getByLabelText('Inside now: 5')).toBeTruthy();
    expect(screen.getByLabelText('Renewals due: 3')).toBeTruthy();
    // "Ready for PT" appears twice — the snapshot tile and the Attention tile.
    expect(screen.getAllByLabelText('Ready for PT: 2').length).toBeGreaterThan(0);
  });

  it('sends the owner to Members when the Members tile is tapped', async () => {
    await draw();
    fireEvent.press(screen.getByLabelText('Members: 24'));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/members');
  });
});

describe('live gym branch selection', () => {
  it('lets the owner switch branches and re-fetches who is inside', async () => {
    await draw();
    await waitFor(() => expect(mockInside).toHaveBeenCalledWith('token', 1));

    await act(async () => {
      fireEvent.press(screen.getByTestId('live-branch-2'));
    });

    await waitFor(() => expect(mockInside).toHaveBeenCalledWith('token', 2));
  });

  it('shows how many trainers are present at the selected branch', async () => {
    await draw();
    expect(screen.getByText('2/3 trainers present today')).toBeTruthy();
  });
});

describe('broadcast entry point', () => {
  it('is discoverable without a dedicated tab', async () => {
    await draw();
    fireEvent.press(screen.getByText('Send a broadcast'));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/broadcast');
  });
});

describe('loading and error states', () => {
  it('shows a skeleton while the dashboard is loading', () => {
    mockDashboard.mockReturnValue(new Promise(() => {}));
    render(<OwnerDashboardScreen />);
    expect(screen.queryByText(/Good/)).toBeNull();
  });

  it('reports a failure instead of a blank screen', async () => {
    mockDashboard.mockRejectedValue(new Error('boom'));
    await draw();
    expect(screen.getByText('We could not load your dashboard')).toBeTruthy();
  });
});
