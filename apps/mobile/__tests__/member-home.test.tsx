/**
 * Member Home's one actionable element: today's workout.
 *
 * What is pinned here is where the card sends the member and what it claims
 * about their day. Both are easy to get subtly wrong — a card that says "2 of
 * 6" while the member is standing at exercise three, or a "Continue" that
 * lands on a list they then have to scroll, is the difference between an entry
 * point and an obstacle.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import MemberHomeScreen from '../app/(member)/index';
import type {
  Journey,
  MemberHome,
  PTPackage,
  PTSession,
  WorkoutItem,
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

const mockHome = jest.fn();
const mockPayments = jest.fn();
const mockDays = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  memberHome: (...a: unknown[]) => mockHome(...a),
  myPayments: (...a: unknown[]) => mockPayments(...a),
  myJourneyDays: (...a: unknown[]) => mockDays(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

jest.mock('../src/components/account', () => ({
  AccountAvatar: () => null,
}));

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
    days_completed: 5,
    completion_pct: 11,
    workouts_completed: 4,
    pt_converted: false,
    ...partial,
  } as Journey;
}

function aWorkout(items: WorkoutItem[], partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 5,
    member_id: 2,
    branch_id: 1,
    journey_id: 3,
    day_number: 6,
    split: 'push',
    split_label: 'Push',
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

function aPackage(partial: Partial<PTPackage> = {}): PTPackage {
  return {
    id: 9,
    member_id: 2,
    member_name: 'Aditya Rao',
    branch_id: 1,
    trainer_id: 5,
    trainer_name: 'Kiran Prasad',
    sessions_total: 12,
    sessions_used: 3,
    sessions_remaining: 9,
    status: 'active',
    start_date: '2026-08-17',
    expiry_date: null,
    origin: 'trainer_conversion',
    price_amount: null,
    currency: null,
    low_balance: false,
    ...partial,
  };
}

function aPtSession(partial: Partial<PTSession> = {}): PTSession {
  return {
    id: 1,
    package_id: 9,
    member_id: 2,
    member_name: 'Aditya Rao',
    trainer_id: 5,
    trainer_name: 'Kiran Prasad',
    branch_id: 1,
    session_date: '2026-08-25',
    scheduled_start: '2026-08-25T18:00:00Z',
    scheduled_end: null,
    session_number: 4,
    package_size: 12,
    status: 'scheduled',
    member_checked_in_at: null,
    trainer_checked_in_at: null,
    completed_at: null,
    notes: null,
    ...partial,
  };
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
    ...partial,
  };
}

async function openHome() {
  const result = render(<MemberHomeScreen />);
  await act(async () => {});
  await focus();
  return result;
}

async function focus() {
  await act(async () => {
    focusCallback?.();
  });
}

const comeBack = focus;

beforeEach(() => {
  jest.clearAllMocks();
  focusCallback = null;
  mockPayments.mockResolvedValue([]);
  mockDays.mockResolvedValue([]);
  mockHome.mockResolvedValue(aHome());
});

/* ------------------------------------------------------------ not started */

describe('before the workout has been started', () => {
  it('offers to start it, and sends the member to the chart to do so', async () => {
    // Starting is a write that lives on the chart. Home does not duplicate it.
    await openHome();
    fireEvent.press(screen.getByLabelText('Start today’s workout'));
    expect(mockPush).toHaveBeenCalledWith('/(member)/workout');
  });

  it('never shows the member the internal 45-day counter', async () => {
    // The 45 days decide when a *trainer* is asked to review somebody for PT.
    // Shown to the member it is a deadline they were never told about and
    // cannot act on, so no member-facing surface carries it.
    await openHome();
    expect(screen.queryByText(/Day \d+ of \d+/)).toBeNull();
    expect(screen.queryByText(/45/)).toBeNull();
    expect(screen.queryByText(/45-day/)).toBeNull();
  });

  it('says the chart is ready instead of counting days', async () => {
    await openHome();
    expect(screen.getByText('Your chart is ready — tap to start')).toBeTruthy();
    expect(screen.queryByText(/sets logged/)).toBeNull();
  });

  it('offers no shortcut into an exercise that does not exist yet', async () => {
    await openHome();
    expect(screen.queryByText('See the full chart')).toBeNull();
  });
});

