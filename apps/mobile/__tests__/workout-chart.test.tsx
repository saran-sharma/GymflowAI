/**
 * The workout chart, and the one thing about it that goes stale.
 *
 * Sets are logged on the exercise screen, so every count here — the per-row
 * `2/3`, the badge, the progress bar — describes a moment that has already
 * passed by the time the member comes back. A chart still showing the state
 * they left reads as the app having lost the sets they just did, which is the
 * worst thing a training log can look like.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import MemberWorkoutScreen from '../app/(member)/workout';
import type { Journey, JourneyDay, WorkoutItem, WorkoutSession } from '../src/api/types';

const mockPush = jest.fn();

/**
 * `useFocusEffect` is captured rather than stubbed away, so the test can run
 * the real callback the screen registered. Calling it is what "the member came
 * back to this screen" means to the navigator.
 */
let focusCallback: (() => void | (() => void)) | null = null;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    focusCallback = callback;
  },
}));

const mockJourney = jest.fn();
const mockToday = jest.fn();
const mockDays = jest.fn();
const mockStart = jest.fn();
const mockComplete = jest.fn();

jest.mock('../src/api/endpoints', () => ({
  myJourney: (...a: unknown[]) => mockJourney(...a),
  todayWorkout: (...a: unknown[]) => mockToday(...a),
  myJourneyDays: (...a: unknown[]) => mockDays(...a),
  startWorkout: (...a: unknown[]) => mockStart(...a),
  completeWorkout: (...a: unknown[]) => mockComplete(...a),
  setWorkoutItem: jest.fn(),
}));

// Stable identity: `useApi` depends on `withToken`, so a fresh one per render
// re-runs every fetch effect on every render.
const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function anItem(partial: Partial<WorkoutItem> = {}): WorkoutItem {
  return {
    id: 11,
    order_index: 0,
    exercise: 'Barbell Bench Press',
    sets: 3,
    reps: '10',
    rest_seconds: 90,
    status: 'pending',
    completed_at: null,
    sets_logged: 0,
    ...partial,
  };
}

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
    current_day: 6,
    phase: 'training',
    split_today: 'push',
    assessment_status: 'completed',
    cardio_completed: 3,
    cardio_required: 3,
    workouts_completed: 30,
    ...partial,
  } as Journey;
}

function aSession(items: WorkoutItem[], partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 5,
    member_id: 2,
    branch_id: 1,
    journey_id: 3,
    day_number: 6,
    split: 'push',
    split_label: 'Push',
    program_day_id: null,
    program_day_name: null,
    program_day_category: null,
    session_date: '2026-08-17',
    status: 'in_progress',
    started_at: '2026-08-17T08:00:00Z',
    completed_at: null,
    supervising_trainer_id: null,
    items,
    completed_items: items.filter((i) => i.status === 'completed').length,
    total_items: items.length,
    ...partial,
  };
}

/**
 * Render, then focus — the order the navigator uses. The screen is focused on
 * mount as well as on return, so a test that only ever fires the *second*
 * focus would never exercise the guard that stops the first one duplicating
 * the fetch `useApi` already did.
 */
async function openChart() {
  const result = render(<MemberWorkoutScreen />);
  await act(async () => {});
  await focus();
  return result;
}

async function focus() {
  await act(async () => {
    focusCallback?.();
  });
}

/** The member returns to this screen from the exercise they were logging. */
const comeBack = focus;

beforeEach(() => {
  jest.clearAllMocks();
  focusCallback = null;
  mockJourney.mockResolvedValue(aJourney());
  mockDays.mockResolvedValue([]);
  mockToday.mockResolvedValue(aSession([anItem()]));
});

describe('the chart reports progress against the plan', () => {
  it('shows nothing next to an exercise with no sets logged', async () => {
    await openChart();
    expect(screen.getByText('Barbell Bench Press')).toBeTruthy();
    expect(screen.queryByText('0/3')).toBeNull();
  });

  it('counts logged sets against the prescription once there are any', async () => {
    mockToday.mockResolvedValue(aSession([anItem({ sets_logged: 2 })]));
    await openChart();
    expect(screen.getByText('2/3')).toBeTruthy();
  });

  it('opens the exercise rather than ticking it off', async () => {
    // An exercise is finished by logging its sets. A tick box beside a lift
    // with two of three recorded would offer to contradict the member's data.
    await openChart();
    fireEvent.press(screen.getByLabelText(/Barbell Bench Press.*Open\./));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(member)/exercise/[itemId]',
      params: { itemId: '11', sessionId: '5' },
    });
  });
});

