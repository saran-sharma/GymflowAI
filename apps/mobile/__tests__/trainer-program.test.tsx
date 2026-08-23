/**
 * A trainer building one member's Program Days — the templates-era
 * replacement for the PUSH | PULL | LEGS split editor (still reachable,
 * unchanged, at `plan-legacy/[id]`; see `trainer-plan-legacy.test.tsx`).
 *
 * Every action here is a real round trip: add/rename/reorder/delete a day,
 * and the mocked endpoint is asserted to have been called with the right
 * arguments, then the screen re-fetches from (the now-updated) mock data —
 * there is no local-only draft state to fall out of sync with the server.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import TrainerProgramScreen from '../app/(trainer)/plan/[id]';
import { ApiError } from '../src/api/client';
import type { MemberWorkoutProgram } from '../src/api/types';

const mockPush = jest.fn();
const mockReplace = jest.fn();
/**
 * Captured rather than stubbed away: Expo Router can resolve a
 * `router.replace` back onto an already-mounted instance of this screen,
 * which does not re-run `useApi`'s effect on its own — only a focus event
 * does. Calling the real callback is what "the trainer landed back on this
 * screen" means to the navigator, and is how the applied-template-still-
 * shows-empty-state regression is pinned below.
 */
let focusCallback: (() => void | (() => void)) | null = null;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, canGoBack: () => true, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '42', name: 'Aditya Rao' }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    focusCallback = callback;
  },
}));

const mockMemberWorkoutProgram = jest.fn();
const mockCreateCustomProgram = jest.fn();
const mockAddProgramDay = jest.fn();
const mockRenameProgramDay = jest.fn();
const mockReorderProgramDays = jest.fn();
const mockDeleteProgramDay = jest.fn();
const mockAddProgramExercise = jest.fn();

jest.mock('../src/api/endpoints', () => ({
  memberWorkoutProgram: (...a: unknown[]) => mockMemberWorkoutProgram(...a),
  createCustomProgram: (...a: unknown[]) => mockCreateCustomProgram(...a),
  addProgramDay: (...a: unknown[]) => mockAddProgramDay(...a),
  renameProgramDay: (...a: unknown[]) => mockRenameProgramDay(...a),
  reorderProgramDays: (...a: unknown[]) => mockReorderProgramDays(...a),
  deleteProgramDay: (...a: unknown[]) => mockDeleteProgramDay(...a),
  addProgramExercise: (...a: unknown[]) => mockAddProgramExercise(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

/**
 * Render, then focus — the order the navigator uses. The screen is focused
 * on mount as well as on return, so a test that only ever fires the
 * *second* focus would never exercise the guard that stops the first one
 * duplicating the fetch `useApi` already did.
 */
async function draw() {
  const result = render(<TrainerProgramScreen />);
  await act(async () => {});
  await comeBack();
  return result;
}

/** The trainer returns to this screen from templates, the day editor, or a sheet. */
async function comeBack() {
  await act(async () => {
    focusCallback?.();
  });
}

function aProgram(partial: Partial<MemberWorkoutProgram> = {}): MemberWorkoutProgram {
  return {
    id: 5,
    member_id: 42,
    source_template_id: 3,
    name: 'Upper / Lower',
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
        ],
      },
      {
        id: 502,
        order_index: 1,
        name: 'Day 2 — Lower Strength',
        category: 'lower',
        image_key: 'lower',
        estimated_duration_minutes: 60,
        exercises: [],
      },
    ],
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  focusCallback = null;
  mockMemberWorkoutProgram.mockResolvedValue(aProgram());
});

describe('a member with no personalized program yet', () => {
  beforeEach(() => {
    mockMemberWorkoutProgram.mockResolvedValue(null);
  });

  it('offers to browse templates or start from scratch, not a fake empty split bar', async () => {
    await draw();
    expect(screen.getByText("Build this member's program")).toBeTruthy();
    expect(screen.getByTestId('browse-templates')).toBeTruthy();
    expect(screen.getByTestId('start-from-scratch')).toBeTruthy();
  });

  it('browsing templates carries the member id and name along', async () => {
    await draw();
    fireEvent.press(screen.getByTestId('browse-templates'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(trainer)/templates',
        params: { memberId: '42', name: 'Aditya Rao' },
      }),
    );
  });

  it('starting from scratch creates a real custom program, not local-only state', async () => {
    mockCreateCustomProgram.mockResolvedValue(aProgram({ source_template_id: null }));
    await draw();
    fireEvent.press(screen.getByTestId('start-from-scratch'));
    await waitFor(() => expect(mockCreateCustomProgram).toHaveBeenCalledTimes(1));
    expect(mockCreateCustomProgram.mock.calls[0][0]).toBe(42);
    await waitFor(() => expect(mockMemberWorkoutProgram).toHaveBeenCalledTimes(2)); // load + refresh
  });

  it('picks up an applied template on refocus, even without its own params changing', async () => {
    // Regression: applying a template navigates back to this exact route
    // (`router.replace` to the same "plan/[id]"), which Expo Router can
    // resolve onto the screen's already-mounted instance rather than
    // remounting it — so nothing re-ran `useApi`'s effect, and the screen
    // kept showing "no personalized program yet" even though the apply had
    // already succeeded on the server. Only the focus-driven refresh below
    // fixes it.
    await draw();
    expect(screen.getByTestId('start-from-scratch')).toBeTruthy();

    mockMemberWorkoutProgram.mockResolvedValue(aProgram());
    await comeBack();
    await waitFor(() => expect(screen.getByText('Day 1 — Upper Strength')).toBeTruthy());
  });
});

