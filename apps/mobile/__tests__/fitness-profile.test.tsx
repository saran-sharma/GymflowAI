/**
 * The read-only "Fitness profile" section — the member's onboarding answers
 * as a trainer or owner sees them on the client / member detail screen.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { MemberIntake } from '../src/api/types';
import { FitnessProfile } from '../src/components/fitness-profile';

function anIntake(partial: Partial<MemberIntake> = {}): MemberIntake {
  return {
    fitness_goal: 'Build muscle',
    experience_level: 'beginner',
    training_frequency_per_week: 3,
    preferred_style: 'strength',
    preferred_time: 'evening',
    wants_pt: true,
    limitations: 'None',
    contact_preference: null,
    ...partial,
  };
}

it('renders each answered field with a readable label', () => {
  render(<FitnessProfile intake={anIntake()} />);
  expect(screen.getByText('Fitness profile')).toBeTruthy();
  expect(screen.getByText('Build muscle')).toBeTruthy();
  expect(screen.getByText('Beginner')).toBeTruthy();
  expect(screen.getByText('3 / week')).toBeTruthy();
  expect(screen.getByText('Strength')).toBeTruthy();
  expect(screen.getByText('Evenings')).toBeTruthy();
  expect(screen.getByText('Yes')).toBeTruthy(); // wants PT
});

it('surfaces a real limitation as a note for the trainer, but hides "None"', () => {
  render(<FitnessProfile intake={anIntake({ limitations: 'previous knee injury' })} />);
  expect(screen.getByText('Note for the trainer')).toBeTruthy();
  expect(screen.getByText('previous knee injury')).toBeTruthy();

  render(<FitnessProfile intake={anIntake({ limitations: 'None' })} />);
  expect(screen.queryByText('Note for the trainer')).toBeNull();
});

it('says plainly when the member has not filled it in', () => {
  render(<FitnessProfile intake={null} />);
  expect(screen.getByText(/Not filled in yet/i)).toBeTruthy();
});

it('handles an intake row where every question was skipped', () => {
  render(
    <FitnessProfile
      intake={anIntake({
        fitness_goal: null,
        experience_level: null,
        training_frequency_per_week: null,
        preferred_style: null,
        preferred_time: null,
        wants_pt: null,
        limitations: null,
      })}
    />,
  );
  expect(screen.getByText(/skipped every question/i)).toBeTruthy();
});

it('shows "No" when the member declined PT', () => {
  render(<FitnessProfile intake={anIntake({ wants_pt: false })} />);
  expect(screen.getByText('No')).toBeTruthy();
});
