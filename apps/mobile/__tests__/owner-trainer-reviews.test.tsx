/**
 * Owner → Trainer Reviews moderation queue.
 *
 * What matters: pending ratings are listed, Approve/Reject/Remove call the
 * moderation endpoint with the right action, a private note can be attached,
 * a reported review is flagged, and the filter chips re-query.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import TrainerReviewsScreen from '../app/(owner)/trainer-reviews';

const mockQueue = jest.fn();
const mockModerate = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  moderationQueue: (...a: unknown[]) => mockQueue(...a),
  moderateReview: (...a: unknown[]) => mockModerate(...a),
}));

const withToken = (fn: (t: string) => Promise<unknown>) => fn('token');
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => ({ withToken }) }));

function aReview(partial: Record<string, unknown> = {}) {
  return {
    id: 1,
    trainer: { id: 7, name: 'Vikas Menon', designation: 'Coach', branch_id: 1 },
    author_label: 'Verified GymFlow Member',
    member_id: 3,
    branch_id: 1,
    rating: 5,
    comment: 'He corrected my form and kept me motivated.',
    status: 'pending',
    reported: false,
    reported_reason: null,
    created_at: '2026-08-30T10:00:00Z',
    published_at: null,
    moderations: [],
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQueue.mockResolvedValue([aReview()]);
  mockModerate.mockResolvedValue(aReview({ status: 'approved' }));
});

async function draw() {
  const result = render(<TrainerReviewsScreen />);
  await act(async () => {});
  return result;
}

it('lists a pending review with its rating and comment', async () => {
  await draw();
  expect(screen.getByText('Vikas Menon')).toBeTruthy();
  expect(screen.getByText(/He corrected my form/)).toBeTruthy();
  expect(screen.getByTestId('moderation-status-1')).toBeTruthy();
});

it('opens on the Pending filter and re-queries when another chip is picked', async () => {
  await draw();
  expect(mockQueue).toHaveBeenLastCalledWith('token', { status: 'pending' });
  fireEvent.press(screen.getByTestId('review-filter-reported'));
  await act(async () => {});
  expect(mockQueue).toHaveBeenLastCalledWith('token', { reported: true });
});

it('Approve calls the endpoint with the approve action', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('moderation-approve-1'));
  await waitFor(() => expect(mockModerate).toHaveBeenCalledWith(1, 'approve', 'token'));
});

it('Reject is available on a pending review', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('moderation-reject-1'));
  await waitFor(() => expect(mockModerate).toHaveBeenCalledWith(1, 'reject', 'token'));
});

it('an approved review offers Remove instead of Approve', async () => {
  mockQueue.mockResolvedValue([aReview({ status: 'approved', published_at: '2026-08-30T11:00:00Z' })]);
  await draw();
  expect(screen.queryByTestId('moderation-approve-1')).toBeNull();
  fireEvent.press(screen.getByTestId('moderation-remove-1'));
  await waitFor(() => expect(mockModerate).toHaveBeenCalledWith(1, 'remove', 'token'));
});

it('a private note can be written and saved', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('moderation-note-toggle-1'));
  fireEvent.changeText(screen.getByTestId('moderation-note-input-1'), 'Long-standing member, genuine.');
  fireEvent.press(screen.getByTestId('moderation-note-save-1'));
  await waitFor(() =>
    expect(mockModerate).toHaveBeenCalledWith(1, 'note', 'token', 'Long-standing member, genuine.'),
  );
});

it('flags a reported review', async () => {
  mockQueue.mockResolvedValue([aReview({ reported: true, reported_reason: 'wrong wording' })]);
  await draw();
  expect(screen.getByTestId('moderation-reported-1')).toBeTruthy();
  expect(screen.getByText(/wrong wording/, { exact: false })).toBeTruthy();
});

it('shows the moderation history inline', async () => {
  mockQueue.mockResolvedValue([
    aReview({
      status: 'approved',
      moderations: [
        {
          id: 1,
          action: 'approve',
          from_status: 'pending',
          to_status: 'approved',
          note: null,
          actor_role: 'owner',
          created_at: '2026-08-30T11:00:00Z',
        },
      ],
    }),
  ]);
  await draw();
  expect(screen.getByText(/owner · approve/)).toBeTruthy();
});
