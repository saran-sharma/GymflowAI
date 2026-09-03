/**
 * The next-weight suggestion card on a lift's detail screen. Presentational —
 * a recommendation payload in, the CURRENT / LAST / NEXT / WHY layout out — and
 * it stays out of the way when it has nothing to say.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ApiError } from '../src/api/client';
import type { ProgressionRecommendation } from '../src/api/types';
import { RecommendationCard } from '../src/components/intelligence';

function rec(partial: Partial<ProgressionRecommendation> = {}): ProgressionRecommendation {
  return {
    exercise: 'Bench Press',
    action: 'increase',
    last_weight_kg: 60,
    last_reps: 10,
    last_rpe: 7,
    recommended_weight_kg: 62.5,
    target_reps: '8-10',
    delta_kg: 2.5,
    rationale: 'Last set was 10 reps against the 8-rep target, RPE 7. Try 62.5 kg next time.',
    ...partial,
  };
}

it('shows last performance, the next weight and the reason', () => {
  render(<RecommendationCard data={rec()} loading={false} error={null} />);
  expect(screen.getByText('Recommended next')).toBeTruthy();
  expect(screen.getByText('Add load')).toBeTruthy();
  expect(screen.getByText('60 kg × 10 · RPE 7')).toBeTruthy();
  expect(screen.getByText('62.5 kg')).toBeTruthy();
  expect(screen.getByText('+2.5 kg · 8-10 reps')).toBeTruthy();
  expect(screen.getByText(/Try 62.5 kg next time/)).toBeTruthy();
  expect(
    screen.getByText('A suggestion from your logged sets — not a change to your programme.'),
  ).toBeTruthy();
});

it('shows a back-off with a negative delta', () => {
  render(
    <RecommendationCard
      data={rec({
        action: 'reduce',
        last_weight_kg: 120,
        last_reps: 4,
        last_rpe: null,
        recommended_weight_kg: 108,
        delta_kg: -12,
        rationale: 'Last set was 4 reps against a 8-rep target. Drop to about 108 kg and rebuild.',
      })}
      loading={false}
      error={null}
    />,
  );
  expect(screen.getByText('Back off')).toBeTruthy();
  expect(screen.getByText('108 kg')).toBeTruthy();
  expect(screen.getByText('-12 kg · 8-10 reps')).toBeTruthy();
});

it('renders the insufficient-data line without a next weight', () => {
  render(
    <RecommendationCard
      data={rec({
        action: 'insufficient_data',
        recommended_weight_kg: null,
        delta_kg: null,
        rationale: 'Log one more session of this lift and GymFlow can suggest a next weight.',
      })}
      loading={false}
      error={null}
    />,
  );
  expect(screen.getByText(/Log one more session/)).toBeTruthy();
  expect(screen.queryByText('Last performance')).toBeNull();
});

it('stays silent on error — it is an enhancement, not core content', () => {
  const { toJSON } = render(
    <RecommendationCard
      data={null}
      loading={false}
      error={new ApiError(500, 'server_error', 'boom')}
    />,
  );
  expect(toJSON()).toBeNull();
});
