/**
 * A trainer editing one client's programming — the legacy PPL split editor.
 *
 * `plan/[id]` now shows the Program Days screen instead (see
 * `trainer-program.test.tsx`); this is the pre-templates split-by-split
 * editor, moved to `plan-legacy/[id]` and kept reachable/working so a member
 * still on the 45-day journey's own `WorkoutPlan` can have it edited
 * directly. `PUT /journeys/members/{id}/plan/{split}` is untouched by the
 * templates work, and these tests hold that connection: a trainer can see
 * what is prescribed for a split, change it, and save exactly that split
 * without touching the others.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import TrainerPlanScreen from '../app/(trainer)/plan-legacy/[id]';
import { ApiError } from '../src/api/client';
import type { WorkoutPlan } from '../src/api/types';

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: mockCanGoBack, replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: '42', name: 'Priyanka Das' }),
}));

const mockMemberPlan = jest.fn();
const mockReplacePlanSplit = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  memberPlan: (...a: unknown[]) => mockMemberPlan(...a),
  replacePlanSplit: (...a: unknown[]) => mockReplacePlanSplit(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

async function draw() {
  const result = render(<TrainerPlanScreen />);
  await act(async () => {});
  return result;
}

function aPlan(partial: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: 9,
    name: 'Priyanka Das — plan',
    member_id: 42,
    journey_id: 3,
    is_active: true,
    items: [
      {
        id: 101,
        split: 'push',
        order_index: 0,
        exercise: 'Bench press',
        sets: 4,
        reps: '6-8',
        rest_seconds: 90,
        notes: null,
      },
      {
        id: 102,
        split: 'push',
        order_index: 1,
        exercise: 'Overhead press',
        sets: 3,
        reps: '8-10',
        rest_seconds: 60,
        notes: 'Light warm-up set first',
      },
      {
        id: 201,
        split: 'legs',
        order_index: 0,
        exercise: 'Back squat',
        sets: 5,
        reps: '5',
        rest_seconds: 120,
        notes: null,
      },
    ],
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMemberPlan.mockResolvedValue(aPlan());
  mockReplacePlanSplit.mockResolvedValue(aPlan());
});

describe('opening a client\'s plan', () => {
  it('shows the exercises already prescribed for the default split', async () => {
    await draw();
    expect(screen.getByDisplayValue('Bench press')).toBeTruthy();
    expect(screen.getByDisplayValue('Overhead press')).toBeTruthy();
    // Legs is a different split — not shown while Push is selected.
    expect(screen.queryByDisplayValue('Back squat')).toBeNull();
  });

  it('switches splits without mixing their exercises', async () => {
    await draw();
    fireEvent.press(screen.getByTestId('plan-split-legs'));
    await waitFor(() => expect(screen.getByDisplayValue('Back squat')).toBeTruthy());
    expect(screen.queryByDisplayValue('Bench press')).toBeNull();
  });

  it('says so plainly when a split has nothing prescribed yet', async () => {
    await draw();
    fireEvent.press(screen.getByTestId('plan-split-cardio'));
    await waitFor(() =>
      expect(screen.getByText(/No exercises prescribed for Cardio yet/)).toBeTruthy(),
    );
  });

  it('offers no edit surface at all when the member has no journey to plan', async () => {
    mockMemberPlan.mockRejectedValue(new ApiError(404, 'not_found', 'no journey'));
    await draw();
    expect(screen.getByText('No programme to edit yet')).toBeTruthy();
    expect(screen.queryByTestId('plan-save')).toBeNull();
  });
});

describe('editing and saving one split', () => {
  it('sends only the edited split, never the others', async () => {
    await draw();
    fireEvent.changeText(screen.getByTestId('plan-exercise-0'), 'Incline bench press');
    fireEvent.press(screen.getByTestId('plan-save'));

    await waitFor(() => expect(mockReplacePlanSplit).toHaveBeenCalledTimes(1));
    const [memberId, split, items] = mockReplacePlanSplit.mock.calls[0];
    expect(memberId).toBe(42);
    expect(split).toBe('push');
    expect(items).toHaveLength(2);
    expect(items[0].exercise).toBe('Incline bench press');
    expect(items.every((i: { split: string }) => i.split === 'push')).toBe(true);
  });

  it('adds a new exercise and includes it on save', async () => {
    await draw();
    fireEvent.press(screen.getByTestId('plan-add-exercise'));
    fireEvent.changeText(screen.getByTestId('plan-exercise-2'), 'Dips');
    fireEvent.press(screen.getByTestId('plan-save'));

    await waitFor(() => expect(mockReplacePlanSplit).toHaveBeenCalledTimes(1));
    const items = mockReplacePlanSplit.mock.calls[0][2];
    expect(items).toHaveLength(3);
    expect(items[2].exercise).toBe('Dips');
  });

  it('drops an exercise from the save when removed', async () => {
    await draw();
    fireEvent.press(screen.getAllByLabelText('Remove exercise')[1]);
    fireEvent.press(screen.getByTestId('plan-save'));

    await waitFor(() => expect(mockReplacePlanSplit).toHaveBeenCalledTimes(1));
    const items = mockReplacePlanSplit.mock.calls[0][2];
    expect(items).toHaveLength(1);
    expect(items[0].exercise).toBe('Bench press');
  });

  it('reorders exercises, and saves in the new order', async () => {
    await draw();
    expect(screen.getByTestId('plan-move-up-0').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByTestId('plan-move-down-0'));
    fireEvent.press(screen.getByTestId('plan-save'));

    await waitFor(() => expect(mockReplacePlanSplit).toHaveBeenCalledTimes(1));
    const items = mockReplacePlanSplit.mock.calls[0][2];
    expect(items).toHaveLength(2);
    expect(items[0].exercise).toBe('Overhead press');
    expect(items[1].exercise).toBe('Bench press');
  });

  it('confirms the save and refreshes from the server response', async () => {
    await draw();
    fireEvent.press(screen.getByTestId('plan-save'));
    await waitFor(() => expect(screen.getByText(/Saved\./)).toBeTruthy());
    expect(mockMemberPlan).toHaveBeenCalledTimes(2); // initial load + post-save refresh
  });

  it('surfaces the server message rather than pretending the save worked', async () => {
    mockReplacePlanSplit.mockRejectedValue(new ApiError(400, 'bad_request', 'Sets must be at least 1'));
    await draw();
    fireEvent.press(screen.getByTestId('plan-save'));
    await waitFor(() => expect(screen.getByText('Sets must be at least 1')).toBeTruthy());
  });
});
