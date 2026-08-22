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
import type { BodyCompositionHistory, MemberActivity, MemberMe, StrengthTrend } from '../src/api/types';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockJourney = jest.fn();
const mockDays = jest.fn();
const mockTimeline = jest.fn();
const mockMe = jest.fn();
const mockStats = jest.fn();
const mockStrength = jest.fn();
const mockBodyComposition = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  myJourney: (...a: unknown[]) => mockJourney(...a),
  myJourneyDays: (...a: unknown[]) => mockDays(...a),
  memberActivity: (...a: unknown[]) => mockTimeline(...a),
  memberMe: (...a: unknown[]) => mockMe(...a),
  memberActivityStats: (...a: unknown[]) => mockStats(...a),
  myStrengthTrend: (...a: unknown[]) => mockStrength(...a),
  myBodyComposition: (...a: unknown[]) => mockBodyComposition(...a),
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
  mockStrength.mockResolvedValue({ exercises: [] } satisfies StrengthTrend);
  mockBodyComposition.mockResolvedValue({
    latest: null,
    measurements: [],
  } satisfies BodyCompositionHistory);
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

describe('the strength section', () => {
  it('does not appear at all when nothing has been logged', async () => {
    await open();
    expect(screen.queryByText('Strength')).toBeNull();
  });

  it('shows each trained lift with a PR badge when the latest session set the record', async () => {
    mockStrength.mockResolvedValue({
      exercises: [
        {
          exercise: 'Bench press',
          points: [
            { session_date: '2026-08-05', top_weight_kg: 50, volume_kg: 400 },
            { session_date: '2026-08-12', top_weight_kg: 55, volume_kg: 440 },
          ],
          heaviest_kg: 55,
          is_recent_pr: true,
        },
      ],
    } satisfies StrengthTrend);
    await open();
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('PR')).toBeTruthy();
    expect(screen.getByText('best 55kg')).toBeTruthy();
  });

  it('says a trend needs at least two sessions rather than charting a single point', async () => {
    mockStrength.mockResolvedValue({
      exercises: [
        {
          exercise: 'Deadlift',
          points: [{ session_date: '2026-08-12', top_weight_kg: 100, volume_kg: 500 }],
          heaviest_kg: 100,
          is_recent_pr: true,
        },
      ],
    } satisfies StrengthTrend);
    await open();
    expect(
      screen.getByText('One session logged so far — a trend needs at least two.'),
    ).toBeTruthy();
  });

  it('shows no PR badge when the latest session did not set the record', async () => {
    mockStrength.mockResolvedValue({
      exercises: [
        {
          exercise: 'Squat',
          points: [
            { session_date: '2026-08-05', top_weight_kg: 120, volume_kg: 600 },
            { session_date: '2026-08-12', top_weight_kg: 100, volume_kg: 500 },
          ],
          heaviest_kg: 120,
          is_recent_pr: false,
        },
      ],
    } satisfies StrengthTrend);
    await open();
    expect(screen.getByText('Squat')).toBeTruthy();
    expect(screen.queryByText('PR')).toBeNull();
  });
});

