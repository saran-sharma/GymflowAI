/**
 * The weekly recap card. Presentational — one summary payload in, the headline
 * and the metrics that moved out. Silent on error; it is a recap, not core
 * content.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ApiError } from '../src/api/client';
import type { WeeklySummary } from '../src/api/types';
import { WeeklySummaryCard } from '../src/components/intelligence';

function summary(partial: Partial<WeeklySummary> = {}): WeeklySummary {
  return {
    audience: 'member',
    week_start: '2026-06-01',
    week_end: '2026-06-07',
    headline: 'Strong week — 3 sessions and 1 personal record.',
    movement: 'ahead',
    metrics: [
      { label: 'Training sessions', value: '3', previous: '1', direction: 'up' },
      { label: 'Total load', value: '4,200 kg', previous: '3,000 kg', direction: 'up' },
      { label: 'Gym visits', value: '3' },
      { label: 'Personal records', value: '1' },
    ],
    narration_source: 'deterministic',
    ...partial,
  };
}

it('shows the movement, headline and each metric with its previous value', () => {
  render(<WeeklySummaryCard data={summary()} loading={false} error={null} />);
  expect(screen.getByText('Ahead')).toBeTruthy();
  expect(screen.getByText('Strong week — 3 sessions and 1 personal record.')).toBeTruthy();
  expect(screen.getByText('Training sessions')).toBeTruthy();
  expect(screen.getByText('  (was 1)')).toBeTruthy();
});

it('renders a metric with no previous value cleanly', () => {
  render(
    <WeeklySummaryCard
      data={summary({ metrics: [{ label: 'Gym visits', value: '4' }] })}
      loading={false}
      error={null}
    />,
  );
  expect(screen.getByText('Gym visits')).toBeTruthy();
  expect(screen.getByText('4')).toBeTruthy();
});

it('is silent on error', () => {
  const { toJSON } = render(
    <WeeklySummaryCard
      data={null}
      loading={false}
      error={new ApiError(500, 'server_error', 'boom')}
    />,
  );
  expect(toJSON()).toBeNull();
});
