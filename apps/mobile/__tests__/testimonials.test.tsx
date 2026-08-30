/**
 * The read-only "Client testimonials" section on a trainer's own Desk and on
 * the owner's trainer-detail screen. Only approved testimonials come back from
 * the API, so this only checks the rendering: the summary, the quotes, and the
 * consented-or-anonymous author line.
 */

import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { TrainerTestimonialsSection } from '../src/components/testimonials';

const mockTestimonials = jest.fn();
const mockSummary = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  trainerTestimonials: (...a: unknown[]) => mockTestimonials(...a),
  myRatingSummary: (...a: unknown[]) => mockSummary(...a),
}));

const withToken = (fn: (t: string) => Promise<unknown>) => fn('token');
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => ({ withToken }) }));

const SUMMARY = {
  trainer_id: 7,
  average_rating: 4.7,
  review_count: 12,
  pending_count: 2,
  approved_testimonial_count: 9,
  recent_average: 4.9,
  trend: 0.3,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSummary.mockResolvedValue(SUMMARY);
});

async function draw(props: React.ComponentProps<typeof TrainerTestimonialsSection>) {
  const r = render(<TrainerTestimonialsSection {...props} />);
  await act(async () => {});
  return r;
}

it('shows the average, the review count and the approved testimonials', async () => {
  mockTestimonials.mockResolvedValue({
    trainer: { id: 7, name: 'Vikas Menon', designation: 'Coach', branch_id: 1 },
    summary: SUMMARY,
    testimonials: [
      {
        id: 1,
        rating: 5,
        comment: 'Great session. He corrected my form and kept me motivated.',
        author_label: 'Aditya R.',
        published_at: '2026-08-30T11:00:00Z',
      },
      {
        id: 2,
        rating: 4,
        comment: 'Consistent and encouraging.',
        author_label: 'Verified GymFlow Member',
        published_at: '2026-08-20T11:00:00Z',
      },
    ],
  });
  await draw({ trainerId: 7 });

  expect(screen.getAllByText('4.7').length).toBeGreaterThan(0);
  expect(screen.getByText('12 reviews')).toBeTruthy();
  expect(screen.getByText(/He corrected my form/)).toBeTruthy();
  expect(screen.getByText('— Aditya R.')).toBeTruthy();
  expect(screen.getByText('— Verified GymFlow Member')).toBeTruthy();
});

it('a trainer viewing their own resolves the id from the summary endpoint first', async () => {
  mockTestimonials.mockResolvedValue({
    trainer: { id: 7, name: 'Vikas Menon', designation: null, branch_id: 1 },
    summary: SUMMARY,
    testimonials: [],
  });
  await draw({ self: true });
  expect(mockSummary).toHaveBeenCalled();
  expect(mockTestimonials).toHaveBeenCalledWith(7, 'token');
});

it('empty state when there are no approved testimonials', async () => {
  mockTestimonials.mockResolvedValue({
    trainer: { id: 7, name: 'Vikas Menon', designation: null, branch_id: 1 },
    summary: { ...SUMMARY, review_count: 0, average_rating: null },
    testimonials: [],
  });
  await draw({ trainerId: 7 });
  expect(screen.getByText(/No testimonials yet/)).toBeTruthy();
});