describe('coming back from the exercise screen', () => {
  it('re-reads the workout, so the counts are not the ones the member left', async () => {
    await openChart();
    expect(screen.getByText('Barbell Bench Press')).toBeTruthy();
    expect(screen.queryByText('3/3')).toBeNull();
    expect(mockToday).toHaveBeenCalledTimes(1);

    // Three sets were logged while the member was on the exercise screen.
    mockToday.mockResolvedValue(
      aSession([
        anItem({ sets_logged: 3, status: 'completed', completed_at: '2026-08-17T09:00:00Z' }),
      ]),
    );
    await comeBack();

    await waitFor(() => expect(screen.getByText('3/3')).toBeTruthy());
    expect(mockToday).toHaveBeenCalledTimes(2);
  });

  it('refreshes the session summary as well as the row', async () => {
    await openChart();
    expect(screen.getByText('0 of 1')).toBeTruthy();

    mockToday.mockResolvedValue(aSession([anItem({ sets_logged: 3, status: 'completed' })]));
    await comeBack();

    await waitFor(() => expect(screen.getByText('1 of 1')).toBeTruthy());
  });

  it('does not fetch twice on the way in', async () => {
    // `useApi` already fetches on mount, and the navigator focuses the screen
    // straight after. Opening the chart must cost one request, not two.
    await openChart();
    expect(mockToday).toHaveBeenCalledTimes(1);

    await comeBack();
    expect(mockToday).toHaveBeenCalledTimes(2);
  });

  it('does not re-fetch the journey, which logging a set cannot change', async () => {
    // Only `complete_workout` ticks a journey day, and that lives on this
    // screen — so returning from an exercise costs one request, not three.
    await openChart();
    await comeBack();
    await comeBack();
    expect(mockJourney).toHaveBeenCalledTimes(1);
    expect(mockDays).toHaveBeenCalledTimes(1);
  });
});

describe('a journey that is no longer active', () => {
  // `start_workout` only resolves the member's plan from an *active* journey.
  // Off that phase it used to fall back to a bare, unassigned session instead
  // of refusing — so the chart must never offer to start one once the
  // journey reports "complete", whatever split day 45 happened to land on.
  it('replaces the Start button with a completion card once training is done', async () => {
    mockJourney.mockResolvedValue(
      aJourney({ status: 'completed', phase: 'complete', split_today: 'push' }),
    );
    mockToday.mockResolvedValue(null);
    await openChart();
    expect(screen.getByText('General Training complete')).toBeTruthy();
    expect(screen.queryByText('Start today’s workout')).toBeNull();
  });

  it('does not offer a rest card either, once training is done', async () => {
    mockJourney.mockResolvedValue(
      aJourney({ status: 'completed', phase: 'complete', split_today: 'rest' }),
    );
    mockToday.mockResolvedValue(null);
    await openChart();
    expect(screen.getByText('General Training complete')).toBeTruthy();
    expect(screen.queryByText('Nothing to do today')).toBeNull();
  });

  it('says "on hold" rather than "complete" for a paused or cancelled journey', async () => {
    mockJourney.mockResolvedValue(
      aJourney({ status: 'paused', phase: 'complete', split_today: 'push' }),
    );
    mockToday.mockResolvedValue(null);
    await openChart();
    expect(screen.getByText('General Training is on hold')).toBeTruthy();
    expect(screen.queryByText('General Training complete')).toBeNull();
    expect(screen.queryByText('Start today’s workout')).toBeNull();
  });
});

describe('recent sessions, compact by default', () => {
  function aDay(dayNumber: number): JourneyDay {
    return {
      day_number: dayNumber,
      planned_on: `2026-08-${String(dayNumber).padStart(2, '0')}`,
      split: 'push',
      status: 'completed',
      completed_at: `2026-08-${String(dayNumber).padStart(2, '0')}T18:00:00Z`,
    };
  }

  it('shows only the 3 most recent completed days, with a "Show N more" toggle', async () => {
    mockJourney.mockResolvedValue(aJourney({ current_day: 8 }));
    mockToday.mockResolvedValue(aSession([anItem()]));
    mockDays.mockResolvedValue([1, 2, 3, 4, 5, 6, 7].map(aDay));
    await openChart();

    expect(screen.getAllByText('Done')).toHaveLength(3);
    expect(screen.getByText('Show 4 more')).toBeTruthy();
  });

  it('expands to the full history already fetched, then collapses back', async () => {
    mockJourney.mockResolvedValue(aJourney({ current_day: 6 }));
    mockToday.mockResolvedValue(aSession([anItem()]));
    mockDays.mockResolvedValue([1, 2, 3, 4, 5].map(aDay));
    await openChart();

    fireEvent.press(screen.getByText('Show 2 more'));
    expect(screen.getAllByText('Done')).toHaveLength(5);
    expect(screen.getByText('Show less')).toBeTruthy();

    fireEvent.press(screen.getByText('Show less'));
    expect(screen.getAllByText('Done')).toHaveLength(3);
  });
});