describe('a member with an existing program', () => {
  it('shows trainer-named days, never Push/Pull/Legs relabelled', async () => {
    await draw();
    expect(screen.getByText('Day 1 — Upper Strength')).toBeTruthy();
    expect(screen.getByText('Day 2 — Lower Strength')).toBeTruthy();
    expect(screen.getByText(/1 exercise/)).toBeTruthy();
  });

  it('adds a day through the real backend', async () => {
    mockAddProgramDay.mockResolvedValue({ id: 503, order_index: 2 });
    mockMemberWorkoutProgram
      .mockResolvedValueOnce(aProgram())
      .mockResolvedValueOnce(
        aProgram({
          days: [
            ...aProgram().days,
            {
              id: 503,
              order_index: 2,
              name: 'Day 3 — Conditioning',
              category: 'conditioning',
              image_key: 'conditioning',
              estimated_duration_minutes: 30,
              exercises: [],
            },
          ],
        }),
      );
    await draw();
    fireEvent.press(screen.getByTestId('add-workout-day'));
    fireEvent.changeText(screen.getByTestId('add-day-name'), 'Day 3 — Conditioning');
    fireEvent.press(screen.getByTestId('add-day-category-conditioning'));
    fireEvent.press(screen.getByTestId('add-day-save'));

    await waitFor(() => expect(mockAddProgramDay).toHaveBeenCalledTimes(1));
    expect(mockAddProgramDay.mock.calls[0][0]).toBe(42);
    expect(mockAddProgramDay.mock.calls[0][1]).toMatchObject({
      name: 'Day 3 — Conditioning',
      category: 'conditioning',
    });
    await waitFor(() => expect(screen.getByText('Day 3 — Conditioning')).toBeTruthy());
  });

  it('renames a day through the overflow menu', async () => {
    mockRenameProgramDay.mockResolvedValue({ ...aProgram().days[0], name: 'Day 1 — Push Focus' });
    await draw();
    fireEvent.press(screen.getByTestId('program-day-menu-501'));
    fireEvent.press(screen.getByTestId('menu-rename'));
    fireEvent.changeText(screen.getByTestId('rename-input'), 'Day 1 — Push Focus');
    fireEvent.press(screen.getByTestId('rename-save'));

    await waitFor(() => expect(mockRenameProgramDay).toHaveBeenCalledTimes(1));
    expect(mockRenameProgramDay.mock.calls[0]).toEqual([
      42,
      501,
      { name: 'Day 1 — Push Focus', category: 'upper' },
      'token',
    ]);
  });

  it('reorders days from the overflow menu', async () => {
    mockReorderProgramDays.mockResolvedValue([]);
    await draw();
    fireEvent.press(screen.getByTestId('program-day-menu-501'));
    fireEvent.press(screen.getByTestId('menu-move-down'));

    await waitFor(() => expect(mockReorderProgramDays).toHaveBeenCalledTimes(1));
    expect(mockReorderProgramDays.mock.calls[0][0]).toBe(42);
    expect(mockReorderProgramDays.mock.calls[0][1]).toEqual([502, 501]);
  });

  it('deletes a day through the overflow menu', async () => {
    mockDeleteProgramDay.mockResolvedValue(undefined);
    await draw();
    fireEvent.press(screen.getByTestId('program-day-menu-502'));
    fireEvent.press(screen.getByTestId('menu-delete'));

    await waitFor(() => expect(mockDeleteProgramDay).toHaveBeenCalledTimes(1));
    expect(mockDeleteProgramDay.mock.calls[0]).toEqual([42, 502, 'token']);
  });

  it('duplicates a day by copying its exercises through real calls, not a local clone', async () => {
    mockAddProgramDay.mockResolvedValue({ id: 601, order_index: 2 });
    await draw();
    fireEvent.press(screen.getByTestId('program-day-menu-501'));
    fireEvent.press(screen.getByTestId('menu-duplicate'));

    await waitFor(() => expect(mockAddProgramDay).toHaveBeenCalledTimes(1));
    expect(mockAddProgramDay.mock.calls[0][1]).toMatchObject({ name: 'Day 1 — Upper Strength (Copy)' });
    await waitFor(() => expect(mockAddProgramExercise).toHaveBeenCalledTimes(1));
    expect(mockAddProgramExercise.mock.calls[0][1]).toBe(601);
    expect(mockAddProgramExercise.mock.calls[0][2]).toMatchObject({ exercise: 'Barbell Bench Press' });
  });

  it('surfaces a server error rather than pretending the action worked', async () => {
    mockDeleteProgramDay.mockRejectedValue(new ApiError(403, 'forbidden', 'Not allowed'));
    await draw();
    fireEvent.press(screen.getByTestId('program-day-menu-502'));
    fireEvent.press(screen.getByTestId('menu-delete'));
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy());
  });
});
