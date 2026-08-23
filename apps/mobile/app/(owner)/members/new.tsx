/**
 * Add member.
 *
 * GymFlow had no runtime way to register a member before this — every member
 * in the app existed only because the demo seeder made one. This is that
 * missing front door: an account, a membership (plan decides duration and
 * any included PT sessions, never the caller — see `PLAN_CATALOG` on the
 * backend), and a short intake questionnaire, in one save.
 *
 * The intake section asks what a trainer actually needs to plan a first
 * session — goal, experience, frequency, style, availability, PT interest,
 * a place for "anything we should know" — and nothing a gym has no business
 * asking. There is no medical history field: GymFlow has no model for
 * injuries or conditions, and `limitations` is a free-text note the member
 * volunteers, not a form staff fill in on their behalf.
 */

import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';

import { ApiError } from '../../../src/api/client';
import * as api from '../../../src/api/endpoints';
import type {
  Branch,
  ContactPreference,
  ExperienceLevel,
  MemberCreateResult,
  PreferredTime,
  PreferredTrainingStyle,
} from '../../../src/api/types';
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
} from '../../../src/design';
import { useApi } from '../../../src/hooks/useApi';
import { useAuth } from '../../../src/store/AuthContext';

const PLANS: { value: string; label: string; hint: string }[] = [
  { value: 'Monthly', label: 'Monthly', hint: '30 days · no PT' },
  { value: 'Quarterly', label: 'Quarterly', hint: '90 days · no PT' },
  { value: 'Annual', label: 'Annual', hint: '365 days · no PT' },
  { value: 'Elite Annual + PT', label: 'Elite Annual + PT', hint: '365 days · 12 PT sessions' },
];

const SKIP = '' as const;

const EXPERIENCE: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const FREQUENCY: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  ...([1, 2, 3, 4, 5, 6, 7] as const).map((n) => ({ value: String(n), label: `${n}/wk` })),
];

const STYLE: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'general_fitness', label: 'General fitness' },
  { value: 'group_classes', label: 'Group classes' },
  { value: 'mobility', label: 'Mobility' },
];

const TIME: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'flexible', label: 'Flexible' },
];

const WANTS_PT: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const CONTACT: { value: string; label: string }[] = [
  { value: SKIP, label: 'Skip' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'none', label: 'None' },
];

