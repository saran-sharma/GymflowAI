/**
 * First-time member onboarding — the Fitness Journey questionnaire.
 *
 * A short, three-step first run: **Your goal**, **Your training**, **Fitting
 * it in**. It writes the existing `MemberIntake` unchanged (one
 * `PUT /members/me/intake` at the end — `MemberIntakeIn` reused as-is, no new
 * fields or table) and then lands on Home. Every question is optional;
 * finishing with nothing answered still saves a row, which is what marks
 * onboarding done so this screen never shows again. Answers persist
 * server-side, so they survive a logout/login.
 *
 * Deliberately concise. A trainer's hands-on fitness/health assessment, a
 * 12-week outcome, session-duration and adherence-barrier questions are a
 * separate, later flow (see docs/NEXT_STEPS.md) — first run stays under a
 * minute. Reached only via the redirect in `(member)/index.tsx` when
 * `GET /members/me/intake` returns `null`.
 */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  ExperienceLevel,
  MemberIntakeIn,
  PreferredTime,
  PreferredTrainingStyle,
} from '../../src/api/types';
import {
  Banner,
  Body,
  Button,
  Chips,
  Input,
  ProgressBar,
  Row,
  Screen,
  Section,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useAuth } from '../../src/store/AuthContext';

const SKIP = '' as const;
const STEPS = ['Your goal', 'Your training', 'Fitting it in'] as const;

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

// Mapped onto the existing `PreferredTrainingStyle` enum.
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

const TIME: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'flexible', label: 'Flexible' },
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

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState('');
  const [experience, setExperience] = useState<string>(SKIP);
  const [style, setStyle] = useState<string>(SKIP);
  const [frequency, setFrequency] = useState<string>(SKIP);
  const [preferredTime, setPreferredTime] = useState<string>(SKIP);
  const [limitations, setLimitations] = useState<string>(SKIP);
  const [limitationsNote, setLimitationsNote] = useState('');
  const [wantsPt, setWantsPt] = useState<string>(SKIP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLast = step === STEPS.length - 1;

  async function save() {
    setBusy(true);
    setError(null);
    const payload: MemberIntakeIn = {
      fitness_goal: goal.trim() || null,
      experience_level: experience ? (experience as ExperienceLevel) : null,
      preferred_style: style ? (style as PreferredTrainingStyle) : null,
      training_frequency_per_week: frequency ? Number(frequency) : null,
      preferred_time: preferredTime ? (preferredTime as PreferredTime) : null,
      wants_pt: wantsPt ? wantsPt === 'yes' : null,
      limitations:
        limitations === 'some'
          ? limitationsNote.trim() || 'Has training limitations — discuss with trainer'
          : limitations === 'none'
            ? 'None'
            : null,
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
    <Screen edges={['top', 'bottom']} background="member" backgroundIntensity="subtle">
      <Body>
        <Stack gap="sm">
          <Text variant="title" style={styles.title}>
            Your Fitness Journey
          </Text>
          <Text variant="label" tone={color.textTertiary}>
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </Text>
          <ProgressBar value={((step + 1) / STEPS.length) * 100} />
        </Stack>

        {step === 0 ? (
          <>
            <Section title="What's your main goal?">
              <Chips
                options={[
                  { value: SKIP, label: 'Skip' },
                  ...GOALS.map((g) => ({ value: g, label: g })),
                ]}
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
            <Section title="Interested in personal training?">
              <Chips
                options={WANTS_PT}
                value={wantsPt}
                onChange={setWantsPt}
                testIDPrefix="onboarding-wants-pt"
              />
            </Section>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Section title="How much have you trained before?">
              <Chips
                options={EXPERIENCE}
                value={experience}
                onChange={setExperience}
                testIDPrefix="onboarding-experience"
              />
            </Section>
            <Section title="How many days a week?">
              <Chips
                options={FREQUENCY}
                value={frequency}
                onChange={setFrequency}
                testIDPrefix="onboarding-frequency"
              />
            </Section>
            <Section title="Preferred training style">
              <Chips
                options={STYLE}
                value={style}
                onChange={setStyle}
                testIDPrefix="onboarding-style"
              />
            </Section>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Section title="When do you usually train?">
              <Chips
                options={TIME}
                value={preferredTime}
                onChange={setPreferredTime}
                testIDPrefix="onboarding-time"
              />
            </Section>
            <Section title="Anything the trainer should know?">
              <Chips
                options={LIMITATIONS}
                value={limitations}
                onChange={setLimitations}
                testIDPrefix="onboarding-limitations"
              />
              {limitations === 'some' ? (
                <Input
                  label="A short note for your trainer (optional)"
                  testID="onboarding-limitations-note"
                  value={limitationsNote}
                  onChangeText={setLimitationsNote}
                  placeholder="e.g. previous knee injury"
                  maxLength={500}
                />
              ) : null}
              <Text variant="label" tone={color.textTertiary}>
                This is not a medical form. Your trainer will do a proper
                readiness check with you in person.
              </Text>
            </Section>
          </>
        ) : null}

        {error ? (
          <Banner tone="critical" icon="alert-circle-outline" testID="onboarding-error">
            {error}
          </Banner>
        ) : null}

        <Row gap="sm">
          {step > 0 ? (
            <Button
              title="Back"
              variant="secondary"
              testID="onboarding-back"
              disabled={busy}
              onPress={() => setStep((s) => Math.max(0, s - 1))}
            />
          ) : null}
          <Spacer />
          {isLast ? (
            <Button
              title="Save and finish"
              testID="onboarding-save"
              loading={busy}
              onPress={() => void save()}
            />
          ) : (
            <Button
              title="Next"
              testID="onboarding-next"
              disabled={busy}
              onPress={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            />
          )}
        </Row>

        <Button
          title="Skip for now"
          variant="ghost"
          testID="onboarding-skip"
          disabled={busy}
          onPress={() => void save()}
        />
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { paddingTop: space.sm },
});
