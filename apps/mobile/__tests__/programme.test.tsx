/**
 * The programme components carry product rules, not just styling.
 *
 * The one that matters most: a metric with no comparison window must render a
 * dash. "Unchanged" and "we have no history" are different statements, and
 * showing 0% for the second would be a claim the data does not support.
 */

import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { DayCounter, SplitBadge, TrendStat, splitMeta, sessionMeta } from '../src/components/programme';
import type { TrendPoint } from '../src/api/types';

function trend(partial: Partial<TrendPoint>): TrendPoint {
  return { value: 0, previous: null, delta: null, has_comparison: false, ...partial };
}

/**
 * `@expo/vector-icons` loads its font asynchronously and calls setState when it
 * lands. Letting that settle inside act() keeps the output free of warnings
 * that have nothing to do with what is being asserted.
 */
async function draw(element: React.ReactElement) {
  const result = render(element);
  await act(async () => {});
  return result;
}

describe('TrendStat', () => {
  it('renders a dash when there is no comparison window', async () => {
    await draw(<TrendStat label="Punctuality" point={trend({ value: 91.7 })} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('no change')).toBeNull();
  });

  it('distinguishes "no history" from a genuinely flat period', async () => {
    await draw(
      <TrendStat
        label="Punctuality"
        point={trend({ value: 90, previous: 90, delta: 0, has_comparison: true })}
      />,
    );
    expect(screen.getByText('no change')).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('shows the size of a change without its sign duplicated', async () => {
    await draw(
      <TrendStat
        label="Punctuality"
        point={trend({ value: 91.7, previous: 83.3, delta: 8.4, has_comparison: true })}
      />,
    );
    expect(screen.getByText('91.7%')).toBeTruthy();
    expect(screen.getByText('8.4%')).toBeTruthy();
  });

  it('keeps whole numbers whole', async () => {
    await draw(<TrendStat label="Late marks" point={trend({ value: 3 })} suffix="" />);
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('DayCounter', () => {
  it('reads as "day X of Y" with the phase named', async () => {
    await draw(<DayCounter currentDay={12} totalDays={45} phase="training" split="legs" />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('/ 45')).toBeTruthy();
    expect(screen.getByText('Training')).toBeTruthy();
    expect(screen.getByText('LEGS')).toBeTruthy();
  });

  it('names the assessment phase for the first three days', async () => {
    await draw(<DayCounter currentDay={2} totalDays={45} phase="assessment" split="cardio" />);
    expect(screen.getByText('Assessment & cardio')).toBeTruthy();
  });

  it('does not claim a day has started before the journey does', async () => {
    await draw(<DayCounter currentDay={0} totalDays={45} phase="not_started" />);
    expect(screen.getByText('Not started yet')).toBeTruthy();
  });
});

describe('split and session vocabulary', () => {
  it('covers every split the API can return', () => {
    for (const split of ['push', 'pull', 'legs', 'cardio', 'assessment', 'rest'] as const) {
      expect(splitMeta[split]).toBeDefined();
      expect(splitMeta[split].label.length).toBeGreaterThan(0);
    }
  });

  it('gives each split its own colour so one never means two things', () => {
    const colours = (['push', 'pull', 'legs', 'cardio'] as const).map((s) => splitMeta[s].color);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('covers every session status the API can return', () => {
    for (const status of [
      'scheduled',
      'in_progress',
      'completed',
      'cancelled',
      'missed',
      'no_show',
    ] as const) {
      expect(sessionMeta[status]).toBeDefined();
    }
  });

  it('labels a no-show as a no-show rather than folding it into "missed"', () => {
    expect(sessionMeta.no_show.label).toBe('No-show');
    expect(sessionMeta.missed.label).toBe('Missed');
    expect(sessionMeta.no_show.color).not.toBe(sessionMeta.missed.color);
  });

  it('renders a split badge with the split name', async () => {
    await draw(<SplitBadge split="push" />);
    expect(screen.getByText('PUSH')).toBeTruthy();
  });
});
