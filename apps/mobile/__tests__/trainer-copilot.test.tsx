/**
 * The trainer copilot surfaces: the per-member brief and the desk triage list.
 * Both are presentational — payload in, sections out — so these checks pin the
 * states and the deep-linking, not any fetching.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ApiError } from '../src/api/client';
import type { TrainerAttentionQueue, TrainerBrief } from '../src/api/types';
import {
  NeedsAttentionSection,
  TrainerBriefSection,
} from '../src/components/intelligence';

const noop = () => {};

function brief(partial: Partial<TrainerBrief> = {}): TrainerBrief {
  return {
    member_id: 42,
    member_name: 'Aditya Rao',
    generated_at: '2026-06-01T00:00:00Z',
    state: 'ok',
    today: [
      { label: 'Journey', value: 'Day 20 of 45' },
      { label: 'Last session', value: '3 d ago' },
    ],
    progress: [
      {
        id: 'consistency',
        type: 'consistency',
        severity: 'positive',
        title: 'Training is consistent',
        summary: '12 sessions in 4 weeks.',
        evidence: [{ label: 'Weekly average', value: '3' }],
        action: null,
      },
    ],
    watch: [
      {
        id: 'membership',
        type: 'membership',
        severity: 'attention',
        title: 'Membership ends soon',
        summary: 'Ends in 7 days.',
        evidence: [{ label: 'Days left', value: '7 days' }],
        action: null,
      },
    ],
    suggested_focus: ['Bench press has been flat for 28 days — a small load increase next block.'],
    coverage: {
      completed_sessions: 12,
      weeks_of_history: 6,
      analysed_through: '2026-06-01T00:00:00Z',
    },
    ...partial,
  };
}

describe('the trainer brief', () => {
  it('shows today, watch, progress and suggested focus', () => {
    render(
      <TrainerBriefSection
        data={brief()}
        loading={false}
        error={null}
        onRetry={noop}
        onNavigate={noop}
      />,
    );
    expect(screen.getByText('Day 20 of 45')).toBeTruthy();
    expect(screen.getByText('Watch')).toBeTruthy();
    expect(screen.getByText('Membership ends soon')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();
    expect(screen.getByText('Training is consistent')).toBeTruthy();
    expect(screen.getByText(/Bench press has been flat/)).toBeTruthy();
  });

  it('still shows today and a focus line when history is thin', () => {
    render(
      <TrainerBriefSection
        data={brief({
          state: 'insufficient_data',
          progress: [],
          watch: [],
          suggested_focus: ['Not enough history yet — log a few sessions to build a picture.'],
        })}
        loading={false}
        error={null}
        onRetry={noop}
        onNavigate={noop}
      />,
    );
    expect(screen.getByText('Day 20 of 45')).toBeTruthy();
    expect(screen.getByText(/Not enough history yet/)).toBeTruthy();
    expect(screen.queryByText('Watch')).toBeNull();
  });

  it('degrades to one line on error without hiding the section', () => {
    render(
      <TrainerBriefSection
        data={null}
        loading={false}
        error={new ApiError(500, 'server_error', 'boom')}
        onRetry={noop}
        onNavigate={noop}
      />,
    );
    expect(screen.getByText('The brief is unavailable right now.')).toBeTruthy();
  });
});

function queue(items: TrainerAttentionQueue['items'], considered = items.length): TrainerAttentionQueue {
  return { generated_at: '2026-06-01T00:00:00Z', considered, items };
}

describe('needs attention', () => {
  it('lists each member with a visible reason and deep-links on tap', () => {
    const onNavigate = jest.fn();
    render(
      <NeedsAttentionSection
        data={queue([
          {
            member_id: 7,
            member_name: 'Priya S',
            priority: 0,
            severity: 'critical',
            reason: 'No training in 24 days',
            detail: null,
            route: '/(trainer)/client/7',
            metrics: [{ label: 'Since last session', value: '24 d' }],
          },
        ])}
        loading={false}
        error={null}
        onRetry={noop}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByText('Priya S')).toBeTruthy();
    expect(screen.getByText('No training in 24 days')).toBeTruthy();
    fireEvent.press(screen.getByText('Priya S'));
    expect(onNavigate).toHaveBeenCalledWith('/(trainer)/client/7');
  });

  it('shows a calm line when every client is on track', () => {
    render(
      <NeedsAttentionSection
        data={queue([], 4)}
        loading={false}
        error={null}
        onRetry={noop}
        onNavigate={noop}
      />,
    );
    expect(screen.getByText('Everyone you coach is on track.')).toBeTruthy();
  });

  it('caps the list and notes the overflow', () => {
    const items = Array.from({ length: 8 }, (_, n) => ({
      member_id: n + 1,
      member_name: `Member ${n + 1}`,
      priority: n,
      severity: 'attention' as const,
      reason: 'Slipping',
      detail: null,
      route: `/(trainer)/client/${n + 1}`,
      metrics: [],
    }));
    render(
      <NeedsAttentionSection
        data={queue(items)}
        loading={false}
        error={null}
        onRetry={noop}
        onNavigate={noop}
        limit={5}
      />,
    );
    expect(screen.getByText('Member 5')).toBeTruthy();
    expect(screen.queryByText('Member 6')).toBeNull();
    expect(screen.getByText('3 more need a look')).toBeTruthy();
  });
});
