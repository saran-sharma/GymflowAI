/**
 * The member Workout screen once a trainer has assigned a personalized
 * program — the templates-era path alongside the existing PPL-journey chart
 * covered by `workout-chart.test.tsx` (untouched by this file).
 *
 * A program takes over the screen the moment one exists, even for a member
 * still separately on a 45-day journey, and always shows the trainer's own
 * day names — never Push/Pull/Legs relabelled.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import MemberWorkoutScreen from '../app/(member)/workout';
import type {
  ActivityEntry,
  MemberWorkoutProgram,
  MemberWorkoutProgramDay,
  WorkoutSession,
} from '../src/api/types';

const mockPush = jest.fn();
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
const mockMemberMe = jest.fn();
const mockMemberWorkoutProgram = jest.fn();
const mockMemberProgramToday = jest.fn();
const mockMemberActivity = jest.fn();

jest.mock('../src/api/endpoints', () => ({
  myJourney: (...a: unknown[]) => mockJourney(...a),
  todayWorkout: (...a: unknown[]) => mockToday(...a),
  myJourneyDays: (...a: unknown[]) => mockDays(...a),
  startWorkout: (...a: unknown[]) => mockStart(...a),
  completeWorkout: (...a: unknown[]) => mockComplete(...a),
  memberMe: (...a: unknown[]) => mockMemberMe(...a),
  memberWorkoutProgram: (...a: unknown[]) => mockMemberWorkoutProgram(...a),
  memberProgramToday: (...a: unknown[]) => mockMemberProgramToday(...a),
  memberActivity: (...a: unknown[]) => mockMemberActivity(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function aDay(partial: Partial<MemberWorkoutProgramDay> = {}): MemberWorkoutProgramDay {
  return {
    id: 501,
    order_index: 0,
    name: 'Day 1 — Upper Strength',
    category: 'upper',
    image_key: 'upper',
    estimated_duration_minutes: 55,
    exercises: [
      {
        id: 9001,
        order_index: 0,
        exercise: 'Barbell Bench Press',
        sets: 4,
        reps: '6-8',
        rest_seconds: 120,
        notes: null,
      },
    ],
    ...partial,
  };
}

function aProgram(days: MemberWorkoutProgramDay[] = [aDay(), aDay({ id: 502, order_index: 1, name: 'Day 2 — Lower Strength', category: 'lower' })]): MemberWorkoutProgram {
  return {
    id: 5,
    member_id: 2,
    source_template_id: 3,
    name: 'Upper / Lower',
    is_active: true,
    days,
  };
}

function aSession(partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 77,
    member_id: 2,
    branch_id: 1,
    journey_id: null,
    day_number: null,
    split: null,
    split_label: null,
    program_day_id: 501,
    program_day_name: 'Day 1 — Upper Strength',
    program_day_category: 'upper',
    session_date: '2026-08-23',
    status: 'in_progress',
    started_at: '2026-08-23T08:00:00Z',
    completed_at: null,
    supervising_trainer_id: null,
    completed_items: 0,
    total_items: 1,
    items: [
      {
        id: 11,
        order_index: 0,
        exercise: 'Barbell Bench Press',
        sets: 4,
        reps: '6-8',
        rest_seconds: 120,
        status: 'pending',
        completed_at: null,
        sets_logged: 0,
      },
    ],
    ...partial,
  };
}

function anActivityEntry(partial: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    kind: 'own_workout',
    on: '2026-08-20',
    at: '2026-08-20T09:00:00Z',
    title: 'Own workout',
    detail: 'Day 1 — Upper Strength',
    reference_id: 70,
    branch_id: 1,
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockJourney.mockResolvedValue(null);
  mockDays.mockResolvedValue([]);
  mockToday.mockResolvedValue(null);
  mockMemberMe.mockResolvedValue({ member_id: 2 });
  mockMemberActivity.mockResolvedValue([]);
});

async function draw() {
  const result = render(<MemberWorkoutScreen />);
  await act(async () => {});
  return result;
}

describe('a member with no active program', () => {
  it('falls back to the journey chart untouched', async () => {
    mockMemberWorkoutProgram.mockResolvedValue(null);
    await draw();
    expect(screen.getByText('No programme yet')).toBeTruthy();
  });
});

describe('a member with an active personalized program', () => {
  beforeEach(() => {
    mockMemberWorkoutProgram.mockResolvedValue(aProgram());
  });

  it('shows a start card with the trainer-named day, never Push/Pull/Legs', async () => {
    mockMemberProgramToday.mockResolvedValue(aDay());
    await draw();
    expect(screen.getAllByText('Day 1 — Upper Strength').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 exercise/)).toBeTruthy();
    expect(screen.getByText(/~55 min/)).toBeTruthy();
    expect(screen.queryByText('Push')).toBeNull();
  });

  it('takes priority over the journey even when both exist', async () => {
    mockJourney.mockResolvedValue({
      id: 3,
      member_id: 2,
      status: 'active',
      phase: 'training',
      split_today: 'push',
      current_day: 6,
    });
    mockMemberProgramToday.mockResolvedValue(aDay());
    await draw();
    expect(screen.getAllByText('Day 1 — Upper Strength').length).toBeGreaterThan(0);
    expect(screen.queryByText('Getting started')).toBeNull();
  });

  it('starting the workout calls the real endpoint', async () => {
    mockMemberProgramToday.mockResolvedValue(aDay());
    mockStart.mockResolvedValue(aSession());
    await draw();
    fireEvent.press(screen.getByText('Start workout'));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
  });

  it('shows the open session under its program day name, with the real chart', async () => {
    mockMemberProgramToday.mockResolvedValue(aDay());
    mockToday.mockResolvedValue(aSession());
    await draw();
    expect(screen.getByText('Barbell Bench Press')).toBeTruthy();
    // The title is the program day name, not a split label.
    expect(screen.getAllByText('Day 1 — Upper Strength').length).toBeGreaterThan(0);
  });

  it('lists every program day by its trainer-given name', async () => {
    mockMemberProgramToday.mockResolvedValue(aDay());
    await draw();
    expect(screen.getByText('Day 2 — Lower Strength')).toBeTruthy();
  });

  it('shows recent sessions from the activity feed, with show more/less', async () => {
    mockMemberProgramToday.mockResolvedValue(aDay());
    mockMemberActivity.mockResolvedValue([
      anActivityEntry({ reference_id: 1, on: '2026-08-20' }),
      anActivityEntry({ reference_id: 2, on: '2026-08-18' }),
      anActivityEntry({ reference_id: 3, on: '2026-08-16' }),
      anActivityEntry({ reference_id: 4, on: '2026-08-14' }),
    ]);
    await draw();
    expect(screen.getAllByText('Day 1 — Upper Strength').length).toBeGreaterThanOrEqual(3);
    fireEvent.press(screen.getByText(/Show/));
    await waitFor(() => expect(screen.getAllByText('Day 1 — Upper Strength').length).toBeGreaterThanOrEqual(4));
  });

  it('finishing a workout calls the real endpoint', async () => {
    mockMemberProgramToday.mockResolvedValue(aDay());
    mockToday.mockResolvedValue(aSession());
    mockComplete.mockResolvedValue(aSession({ status: 'completed' }));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Finish');
      confirm?.onPress?.();
    });
    await draw();
    fireEvent.press(screen.getByText('Finish workout'));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledWith(77, 'token'));
    alertSpy.mockRestore();
  });
});
