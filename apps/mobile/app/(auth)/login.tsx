/**
 * Sign in.
 *
 * The role selector is a convenience only — it pre-fills nothing the server
 * trusts. Authorization comes from the account, and after a successful login
 * the app routes on the *server's* role, not the chip the person tapped. If
 * those disagree, the server wins and the screen says so.
 *
 * Built from the design system rather than hand-rolled inputs, so the field
 * borders, error text and disabled button behave exactly as they do on every
 * other screen. Nothing about authentication changed here.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ApiError, OFFLINE_CODE, UNCONFIGURED_CODE } from '../../src/api/client';
import type { Role } from '../../src/api/types';
import {
  Banner,
  Button,
  Eyebrow,
  Input,
  LinkButton,
  OfflineNotice,
  Screen,
  SlamLogo,
  Spacer,
  Stack,
  Row,
  Text,
  alpha,
  color,
  radii,
  space,
} from '../../src/design';
import { homeRouteForRole, useAuth } from '../../src/store/AuthContext';
import { OFFLINE_MESSAGE, useNetwork } from '../../src/store/NetworkContext';

/** The four ways into SLAM. `admin` maps onto the platform's super-admin role. */
const ROLES: { key: Role; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'owner', label: 'OWNER', icon: 'business-outline' },
  { key: 'trainer', label: 'TRAINER', icon: 'barbell-outline' },
  { key: 'member', label: 'MEMBER', icon: 'person-outline' },
  { key: 'super_admin', label: 'ADMIN', icon: 'shield-checkmark-outline' },
];

const HELP_TEXT =
  'Ask your SLAM branch manager to reset your password or check your account. ' +
  'Nagalkeni, Boganhalli and Alandur can all help.';

/**
 * Turn a failure into something the person holding the phone can act on.
 *
 * Nothing technical reaches the screen: a stack of internal codes tells a
 * trainer on the gym floor nothing, and an error mentioning the database
 * would be worse than useless.
 */
function messageFor(error: ApiError | null, online: boolean): string | null {
  if (!error) return null;
  if (!online || error.code === OFFLINE_CODE) {
    return 'No connection to GymFlow. Check your network and try again.';
  }
  if (error.code === UNCONFIGURED_CODE) {
    return 'This build is not pointed at a GymFlow server. Contact SLAM support.';
  }
  if (error.status === 401 || error.code === 'invalid_credentials') {
    return 'That email or password is not right. Try again.';
  }
  if (error.status === 403) return 'This account is locked. Contact your branch manager.';
  if (error.status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (error.status === 422) return 'Check your email and password, then try again.';
  if (error.status >= 500 || error.status === 0) {
    return 'GymFlow is unavailable right now. Try again shortly.';
  }
  return 'Sign in failed. Try again.';
}

/** Accepts an email or an Indian mobile number, which is how SLAM identifies people. */
function looksLikeIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return /^\+?[0-9\s-]{10,15}$/.test(trimmed);
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { isOnline } = useNetwork();
  const router = useRouter();

  const [role, setRole] = useState<Role>('owner');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const identifierValid = looksLikeIdentifier(identifier);
  const passwordValid = password.length >= 8;
  const canSubmit = identifierValid && passwordValid && !busy;
  const errorText = useMemo(() => messageFor(error, isOnline), [error, isOnline]);

  // Validation speaks only once the person has left the field, so the form does
  // not scold someone halfway through typing their own email address.
  const identifierError =
    touched && identifier.length > 0 && !identifierValid
      ? 'Enter a valid email address or mobile number.'
      : null;
  const passwordError =
    touched && password.length > 0 && !passwordValid
      ? 'Your password is at least 8 characters.'
      : null;

  async function submit() {
    setTouched(true);
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const user = await signIn(identifier, password);
      if (user.role !== role) {
        // The selector was only ever a shortcut. Say what actually happened
        // rather than silently landing somewhere unexpected.
        setNotice(`Signed in as ${user.role.replace('_', ' ')}.`);
      }
      router.replace(homeRouteForRole(user.role) as never);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, 'unknown', (caught as Error)?.message ?? 'Sign in failed.'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Stack gap="sm" style={styles.header}>
            <SlamLogo width={196} />
            <Text variant="display" style={styles.headline}>
              GymFlow AI
            </Text>
            <Text variant="body" tone={color.textSecondary}>
              Smart operations across every SLAM branch.
            </Text>
          </Stack>

          {!isOnline ? <OfflineNotice message={OFFLINE_MESSAGE} /> : null}

          <Stack gap="sm">
            <Eyebrow>I am a</Eyebrow>
            <Row gap="sm" align="stretch">
              {ROLES.map((option) => {
                const selected = option.key === role;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setRole(option.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.label}
                    testID={`role-${option.key}`}
                    style={({ pressed }) => [
                      styles.roleChip,
                      selected ? styles.roleChipSelected : null,
                      pressed ? styles.roleChipPressed : null,
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={18}
                      color={selected ? color.brand : color.textTertiary}
                    />
                    <Text
                      variant="caption"
                      tone={selected ? color.text : color.textTertiary}
                      style={styles.roleLabel}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </Row>
          </Stack>

          <Stack gap="lg">
            <Input
              label="Email or mobile"
              value={identifier}
              onChangeText={setIdentifier}
              onBlur={() => setTouched(true)}
              placeholder="you@slam.fit or 98xxxxxxxx"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              keyboardType="email-address"
              inputMode="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              error={identifierError}
              accessibilityLabel="Email address or mobile number"
              testID="login-email"
            />

            <Input
              ref={passwordRef}
              label="Password"
              secure
              value={password}
              onChangeText={setPassword}
              onBlur={() => setTouched(true)}
              placeholder="••••••••"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={submit}
              error={passwordError}
              accessibilityLabel="Password"
              testID="login-password"
              toggleTestID="toggle-password"
            />

            {errorText ? (
              <Banner tone="critical" icon="alert-circle-outline" testID="login-error">
                {errorText}
              </Banner>
            ) : null}
            {notice ? (
              <Banner tone="info" icon="information-circle-outline">
                {notice}
              </Banner>
            ) : null}

            <Button
              title="Sign in"
              size="lg"
              loading={busy}
              disabled={!canSubmit}
              onPress={submit}
              testID="login-submit"
            />

            <Row>
              <LinkButton
                title="Forgot password?"
                onPress={() => setNotice(HELP_TEXT)}
                testID="forgot-password"
              />
              <Spacer />
              <LinkButton
                title="Contact your SLAM branch"
                tone={color.textSecondary}
                onPress={() => setNotice(HELP_TEXT)}
                testID="contact-branch"
              />
            </Row>
          </Stack>

          <Text variant="label" tone={color.textTertiary} align="center" style={styles.footer}>
            Your session is stored in the device keychain. Attendance times always come from the
            GymFlow server, never from your phone.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.xl, gap: space.xl, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'flex-start' },
  headline: { marginTop: space.md },
  roleChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: space.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surfaceRaised,
    minHeight: 60,
  },
  roleChipSelected: {
    borderColor: color.brand,
    backgroundColor: alpha(color.brand, 0.12),
  },
  roleChipPressed: { opacity: 0.8 },
  roleLabel: { fontSize: 10 },
  footer: { lineHeight: 18 },
});
