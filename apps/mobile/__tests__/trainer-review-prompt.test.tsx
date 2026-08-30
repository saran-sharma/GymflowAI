/**
 * The post-workout "How was your session with [Trainer]?" prompt.
 *
 * What matters: it only shows when the server says the session is eligible,
 * the comment is optional, Skip just closes, a rating is required to submit,
 * and after a successful submit the closing copy says the rating went to the
 * owner for review — never straight to a profile.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { TrainerReviewPrompt } from '../src/components/trainer-review-prompt';

const mockPrompt = jest.fn();
const mockSubmit = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  reviewPrompt: (...a: unknown[]) => mockPrompt(...a),
  submitTrainerReview: (...a: unknown[]) => mockSubmit(...a),
}));

// A *stable* withToken — an inline arrow would change identity every render
// and re-fire the prompt's effect forever.
const mockWithToken = (fn: (t: string) => Promise<unknown>) => fn('token');
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => ({ withToken: mockWithToken }) }));

const ELIGIBLE = {
  eligible: true,
  already_reviewed: false,
  trainer: { id: 7, name: 'Vikas Menon', designation: 'Coach', branch_id: 1 },
  policy_version: '2026-08-30',
  support_contact: 'support@slam.fitness',
};

const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockPrompt.mockResolvedValue(ELIGIBLE);
  mockSubmit.mockResolvedValue({ id: 1, status: 'pending' });
});

async function open(props: Partial<React.ComponentProps<typeof TrainerReviewPrompt>> = {}) {
  const result = render(
    <TrainerReviewPrompt visible onClose={onClose} workoutSessionId={99} {...props} />,
  );
  await act(async () => {});
  return result;
}

it('asks the server whether to show, and renders the trainer name when eligible', async () => {
  await open();
  expect(mockPrompt).toHaveBeenCalledWith({ workoutSessionId: 99, ptSessionId: undefined }, 'token');
  expect(screen.getByText(/How was your session with Vikas Menon/)).toBeTruthy();
});

it('closes itself without asking anything when the session is not eligible', async () => {
  mockPrompt.mockResolvedValue({ ...ELIGIBLE, eligible: false, trainer: null });
  await open();
  expect(onClose).toHaveBeenCalled();
  expect(screen.queryByTestId('review-submit')).toBeNull();
});

it('Skip just closes — nothing is submitted', async () => {
  await open();
  fireEvent.press(screen.getByTestId('review-skip'));
  expect(onClose).toHaveBeenCalled();
  expect(mockSubmit).not.toHaveBeenCalled();
});

it('needs a star before it will submit, and the comment is optional', async () => {
  await open();
  // Acknowledge the guidelines so the button is enabled, then submit with no star.
  fireEvent.press(screen.getByTestId('review-policy-ack'));
  fireEvent.press(screen.getByTestId('review-submit'));
  await act(async () => {});
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(screen.getByTestId('review-error')).toBeTruthy();

  // Four stars, still no comment -> submits.
  fireEvent.press(screen.getByTestId('review-star-4'));
  fireEvent.press(screen.getByTestId('review-submit'));
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
  expect(mockSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      workout_session_id: 99,
      rating: 4,
      comment: null,
      display_name_consent: false,
      policy_ack: true,
    }),
    'token',
  );
});

it('sends the comment when one is typed', async () => {
  await open();
  fireEvent.press(screen.getByTestId('review-policy-ack'));
  fireEvent.press(screen.getByTestId('review-star-5'));
  fireEvent.changeText(screen.getByTestId('review-comment'), 'Great cues, kept me going.');
  fireEvent.press(screen.getByTestId('review-submit'));
  await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
  expect(mockSubmit.mock.calls[0][0].comment).toBe('Great cues, kept me going.');
});

it('after submitting, says it went to the owner for review — not to a profile', async () => {
  await open();
  fireEvent.press(screen.getByTestId('review-policy-ack'));
  fireEvent.press(screen.getByTestId('review-star-5'));
  fireEvent.press(screen.getByTestId('review-submit'));
  await waitFor(() => expect(screen.getByTestId('review-thanks')).toBeTruthy());
  expect(screen.getByTestId('review-thanks').props.children.join?.('') ?? '').toMatch(
    /sent to the gym owner/i,
  );
});

it('shows an error and stays open if the submit fails', async () => {
  mockSubmit.mockRejectedValue(new Error('boom'));
  await open();
  fireEvent.press(screen.getByTestId('review-policy-ack'));
  fireEvent.press(screen.getByTestId('review-star-3'));
  fireEvent.press(screen.getByTestId('review-submit'));
  await waitFor(() => expect(screen.getByTestId('review-error')).toBeTruthy());
  expect(screen.queryByTestId('review-thanks')).toBeNull();
});
