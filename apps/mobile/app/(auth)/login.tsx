/**
 * Sign in.
 *
 * The role selector is a convenience only — it pre-fills nothing the server
 * trusts. Authorization comes from the account, and after a successful login
 * the app routes on the *server's* role, not the chip the person tapped. If
 * those disagree, the server wins and the screen says so.
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
import { SlamLogo } from '../../src/components/Brand';
import { Banner, Button, Eyebrow, OfflineNotice, Screen, Txt } from '../../src/components/ui';
import { homeRouteForRole, useAuth } from '../../src/store/AuthContext';
import { OFFLINE_MESSAGE, useNetwork } from '../../src/store/NetworkContext';
import { colors, HIT_TARGET, radius, spacing, typography } from '../../src/theme';
import type { Role } from '../../src/api/types';

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const identifierValid = looksLikeIdentifier(identifier);
  const passwordValid = password.length >= 8;
  const canSubmit = identifierValid && passwordValid && !busy;
  const errorText = useMemo(() => messageFor(error, isOnline), [error, isOnline]);

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
          <View style={styles.header}>
            <SlamLogo width={196} />
            <Txt variant="display" style={styles.headline}>
              GymFlow AI
            </Txt>
            <Txt variant="body" color={colors.textMuted}>
              Smart operations across every SLAM branch.
            </Txt>
          </View>

          {!isOnline ? <OfflineNotice message={OFFLINE_MESSAGE} /> : null}

          <View style={styles.roles}>
            <Eyebrow>I am a</Eyebrow>
            <View style={styles.roleRow}>
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
                      selected && styles.roleChipSelected,
                      pressed && styles.roleChipPressed,
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={18}
                      color={selected ? colors.text : colors.textFaint}
                    />
                    <Txt
                      variant="caption"
                      color={selected ? colors.text : colors.textFaint}
                      style={styles.roleLabel}
                    >
                      {option.label}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Eyebrow>Email or mobile</Eyebrow>
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                onBlur={() => setTouched(true)}
                placeholder="you@slam.fit or 98xxxxxxxx"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                keyboardType="email-address"
                inputMode="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                style={[
                  styles.input,
                  touched && identifier.length > 0 && !identifierValid && styles.inputInvalid,
                ]}
                accessibilityLabel="Email address or mobile number"
                testID="login-email"
              />
              {touched && identifier.length > 0 && !identifierValid ? (
                <Txt variant="label" color={colors.brandSoft}>
                  Enter a valid email address or mobile number.
                </Txt>
              ) : null}
            </View>

            <View style={styles.field}>
              <Eyebrow>Password</Eyebrow>
              <View style={styles.passwordWrap}>
                <TextInput
                  ref={passwordRef}
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => setTouched(true)}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  style={[
                    styles.input,
                    styles.passwordInput,
                    touched && password.length > 0 && !passwordValid && styles.inputInvalid,
                  ]}
                  onSubmitEditing={submit}
                  returnKeyType="go"
                  accessibilityLabel="Password"
                  testID="login-password"
                />
                <Pressable
                  onPress={() => setShowPassword((value) => !value)}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  testID="toggle-password"
                  style={styles.eye}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>
              {touched && password.length > 0 && !passwordValid ? (
                <Txt variant="label" color={colors.brandSoft}>
                  Your password is at least 8 characters.
                </Txt>
              ) : null}
            </View>

            {errorText ? (
              <Banner tone="danger" testID="login-error">
                {errorText}
              </Banner>
            ) : null}
            {notice ? <Banner tone="info">{notice}</Banner> : null}

            <Button
              title="SIGN IN"
              size="lg"
              loading={busy}
              disabled={!canSubmit}
              onPress={submit}
              testID="login-submit"
            />

            <View style={styles.links}>
              <Pressable
                onPress={() => setNotice(HELP_TEXT)}
                accessibilityRole="button"
                testID="forgot-password"
                style={styles.link}
              >
                <Txt variant="label" color={colors.brandSoft}>
                  Forgot password?
                </Txt>
              </Pressable>
              <Pressable
                onPress={() => setNotice(HELP_TEXT)}
                accessibilityRole="button"
                testID="contact-branch"
                style={styles.link}
              >
                <Txt variant="label" color={colors.textMuted}>
                  Contact your SLAM branch
                </Txt>
              </Pressable>
            </View>
          </View>

          <Txt variant="label" color={colors.textFaint} style={styles.footer}>
            Your session is stored in the device keychain. Attendance times always come from the
            GymFlow server, never from your phone.
          </Txt>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl, flexGrow: 1, justifyContent: 'center' },
  header: { gap: spacing.sm, alignItems: 'flex-start' },
  headline: { marginTop: spacing.md },
  roles: { gap: spacing.sm },
  roleRow: { flexDirection: 'row', gap: spacing.sm },
  roleChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    minHeight: HIT_TARGET + 12,
  },
  roleChipSelected: { borderColor: colors.brand, backgroundColor: `${colors.brand}1F` },
  roleChipPressed: { opacity: 0.8 },
  roleLabel: { fontSize: 10 },
  form: { gap: spacing.lg },
  field: { gap: spacing.xs },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 54,
  },
  inputInvalid: { borderColor: colors.brandDeep },
  passwordWrap: { justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  eye: {
    position: 'absolute',
    right: spacing.md,
    height: HIT_TARGET,
    width: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  links: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { paddingVertical: spacing.sm },
  footer: { textAlign: 'center', lineHeight: 18 },
});
