/**
 * Member attendance's "Programme attendance" card.
 *
 * It used to state `workouts_completed` twice, once as "workouts completed"
 * and again as "workouts recorded" — the same number, in different words,
 * reading as two facts where there was only one. Days completed and workouts
 * recorded are genuinely different counts (a day can be marked done by a
 * trainer without every set being logged), so the fix contrasts them instead.
 */

import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import MemberAttendanceScreen from '../app/(member)/visits';
import type { Journey, MemberHome } from '../src/api/types';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockVisits = jest.fn();
const mockActivity = jest.fn();
const mockHome = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  memberVisits: (...a: unknown[]) => mockVisits(...a),
  memberActivity: (...a: unknown[]) => mockActivity(...a),
  memberHome: (...a: unknown[]) => mockHome(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function aJourney(partial: Partial<Journey> = {}): Journey {
  return {
    id: 3,
    member_id: 2,
    member_name: 'Aditya Rao',
    branch_id: 1,
    journey_type: 'general_training',
    status: 'active',
    start_date: '2026-08-12',
    end_date: '2026-09-25',
    duration_days: 45,
    assessment_days: 3,
    current_day: 20,
    phase: 'training',
    split_today: 'push',
    assessment_status: 'completed',
    cardio_completed: 3,
    cardio_required: 3,
    days_completed: 15,
    completion_pct: 33,
    workouts_completed: 12,
    pt_converted: false,
    ...partial,
  } as Journey;
}

function aHome(partial: Partial<MemberHome> = {}): MemberHome {
  return {
    member_id: 2,
    full_name: 'Aditya Rao',
    branch_id: 1,
    branch_name: 'SLAM Nagalkeni',
    membership_plan: 'Annual',
    membership_status: 'active',
    days_remaining: 200,
    is_inside: false,
    trainer_name: 'Vikas Menon',
    journey: aJourney(),
    today_workout: null,
    next_pt_session: null,
    pt_package: null,
    next_class: null,
    occupancy: null,
    unread_alerts: 0,
    streak_days: 3,
    today_checkin: null,
    ...partial,
  };
}

async function open() {
  const result = render(<MemberAttendanceScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVisits.mockResolvedValue([]);
  mockActivity.mockResolvedValue([]);
  mockHome.mockResolvedValue(aHome());
});

describe('the programme attendance card', () => {
  it('contrasts days completed against workouts recorded, not the same number twice', async () => {
    await open();
    expect(screen.getByText('15 of 45 days completed · 12 workouts recorded')).toBeTruthy();
    // The old copy repeated one number under two names — neither survives.
    expect(screen.queryByText('12 workouts completed · 12 workouts recorded')).toBeNull();
  });
});
