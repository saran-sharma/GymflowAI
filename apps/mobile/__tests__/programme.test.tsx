/**
 * The programme components carry product rules, not just styling.
 *
 * The one that matters most: a metric with no comparison window must render a
 * dash. "Unchanged" and "we have no history" are different statements, and
 * showing 0% for the second would be a claim the data does not support.
 */

import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { SplitBadge, TrendStat, splitMeta, sessionMeta } from '../src/components/programme';
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
    // The design system's Badge uppercases with textTransform, so the node keeps its case.
    expect(screen.getByText('Push')).toBeTruthy();
  });
});
