/**
 * The intelligence section on Member Progress.
 *
 * Presentational only — it takes a `MemberIntelligence` payload and the
 * loading/error flags. These checks pin the states the mission requires each
 * new surface to handle (§21): loading, insufficient data, provider error, the
 * calm "nothing needs attention" case, and a normal read with evidence and a
 * next action.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ApiError } from '../src/api/client';
import type { MemberIntelligence } from '../src/api/types';
import { MemberIntelligenceSection } from '../src/components/intelligence';

function payload(partial: Partial<MemberIntelligence> = {}): MemberIntelligence {
  return {
    member_id: 2,
    generated_at: '2026-06-01T00:00:00Z',
    state: 'ok',
    headline: 'Going well — training is consistent.',
    insights: [],
    next_action: null,
    narration_source: 'deterministic',
    coverage: {
      completed_sessions: 12,
      weeks_of_history: 6,
      analysed_through: '2026-06-01T00:00:00Z',
    },
    ...partial,
  };
}

const noop = () => {};

it('shows a placeholder while the first read is in flight', () => {
  render(
    <MemberIntelligenceSection
      data={null}
      loading
      error={null}
      onRetry={noop}
      onNavigate={noop}
    />,
  );
  expect(screen.getByText('What stands out')).toBeTruthy();
});

it('renders the empty state for a member without enough history', () => {
  render(
    <MemberIntelligenceSection
      data={payload({
        state: 'insufficient_data',
        headline: 'Complete a few workouts and GymFlow will start showing your training trends here.',
      })}
      loading={false}
      error={null}
      onRetry={noop}
      onNavigate={noop}
    />,
  );
  expect(screen.getByText('Not enough history yet')).toBeTruthy();
  expect(screen.getByText(/Complete a few workouts/)).toBeTruthy();
});

it('degrades to one line when the intelligence read fails, without hiding the section', () => {
  render(
    <MemberIntelligenceSection
      data={null}
      loading={false}
      error={new ApiError(500, 'server_error', 'boom')}
      onRetry={noop}
      onNavigate={noop}
    />,
  );
  expect(screen.getByText('Progress insights are unavailable right now.')).toBeTruthy();
  expect(screen.getByText('Try again')).toBeTruthy();
});

it('shows the calm line when there is nothing to flag', () => {
  render(
    <MemberIntelligenceSection
      data={payload({ headline: 'You are on track.', insights: [] })}
      loading={false}
      error={null}
      onRetry={noop}
      onNavigate={noop}
    />,
  );
  expect(
    screen.getByText('You are on track — nothing needs attention this week.'),
  ).toBeTruthy();
});

it('renders an insight with its evidence and fires its action route', () => {
  const onNavigate = jest.fn();
  render(
    <MemberIntelligenceSection
      data={payload({
        headline: 'Worth a look: no training in 24 days.',
        insights: [
          {
            id: 'inactivity',
            type: 'inactivity',
            severity: 'critical',
            title: 'No training in 24 days',
            summary: 'Your last recorded session was 24 days ago.',
            evidence: [
              { label: 'Since last session', value: '24 days' },
              { label: 'Last trained', value: '2026-05-08' },
            ],
            action: { label: 'Start today’s workout', route: '/(member)/workout' },
          },
        ],
        next_action: { label: 'Start today’s workout', route: '/(member)/workout' },
      })}
      loading={false}
      error={null}
      onRetry={noop}
      onNavigate={onNavigate}
    />,
  );

  expect(screen.getByText('No training in 24 days')).toBeTruthy();
  expect(screen.getByText('Since last session')).toBeTruthy();
  expect(screen.getByText('24 days')).toBeTruthy();

  fireEvent.press(screen.getByText('Start today’s workout'));
  expect(onNavigate).toHaveBeenCalledWith('/(member)/workout');
});

it('shows at most the first three insights', () => {
  const mk = (n: number) =>
    ({
      id: `i${n}`,
      type: 'trend' as const,
      severity: 'info' as const,
      title: `Insight ${n}`,
      summary: 's',
      evidence: [],
      action: null,
    });
  render(
    <MemberIntelligenceSection
      data={payload({ insights: [mk(1), mk(2), mk(3), mk(4), mk(5)] })}
      loading={false}
      error={null}
      onRetry={noop}
      onNavigate={noop}
    />,
  );
  expect(screen.getByText('Insight 3')).toBeTruthy();
  expect(screen.queryByText('Insight 4')).toBeNull();
});
