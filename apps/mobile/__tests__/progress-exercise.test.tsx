/**
 * The detailed per-exercise Progress view — reached by tapping a compact
 * strength row. The trend chart and "recent sessions" list both read from
 * real endpoints (`myStrengthTrend`, `myExerciseHistory`); nothing here is
 * computed or invented on the client.
 */

import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import ProgressExerciseScreen from '../app/(member)/progress-exercise';
import type { StrengthTrend, WorkoutSetHistory } from '../src/api/types';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ exercise: 'Bench press' }),
}));

const mockStrength = jest.fn();
const mockHistory = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  myStrengthTrend: (...a: unknown[]) => mockStrength(...a),
  myExerciseHistory: (...a: unknown[]) => mockHistory(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

async function draw() {
  const result = render(<ProgressExerciseScreen />);
  await act(async () => {});
  return result;
}

function aHistory(partial: Partial<WorkoutSetHistory> = {}): WorkoutSetHistory {
  return {
    exercise: 'Bench press',
    sessions: [
      {
        session_id: 1,
        session_date: '2026-08-23',
        split: null,
        split_label: null,
        program_day_name: 'Day 1 — Upper Strength',
        sets: [],
        volume_kg: 400,
        top_weight_kg: 70,
        total_reps: 24,
        average_rpe: null,
      },
      {
        session_id: 2,
        session_date: '2026-08-20',
        split: null,
        split_label: null,
        program_day_name: 'Day 1 — Upper Strength',
        sets: [],
        volume_kg: 360,
        top_weight_kg: 65,
        total_reps: 24,
        average_rpe: null,
      },
    ],
    heaviest: null,
    best_volume_kg: 400,
    best_volume_on: '2026-08-23',
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStrength.mockResolvedValue({
    exercises: [
      {
        exercise: 'Bench press',
        points: [
          { session_date: '2026-08-17', top_weight_kg: 60, volume_kg: 360 },
          { session_date: '2026-08-20', top_weight_kg: 65, volume_kg: 360 },
          { session_date: '2026-08-23', top_weight_kg: 70, volume_kg: 400 },
        ],
        heaviest_kg: 70,
        is_recent_pr: true,
      },
    ],
  } satisfies StrengthTrend);
  mockHistory.mockResolvedValue(aHistory());
});

it('shows the PR and real recent sessions, by their trainer-given day name', async () => {
  await draw();
  expect(screen.getByText('Bench press')).toBeTruthy();
  expect(screen.getByText('PR · 70kg')).toBeTruthy();
  expect(screen.getAllByText('Day 1 — Upper Strength').length).toBe(2);
  expect(screen.getByText('70kg')).toBeTruthy();
  expect(screen.getByText('65kg')).toBeTruthy();
});

it('says a trend needs at least two sessions rather than charting a single point', async () => {
  mockStrength.mockResolvedValue({
    exercises: [
      {
        exercise: 'Bench press',
        points: [{ session_date: '2026-08-23', top_weight_kg: 70, volume_kg: 400 }],
        heaviest_kg: 70,
        is_recent_pr: true,
      },
    ],
  } satisfies StrengthTrend);
  await draw();
  expect(
    screen.getByText('One session logged so far — a trend needs at least two.'),
  ).toBeTruthy();
});

it('says plainly when nothing has been logged for this lift yet', async () => {
  mockHistory.mockResolvedValue(aHistory({ sessions: [] }));
  await draw();
  expect(screen.getByText('Nothing logged yet')).toBeTruthy();
});