describe('the body composition section', () => {
  it('says plainly when no InBody measurements exist yet', async () => {
    await open();
    expect(screen.getByText('No InBody measurements yet')).toBeTruthy();
    expect(
      screen.getByText('Once your next scan is synced, your measurements will appear here.'),
    ).toBeTruthy();
  });

  it('shows the latest snapshot alone, with no trend, for a single measurement', async () => {
    mockBodyComposition.mockResolvedValue({
      latest: {
        measured_at: '2026-08-22T09:00:00Z',
        source: 'inbody',
        weight_kg: 78.4,
        body_fat_pct: 18.7,
        muscle_mass_kg: 32.1,
        bmi: 24.6,
        visceral_fat: 8,
        bmr_kcal: 1650,
        body_water_pct: 54.3,
      },
      measurements: [
        {
          measured_at: '2026-08-22T09:00:00Z',
          source: 'inbody',
          weight_kg: 78.4,
          body_fat_pct: 18.7,
          muscle_mass_kg: 32.1,
          bmi: 24.6,
          visceral_fat: 8,
          bmr_kcal: 1650,
          body_water_pct: 54.3,
        },
      ],
    } satisfies BodyCompositionHistory);
    await open();

    expect(screen.getByText('78.4 kg')).toBeTruthy();
    expect(screen.getByText('32.1 kg')).toBeTruthy();
    expect(screen.getByText('18.7%')).toBeTruthy();
    expect(screen.getByText('24.6')).toBeTruthy();
    expect(screen.queryByText('Weight trend')).toBeNull();
    expect(screen.queryByText('Body fat trend')).toBeNull();
  });

  it('shows trend charts once there are two or more measurements', async () => {
    mockBodyComposition.mockResolvedValue({
      latest: {
        measured_at: '2026-08-22T09:00:00Z',
        source: 'inbody',
        weight_kg: 78.4,
        body_fat_pct: 18.7,
        muscle_mass_kg: 32.1,
        bmi: 24.6,
        visceral_fat: null,
        bmr_kcal: null,
        body_water_pct: null,
      },
      measurements: [
        {
          measured_at: '2026-08-01T09:00:00Z',
          source: 'inbody',
          weight_kg: 80.1,
          body_fat_pct: 20.1,
          muscle_mass_kg: 31.5,
          bmi: 25.4,
          visceral_fat: null,
          bmr_kcal: null,
          body_water_pct: null,
        },
        {
          measured_at: '2026-08-22T09:00:00Z',
          source: 'inbody',
          weight_kg: 78.4,
          body_fat_pct: 18.7,
          muscle_mass_kg: 32.1,
          bmi: 24.6,
          visceral_fat: null,
          bmr_kcal: null,
          body_water_pct: null,
        },
      ],
    } satisfies BodyCompositionHistory);
    await open();

    expect(screen.getByText('Weight trend')).toBeTruthy();
    expect(screen.getByText('Body fat trend')).toBeTruthy();
    expect(screen.getByText('Skeletal muscle trend')).toBeTruthy();
    // The history list, most recent first.
    expect(screen.getByText('80.1kg · 20.1% BF · 31.5kg SMM')).toBeTruthy();
    expect(screen.getByText('78.4kg · 18.7% BF · 32.1kg SMM')).toBeTruthy();
  });

  it('omits a snapshot stat and its trend individually when a field is null', async () => {
    mockBodyComposition.mockResolvedValue({
      latest: {
        measured_at: '2026-08-22T09:00:00Z',
        source: 'inbody',
        weight_kg: 78.4,
        body_fat_pct: null,
        muscle_mass_kg: 32.1,
        bmi: 24.6,
        visceral_fat: null,
        bmr_kcal: null,
        body_water_pct: null,
      },
      measurements: [
        {
          measured_at: '2026-08-01T09:00:00Z',
          source: 'inbody',
          weight_kg: 80.1,
          body_fat_pct: null,
          muscle_mass_kg: 31.5,
          bmi: 25.4,
          visceral_fat: null,
          bmr_kcal: null,
          body_water_pct: null,
        },
        {
          measured_at: '2026-08-22T09:00:00Z',
          source: 'inbody',
          weight_kg: 78.4,
          body_fat_pct: null,
          muscle_mass_kg: 32.1,
          bmi: 24.6,
          visceral_fat: null,
          bmr_kcal: null,
          body_water_pct: null,
        },
      ],
    } satisfies BodyCompositionHistory);
    await open();

    expect(screen.getByText('Weight trend')).toBeTruthy();
    expect(screen.queryByText('Body fat trend')).toBeNull();
    expect(screen.queryByText(/% BF/)).toBeNull();
  });
});
