/**
 * Broadcast Center.
 *
 * There is no push and no WhatsApp in GymFlow yet — the in-app alert inbox is
 * the whole notification channel the product depends on (see
 * `alert_service`). A broadcast is therefore not a new delivery mechanism: it
 * is one `Alert` row per recipient, written through the same service every
 * other alert in the app already uses, so it shows up in the same inbox a
 * member or trainer already checks. The preview below is drawn with the same
 * `AlertCard` their inbox renders — what you see here is what they get,
 * because it is the same component.
 *
 * No image attachment: nothing in GymFlow can store or serve a file today
 * (no upload endpoint, no object storage). Adding one is real backend work,
 * not a checkbox — see the report for what that would take.
 *
 * No scheduling: there is no job queue or cron in this codebase to hold a
 * "send later" reliably, so this only ever sends now.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ApiError } from '../../src/api/client';
import * as api from '../../src/api/endpoints';
import type {
  Branch,
  BroadcastAudience,
  BroadcastResult,
  BroadcastType,
  Dashboard,
  Trainer,
} from '../../src/api/types';
import {
  AlertCard,
  Banner,
  Body,
  Button,
  Chips,
  Eyebrow,
  Input,
  Screen,
  ScreenHeader,
  Section,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';
import { useApi } from '../../src/hooks/useApi';
import { useAuth } from '../../src/store/AuthContext';

const AUDIENCES: {
  value: BroadcastAudience;
  label: string;
  icon: 'people-outline' | 'body-outline' | 'barbell-outline' | 'person-outline';
}[] = [
  { value: 'everyone', label: 'Everyone', icon: 'people-outline' },
  { value: 'members', label: 'Members', icon: 'body-outline' },
  { value: 'trainers', label: 'Trainers', icon: 'barbell-outline' },
  { value: 'pt_members', label: 'PT members', icon: 'person-outline' },
];

const TYPES: { value: BroadcastType; label: string }[] = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'training', label: 'Training' },
  { value: 'membership', label: 'Membership' },
  { value: 'motivation', label: 'Motivation' },
  { value: 'campaign', label: 'Campaign' },
];

export default function OwnerBroadcastScreen() {
  const router = useRouter();
  const { user, withToken } = useAuth();
  // Reached with a specific member in mind (Renewals, Member Intelligence)
  // pre-selects that one recipient rather than opening on "everyone" — the
  // server has supported a single-member audience since Marketing shipped;
  // this is the deep-link entry point into it.
  const { memberId, memberName } = useLocalSearchParams<{ memberId?: string; memberName?: string }>();
  const targetMemberId = memberId ? Number(memberId) : null;

  const branches = useApi<Branch[]>((token) => api.listBranches(token), []);
  const dashboard = useApi<Dashboard>((token) => api.dashboard(token), []);
  const trainers = useApi<Trainer[]>((token) => api.listTrainers(token), []);

  const [audience, setAudience] = useState<BroadcastAudience>(
    targetMemberId ? 'member' : 'everyone',
  );
  const [branchId, setBranchId] = useState<number | null>(null);
  const [broadcastType, setBroadcastType] = useState<BroadcastType>('announcement');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  // An estimate from data already on screen elsewhere in the app — the exact
  // count the server actually reached comes back with the send, since that is
  // the only number worth trusting completely. `pt_members` has no count
  // anywhere already on screen, so this says nothing rather than guessing —
  // the send result still reports the real number once it lands.
  const estimatedRecipients = useMemo(() => {
    if (audience === 'member') return 1;
    if (audience === 'pt_members') return null;
    const branchMemberCount = branchId
      ? (dashboard.data?.branches.find((b) => b.branch_id === branchId)?.member_count ?? 0)
      : (dashboard.data?.total_members ?? 0);
    const trainerCount = (trainers.data ?? []).filter(
      (t) => !branchId || t.branch_id === branchId,
    ).length;
    if (audience === 'members') return branchMemberCount;
    if (audience === 'trainers') return trainerCount;
    return branchMemberCount + trainerCount;
  }, [audience, branchId, dashboard.data, trainers.data]);

  const canSend =
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    !sending &&
    (audience !== 'member' || targetMemberId !== null);

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const sent = await withToken((token) =>
        api.sendBroadcast(
          {
            audience,
            branch_id: audience === 'member' ? null : branchId,
            member_id: audience === 'member' ? targetMemberId : undefined,
            broadcast_type: broadcastType,
            title: title.trim(),
            message: message.trim(),
          },
          token,
        ),
      );
      setResult(sent);
      setTitle('');
      setMessage('');
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'That did not go through. Check your connection and try again.',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Broadcast" onBack={() => router.back()} />
      <Body>
        <Text variant="body" tone={color.textSecondary}>
          Send a message to your team or your members. It lands in the alert inbox they already
          check — there is no separate channel to miss.
        </Text>

        {result ? (
          <Banner tone="positive" icon="checkmark-circle-outline">
            {`Sent to ${result.recipients} ${result.recipients === 1 ? 'person' : 'people'}.`}
          </Banner>
        ) : null}
        {error ? (
          <Banner tone="critical" icon="alert-circle-outline">
            {error}
          </Banner>
        ) : null}

        <Section title="Audience">
          <Chips
            options={
              targetMemberId
                ? [
                    { value: 'member' as const, label: memberName ?? 'This member', icon: 'person-outline' as const },
                    ...AUDIENCES,
                  ]
                : AUDIENCES
            }
            value={audience}
            onChange={setAudience}
            testIDPrefix="broadcast-audience"
          />
        </Section>

        {audience === 'member' ? null : (
          <Section title="Branch">
            <Chips
              options={[
                { value: 'all', label: 'All branches' },
                ...((branches.data ?? []).map((b) => ({
                  value: String(b.id),
                  label: b.name.replace(/^SLAM\s+/i, ''),
                }))),
              ]}
              value={branchId === null ? 'all' : String(branchId)}
              onChange={(value) => setBranchId(value === 'all' ? null : Number(value))}
              testIDPrefix="broadcast-branch"
            />
          </Section>
        )}

        <Section title="Type">
          <Chips
            options={TYPES}
            value={broadcastType}
            onChange={setBroadcastType}
            testIDPrefix="broadcast-type"
          />
        </Section>

        <Section title="Message">
          <Stack gap="md">
            <Input
              label="Title"
              testID="broadcast-title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. New Zumba class"
              maxLength={160}
            />
            <Input
              label="Message"
              testID="broadcast-message"
              value={message}
              onChangeText={setMessage}
              placeholder="What do they need to know?"
              multiline
              maxLength={2000}
            />
          </Stack>
        </Section>

        <Section title="Preview">
          <Eyebrow>What recipients will see</Eyebrow>
          <AlertCard
            title={title.trim() || 'Your title appears here'}
            body={message.trim() || 'Your message appears here.'}
            tone={broadcastType === 'urgent' ? 'critical' : 'info'}
            meta={
              estimatedRecipients === null
                ? `From ${user?.full_name ?? 'you'}`
                : `From ${user?.full_name ?? 'you'} · ${estimatedRecipients} recipient${
                    estimatedRecipients === 1 ? '' : 's'
                  } (estimate)`
            }
          />
        </Section>

        <Button
          title="Send now"
          size="lg"
          testID="broadcast-send"
          loading={sending}
          disabled={!canSend}
          onPress={() => void send()}
        />
        <Text variant="label" tone={color.textTertiary} style={styles.footnote}>
          No scheduling yet — a broadcast sends immediately. No image attachment yet — GymFlow has
          nowhere to store one.
        </Text>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footnote: { textAlign: 'center', paddingTop: space.sm, paddingBottom: space.xl },
});
