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
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ApiError } from '../api/client';
import { resolveBaseUrl } from '../api/client';
import * as api from '../api/endpoints';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  Divider,
  Eyebrow,
  Row,
  Screen,
  Txt,
} from './ui';
import { PUSH_ENABLED, registerForPush } from '../notifications';
import { useAuth } from '../store/AuthContext';
import { useNetwork } from '../store/NetworkContext';
import { colors, HIT_TARGET, radius, spacing, typography } from '../theme';
import { initials } from '../utils/format';

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
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  if (!user) return null;

  async function savePin() {
    setPinBusy(true);
    setMessage(null);
    try {
      await withToken((token) => api.setPin(password, pin, token));
      setPinOpen(false);
      setPassword('');
      setPin('');
      setMessage({ tone: 'success', text: 'Check-in PIN updated.' });
      await refreshUser();
    } catch (caught) {
      setMessage({ tone: 'danger', text: (caught as ApiError)?.message ?? 'Could not update the PIN.' });
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
        setMessage({ tone: 'success', text: 'This device will receive GymFlow alerts.' });
        return;
      } catch (caught) {
        setMessage({ tone: 'danger', text: (caught as ApiError)?.message ?? 'Could not register.' });
        return;
      }
    }
    setMessage({ tone: 'danger', text: result.reason ?? 'Push is not available.' });
  }

  return (
    <Screen>
      <Body>
        <Row style={styles.identity}>
          <View style={styles.avatar}>
            <Txt variant="heading">{initials(user.full_name)}</Txt>
          </View>
          <View style={styles.identityText}>
            <Txt variant="heading">{user.full_name}</Txt>
            <Txt variant="label" color={colors.textMuted}>
              {user.email}
            </Txt>
          </View>
        </Row>

        <Card>
          <Eyebrow>Access</Eyebrow>
          <Divider />
          <Detail label="Role" value={roleLabels[user.role] ?? user.role} />
          <Detail label="Branch" value={user.branch?.name ?? 'All SLAM branches'} />
          {showPin ? (
            <Detail label="Check-in PIN" value={user.has_pin ? 'Set' : 'Not set'} />
          ) : null}
        </Card>

        {links.length ? (
          <Card>
            <Eyebrow>More</Eyebrow>
            <Divider />
            {links.map((link) => (
              <Pressable
                key={link.route}
                accessibilityRole="button"
                accessibilityLabel={link.label}
                onPress={() => router.push(link.route as never)}
                style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
              >
                <Ionicons name={link.icon} size={20} color={colors.textMuted} />
                <View style={styles.linkText}>
                  <Txt variant="body">{link.label}</Txt>
                  {link.detail ? (
                    <Txt variant="label" color={colors.textFaint}>
                      {link.detail}
                    </Txt>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Pressable>
            ))}
          </Card>
        ) : null}

        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

        {showPin ? (
          <Button
            title={user.has_pin ? 'Change check-in PIN' : 'Set a check-in PIN'}
            variant="secondary"
            icon="keypad-outline"
            onPress={() => setPinOpen(true)}
          />
        ) : null}

        <Card>
          <Row style={styles.cardHead}>
            <Eyebrow>Notifications</Eyebrow>
            <Badge
              label={PUSH_ENABLED ? 'Available' : 'Off in this build'}
              color={PUSH_ENABLED ? colors.onTime : colors.textFaint}
            />
          </Row>
          <Txt variant="body" color={colors.textMuted}>
            {PUSH_ENABLED
              ? 'Turn on alerts for late check-ins, absences and shift reminders.'
              : 'Push delivery is not enabled in V1. Alerts are collected in GymFlow and will be delivered when the channel is switched on.'}
          </Txt>
          {PUSH_ENABLED ? (
            <Button title="Enable alerts" variant="secondary" icon="notifications-outline" onPress={enablePush} />
          ) : null}
        </Card>

        <Card>
          <Eyebrow>Connection</Eyebrow>
          <Divider />
          <Row style={styles.detail}>
            <Txt variant="label" color={colors.textMuted}>
              Status
            </Txt>
            <Row style={styles.statusRow}>
              <Ionicons
                name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={16}
                color={isOnline ? colors.onTime : colors.brand}
              />
              <Txt variant="mono" color={isOnline ? colors.onTime : colors.brand}>
                {isOnline ? `Online · ${type}` : 'Offline'}
              </Txt>
            </Row>
          </Row>
          <Detail label="Server" value={resolveBaseUrl()} />
          <Txt variant="label" color={colors.textFaint} style={styles.note}>
            All attendance times are recorded by the GymFlow server. Your phone's clock is never
            used.
          </Txt>
        </Card>

        <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={signOut} />
      </Body>

      <Modal visible={pinOpen} transparent animationType="fade" onRequestClose={() => setPinOpen(false)}>
        <View style={styles.backdrop}>
          <Card style={styles.modalCard}>
            <Txt variant="heading">Set check-in PIN</Txt>
            <Txt variant="body" color={colors.textMuted}>
              Confirm your password, then choose a 4–8 digit PIN for floor check-in.
            </Txt>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Current password"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
              accessibilityLabel="Current password"
            />
            <TextInput
              value={pin}
              onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 8))}
              placeholder="New PIN"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.input}
              accessibilityLabel="New PIN"
            />
            <Button
              title="SAVE PIN"
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
    <Row style={styles.detail}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt variant="mono" numberOfLines={1} style={styles.detailValue}>
        {value}
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  identity: { gap: spacing.lg, marginBottom: spacing.sm },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: 2 },
  cardHead: { justifyContent: 'space-between' },
  detail: { justifyContent: 'space-between', paddingVertical: 3, gap: spacing.lg },
  detailValue: { flexShrink: 1, textAlign: 'right' },
  statusRow: { gap: spacing.xs },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: HIT_TARGET,
  },
  linkPressed: { opacity: 0.7 },
  linkText: { flex: 1, gap: 2 },
  note: { marginTop: spacing.sm, lineHeight: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { gap: spacing.md },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
  },
});