export default function AddMemberScreen() {
  const router = useRouter();
  const { user, withToken } = useAuth();
  const branches = useApi<Branch[]>((token) => api.listBranches(token), []);

  const [branchId, setBranchId] = useState<number | null>(user?.branch_id ?? null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState<string>('Monthly');

  const [fitnessGoal, setFitnessGoal] = useState('');
  const [experience, setExperience] = useState<string>(SKIP);
  const [frequency, setFrequency] = useState<string>(SKIP);
  const [style, setStyle] = useState<string>(SKIP);
  const [time, setTime] = useState<string>(SKIP);
  const [wantsPt, setWantsPt] = useState<string>(SKIP);
  const [limitations, setLimitations] = useState('');
  const [contact, setContact] = useState<string>(SKIP);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MemberCreateResult | null>(null);

  // A single-branch owner or a branch manager never sees the picker — there
  // is nothing to pick, and the field would only ever show one disabled
  // option.
  const effectiveBranchId = branchId ?? branches.data?.[0]?.id ?? null;

  const canSave =
    fullName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(email.trim()) &&
    password.length >= 10 &&
    effectiveBranchId !== null &&
    !saving;

  const selectedPlan = useMemo(() => PLANS.find((p) => p.value === plan), [plan]);

  async function save() {
    if (!canSave || effectiveBranchId === null) return;
    setSaving(true);
    setError(null);
    try {
      const result = await withToken((token) =>
        api.registerMember(
          {
            full_name: fullName.trim(),
            email: email.trim(),
            phone: phone.trim() || null,
            password,
            branch_id: effectiveBranchId,
            plan_name: plan,
            intake: {
              fitness_goal: fitnessGoal.trim() || null,
              experience_level: experience ? (experience as ExperienceLevel) : null,
              training_frequency_per_week: frequency ? Number(frequency) : null,
              preferred_style: style ? (style as PreferredTrainingStyle) : null,
              preferred_time: time ? (time as PreferredTime) : null,
              wants_pt: wantsPt ? wantsPt === 'yes' : null,
              limitations: limitations.trim() || null,
              contact_preference: contact ? (contact as ContactPreference) : null,
            },
          },
          token,
        ),
      );
      setCreated(result);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'That did not save. Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <Screen>
        <ScreenHeader title="Add member" onBack={() => router.back()} />
        <Body>
          <Banner tone="positive" icon="checkmark-circle-outline">
            {`${created.full_name} is registered — ${created.member_code}.`}
          </Banner>
          <Text variant="body" tone={color.textSecondary}>
            Share their sign-in email and the password you set. They can change it once they are
            in.
          </Text>
          <Button
            title="View member"
            onPress={() =>
              router.replace({
                pathname: '/(owner)/member/[id]',
                params: { id: String(created.member_id) },
              } as never)
            }
          />
          <Button
            title="Add another"
            variant="secondary"
            onPress={() => {
              setCreated(null);
              setFullName('');
              setEmail('');
              setPhone('');
              setPassword('');
              setFitnessGoal('');
              setExperience(SKIP);
              setFrequency(SKIP);
              setStyle(SKIP);
              setTime(SKIP);
              setWantsPt(SKIP);
              setLimitations('');
              setContact(SKIP);
            }}
          />
        </Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Add member" onBack={() => router.back()} />
      <Body>
        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}

        <Section title="Details">
          <Stack gap="md">
            <Input
              label="Full name"
              testID="new-member-name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Priya Shah"
            />
            <Input
              label="Email"
              testID="new-member-email"
              value={email}
              onChangeText={setEmail}
              placeholder="member@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Input
              label="Phone (optional)"
              testID="new-member-phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 90000 00000"
              keyboardType="phone-pad"
            />
            <Input
              label="Set an initial password"
              testID="new-member-password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 10 characters"
              secure
              hint="The member signs in with this until they change it."
            />
          </Stack>
        </Section>

        {(branches.data?.length ?? 0) > 1 ? (
          <Section title="Branch">
            <Chips
              options={(branches.data ?? []).map((b) => ({
                value: String(b.id),
                label: b.name.replace(/^SLAM\s+/i, ''),
              }))}
              value={String(effectiveBranchId ?? '')}
              onChange={(value) => setBranchId(Number(value))}
              testIDPrefix="new-member-branch"
            />
          </Section>
        ) : null}

        <Section title="Membership">
          <Chips options={PLANS} value={plan} onChange={setPlan} testIDPrefix="new-member-plan" />
          {selectedPlan ? (
            <Text variant="label" tone={color.textTertiary}>
              {selectedPlan.hint}
            </Text>
          ) : null}
        </Section>

        <Section title="About them">
          <Stack gap="md">
            <Text variant="label" tone={color.textTertiary}>
              Everything below is optional — skip what they would rather not answer.
            </Text>
            <Input
              label="Fitness goal"
              testID="new-member-goal"
              value={fitnessGoal}
              onChangeText={setFitnessGoal}
              placeholder="e.g. Lose fat, build strength"
              maxLength={160}
            />

            <Text variant="caption" caps tone={color.textTertiary}>
              Experience
            </Text>
            <Chips options={EXPERIENCE} value={experience} onChange={setExperience} testIDPrefix="new-member-experience" />

            <Text variant="caption" caps tone={color.textTertiary}>
              Training frequency
            </Text>
            <Chips options={FREQUENCY} value={frequency} onChange={setFrequency} testIDPrefix="new-member-frequency" />

            <Text variant="caption" caps tone={color.textTertiary}>
              Preferred style
            </Text>
            <Chips options={STYLE} value={style} onChange={setStyle} testIDPrefix="new-member-style" />

            <Text variant="caption" caps tone={color.textTertiary}>
              Usually trains
            </Text>
            <Chips options={TIME} value={time} onChange={setTime} testIDPrefix="new-member-time" />

            <Text variant="caption" caps tone={color.textTertiary}>
              Interested in personal training?
            </Text>
            <Chips options={WANTS_PT} value={wantsPt} onChange={setWantsPt} testIDPrefix="new-member-wants-pt" />

            <Input
              label="Anything we should know (optional)"
              testID="new-member-limitations"
              value={limitations}
              onChangeText={setLimitations}
              placeholder="e.g. previous knee injury"
              maxLength={500}
            />

            <Text variant="caption" caps tone={color.textTertiary}>
              Preferred contact
            </Text>
            <Chips options={CONTACT} value={contact} onChange={setContact} testIDPrefix="new-member-contact" />
          </Stack>
        </Section>

        <Button
          title="Register member"
          size="lg"
          testID="new-member-save"
          loading={saving}
          disabled={!canSave}
          onPress={() => void save()}
        />
      </Body>
    </Screen>
  );
}
