/**
 * The exercise screen, driven the way a member drives it.
 *
 * What is pinned here is everything between the keyboard and the API: that the
 * fields are prefilled from real history rather than left blank, that a member
 * can clear a field they were given, that a typo never reaches the server, and
 * that nothing is shown as logged until the server has actually stored it.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import ExerciseScreen from '../app/(member)/exercise/[itemId]';
import { ApiError } from '../src/api/client';
import type {
  PersonalRecord,
  WorkoutSession,
  WorkoutSet,
  WorkoutSetHistory,
  WorkoutSetLogged,
} from '../src/api/types';

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: jest.fn() }),
  useLocalSearchParams: () => ({ itemId: '11', sessionId: '5' }),
}));

const mockSets = jest.fn();
const mockHistory = jest.fn();
const mockToday = jest.fn();
const mockLog = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockSetItem = jest.fn();

jest.mock('../src/api/endpoints', () => ({
  todayWorkout: (...a: unknown[]) => mockToday(...a),
  workoutSets: (...a: unknown[]) => mockSets(...a),
  exerciseHistory: (...a: unknown[]) => mockHistory(...a),
  logWorkoutSet: (...a: unknown[]) => mockLog(...a),
  updateWorkoutSet: (...a: unknown[]) => mockUpdate(...a),
  deleteWorkoutSet: (...a: unknown[]) => mockDelete(...a),
  setWorkoutItem: (...a: unknown[]) => mockSetItem(...a),
}));

/**
 * `withToken` and the context object must keep the same identity across
 * renders. `useApi` lists `withToken` as a dependency, so a fresh function per
 * render re-runs the fetch effect on every render — the real provider is
 * memoised, and a mock that is not turns every test into an infinite loop.
 */
const mockWithToken = (action: (token: string) => Promise<unknown>) => action('token');
const mockAuth = { withToken: mockWithToken };
jest.mock('../src/store/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

function aSet(partial: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 1,
    session_item_id: 11,
    set_number: 1,
    weight_kg: 60,
    reps: 8,
    rpe: null,
    completed_at: '2026-08-17T09:00:00Z',
    ...partial,
  };
}

function noHistory(): WorkoutSetHistory {
  return {
    exercise: 'Barbell Bench Press',
    sessions: [],
    heaviest: null,
    best_volume_kg: null,
    best_volume_on: null,
  };
}

function historyOf(sets: WorkoutSet[], sessionDate = '2026-08-14'): WorkoutSetHistory {
  return {
    exercise: 'Barbell Bench Press',
    sessions: [
      {
        session_id: 4,
        session_date: sessionDate,
        split: 'push',
        split_label: 'Push',
        sets,
        volume_kg: sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0),
        top_weight_kg: Math.max(...sets.map((s) => s.weight_kg), 0),
        total_reps: sets.reduce((sum, s) => sum + s.reps, 0),
        average_rpe: null,
      },
    ],
    heaviest: sets[0] ?? null,
    best_volume_kg: 480,
    best_volume_on: sessionDate,
  };
}

function logged(set: WorkoutSet, records: PersonalRecord[] = []): WorkoutSetLogged {
  return { set, records };
}

function aSession(partial: Partial<WorkoutSession> = {}): WorkoutSession {
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
    completed_items: 0,
    total_items: 2,
    items: [
      {
        id: 11,
        order_index: 0,
        exercise: 'Barbell Bench Press',
        sets: 3,
        reps: '10',
        rest_seconds: 90,
        status: 'pending',
        completed_at: null,
        sets_logged: 0,
      },
      {
        id: 12,
        order_index: 1,
        exercise: 'Incline Dumbbell Press',
        sets: 3,
        reps: '12',
        rest_seconds: 60,
        status: 'pending',
        completed_at: null,
        sets_logged: 0,
      },
    ],
    ...partial,
  };
}

async function open() {
  const result = render(<ExerciseScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockToday.mockResolvedValue(aSession());
  mockSets.mockResolvedValue([]);
  mockHistory.mockResolvedValue(noHistory());
});

/* ------------------------------------------------------------- loading */

