/**
 * Editing one program day's exercises — add, edit, reorder, remove.
 *
 * There is no "get one day" endpoint; the screen reads the day out of the
 * whole programme and refetches that same programme after every mutation,
 * so these tests assert against the real endpoint calls the same way
 * `trainer-program.test.tsx` does for the day list one level up.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import TrainerProgramDayScreen from '../app/(trainer)/plan-day/[dayId]';
import { ApiError } from '../src/api/client';
import type { MemberWorkoutProgram } from '../src/api/types';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ dayId: '501', memberId: '42', dayName: 'Day 1 — Upper Strength' }),
}));

const mockMemberWorkoutProgram = jest.fn();
const mockAddProgramExercise = jest.fn();
const mockUpdateProgramExercise = jest.fn();
const mockRemoveProgramExercise = jest.fn();
const mockReorderProgramExercises = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  memberWorkoutProgram: (...a: unknown[]) => mockMemberWorkoutProgram(...a),
  addProgramExercise: (...a: unknown[]) => mockAddProgramExercise(...a),
  updateProgramExercise: (...a: unknown[]) => mockUpdateProgramExercise(...a),
  removeProgramExercise: (...a: unknown[]) => mockRemoveProgramExercise(...a),
  reorderProgramExercises: (...a: unknown[]) => mockReorderProgramExercises(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

async function draw() {
  const result = render(<TrainerProgramDayScreen />);
  await act(async () => {});
  return result;
}

function aProgram(partial: Partial<MemberWorkoutProgram> = {}): MemberWorkoutProgram {
  return {
    id: 5,
    member_id: 42,
    source_template_id: null,
    name: 'Custom plan',
    is_active: true,
    days: [
      {
        id: 501,
        order_index: 0,
        name: 'Day 1 — Upper Strength',
        category: 'upper',
        image_key: 'upper',
        estimated_duration_minutes: 60,
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
          {
            id: 9002,
            order_index: 1,
            exercise: 'Barbell Row',
            sets: 4,
            reps: '6-8',
            rest_seconds: 120,
            notes: null,
          },
        ],
      },
    ],
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMemberWorkoutProgram.mockResolvedValue(aProgram());
});

it('shows the exercises already in this day', async () => {
  await draw();
  expect(screen.getByText('Barbell Bench Press')).toBeTruthy();
  expect(screen.getByText('Barbell Row')).toBeTruthy();
});

it('says so plainly when the day itself has vanished from the programme', async () => {
  mockMemberWorkoutProgram.mockResolvedValue(aProgram({ days: [] }));
  await draw();
  expect(screen.getByText('This day is no longer here')).toBeTruthy();
});

it('adds an exercise through the real backend', async () => {
  mockAddProgramExercise.mockResolvedValue({});
  await draw();
  fireEvent.press(screen.getByTestId('add-exercise'));
  fireEvent.changeText(screen.getByTestId('add-exercise-name'), 'Lateral Raise');
  fireEvent.changeText(screen.getByTestId('add-exercise-sets'), '3');
  fireEvent.press(screen.getByTestId('add-exercise-save'));

  await waitFor(() => expect(mockAddProgramExercise).toHaveBeenCalledTimes(1));
  expect(mockAddProgramExercise.mock.calls[0]).toEqual([
    42,
    501,
    { exercise: 'Lateral Raise', sets: 3, reps: '10', rest_seconds: 60, notes: null },
    'token',
  ]);
});

it('edits an exercise in place', async () => {
  mockUpdateProgramExercise.mockResolvedValue({});
  await draw();
  fireEvent.press(screen.getByTestId('exercise-edit-0'));
  fireEvent.changeText(screen.getByTestId('edit-exercise-sets'), '5');
  fireEvent.press(screen.getByTestId('edit-exercise-save'));

  await waitFor(() => expect(mockUpdateProgramExercise).toHaveBeenCalledTimes(1));
  expect(mockUpdateProgramExercise.mock.calls[0][0]).toBe(42);
  expect(mockUpdateProgramExercise.mock.calls[0][1]).toBe(501);
  expect(mockUpdateProgramExercise.mock.calls[0][2]).toBe(9001);
  expect(mockUpdateProgramExercise.mock.calls[0][3]).toMatchObject({ sets: 5 });
});

it('removes an exercise through the real backend', async () => {
  mockRemoveProgramExercise.mockResolvedValue(undefined);
  await draw();
  fireEvent.press(screen.getByTestId('exercise-remove-0'));

  await waitFor(() => expect(mockRemoveProgramExercise).toHaveBeenCalledTimes(1));
  expect(mockRemoveProgramExercise.mock.calls[0]).toEqual([42, 501, 9001, 'token']);
});

it('reorders exercises within the day', async () => {
  mockReorderProgramExercises.mockResolvedValue({});
  await draw();
  expect(screen.getByTestId('exercise-move-up-0').props.accessibilityState.disabled).toBe(true);

  fireEvent.press(screen.getByTestId('exercise-move-down-0'));

  await waitFor(() => expect(mockReorderProgramExercises).toHaveBeenCalledTimes(1));
  expect(mockReorderProgramExercises.mock.calls[0]).toEqual([42, 501, [9002, 9001], 'token']);
});

it('surfaces a server error rather than pretending the save worked', async () => {
  mockAddProgramExercise.mockRejectedValue(new ApiError(400, 'bad_request', 'Sets must be at least 1'));
  await draw();
  fireEvent.press(screen.getByTestId('add-exercise'));
  fireEvent.changeText(screen.getByTestId('add-exercise-name'), 'Face Pull');
  fireEvent.press(screen.getByTestId('add-exercise-save'));
  await waitFor(() => expect(screen.getByText('Sets must be at least 1')).toBeTruthy());
});
