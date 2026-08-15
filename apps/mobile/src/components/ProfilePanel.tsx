/**
 * The profile screen, shared by all three role apps.
 *
 * Identity, the connection the app is talking to, notification state, and sign
 * out. Trainers also get PIN management here because it is the credential they
 * use on the floor.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { ApiError, resolveBaseUrl } from '../api/client';
import * as api from '../api/endpoints';
import {
  Avatar,
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Divider,
  Eyebrow,
  Input,
  NavRow,
  Row,
  Screen,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../design';
import { PUSH_ENABLED, registerForPush } from '../notifications';
import { useAuth } from '../store/AuthContext';
import { useNetwork } from '../store/NetworkContext';

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  owner: 'Owner',
  branch_manager: 'Branch Manager',
  trainer: 'Trainer',
  member: 'Member',
};

/** A screen this role can reach from here rather than from a tab of its own. */
export interface ProfileLink {
  label: string;
  detail?: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

export function ProfilePanel({
  showPin = false,
  links = [],
}: {
  showPin?: boolean;
  links?: ProfileLink[];
}) {
  const { user, signOut, withToken, refreshUser } = useAuth();
  const { isOnline, type } = useNetwork();
  const router = useRouter();

  const [pinOpen, setPinOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(
    null,
  );

  if (!user) return null;

  async function savePin() {
    setPinBusy(true);
    setMessage(null);
    try {
      await withToken((token) => api.setPin(password, pin, token));
      setPinOpen(false);
      setPassword('');
      setPin('');
      setMessage({ tone: 'positive', text: 'Check-in PIN updated.' });
      await refreshUser();
    } catch (caught) {
      setMessage({
        tone: 'critical',
        text: (caught as ApiError)?.message ?? 'Could not update the PIN.',
      });
    } finally {
      setPinBusy(false);
    }
  }

  async function enablePush() {
    setMessage(null);
    const result = await registerForPush();
    if (result.token) {
      try {
        await withToken((token) => api.registerPushToken(result.token as string, token));
        setMessage({ tone: 'positive', text: 'This device will receive GymFlow alerts.' });
        return;
      } catch (caught) {
        setMessage({
          tone: 'critical',
          text: (caught as ApiError)?.message ?? 'Could not register.',
        });
        return;
      }
    }
    setMessage({ tone: 'critical', text: result.reason ?? 'Push is not available.' });
  }

  return (
    <Screen>
      <Body>
        <Row gap="lg">
          <Avatar name={user.full_name} size={56} />
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="heading">{user.full_name}</Text>
            <Text variant="label" tone={color.textSecondary}>
              {user.email}
            </Text>
          </Stack>
        </Row>

        <Card>
          <Eyebrow>Access</Eyebrow>
          <Divider />
          <Detail label="Role" value={roleLabels[user.role] ?? user.role} />
          <Detail label="Branch" value={user.branch?.name ?? 'All SLAM branches'} />
          {showPin ? <Detail label="Check-in PIN" value={user.has_pin ? 'Set' : 'Not set'} /> : null}
        </Card>

        {links.length ? (
          <Card>
            <Eyebrow>More</Eyebrow>
            <Divider />
            {links.map((link) => (
              <NavRow
                key={link.route}
                label={link.label}
                detail={link.detail}
                icon={link.icon}
                onPress={() => router.push(link.route as never)}
              />
            ))}
          </Card>
        ) : null}

        {message ? (
          <Banner
            tone={message.tone}
            icon={message.tone === 'positive' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
          >
            {message.text}
          </Banner>
        ) : null}

        {showPin ? (
          <Button
            title={user.has_pin ? 'Change check-in PIN' : 'Set a check-in PIN'}
            variant="secondary"
            icon="keypad-outline"
            onPress={() => setPinOpen(true)}
          />
        ) : null}

        <Card>
          <Row gap="sm">
            <Eyebrow>Notifications</Eyebrow>
            <Spacer />
            <Badge
              label={PUSH_ENABLED ? 'Available' : 'Off in this build'}
              tone={PUSH_ENABLED ? 'positive' : 'neutral'}
            />
          </Row>
          <Text variant="body" tone={color.textSecondary}>
            {PUSH_ENABLED
              ? 'Turn on alerts for late check-ins, absences and shift reminders.'
              : 'Push delivery is not enabled in V1. Alerts are collected in GymFlow and will be delivered when the channel is switched on.'}
          </Text>
          {PUSH_ENABLED ? (
            <Button
              title="Enable alerts"
              variant="secondary"
              icon="notifications-outline"
              onPress={enablePush}
            />
          ) : null}
        </Card>

        <Card>
          <Eyebrow>Connection</Eyebrow>
          <Divider />
          <Row gap="lg" style={styles.detail}>
            <Text variant="label" tone={color.textSecondary}>
              Status
            </Text>
            <Spacer />
            <Row gap="xs">
              <Ionicons
                name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={16}
                color={isOnline ? color.status.positive : color.brandAccent}
              />
              <Text variant="mono" tone={isOnline ? color.status.positive : color.brandAccent}>
                {isOnline ? `Online · ${type}` : 'Offline'}
              </Text>
            </Row>
          </Row>
          <Detail label="Server" value={resolveBaseUrl()} />
          <Text variant="label" tone={color.textTertiary} style={styles.note}>
            All attendance times are recorded by the GymFlow server. Your phone&apos;s clock is
            never used.
          </Text>
        </Card>

        <Button title="Sign out" variant="destructive" icon="log-out-outline" onPress={signOut} />
      </Body>

      <Modal
        visible={pinOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPinOpen(false)}
      >
        <View style={styles.backdrop}>
          <Card style={styles.modalCard}>
            <Text variant="heading">Set check-in PIN</Text>
            <Text variant="body" tone={color.textSecondary}>
              Confirm your password, then choose a 4–8 digit PIN for floor check-in.
            </Text>
            <Input
              label="Current password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your GymFlow password"
              secure
              autoCapitalize="none"
              toggleTestID="toggle-profile-password"
            />
            <Input
              label="New PIN"
              value={pin}
              onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 8))}
              placeholder="4–8 digits"
              keyboardType="number-pad"
              secure
              toggleTestID="toggle-profile-pin"
            />
            <Button
              title="Save PIN"
              loading={pinBusy}
              disabled={password.length < 8 || pin.length < 4}
              onPress={savePin}
            />
            <Button title="Cancel" variant="ghost" onPress={() => setPinOpen(false)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Row gap="lg" style={styles.detail}>
      <Text variant="label" tone={color.textSecondary}>
        {label}
      </Text>
      <Spacer />
      <Text variant="mono" numberOfLines={1} style={styles.detailValue}>
        {value}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  detail: { paddingVertical: 3 },
  detailValue: { flexShrink: 1, textAlign: 'right' },
  note: { marginTop: space.sm, lineHeight: 16 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: space.xl,
  },
  modalCard: { gap: space.md },
});