/* ------------------------------------------------------------ in progress */

describe('while the workout is under way', () => {
  const items = [
    anItem({ id: 11, order_index: 0, status: 'completed', sets_logged: 3 }),
    anItem({ id: 12, order_index: 1, exercise: 'Incline Dumbbell Press', sets_logged: 1 }),
    anItem({ id: 13, order_index: 2, exercise: 'Lateral Raise' }),
  ];

  beforeEach(() => {
    mockHome.mockResolvedValue(aHome({ today_workout: aWorkout(items) }));
  });

  it('names the next exercise on the button itself', async () => {
    // The member reads where they are going before deciding to go.
    await openHome();
    expect(screen.getByText('Continue · Incline Dumbbell Press')).toBeTruthy();
  });

  it('opens that exercise directly, not the list in front of it', async () => {
    await openHome();
    fireEvent.press(screen.getByLabelText('Continue · Incline Dumbbell Press'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(member)/exercise/[itemId]',
      params: { itemId: '12', sessionId: '5' },
    });
  });

  it('picks the next unfinished exercise in chart order, not the first started one', async () => {
    const outOfOrder = [
      anItem({ id: 13, order_index: 2, exercise: 'Lateral Raise' }),
      anItem({ id: 11, order_index: 0, status: 'completed', sets_logged: 3 }),
      anItem({ id: 12, order_index: 1, exercise: 'Incline Dumbbell Press' }),
    ];
    mockHome.mockResolvedValue(aHome({ today_workout: aWorkout(outOfOrder) }));
    await openHome();
    expect(screen.getByText('Continue · Incline Dumbbell Press')).toBeTruthy();
  });

  it('keeps the whole chart one tap away', async () => {
    await openHome();
    fireEvent.press(screen.getByLabelText('See the full chart'));
    expect(mockPush).toHaveBeenCalledWith('/(member)/workout');
  });

  it('states progress in exercises and in sets actually logged', async () => {
    await openHome();
    expect(screen.getByText('1 of 3 exercises done · 4 sets logged')).toBeTruthy();
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('does not mention sets before any have been logged', async () => {
    const untouched = [anItem({ id: 11 }), anItem({ id: 12, order_index: 1 })];
    mockHome.mockResolvedValue(aHome({ today_workout: aWorkout(untouched) }));
    await openHome();
    expect(screen.getByText('0 of 2 exercises done')).toBeTruthy();
  });
});

/* ----------------------------------------------------- everything but done */

describe('when every exercise is finished but the workout is not', () => {
  it('offers to finish it, on the chart where finishing lives', async () => {
    const allDone = [
      anItem({ id: 11, status: 'completed', sets_logged: 3 }),
      anItem({ id: 12, order_index: 1, status: 'completed', sets_logged: 3 }),
    ];
    mockHome.mockResolvedValue(aHome({ today_workout: aWorkout(allDone) }));
    await openHome();

    expect(screen.getByText('Finish workout')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Finish workout'));
    expect(mockPush).toHaveBeenCalledWith('/(member)/workout');
  });
});

/* -------------------------------------------------------------- completed */

describe('once the workout is recorded', () => {
  const items = [
    anItem({ id: 11, status: 'completed', sets_logged: 3 }),
    anItem({ id: 12, order_index: 1, status: 'completed', sets_logged: 4 }),
  ];

  beforeEach(() => {
    mockHome.mockResolvedValue(aHome({ today_workout: aWorkout(items, { status: 'completed' }) }));
  });

  it('says what was built, in sets the member logged', async () => {
    await openHome();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('2 exercises · 7 sets logged')).toBeTruthy();
  });

  it('offers a review rather than a way back in', async () => {
    await openHome();
    expect(screen.getByText('Review today’s workout')).toBeTruthy();
    expect(screen.queryByText(/^Continue/)).toBeNull();
    expect(screen.queryByText('See the full chart')).toBeNull();
  });

  it('falls back to exercises when a workout was completed without sets', async () => {
    // Older sessions, and any exercise ticked off without logging, have none.
    const noSets = items.map((item) => ({ ...item, sets_logged: 0 }));
    mockHome.mockResolvedValue(aHome({ today_workout: aWorkout(noSets, { status: 'completed' }) }));
    await openHome();
    expect(screen.getByText('2 exercises done')).toBeTruthy();
  });
});

/* ------------------------------------------------------------- returning */

describe('coming back from logging', () => {
  it('re-reads the day, so the card is not the one the member left', async () => {
    mockHome.mockResolvedValue(aHome({ today_workout: aWorkout([anItem()]) }));
    await openHome();
    expect(mockHome).toHaveBeenCalledTimes(1);

    mockHome.mockResolvedValue(
      aHome({
        today_workout: aWorkout([anItem({ status: 'completed', sets_logged: 3 })], {
          status: 'completed',
        }),
      }),
    );
    await comeBack();

    await waitFor(() => expect(screen.getByText('Completed')).toBeTruthy());
    expect(mockHome).toHaveBeenCalledTimes(2);
  });

  it('does not fetch twice on the way in', async () => {
    await openHome();
    expect(mockHome).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------ what must not be touched */

describe('the rest of home is left alone', () => {
  it('still leads with a rest day rather than an exercise', async () => {
    mockHome.mockResolvedValue(aHome({ journey: aJourney({ split_today: 'rest' }) }));
    await openHome();
    // Twice: the kind tag and the card title. Both are meant to be there.
    expect(screen.getAllByText('Rest & recovery').length).toBe(2);
    expect(screen.queryByText(/^Continue/)).toBeNull();
  });

  it('still says plainly when no programme has started', async () => {
    mockHome.mockResolvedValue(aHome({ journey: null }));
    await openHome();
    expect(screen.getByText('Your programme has not started')).toBeTruthy();
  });

  it('still shows the streak and the workout count', async () => {
    await openHome();
    expect(screen.getByText('Streak')).toBeTruthy();
    expect(screen.getByText('Workouts')).toBeTruthy();
  });
});

/* ------------------------------------------------------- an inactive journey */

describe('a journey that is no longer active', () => {
  // `start_workout` resolves the member's plan from their *active* journey.
  // Off that phase it silently opens a bare, unassigned session instead of
  // refusing — so the Today card must never offer to start one once the
  // journey reports "complete", regardless of what day 45 happened to plan.
  it('never offers to start a workout once the programme has finished', async () => {
    mockHome.mockResolvedValue(
      aHome({ journey: aJourney({ status: 'completed', phase: 'complete', split_today: 'push' }) }),
    );
    await openHome();
    expect(screen.queryByTestId('today-card')).toBeNull();
    expect(screen.queryByText(/Start today.s workout/)).toBeNull();
    expect(screen.getByText('General Training complete')).toBeTruthy();
  });

  it('never offers a rest card either, once the programme has finished', async () => {
    // Day 45 could just as easily have planned a rest day — that must not
    // read as "come back tomorrow" when there is no programme left to train.
    mockHome.mockResolvedValue(
      aHome({ journey: aJourney({ status: 'completed', phase: 'complete', split_today: 'rest' }) }),
    );
    await openHome();
    expect(screen.queryByTestId('today-card')).toBeNull();
    expect(screen.getByText('General Training complete')).toBeTruthy();
  });

  it('still opens a booked PT session today even after the programme is done', async () => {
    mockHome.mockResolvedValue(
      aHome({
        journey: aJourney({ status: 'completed', phase: 'complete', pt_converted: true }),
        next_pt_session: aPtSession({
          session_number: 1,
          session_date: new Date().toISOString().slice(0, 10),
          scheduled_start: new Date().toISOString(),
        }),
      }),
    );
    await openHome();
    expect(screen.getByText('Open your PT session')).toBeTruthy();
  });
});

/* --------------------------------------------------------- the PT package */

describe("a converted member's PT package", () => {
  it('is shown on Home even with nothing booked yet', async () => {
    mockHome.mockResolvedValue(
      aHome({
        journey: aJourney({ status: 'completed', phase: 'complete', pt_converted: true }),
        pt_package: aPackage({ sessions_remaining: 9, sessions_total: 12 }),
      }),
    );
    await openHome();
    expect(screen.getByText('PT with Kiran Prasad')).toBeTruthy();
    expect(screen.getByText('of 12 sessions left')).toBeTruthy();
  });

  it('gives way to the next-session card once one is booked, rather than repeating it', async () => {
    mockHome.mockResolvedValue(
      aHome({
        journey: aJourney({ status: 'completed', phase: 'complete', pt_converted: true }),
        pt_package: aPackage(),
        next_pt_session: aPtSession(),
      }),
    );
    await openHome();
    expect(screen.getByText('Next PT session')).toBeTruthy();
    expect(screen.queryByText('PT with Kiran Prasad')).toBeNull();
  });

  it('says nothing when there is no active package', async () => {
    await openHome();
    expect(screen.queryByText(/of \d+ sessions left/)).toBeNull();
  });
});

/* -------------------------------------------------- PT with no GT journey */

describe('a member trained entirely on PT, with no General Training journey', () => {
  // A package can be created with no `journey_id` at all — PT on its own is a
  // real, first-class programme, not only something a finished GT journey
  // converts into. `journey: null` must never read as "nothing has started".

  it('opens a same-day PT session rather than claiming nothing has started', async () => {
    mockHome.mockResolvedValue(
      aHome({
        journey: null,
        next_pt_session: aPtSession({
          session_date: new Date().toISOString().slice(0, 10),
          scheduled_start: new Date().toISOString(),
        }),
        pt_package: aPackage(),
      }),
    );
    await openHome();
    expect(screen.getByText('Open your PT session')).toBeTruthy();
    expect(screen.queryByText('Your programme has not started')).toBeNull();
  });

  it('says there is no session today, not that nothing has started, when the next one is later', async () => {
    mockHome.mockResolvedValue(
      aHome({
        journey: null,
        next_pt_session: aPtSession(),
        pt_package: aPackage(),
      }),
    );
    await openHome();
    expect(screen.getByText('No session today')).toBeTruthy();
    expect(screen.queryByText('Your programme has not started')).toBeNull();
    expect(screen.getByText('Next PT session')).toBeTruthy();
  });

  it('points at PT rather than GT when only an active package exists, nothing booked', async () => {
    mockHome.mockResolvedValue(aHome({ journey: null, pt_package: aPackage() }));
    await openHome();
    expect(screen.getByText('No session today')).toBeTruthy();
    expect(screen.queryByText('Your programme has not started')).toBeNull();
  });
});

/* ------------------------------------------------------------ days left */

describe('a lapsed membership', () => {
  // `ends_on` can fall behind `membership_status` by a day or two, so
  // `days_remaining` can go negative while the status card above still reads
  // "active". A plain signed number in the "Days left" tile — "-5" — reads as
  // a broken count, not as "expired".
  it('reads as expired rather than as a negative count', async () => {
    mockHome.mockResolvedValue(aHome({ days_remaining: -5 }));
    await openHome();
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.queryByText('-5')).toBeNull();
    expect(screen.queryByText('on plan')).toBeNull();
  });

  it('still shows the real count while time remains', async () => {
    mockHome.mockResolvedValue(aHome({ days_remaining: 12 }));
    await openHome();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('on plan')).toBeTruthy();
  });
});
