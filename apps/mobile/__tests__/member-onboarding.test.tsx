/**
 * First-time member onboarding — the three-step Fitness Journey flow.
 *
 * Steps: Your goal -> Your training -> Fitting it in. One
 * `PUT /members/me/intake` at the end with the existing `MemberIntakeIn`
 * shape, then Home. The gate in `(member)/index.tsx` only shows this while
 * `GET /members/me/intake` is `null`.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import MemberOnboardingScreen from '../app/(onboarding)/fitness-journey';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

const mockUpdate = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  updateMyIntake: (...a: unknown[]) => mockUpdate(...a),
}));

jest.mock('../src/store/AuthContext', () => ({
  useAuth: () => ({ withToken: (fn: (t: string) => Promise<unknown>) => fn('token') }),
}));

async function renderScreen() {
  const result = render(<MemberOnboardingScreen />);
  await act(async () => {});
  return result;
}

async function goNext() {
  fireEvent.press(screen.getByTestId('onboarding-next'));
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({});
});

it('opens on step 1 of 3 — "Your goal" — with the goal and PT questions', async () => {
  await renderScreen();
  expect(screen.getByText('Your Fitness Journey')).toBeTruthy();
  expect(screen.getByText('Step 1 of 3 · Your goal')).toBeTruthy();
  expect(screen.getByText("What's your main goal?")).toBeTruthy();
  expect(screen.getByText('Interested in personal training?')).toBeTruthy();
  // Step-2/3 questions are not on screen yet.
  expect(screen.queryByText('How many days a week?')).toBeNull();
  expect(screen.queryByText('When do you usually train?')).toBeNull();
});

it('walks all three steps and saves the answers mapped to MemberIntakeIn', async () => {
  await renderScreen();

  // Step 1
  fireEvent.press(screen.getByTestId('onboarding-goal-Build muscle'));
  fireEvent.press(screen.getByTestId('onboarding-wants-pt-yes'));
  await goNext();

  // Step 2
  expect(screen.getByText('Step 2 of 3 · Your training')).toBeTruthy();
  fireEvent.press(screen.getByTestId('onboarding-experience-beginner'));
  fireEvent.press(screen.getByTestId('onboarding-frequency-3'));
  fireEvent.press(screen.getByTestId('onboarding-style-cardio')); // "Conditioning / HIIT"
  await goNext();

  // Step 3
  expect(screen.getByText('Step 3 of 3 · Fitting it in')).toBeTruthy();
  fireEvent.press(screen.getByTestId('onboarding-time-evening'));
  fireEvent.press(screen.getByTestId('onboarding-limitations-none'));
  fireEvent.press(screen.getByTestId('onboarding-save'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  expect(mockUpdate).toHaveBeenCalledWith(
    {
      fitness_goal: 'Build muscle',
      experience_level: 'beginner',
      preferred_style: 'cardio',
      training_frequency_per_week: 3,
      preferred_time: 'evening',
      wants_pt: true,
      limitations: 'None',
      contact_preference: null,
    },
    'token',
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(member)'));
});

it('Back returns to the previous step without losing answers', async () => {
  await renderScreen();
  fireEvent.press(screen.getByTestId('onboarding-goal-Lose fat'));
  await goNext();
  fireEvent.press(screen.getByTestId('onboarding-experience-advanced'));

  fireEvent.press(screen.getByTestId('onboarding-back'));
  await act(async () => {});
  expect(screen.getByText('Step 1 of 3 · Your goal')).toBeTruthy();

  // Forward again, then finish — both earlier answers survive.
  await goNext();
  await goNext();
  fireEvent.press(screen.getByTestId('onboarding-save'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  const body = mockUpdate.mock.calls[0][0];
  expect(body.fitness_goal).toBe('Lose fat');
  expect(body.experience_level).toBe('advanced');
});

it('"Skip for now" from any step still saves a row (onboarding done) and goes Home', async () => {
  await renderScreen();
  fireEvent.press(screen.getByTestId('onboarding-skip'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  expect(mockUpdate).toHaveBeenCalledWith(
    {
      fitness_goal: null,
      experience_level: null,
      preferred_style: null,
      training_frequency_per_week: null,
      preferred_time: null,
      wants_pt: null,
      limitations: null,
      contact_preference: null,
    },
    'token',
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(member)'));
});

it('a free-text goal typed instead of a chip is what gets saved', async () => {
  await renderScreen();
  fireEvent.changeText(
    screen.getByTestId('onboarding-goal-other'),
    'Run a 10k without stopping',
  );
  fireEvent.press(screen.getByTestId('onboarding-skip'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  expect(mockUpdate.mock.calls[0][0].fitness_goal).toBe('Run a 10k without stopping');
});

it('reveals the trainer-note field only when a limitation is declared, and sends it', async () => {
  await renderScreen();
  await goNext();
  await goNext();
  expect(screen.queryByTestId('onboarding-limitations-note')).toBeNull();

  fireEvent.press(screen.getByTestId('onboarding-limitations-some'));
  fireEvent.changeText(
    screen.getByTestId('onboarding-limitations-note'),
    'previous knee injury',
  );
  fireEvent.press(screen.getByTestId('onboarding-save'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  expect(mockUpdate.mock.calls[0][0].limitations).toBe('previous knee injury');
});

it('does not present itself as a medical form', async () => {
  await renderScreen();
  await goNext();
  await goNext();
  expect(screen.getByText(/not a medical form/i)).toBeTruthy();
});

it('shows an error and stays on the last step if the save fails', async () => {
  mockUpdate.mockRejectedValue(new Error('boom'));
  await renderScreen();
  await goNext();
  await goNext();
  fireEvent.press(screen.getByTestId('onboarding-save'));

  await waitFor(() => expect(screen.getByTestId('onboarding-error')).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByText('Step 3 of 3 · Fitting it in')).toBeTruthy();
});
