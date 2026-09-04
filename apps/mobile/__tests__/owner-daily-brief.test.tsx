/**
 * The owner's "what needs my attention today?" section. Presentational — a
 * brief payload in, a compact list out — so these pin the states and the
 * deep-linking.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ApiError } from '../src/api/client';
import type { OwnerDailyBrief } from '../src/api/types';
import { OwnerDailyBriefSection } from '../src/components/intelligence';

const noop = () => {};

function brief(partial: Partial<OwnerDailyBrief> = {}): OwnerDailyBrief {
  return {
    generated_at: '2026-06-20T06:00:00Z',
    scope: 'All branches',
    headline: '2 things to look at — trainer punctuality is below target.',
    issues: [
      {
        id: 'trainer_punctuality',
        severity: 'attention',
        title: 'Trainer punctuality is below target',
        summary: '50 of 100 shifts started on time (50%), under the 85% target.',
        evidence: [
          { label: 'On time (MTD)', value: '50%' },
          { label: 'Last month', value: '92%' },
        ],
        direction: 'down',
        action: { label: 'Open trainers', route: '/(owner)/trainers' },
      },
      {
        id: 'renewals_due',
        severity: 'info',
        title: '3 memberships due to renew',
        summary: '3 active memberships end within 14 days. No amount is attached.',
        evidence: [{ label: 'Due in 14 days', value: '3' }],
        direction: null,
        action: { label: 'Open renewals', route: '/(owner)/renewals' },
      },
    ],
    narration_source: 'deterministic',
    ...partial,
  };
}

it('lists issues with evidence and deep-links each action', () => {
  const onNavigate = jest.fn();
  render(
    <OwnerDailyBriefSection
      data={brief()}
      loading={false}
      error={null}
      onRetry={noop}
      onNavigate={onNavigate}
    />,
  );
  expect(screen.getByText('All branches')).toBeTruthy();
  expect(screen.getByText('Trainer punctuality is below target')).toBeTruthy();
  expect(screen.getByText('50%')).toBeTruthy();
  fireEvent.press(screen.getByText('Open renewals'));
  expect(onNavigate).toHaveBeenCalledWith('/(owner)/renewals');
});

it('offers "Tell me more" per issue when onAsk is wired', () => {
  const onAsk = jest.fn();
  render(
    <OwnerDailyBriefSection
      data={brief()}
      loading={false}
      error={null}
      onRetry={noop}
      onNavigate={noop}
      onAsk={onAsk}
    />,
  );
  fireEvent.press(screen.getAllByText('Tell me more')[0]);
  expect(onAsk).toHaveBeenCalledWith(
    'Tell me more about: Trainer punctuality is below target',
  );
});

it('has no "Tell me more" affordance when onAsk is not provided', () => {
  render(
    <OwnerDailyBriefSection
      data={brief()}
      loading={false}
      error={null}
      onRetry={noop}
      onNavigate={noop}
    />,
  );
  expect(screen.queryByText('Tell me more')).toBeNull();
});

it('shows the calm headline when there is nothing to flag', () => {
  render(
    <OwnerDailyBriefSection
      data={brief({ issues: [], headline: 'Nothing needs your attention this morning.' })}
      loading={false}
      error={null}
      onRetry={noop}
      onNavigate={noop}
    />,
  );
  expect(screen.getByText('Nothing needs your attention this morning.')).toBeTruthy();
});

it('degrades to one line on error without hiding the section', () => {
  render(
    <OwnerDailyBriefSection
      data={null}
      loading={false}
      error={new ApiError(500, 'server_error', 'boom')}
      onRetry={noop}
      onNavigate={noop}
    />,
  );
  expect(screen.getByText('Your brief is unavailable right now.')).toBeTruthy();
});

it('caps the list and notes the overflow', () => {
  const issues = Array.from({ length: 6 }, (_, n) => ({
    id: `i${n}`,
    severity: 'info' as const,
    title: `Issue ${n}`,
    summary: 's',
    evidence: [],
    direction: null,
    action: null,
  }));
  render(
    <OwnerDailyBriefSection
      data={brief({ issues })}
      loading={false}
      error={null}
      onRetry={noop}
      onNavigate={noop}
      limit={4}
    />,
  );
  expect(screen.getByText('Issue 3')).toBeTruthy();
  expect(screen.queryByText('Issue 4')).toBeNull();
  expect(screen.getByText('2 more on the list')).toBeTruthy();
});
