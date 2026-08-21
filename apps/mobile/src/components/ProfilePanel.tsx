/**
 * The Account screen — the fifth tab for all three roles.
 *
 * This used to be "More": a link list with the role and branch shown as two
 * rows of a table. It is now the personal area, which is a different job. The
 * ordering is the one a person actually uses: who am I, what do I have, what
 * have I done, what can I change, and only then how do I leave.
 *
 * Sections rather than one list, because a flat list of fourteen rows is a
 * scroll, not a menu. Each role passes the rows that belong to its "Activity"
 * section; everything else — identity, security, preferences, support, sign-out
 * — is the same for everyone and lives here rather than in three call sites.
 *
 * Nothing here is invented. Where a capability has no backend model, the row
 * states that plainly instead of opening something that cannot work.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { ApiError } from '../api/client';
import * as api from '../api/endpoints';
import type { Branch } from '../api/types';
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
  Section,
  Sheet,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../design';
import { useApi } from '../hooks/useApi';
import { PUSH_ENABLED, registerForPush } from '../notifications';
import { useAuth } from '../store/AuthContext';
import { useNetwork } from '../store/NetworkContext';
import { NotConnected } from './member';

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

  // Whatever the server says this person may see. One request, and the only
  // honest answer to "how many gyms is this".
  const branches = useApi<Branch[]>((token) => api.listBranches(token), []);

  const [pinOpen, setPinOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'positive' | 'critical'; text: string } | null>(
    null,
  );

  const savePin = useCallback(async () => {
    setBusy(true);
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
      setBusy(false);
    }
  }, [password, pin, withToken, refreshUser]);

  const savePassword = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      await withToken((token) => api.changePassword(currentPassword, newPassword, token));
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setMessage({
        tone: 'positive',
        text: 'Password updated. Your other devices have been signed out.',
      });
    } catch (caught) {
      setMessage({
        tone: 'critical',
        text: (caught as ApiError)?.message ?? 'Could not change the password.',
      });
    } finally {
      setBusy(false);
    }
  }, [currentPassword, newPassword, withToken]);

  const enablePush = useCallback(async () => {
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
  }, [withToken]);

  const confirmSignOut = useCallback(() => {
    Alert.alert('Sign out?', 'You will need your password to sign back in.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }, [signOut]);

  if (!user) return null;

  const gymCount = branches.data?.length ?? null;

  return (
    <Screen>
      <Body>
        {/* Identity. The avatar opens the same menu as everywhere else, so the
            gesture means one thing across the app. */}
        <Row gap="lg">
          <Avatar name={user.full_name} size={56} accent />
          <Stack gap="xxs" style={styles.grow}>
            <Text variant="heading" numberOfLines={1}>
              {user.full_name}
            </Text>
            <Text variant="label" tone={color.textSecondary} numberOfLines={1}>
              {user.email}
            </Text>
            <Row gap="xs" wrap>
              <Badge label={roleLabels[user.role] ?? user.role} tone="brand" solid />
              {user.branch ? <Badge label={user.branch.name} tone="info" /> : null}
            </Row>
          </Stack>
        </Row>

        {message ? (
          <Banner
            tone={message.tone}
            icon={message.tone === 'positive' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
          >
            {message.text}
          </Banner>
        ) : null}

        {/* ------------------------------------------------------- account */}
        <Section title="Account">
          <Card>
            <Detail label="Role" value={roleLabels[user.role] ?? user.role} />
            <Detail label="Gym" value={user.branch?.name ?? 'All SLAM branches'} />
            {user.phone ? <Detail label="Phone" value={user.phone} /> : null}
            {showPin ? (
              <Detail label="Check-in PIN" value={user.has_pin ? 'Set' : 'Not set'} />
            ) : null}
            {gymCount && gymCount > 1 ? (
              <>
                <Divider />
                <Row gap="sm">
                  <Ionicons name="business-outline" size={16} color={color.textTertiary} />
                  <Text variant="label" tone={color.textTertiary} style={styles.grow}>
                    You can see {gymCount} gyms. GymFlow scopes data by your role, so there is no
                    gym to switch between.
                  </Text>
                </Row>
              </>
            ) : null}
          </Card>
        </Section>

        {/* Activity — the rows each role passes in. */}
        {links.length ? (
          <Section title="Activity">
            <Card>
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
          </Section>
        ) : null}

        {/* --------------------------------------------------- preferences */}
        <Section title="Preferences">
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
                : 'Push delivery is not enabled in V1. Alerts are collected in GymFlow and appear under Updates.'}
            </Text>
            {PUSH_ENABLED ? (
              <Button
                title="Enable alerts"
                variant="secondary"
                icon="notifications-outline"
                onPress={() => void enablePush()}
              />
            ) : null}
          </Card>
        </Section>

        {/* ------------------------------------------------------ security */}
        <Section title="Security">
          <Card>
            <NavRow
              label="Change password"
              detail="Signs out your other devices"
              icon="key-outline"
              testID="security-password"
              onPress={() => setPasswordOpen(true)}
            />
            {showPin ? (
              <NavRow
                label={user.has_pin ? 'Change check-in PIN' : 'Set a check-in PIN'}
                detail="Used at the front desk"
                icon="keypad-outline"
                testID="security-pin"
                onPress={() => setPinOpen(true)}
              />
            ) : null}
          </Card>

          <Stack gap="sm">
            <NotConnected
              icon="finger-print-outline"
              title="Biometric unlock"
              detail="Not available in this version. Sign in with your password."
            />
            <NotConnected
              icon="logo-google"
              title="Google account"
              detail="Not available in this version. Sign in with your email or mobile number and password."
            />
            <NotConnected
              icon="phone-portrait-outline"
              title="Active sessions"
              detail="Not available in this version. Changing your password signs every other device out."
            />
          </Stack>
        </Section>

        {/* ------------------------------------------------------- support */}
        <Section title="Support">
          <Card>
            <Row gap="sm" style={styles.detail}>
              <Text variant="label" tone={color.textSecondary}>
                Connection
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
            <Divider />
            <Text variant="label" tone={color.textTertiary}>
              Anything GymFlow cannot fix is a question for your SLAM branch
              {user.branch ? ` — ${user.branch.name}` : ''}. All attendance times are recorded by
              the server; your phone&apos;s clock is never used.
            </Text>
          </Card>
        </Section>

        <Button
          title="Sign out"
          variant="destructive"
          icon="log-out-outline"
          onPress={confirmSignOut}
          testID="profile-sign-out"
        />
      </Body>

      <Sheet
        visible={pinOpen}
        onClose={() => setPinOpen(false)}
        title="Check-in PIN"
        subtitle="Confirm your password, then choose 4–8 digits"
        footer={
          <Button
            title="Save PIN"
            loading={busy}
            disabled={password.length < 8 || pin.length < 4}
            onPress={() => void savePin()}
          />
        }
      >
        <Input
          label="Current password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your GymFlow password"
          secure
          autoCapitalize="none"
          toggleTestID="toggle-pin-password"
        />
        <Input
          label="New PIN"
          value={pin}
          onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 8))}
          placeholder="4–8 digits"
          keyboardType="number-pad"
          secure
          toggleTestID="toggle-pin"
        />
      </Sheet>

      <Sheet
        visible={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Change password"
        subtitle="Your other devices will be signed out"
        footer={
          <Button
            title="Change password"
            loading={busy}
            // The server enforces ten; saying so before the request is faster
            // than a round trip that comes back rejected.
            disabled={currentPassword.length < 8 || newPassword.length < 10}
            onPress={() => void savePassword()}
          />
        }
      >
        <Input
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secure
          autoCapitalize="none"
          toggleTestID="toggle-current-password"
        />
        <Input
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          hint="At least 10 characters"
          secure
          autoCapitalize="none"
          toggleTestID="toggle-new-password"
        />
      </Sheet>
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
});