describe('what the member sees before anything is logged', () => {
  it('names the exercise, its place in the chart and what the plan asks for', async () => {
    await open();
    expect(screen.getByText('Barbell Bench Press')).toBeTruthy();
    expect(screen.getByText('Push · 1 of 2')).toBeTruthy();
    expect(screen.getByText(/Plan: 3 × 10/)).toBeTruthy();
  });

  it('says there are no sets rather than showing an empty table', async () => {
    await open();
    expect(screen.getByText(/No sets logged yet/)).toBeTruthy();
  });

  it('reports a failure to load in words, with a retry', async () => {
    mockSets.mockRejectedValue(new ApiError(500, 'server_error', 'GymFlow is not responding.'));
    await open();
    expect(screen.getByText('GymFlow is not responding.')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('reads offline as offline rather than as a server fault', async () => {
    mockSets.mockRejectedValue(new ApiError(0, 'offline', 'No connection.'));
    await open();
    expect(screen.getByText('No connection')).toBeTruthy();
  });
});

/* ------------------------------------------------------------ prefill */

describe('the fields start from real history', () => {
  it('prefills from the last session when today has nothing yet', async () => {
    mockHistory.mockResolvedValue(
      historyOf([aSet({ weight_kg: 60, reps: 8 }), aSet({ id: 2, weight_kg: 62.5, reps: 6 })]),
    );
    await open();

    // The last set of last session — what the member is most likely to repeat.
    expect(screen.getByTestId('set-weight').props.value).toBe('62.5');
    expect(screen.getByTestId('set-reps').props.value).toBe('6');
  });

  it('prefills from the previous set of this session once one exists', async () => {
    mockSets.mockResolvedValue([aSet({ weight_kg: 70, reps: 5 })]);
    await open();
    expect(screen.getByTestId('set-weight').props.value).toBe('70');
    expect(screen.getByTestId('set-reps').props.value).toBe('5');
  });

  it('never suggests an RPE, which is how hard *this* set felt', async () => {
    mockSets.mockResolvedValue([aSet({ rpe: 9 })]);
    await open();
    expect(screen.getByTestId('set-rpe').props.value).toBe('');
  });

  it('lets a member clear a field they were given', async () => {
    // The bug this guards: treating "empty" as "untouched" snaps the
    // suggestion straight back and the field cannot be emptied.
    mockSets.mockResolvedValue([aSet({ weight_kg: 70, reps: 5 })]);
    await open();
    fireEvent.changeText(screen.getByTestId('set-weight'), '');
    expect(screen.getByTestId('set-weight').props.value).toBe('');
    // And the field they did not touch keeps its suggestion.
    expect(screen.getByTestId('set-reps').props.value).toBe('5');
  });

  it('numbers the next set from what is already logged', async () => {
    mockSets.mockResolvedValue([aSet({ set_number: 1 }), aSet({ id: 2, set_number: 2 })]);
    await open();
    expect(screen.getByText('Log set 3')).toBeTruthy();
  });
});

/* --------------------------------------------------------- validation */

describe('a typo never reaches the server', () => {
  it('refuses reps that are not a whole number of repetitions', async () => {
    await open();
    fireEvent.changeText(screen.getByTestId('set-weight'), '60');
    fireEvent.changeText(screen.getByTestId('set-reps'), '0');
    await act(async () => {
      fireEvent.press(screen.getByTestId('log-set'));
    });
    expect(mockLog).not.toHaveBeenCalled();
    expect(screen.getByText(/how many reps/)).toBeTruthy();
  });

  it('refuses an RPE that is not on the scale', async () => {
    await open();
    fireEvent.changeText(screen.getByTestId('set-weight'), '60');
    fireEvent.changeText(screen.getByTestId('set-reps'), '8');
    fireEvent.changeText(screen.getByTestId('set-rpe'), '12');
    await act(async () => {
      fireEvent.press(screen.getByTestId('log-set'));
    });
    expect(mockLog).not.toHaveBeenCalled();
    expect(screen.getByText(/RPE runs from 1 to 10/)).toBeTruthy();
  });

  it('accepts zero as a weight, because bodyweight is a real answer', async () => {
    mockLog.mockResolvedValue(logged(aSet({ weight_kg: 0, reps: 12 })));
    await open();
    fireEvent.changeText(screen.getByTestId('set-weight'), '0');
    fireEvent.changeText(screen.getByTestId('set-reps'), '12');
    await act(async () => {
      fireEvent.press(screen.getByTestId('log-set'));
    });
    expect(mockLog).toHaveBeenCalledWith(
      5,
      11,
      { set_number: 1, weight_kg: 0, reps: 12, rpe: null },
      'token',
    );
  });
});

/* --------------------------------------------------------- persistence */

describe('logging a set', () => {
  it('sends what was typed and re-reads the stored rows', async () => {
    mockLog.mockResolvedValue(logged(aSet()));
    await open();
    fireEvent.changeText(screen.getByTestId('set-weight'), '62.5');
    fireEvent.changeText(screen.getByTestId('set-reps'), '8');
    fireEvent.changeText(screen.getByTestId('set-rpe'), '7.5');
    await act(async () => {
      fireEvent.press(screen.getByTestId('log-set'));
    });

    expect(mockLog).toHaveBeenCalledWith(
      5,
      11,
      { set_number: 1, weight_kg: 62.5, reps: 8, rpe: 7.5 },
      'token',
    );
    // Re-read rather than trusted locally: the list shows stored rows only.
    await waitFor(() => expect(mockSets).toHaveBeenCalledTimes(2));
  });

  it('starts the rest the plan prescribed once the set is stored', async () => {
    mockLog.mockResolvedValue(logged(aSet()));
    await open();
    fireEvent.changeText(screen.getByTestId('set-weight'), '60');
    fireEvent.changeText(screen.getByTestId('set-reps'), '8');
    await act(async () => {
      fireEvent.press(screen.getByTestId('log-set'));
    });
    // 90s rest on this exercise, not a hard-coded default.
    await waitFor(() => expect(screen.getByText('1:30')).toBeTruthy());
  });

  it('does not start a rest, or clear the fields, when the save failed', async () => {
    mockLog.mockRejectedValue(new ApiError(409, 'set_number_taken', 'Set 1 is already logged.'));
    await open();
    fireEvent.changeText(screen.getByTestId('set-weight'), '60');
    fireEvent.changeText(screen.getByTestId('set-reps'), '8');
    await act(async () => {
      fireEvent.press(screen.getByTestId('log-set'));
    });

    expect(screen.getByText('Set 1 is already logged.')).toBeTruthy();
    expect(screen.queryByText('Resting')).toBeNull();
    expect(screen.getByTestId('set-weight').props.value).toBe('60');
  });
});

describe('correcting a set', () => {
  it('loads the set into the fields and saves it as an update', async () => {
    mockSets.mockResolvedValue([aSet({ weight_kg: 60, reps: 8, rpe: 8 })]);
    mockUpdate.mockResolvedValue(aSet({ weight_kg: 65 }));
    await open();

    fireEvent.press(screen.getByLabelText(/Edit\.$/));
    expect(screen.getByTestId('set-weight').props.value).toBe('60');
    expect(screen.getByTestId('set-rpe').props.value).toBe('8');
    expect(screen.getByText('Save changes')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('set-weight'), '65');
    await act(async () => {
      fireEvent.press(screen.getByTestId('log-set'));
    });
    expect(mockUpdate).toHaveBeenCalledWith(5, 11, 1, { weight_kg: 65, reps: 8, rpe: 8 }, 'token');
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('does not start a rest timer after a correction', async () => {
    // Correcting a set an hour later must not tell the member to rest.
    mockSets.mockResolvedValue([aSet()]);
    mockUpdate.mockResolvedValue(aSet({ weight_kg: 65 }));
    await open();
    fireEvent.press(screen.getByLabelText(/Edit\.$/));
    fireEvent.changeText(screen.getByTestId('set-weight'), '65');
    await act(async () => {
      fireEvent.press(screen.getByTestId('log-set'));
    });
    expect(screen.queryByText('Resting')).toBeNull();
  });
});

/* ------------------------------------------------------------ closed */

describe('a finished workout', () => {
  it('is a record, so it offers no way to change it', async () => {
    mockToday.mockResolvedValue(aSession({ status: 'completed' }));
    mockSets.mockResolvedValue([aSet()]);
    await open();

    expect(screen.getByText(/cannot be changed/)).toBeTruthy();
    expect(screen.queryByTestId('log-set')).toBeNull();
    // The sets stay readable.
    expect(screen.getByText('60 kg')).toBeTruthy();
  });
});

/* -------------------------------------------------------- navigation */

describe('moving through the chart', () => {
  it('offers the next exercise by name', async () => {
    await open();
    expect(screen.getByText('Next: Incline Dumbbell Press')).toBeTruthy();
  });

  it('offers the way back instead of a next when this is the last exercise', async () => {
    mockToday.mockResolvedValue(aSession({ items: [aSession().items[0]] }));
    await open();
    expect(screen.queryByText(/^Next:/)).toBeNull();
    expect(screen.getByText('Back to workout')).toBeTruthy();
  });

  it('says so plainly when the exercise is no longer in the workout', async () => {
    mockToday.mockResolvedValue(aSession({ items: [] }));
    await open();
    expect(screen.getByText(/not in today’s workout/)).toBeTruthy();
  });
});

/* ------------------------------------------------------ personal records */

function aRecord(partial: Partial<PersonalRecord> = {}): PersonalRecord {
  return {
    kind: 'heaviest_weight',
    weight_kg: 65,
    reps: 6,
    volume_kg: null,
    previous_weight_kg: 60,
    previous_reps: 8,
    previous_volume_kg: null,
    ...partial,
  };
}

async function logASet(weight = '65', reps = '6') {
  fireEvent.changeText(screen.getByTestId('set-weight'), weight);
  fireEvent.changeText(screen.getByTestId('set-reps'), reps);
  await act(async () => {
    fireEvent.press(screen.getByTestId('log-set'));
  });
}

describe('records the server reports', () => {
  it('says what was beaten, without asking for anything back', async () => {
    // No modal, no dismiss. A member mid-workout has their hands on a bar.
    mockLog.mockResolvedValue(logged(aSet({ weight_kg: 65, reps: 6 }), [aRecord()]));
    await open();
    await logASet();

    await waitFor(() => expect(screen.getByText('Heaviest ever')).toBeTruthy());
    expect(screen.getByText('65 kg × 6 · was 60 kg × 8')).toBeTruthy();
  });

  it('shows nothing when the set beat nothing', async () => {
    mockLog.mockResolvedValue(logged(aSet(), []));
    await open();
    await logASet('60', '8');
    expect(screen.queryByText('Heaviest ever')).toBeNull();
  });

  it('never invents a record the server did not report', async () => {
    // A heavier-looking set is not a PR unless the server says so — it is the
    // only side that can see the member's whole history.
    mockHistory.mockResolvedValue(historyOf([aSet({ weight_kg: 60, reps: 8 })]));
    mockLog.mockResolvedValue(logged(aSet({ weight_kg: 100, reps: 10 }), []));
    await open();
    await logASet('100', '10');
    expect(screen.queryByText(/Heaviest/)).toBeNull();
  });

  it('clears the notice once the member starts typing the next set', async () => {
    // Left on screen it would read as a claim about the set being typed.
    mockLog.mockResolvedValue(logged(aSet({ weight_kg: 65, reps: 6 }), [aRecord()]));
    await open();
    await logASet();
    await waitFor(() => expect(screen.getByText('Heaviest ever')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('set-weight'), '67.5');
    expect(screen.queryByText('Heaviest ever')).toBeNull();
  });

  it('does not claim a record for a correction', async () => {
    mockSets.mockResolvedValue([aSet()]);
    mockUpdate.mockResolvedValue(aSet({ weight_kg: 65 }));
    await open();
    fireEvent.press(screen.getByLabelText(/Edit\.$/));
    fireEvent.changeText(screen.getByTestId('set-weight'), '65');
    await act(async () => {
      fireEvent.press(screen.getByTestId('log-set'));
    });
    expect(screen.queryByText('Heaviest ever')).toBeNull();
  });
});

/* -------------------------------------------------------------- history */

describe('the history sheet', () => {
  it('is offered only once there is more than the last session to show', async () => {
    mockHistory.mockResolvedValue(historyOf([aSet()]));
    await open();
    expect(screen.queryByText(/History ·/)).toBeNull();
  });

  it('opens on request and lists past sessions with their totals', async () => {
    const history = historyOf([aSet({ weight_kg: 60, reps: 8 })]);
    history.sessions.push({
      ...history.sessions[0],
      session_id: 9,
      session_date: '2026-08-10',
      average_rpe: 8,
    });
    mockHistory.mockResolvedValue(history);
    await open();

    await act(async () => {
      fireEvent.press(screen.getByText('History · 2 sessions'));
    });
    expect(screen.getByText('Your history')).toBeTruthy();
    expect(screen.getByText('Heaviest set')).toBeTruthy();
    expect(screen.getByText('Most moved in a session')).toBeTruthy();
    expect(screen.getByText('RPE 8')).toBeTruthy();
  });

  it('does not block logging when the history request fails', async () => {
    // A member can log sets without knowing what they did last week.
    mockHistory.mockRejectedValue(new ApiError(500, 'server_error', 'History unavailable.'));
    mockLog.mockResolvedValue(logged(aSet()));
    await open();

    expect(screen.getByTestId('log-set')).toBeTruthy();
    expect(screen.getByText(/First time logging this lift/)).toBeTruthy();
    await logASet('60', '8');
    expect(mockLog).toHaveBeenCalled();
  });
});
