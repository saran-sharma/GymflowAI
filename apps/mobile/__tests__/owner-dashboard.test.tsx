/**
 * The Owner Command Center dashboard.
 *
 * What's pinned here: the greeting reads the clock, not a hardcoded string,
 * and is grouped into one accessible announcement rather than bleeding into
 * the rest of the screen; the snapshot metrics come from real endpoint data,
 * not placeholders; "who is inside" now points at Members' own "Currently in
 * gym" list rather than duplicating it here; Attention is capped and
 * summarized rather than dumping every item; Broadcast is reachable from a
 * header action without a dedicated tab; and a failed load says so instead of
 * showing a blank or half-drawn screen.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import OwnerDashboardScreen from '../app/(owner)/index';
import type {
  Branch,
  BranchPerformanceResponse,
  Dashboard,
  Insight,
  MarketingDashboard,
  NeedsAttention,
  Renewals,
  RevenueSummary,
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
const mockDailyBrief = jest.fn();
const mockWeekly = jest.fn();

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
  ownerDailyBrief: (...a: unknown[]) => mockDailyBrief(...a),
  ownerWeeklySummary: (...a: unknown[]) => mockWeekly(...a),
  askSuggestions: jest.fn().mockResolvedValue({ suggestions: [] }),
  askGymFlow: jest.fn().mockResolvedValue({
    question: '',
    intent: 'unrecognised',
    answer: '',
    source: 'deterministic',
    data: [],
    suggestions: [],
  }),
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

function anInsight(partial: Partial<Insight> = {}): Insight {
  return {
    key: 'late-marks',
    title: 'SLAM Boganhalli: late marks above 20%',
    detail: '15 of 54 rostered shifts this month started after the grace window.',
    severity: 'warning',
    data: {},
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
  mockDailyBrief.mockResolvedValue({
    generated_at: '2026-08-21T10:00:00Z',
    scope: 'All branches',
    headline: 'Nothing needs your attention this morning.',
    issues: [],
    narration_source: 'deterministic',
  });
  mockWeekly.mockResolvedValue({
    audience: 'owner',
    week_start: '2026-08-10',
    week_end: '2026-08-16',
    scope: 'All branches',
    headline: 'Steady week — 88% on time, 2 new members.',
    movement: 'steady',
    metrics: [
      { label: 'Trainer punctuality', value: '88%', previous: '86%', direction: 'flat' },
      { label: 'Member visits', value: '210', previous: '198', direction: 'up' },
    ],
    narration_source: 'deterministic',
  });
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
});

describe('greeting', () => {
  // The greeting and its subtext are grouped into one accessible block —
  // separate visual lines (the name set larger, as the screen's hero) but
  // one announcement, so a screen reader does not stop on each fragment.
  it('greets by time of day and first name', async () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9);
    await draw();
    expect(
      screen.getByLabelText("Good morning, Karan. Here's what needs your attention today."),
    ).toBeTruthy();
  });

  it('says good afternoon at midday', async () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14);
    await draw();
    expect(
      screen.getByLabelText("Good afternoon, Karan. Here's what needs your attention today."),
    ).toBeTruthy();
  });

  it('says good evening at night', async () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(20);
    await draw();
    expect(
      screen.getByLabelText("Good evening, Karan. Here's what needs your attention today."),
    ).toBeTruthy();
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

describe('who is inside', () => {
  // Members already has a live "Currently in gym" list, branch picker
  // included — the dashboard states the count and sends anyone who wants
  // the names there, rather than keeping a second, thinner copy of it.
  it('sends the owner to Members, where the live list actually lives', async () => {
    await draw();
    fireEvent.press(screen.getByLabelText('Inside now: 5'));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/members');
  });
});

describe('broadcast entry point', () => {
  it('is discoverable from a header action without a dedicated tab', async () => {
    await draw();
    fireEvent.press(screen.getByTestId('dashboard-broadcast'));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/broadcast');
  });

  it('names what the action does for assistive technology', async () => {
    await draw();
    expect(screen.getByLabelText('Send a broadcast')).toBeTruthy();
  });
});

describe('attention', () => {
  it('summarizes instead of dumping every item as its own card', async () => {
    mockInsights.mockResolvedValue([
      anInsight({ key: 'a', title: 'SLAM Nagalkeni: 4 unworked shift(s)', severity: 'critical' }),
      anInsight({ key: 'b', title: 'SLAM Boganhalli: late marks above 20%', severity: 'warning' }),
      anInsight({ key: 'c', title: 'SLAM Boganhalli: 1 unworked shift(s)', severity: 'warning' }),
      anInsight({ key: 'd', title: 'SLAM Alandur: 1 unworked shift(s)', severity: 'warning' }),
    ]);
    await draw();

    // The most severe items are shown, capped at three plus the pending
    // corrections line, with a way to see the rest rather than five full
    // cards competing with everything else for the same glance.
    expect(screen.getByText('SLAM Nagalkeni: 4 unworked shift(s)')).toBeTruthy();
    expect(screen.queryByText('SLAM Alandur: 1 unworked shift(s)')).toBeNull();
    expect(screen.getByText('View all (5)')).toBeTruthy();
  });

  it('shows a calm empty state when nothing needs attention', async () => {
    mockAttention.mockResolvedValue({ items: [], pt_ready_count: 0, pending_corrections: 0 } satisfies NeedsAttention);
    mockInsights.mockResolvedValue([]);
    await draw();
    expect(screen.getByText('Nothing needs your attention')).toBeTruthy();
  });

  it('routes a named attention item to its action route', async () => {
    mockAttention.mockResolvedValue({
      items: [
        {
          id: 9,
          key: 'missed-shift',
          severity: 'critical',
          title: 'Rahul Deshpande did not work a rostered shift',
          body: 'Rostered at SLAM Boganhalli on 2026-08-19 with no check-in.',
          branch_id: 2,
          entity_type: 'trainer',
          entity_id: '5',
          action_route: '/(owner)/trainer/5',
          created_at: '2026-08-20T09:00:00Z',
        },
      ],
      pt_ready_count: 2,
      pending_corrections: 0,
    } satisfies NeedsAttention);
    await draw();
    fireEvent.press(screen.getByText('Rahul Deshpande did not work a rostered shift'));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/trainer/5');
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
