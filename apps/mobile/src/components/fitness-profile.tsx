/**
 * The member's onboarding answers, shown read-only to a trainer or an owner.
 *
 * This is the "Fitness profile" section on the client / member detail
 * screens — goal, experience, training days & style, availability, PT
 * interest, and anything the member flagged for the trainer. It renders the
 * existing `MemberIntake` and nothing else: a trainer's hands-on
 * fitness/health assessment is a separate, later record and never shown
 * here. Nothing on this component prescribes a workout — it informs the
 * trainer, who stays the authority on what programme the member gets.
 */

import React from 'react';

import type { MemberIntake } from '../api/types';
import { Row, Section, Spacer, Stack, Text, color } from '../design';

const EXPERIENCE: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const STYLE: Record<string, string> = {
  strength: 'Strength',
  cardio: 'Conditioning / HIIT',
  general_fitness: 'General fitness',
  group_classes: 'Group classes',
  mobility: 'Mobility / recovery',
};

const TIME: Record<string, string> = {
  morning: 'Mornings',
  afternoon: 'Afternoons',
  evening: 'Evenings',
  flexible: 'Flexible',
};

function label(map: Record<string, string>, key: string | null): string | null {
  return key ? (map[key] ?? key) : null;
}

function DetailRow({ name, value }: { name: string; value: string }) {
  return (
    <Row gap="md">
      <Text variant="label" tone={color.textTertiary}>
        {name}
      </Text>
      <Spacer />
      <Text variant="body">{value}</Text>
    </Row>
  );
}

export function FitnessProfile({ intake }: { intake: MemberIntake | null }) {
  if (!intake) {
    return (
      <Section title="Fitness profile">
        <Text variant="label" tone={color.textTertiary}>
          Not filled in yet — the member completes this when they first open the app.
        </Text>
      </Section>
    );
  }

  const rows: { name: string; value: string }[] = [];
  if (intake.fitness_goal) rows.push({ name: 'Goal', value: intake.fitness_goal });
  const exp = label(EXPERIENCE, intake.experience_level);
  if (exp) rows.push({ name: 'Experience', value: exp });
  if (intake.training_frequency_per_week != null) {
    rows.push({
      name: 'Training days',
      value: `${intake.training_frequency_per_week} / week`,
    });
  }
  const style = label(STYLE, intake.preferred_style);
  if (style) rows.push({ name: 'Preferred style', value: style });
  const time = label(TIME, intake.preferred_time);
  if (time) rows.push({ name: 'Trains', value: time });
  if (intake.wants_pt != null) {
    rows.push({ name: 'Wants PT', value: intake.wants_pt ? 'Yes' : 'No' });
  }

  return (
    <Section title="Fitness profile">
      {rows.length === 0 ? (
        <Text variant="label" tone={color.textTertiary}>
          The member skipped every question.
        </Text>
      ) : (
        <Stack gap="sm">
          {rows.map((row) => (
            <DetailRow key={row.name} name={row.name} value={row.value} />
          ))}
        </Stack>
      )}
      {intake.limitations && intake.limitations !== 'None' ? (
        <Stack gap="xxs">
          <Text variant="label" tone={color.textTertiary}>
            Note for the trainer
          </Text>
          <Text variant="body">{intake.limitations}</Text>
        </Stack>
      ) : null}
    </Section>
  );
}
