/**
 * Member Intelligence — the owner's operational picture of one member.
 *
 * The thing worth pinning down is that this screen tells a General Training
 * member and a PT member apart correctly: the right badge, the right
 * training block (journey bar vs package progress), and that it never
 * silently shows one when the data says the other.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import OwnerMemberScreen from '../app/(owner)/member/[id]';
import type { Journey, Payment, PTPackage, TrainerClientDetail } from '../src/api/types';
import { dayLabel } from '../src/utils/format';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }),
  useLocalSearchParams: () => ({ id: '13' }),
}));

const mockGetMember = jest.fn();
const mockListPayments = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  getMember: (...a: unknown[]) => mockGetMember(...a),
  listPayments: (...a: unknown[]) => mockListPayments(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function aJourney(partial: Partial<Journey> = {}): Journey {
  return {
    id: 12,
    member_id: 13,
    member_name: 'Rahul Iyer',
    branch_id: 1,
    journey_type: 'general_training',
    status: 'active',
    start_date: '2026-08-01',
    end_date: '2026-09-14',
    duration_days: 45,
    assessment_days: 3,
    current_day: 20,
    phase: 'training',
    split_today: 'push',
    assessment_status: 'completed',
    cardio_completed: 3,
    cardio_required: 3,
    days_completed: 18,
    workouts_completed: 15,
    completion_pct: 44.4,
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
    ...partial,
  };
}

function aDetail(partial: Partial<TrainerClientDetail['client']> = {}): TrainerClientDetail {
  return {
    client: {
      member_id: 13,
      member_code: 'SLAM-NGK-M0026',
      full_name: 'Rahul Iyer',
      branch_id: 1,
      joined_on: '2026-07-13',
      membership_plan: 'Annual + PT',
      membership_status: 'active',
      days_remaining: 17,
      journey: aJourney(),
      pt_package: null,
      next_pt_session: null,
      last_seen_on: '2026-08-20',
      visits_last_30: 13,
      ...partial,
    },
    recent_sessions: [],
    recent_workouts: [],
    activity: [],
  };
}

function aPayment(partial: Partial<Payment> = {}): Payment {
  return {
    id: 1,
    branch_id: 1,
    member_id: 13,
    member_name: 'Rahul Iyer',
    kind: 'membership',
    status: 'paid',
    method: 'card',
    amount: 12000,
    discount: 0,
    tax: 0,
    currency: 'INR',
    membership_id: 1,
    pt_package_id: null,
    group_class_id: null,
    trainer_id: null,
    trainer_name: null,
    due_on: null,
    paid_at: '2026-08-01T10:00:00Z',
    collected_by_user_id: null,
    receipt_no: 'R-1',
    notes: null,
    ...partial,
  };
}

async function draw() {
  const result = render(<OwnerMemberScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListPayments.mockResolvedValue([aPayment()]);
});

describe('a General Training member', () => {
  beforeEach(() => {
    mockGetMember.mockResolvedValue(aDetail());
  });

  it('shows the header, GT badge and journey progress', async () => {
    await draw();
    expect(screen.getByText('Rahul Iyer')).toBeTruthy();
    expect(screen.getByText('Own workout')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
  });

  it('does not show PT package detail for a General Training member', async () => {
    await draw();
    expect(screen.queryByTestId('pt-package-progress')).toBeNull();
  });

  it('shows the payment on file', async () => {
    await draw();
    expect(screen.getByText(/membership/)).toBeTruthy();
  });
});

describe('a PT member', () => {
  beforeEach(() => {
    mockGetMember.mockResolvedValue(
      aDetail({
        journey: aJourney({ pt_converted: true }),
        pt_package: aPackage(),
      }),
    );
  });

  it('shows the PT badge and package progress', async () => {
    await draw();
    expect(screen.getByText('PT session')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText(/Vikas Menon/)).toBeTruthy();
  });
});

describe('last seen', () => {
  beforeEach(() => {
    mockGetMember.mockResolvedValue(aDetail({ last_seen_on: '2026-08-19' }));
  });

  // The value used to be the date string split on its first space — for a
  // "Wed, Aug 19"-shaped label that is "Wed," alone — with the same full date
  // repeated a second time as the hint. One clean date, one distinct hint.
  it('renders one clean date rather than a split weekday plus a duplicate', async () => {
    const full = dayLabel('2026-08-19');
    const splitFragment = full.split(' ')[0];
    await draw();
    expect(screen.queryByText(splitFragment)).toBeNull();
    expect(screen.getAllByText(full).length).toBe(1);
  });
});

describe('expired membership', () => {
  it('reads as an explicit past-tense state rather than a negative countdown', async () => {
    mockGetMember.mockResolvedValue(
      aDetail({ membership_status: 'expired', days_remaining: -5 }),
    );
    await draw();
    expect(screen.getByText('Expired 5 days ago')).toBeTruthy();
    expect(screen.queryByText('-5 days left')).toBeNull();
  });

  it('still counts down normally while active', async () => {
    mockGetMember.mockResolvedValue(aDetail({ days_remaining: 17 }));
    await draw();
    expect(screen.getByText('17 days left')).toBeTruthy();
  });
});

describe('back navigation', () => {
  beforeEach(() => {
    mockGetMember.mockResolvedValue(aDetail());
  });

  it('returns to whichever screen pushed this one', async () => {
    mockCanGoBack.mockReturnValue(true);
    await draw();
    fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to Members only when there is no history to unwind', async () => {
    mockCanGoBack.mockReturnValue(false);
    await draw();
    fireEvent.press(screen.getByLabelText('Back'));
    expect(mockReplace).toHaveBeenCalledWith('/(owner)/members');
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('loading and error states', () => {
  it('shows a loading state before the member loads', () => {
    mockGetMember.mockReturnValue(new Promise(() => {}));
    render(<OwnerMemberScreen />);
    expect(screen.getByText('Loading member')).toBeTruthy();
  });

  it('explains a branch the owner cannot see', async () => {
    const { ApiError } = jest.requireActual('../src/api/client');
    mockGetMember.mockRejectedValue(new ApiError(403, 'forbidden', 'Outside your branches'));
    await draw();
    expect(screen.getByText('Outside your branches')).toBeTruthy();
  });

  it('offers a retry on an ordinary failure', async () => {
    mockGetMember.mockRejectedValue(new Error('network down'));
    await draw();
    expect(screen.getByText('We could not load this member')).toBeTruthy();
  });
});
