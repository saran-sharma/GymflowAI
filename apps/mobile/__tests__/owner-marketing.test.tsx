/**
 * Marketing Intelligence: a source on the funnel opens onto who it actually
 * brought in, and each of those members opens the same Member Intelligence
 * screen everything else in the app uses.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import MarketingSourceScreen from '../app/(owner)/marketing/[source]';
import OwnerMarketingScreen from '../app/(owner)/marketing';
import type { MarketingDashboard, TrainerClient } from '../src/api/types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ source: 'instagram' }),
}));

const mockDashboard = jest.fn();
const mockSourceMembers = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  marketingDashboard: (...a: unknown[]) => mockDashboard(...a),
  sourceMembers: (...a: unknown[]) => mockSourceMembers(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function aDashboard(partial: Partial<MarketingDashboard> = {}): MarketingDashboard {
  return {
    period_start: '2026-05-23',
    period_end: '2026-08-21',
    new_members: 24,
    sources: [
      {
        source_key: 'instagram',
        source_label: 'Instagram',
        joined: 5,
        reached_day_45: 3,
        pt_conversions: 2,
        referrals: 0,
        day45_pct: 60,
        pt_conversion_pct: 40,
        campaigns: ['August Transformation'],
      },
    ],
    campaigns: [],
    referrals: [],
    total_referrals: 0,
    has_data: true,
    ...partial,
  };
}

function aMember(partial: Partial<TrainerClient> = {}): TrainerClient {
  return {
    member_id: 13,
    member_code: 'SLAM-NGK-M0026',
    full_name: 'Rahul Iyer',
    branch_id: 1,
    joined_on: '2026-08-13',
    membership_plan: 'Annual + PT',
    membership_status: 'active',
    days_remaining: 17,
    journey: null,
    pt_package: null,
    next_pt_session: null,
    last_seen_on: '2026-08-20',
    visits_last_30: 5,
    ...partial,
  };
}

async function draw(element: React.ReactElement) {
  const result = render(element);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDashboard.mockResolvedValue(aDashboard());
});

describe('tapping a source on the funnel', () => {
  it('opens that source', async () => {
    await draw(<OwnerMarketingScreen />);
    fireEvent.press(screen.getByTestId('marketing-source-instagram'));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/marketing/instagram');
  });
});

describe('a source opened', () => {
  it('shows the source name and funnel figures', async () => {
    mockSourceMembers.mockResolvedValue([aMember()]);
    await draw(<MarketingSourceScreen />);
    expect(screen.getByText('Instagram')).toBeTruthy();
    expect(screen.getByLabelText('Joined: 5')).toBeTruthy();
    expect(screen.getByLabelText('Converted to PT: 2')).toBeTruthy();
  });

  it('lists the members acquired, with useful detail', async () => {
    mockSourceMembers.mockResolvedValue([
      aMember({ journey: { pt_converted: false } as never }),
    ]);
    await draw(<MarketingSourceScreen />);
    expect(screen.getByText('Rahul Iyer')).toBeTruthy();
    expect(screen.getByText(/Annual \+ PT/)).toBeTruthy();
    expect(screen.getByText('GT')).toBeTruthy();
  });

  it('opens Member Intelligence when a member row is tapped', async () => {
    mockSourceMembers.mockResolvedValue([aMember()]);
    await draw(<MarketingSourceScreen />);
    fireEvent.press(screen.getByTestId('source-member-13'));
    expect(mockPush).toHaveBeenCalledWith('/(owner)/member/13');
  });

  it('says plainly when a source brought nobody in', async () => {
    mockSourceMembers.mockResolvedValue([]);
    await draw(<MarketingSourceScreen />);
    expect(screen.getByText('No members from this source')).toBeTruthy();
  });

  it('reports a failure instead of a blank list', async () => {
    mockSourceMembers.mockRejectedValue(new Error('network down'));
    await draw(<MarketingSourceScreen />);
    expect(screen.getByText('We could not load this source')).toBeTruthy();
  });
});
