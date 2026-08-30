/**
 * First-time member onboarding — the fitness-journey questionnaire.
 *
 * It writes `PUT /members/me/intake` with the existing `MemberIntakeIn`
 * shape, then lands on Home. Answers persist server-side, so they survive a
 * logout/login; the gate in `(member)/index.tsx` only shows this screen while
 * `GET /members/me/intake` is still `null`.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import MemberOnboardingScreen from '../app/(member)/onboarding';

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

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({});
});

it('shows the fitness-journey questions', async () => {
  await renderScreen();
  expect(screen.getByText('Your fitness journey')).toBeTruthy();
  expect(screen.getByText('Primary fitness goal')).toBeTruthy();
  expect(screen.getByText('Experience')).toBeTruthy();
  expect(screen.getByText('Preferred training style')).toBeTruthy();
  expect(screen.getByText('Training frequency')).toBeTruthy();
  expect(screen.getByText('Training limitations')).toBeTruthy();
  expect(screen.getByText('Interested in personal training?')).toBeTruthy();
});

it('saves the chosen answers, mapped to MemberIntakeIn, then goes Home', async () => {
  await renderScreen();

  fireEvent.press(screen.getByTestId('onboarding-goal-Build muscle'));
  fireEvent.press(screen.getByTestId('onboarding-experience-beginner'));
  fireEvent.press(screen.getByTestId('onboarding-style-cardio')); // "Conditioning / HIIT"
  fireEvent.press(screen.getByTestId('onboarding-frequency-3'));
  fireEvent.press(screen.getByTestId('onboarding-wants-pt-yes'));
  fireEvent.press(screen.getByTestId('onboarding-save'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  expect(mockUpdate).toHaveBeenCalledWith(
    {
      fitness_goal: 'Build muscle',
      experience_level: 'beginner',
      preferred_style: 'cardio',
      training_frequency_per_week: 3,
      wants_pt: true,
      limitations: null,
      preferred_time: null,
      contact_preference: null,
    },
    'token',
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(member)'));
});

it('"Skip for now" still saves a row (so onboarding is done) and goes Home', async () => {
  await renderScreen();
  fireEvent.press(screen.getByTestId('onboarding-skip'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  // All-null payload — a saved row is what marks onboarding complete.
  expect(mockUpdate).toHaveBeenCalledWith(
    {
      fitness_goal: null,
      experience_level: null,
      preferred_style: null,
      training_frequency_per_week: null,
      wants_pt: null,
      limitations: null,
      preferred_time: null,
      contact_preference: null,
    },
    'token',
  );
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(member)'));
});

it('captures a free-text goal typed instead of a chip', async () => {
  await renderScreen();
  fireEvent.changeText(
    screen.getByTestId('onboarding-goal-other'),
    'Run a 10k without stopping',
  );
  fireEvent.press(screen.getByTestId('onboarding-save'));

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  expect(mockUpdate.mock.calls[0][0].fitness_goal).toBe('Run a 10k without stopping');
});

it('reveals a note field only when a limitation is declared, and sends it', async () => {
  await renderScreen();
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

it('shows an error and stays put if the save fails', async () => {
  mockUpdate.mockRejectedValue(new Error('boom'));
  await renderScreen();
  fireEvent.press(screen.getByTestId('onboarding-save'));

  await waitFor(() => expect(screen.getByTestId('onboarding-error')).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalled();
});
