/**
 * The consistency chart's week labels.
 *
 * Each bar used to be captioned with `dayLabel(week.week_start).split(' ')[1]`
 * — a fixed word position pulled out of a sentence-shaped string. `dayLabel`
 * orders weekday/day/month by locale, so in this app's default locale that
 * split landed on the month abbreviation, not the day number: every week
 * within the same month showed the identical caption, and the axis stopped
 * telling the member which week was which.
 */

import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import MemberProgressScreen from '../app/(member)/progress';
import type { MemberActivity, MemberMe } from '../src/api/types';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockJourney = jest.fn();
const mockDays = jest.fn();
const mockTimeline = jest.fn();
const mockMe = jest.fn();
const mockStats = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  myJourney: (...a: unknown[]) => mockJourney(...a),
  myJourneyDays: (...a: unknown[]) => mockDays(...a),
  memberActivity: (...a: unknown[]) => mockTimeline(...a),
  memberMe: (...a: unknown[]) => mockMe(...a),
  memberActivityStats: (...a: unknown[]) => mockStats(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function anActivity(partial: Partial<MemberActivity> = {}): MemberActivity {
  return {
    member_id: 2,
    totals: { gym_visits: 40, own_workouts: 41, pt_sessions: 42, group_classes: 43 },
    weekly: [
      { week_start: '2026-08-05', week_end: '2026-08-11', gym_visits: 3, own_workouts: 2, pt_sessions: 1, group_classes: 0, total: 6 },
      { week_start: '2026-08-12', week_end: '2026-08-18', gym_visits: 2, own_workouts: 3, pt_sessions: 0, group_classes: 1, total: 6 },
    ],
    ...partial,
  };
}

async function open() {
  const result = render(<MemberProgressScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockJourney.mockResolvedValue(null);
  mockDays.mockResolvedValue([]);
  mockTimeline.mockResolvedValue([]);
  mockMe.mockResolvedValue({ member_id: 2 } as MemberMe);
  mockStats.mockResolvedValue(anActivity());
});

describe('the consistency chart', () => {
  it('captions each week by its starting day of month, not by a locale-dependent word split', async () => {
    await open();
    // 2026-08-05 and 2026-08-12 — the day numbers, not "Aug" repeated twice.
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.queryAllByText('Aug').length).toBe(0);
  });
});
