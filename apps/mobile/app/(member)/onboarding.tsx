/**
 * First-time fitness onboarding — the questionnaire a member fills in once,
 * the first time they open GymFlow, when the front desk created their account
 * without an intake.
 *
 * It writes the SAME `MemberIntake` a trainer captures at registration
 * (`PUT /members/me/intake`, `MemberIntakeIn` reused as-is — no new fields,
 * no new table). Every question is optional; answering none still saves a
 * row, which is what marks onboarding done so this screen never shows again.
 * The answers survive logout/login because they live on the server, not the
 * device.
 *
 * Reached only via the redirect in `(member)/index.tsx` when
 * `GET /members/me/intake` returns `null`.
 */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';

import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  ExperienceLevel,
  MemberIntakeIn,
  PreferredTrainingStyle,
} from '../../src/api/types';
import {
  Banner,
  Body,
  Button,
  Chips,
  Input,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  Text,
  color,
} from '../../src/design';
import { useAuth } from '../../src/store/AuthContext';

const SKIP = '' as const;

// Free-text goal, offered as quick picks over the existing `fitness_goal`
// string column — a member can still type their own.
const GOALS = [
  'Build muscle',
  'Lose fat',
  'Improve strength',
  'Improve conditioning',
  'Improve mobility',
  'General health',
];

const EXPERIENCE: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

// Mapped onto the existing `PreferredTrainingStyle` enum — "Hypertrophy" and
// "Mixed" have no dedicated member-facing enum value, so they fold into the
// closest one rather than growing the schema for the demo.
const STYLE: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Conditioning / HIIT' },
  { value: 'mobility', label: 'Mobility / recovery' },
  { value: 'general_fitness', label: 'General fitness' },
  { value: 'group_classes', label: 'Group classes' },
];

const FREQUENCY: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: '2', label: '2 / wk' },
  { value: '3', label: '3 / wk' },
  { value: '4', label: '4 / wk' },
  { value: '5', label: '5+ / wk' },
];

const LIMITATIONS: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: 'none', label: 'None' },
  { value: 'some', label: 'Yes — discuss with trainer' },
];

const WANTS_PT: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

export default function MemberOnboardingScreen() {
  const router = useRouter();
  const { withToken } = useAuth();

  const [goal, setGoal] = useState('');
  const [experience, setExperience] = useState<string>(SKIP);
  const [style, setStyle] = useState<string>(SKIP);
  const [frequency, setFrequency] = useState<string>(SKIP);
  const [limitations, setLimitations] = useState<string>(SKIP);
  const [limitationsNote, setLimitationsNote] = useState('');
  const [wantsPt, setWantsPt] = useState<string>(SKIP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const payload: MemberIntakeIn = {
      fitness_goal: goal.trim() || null,
      experience_level: experience ? (experience as ExperienceLevel) : null,
      preferred_style: style ? (style as PreferredTrainingStyle) : null,
      training_frequency_per_week: frequency ? Number(frequency) : null,
      wants_pt: wantsPt ? wantsPt === 'yes' : null,
      limitations:
        limitations === 'some'
          ? limitationsNote.trim() || 'Has training limitations — discuss with trainer'
          : limitations === 'none'
            ? 'None'
            : null,
      preferred_time: null,
      contact_preference: null,
    };
    try {
      await withToken((token) => api.updateMyIntake(payload, token));
      router.replace('/(member)');
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'offline'
          ? "We couldn't reach GymFlow. Check your connection and try again."
          : 'Could not save your answers. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Your fitness journey" />
      <Body>
        <Text variant="body" tone={color.textSecondary}>
          A few quick questions so your trainer can plan your first sessions. Every one is
          optional — you can change any answer later with your trainer.
        </Text>

        <Section title="Primary fitness goal">
          <Chips
            options={[{ value: SKIP, label: 'Skip' }, ...GOALS.map((g) => ({ value: g, label: g }))]}
            value={goal}
            onChange={setGoal}
            testIDPrefix="onboarding-goal"
          />
          <Input
            label="Or describe it in your own words"
            testID="onboarding-goal-other"
            value={goal}
            onChangeText={setGoal}
            placeholder="e.g. Run a 10k without stopping"
            maxLength={160}
          />
        </Section>

        <Section title="Experience">
          <Chips
            options={EXPERIENCE}
            value={experience}
            onChange={setExperience}
            testIDPrefix="onboarding-experience"
          />
        </Section>

        <Section title="Preferred training style">
          <Chips options={STYLE} value={style} onChange={setStyle} testIDPrefix="onboarding-style" />
        </Section>

        <Section title="Training frequency">
          <Chips
            options={FREQUENCY}
            value={frequency}
            onChange={setFrequency}
            testIDPrefix="onboarding-frequency"
          />
        </Section>

        <Section title="Training limitations">
          <Chips
            options={LIMITATIONS}
            value={limitations}
            onChange={setLimitations}
            testIDPrefix="onboarding-limitations"
          />
          {limitations === 'some' ? (
            <Input
              label="Anything the trainer should know (optional)"
              testID="onboarding-limitations-note"
              value={limitationsNote}
              onChangeText={setLimitationsNote}
              placeholder="e.g. previous knee injury"
              maxLength={500}
            />
          ) : null}
        </Section>

        <Section title="Interested in personal training?">
          <Chips
            options={WANTS_PT}
            value={wantsPt}
            onChange={setWantsPt}
            testIDPrefix="onboarding-wants-pt"
          />
        </Section>

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline" testID="onboarding-error">
            {error}
          </Banner>
        ) : null}

        <Stack gap="sm">
          <Button
            title="Save and continue"
            size="lg"
            testID="onboarding-save"
            loading={busy}
            onPress={() => void save()}
          />
          <Button
            title="Skip for now"
            variant="ghost"
            testID="onboarding-skip"
            disabled={busy}
            onPress={() => void save()}
          />
        </Stack>
      </Body>
    </Screen>
  );
}
