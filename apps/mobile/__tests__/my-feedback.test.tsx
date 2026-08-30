/**
 * "My feedback" — the member's own submitted ratings and their status.
 *
 * What matters: the status is shown, the "show my name" consent can be
 * toggled at any time, and a review can only be withdrawn while it is still
 * pending.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import MyFeedbackScreen from '../app/(member)/reviews';

const mockList = jest.fn();
const mockConsent = jest.fn();
const mockRetract = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  myTrainerReviews: (...a: unknown[]) => mockList(...a),
  setReviewConsent: (...a: unknown[]) => mockConsent(...a),
  retractReview: (...a: unknown[]) => mockRetract(...a),
}));

const withToken = (fn: (t: string) => Promise<unknown>) => fn('token');
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => ({ withToken }) }));

function aReview(partial: Record<string, unknown> = {}) {
  return {
    id: 1,
    trainer: { id: 7, name: 'Vikas Menon', designation: 'Coach', branch_id: 1 },
    rating: 5,
    comment: 'Great session.',
    status: 'pending',
    display_name_consent: false,
    can_retract: true,
    reported: false,
    created_at: '2026-08-30T10:00:00Z',
    published_at: null,
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([aReview()]);
  mockConsent.mockResolvedValue(aReview({ display_name_consent: true }));
  mockRetract.mockResolvedValue({ message: 'ok' });
});

async function draw() {
  const r = render(<MyFeedbackScreen />);
  await act(async () => {});
  return r;
}

it('shows the trainer, the rating and the status', async () => {
  await draw();
  expect(screen.getByText('Vikas Menon')).toBeTruthy();
  expect(screen.getByTestId('my-review-status-1')).toBeTruthy();
  expect(screen.getByText(/Awaiting owner review/)).toBeTruthy();
});

it('toggling the name consent calls the endpoint', async () => {
  await draw();
  fireEvent(screen.getByTestId('my-review-consent-1'), 'valueChange', true);
  await waitFor(() => expect(mockConsent).toHaveBeenCalledWith(1, true, 'token'));
});

it('a pending review can be withdrawn', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('my-review-withdraw-1'));
  await waitFor(() => expect(mockRetract).toHaveBeenCalledWith(1, 'token'));
});

it('an approved review shows Published and offers no withdraw', async () => {
  mockList.mockResolvedValue([
    aReview({ status: 'approved', can_retract: false, published_at: '2026-08-30T12:00:00Z' }),
  ]);
  await draw();
  expect(screen.getByText(/Published/)).toBeTruthy();
  expect(screen.queryByTestId('my-review-withdraw-1')).toBeNull();
});

it('empty state when the member has left no feedback', async () => {
  mockList.mockResolvedValue([]);
  await draw();
  expect(screen.getByText(/No feedback yet/)).toBeTruthy();
});
