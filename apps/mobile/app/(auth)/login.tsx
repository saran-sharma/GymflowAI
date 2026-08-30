/**
 * GymFlow's two-step sign-in. The server deliberately accepts the identifier
 * only with a password, so the first step never claims an account was found.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { ApiError, OFFLINE_CODE, UNCONFIGURED_CODE } from '../../src/api/client';
import {
  Banner,
  Button,
  Input,
  OfflineNotice,
  Row,
  Screen,
  SlamLogo,
  Stack,
  Text,
  color,
  font,
  radii,
  roleAccent,
  space,
  useThemedStyles,
} from '../../src/design';
import type { Role } from '../../src/api/types';
import { homeRouteForRole, useAuth } from '../../src/store/AuthContext';
import { OFFLINE_MESSAGE, useNetwork } from '../../src/store/NetworkContext';

const GOLD = roleAccent.auth;
const RESET_UNAVAILABLE =
  'Password resets are arranged by your SLAM branch until self-service reset is available.';

type Step = 'identify' | 'password' | 'reset' | 'success';
type RoleFamily = 'member' | 'trainer' | 'owner';

/** How the role-select screen labelled each option. */
const CHOSEN_LABEL: Record<RoleFamily, string> = {
  member: 'Member',
  trainer: 'Trainer',
  owner: 'Gym Owner',
};
/** How to name the account the person actually signed in with. */
const ACTUAL_LABEL: Record<RoleFamily, string> = {
  member: 'a member',
  trainer: 'a trainer',
  owner: 'an owner or manager',
};

/** The three role-select "families" — owner covers owner/manager/admin. */
function roleFamily(role: Role): RoleFamily {
  if (role === 'trainer') return 'trainer';
  if (role === 'member') return 'member';
  return 'owner';
}

function messageFor(error: ApiError | null, online: boolean): string | null {
  if (!error) return null;
  if (!online || error.code === OFFLINE_CODE || error.status >= 500 || error.status === 0) {
    return "We couldn't reach GymFlow right now. Check your connection and try again.";
  }
  if (error.code === UNCONFIGURED_CODE) {
    return 'This build is not connected to GymFlow. Contact your SLAM branch.';
  }
  if (error.status === 429 || error.status === 423) {
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }
  // Authentication responses stay deliberately generic: neither account
  // existence nor account state should be visible before authentication.
  return 'Invalid email/mobile number or password.';
}

function looksLikeIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return /^\+?[0-9\s-]{10,15}$/.test(trimmed);
}

function greeting(name: string): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return `Good ${time}, ${name}.`;
}

export default function LoginScreen() {
  const styles = useThemedStyles(buildStyles);
  const { signIn, signOut } = useAuth();
  const { isOnline } = useNetwork();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  // Context only — set when the user came via the "How are you using
  // GymFlow?" screen. Never sent to the server; used only to refuse an
  // obvious "picked Owner, signed in as a Member" mismatch after the backend
  // has already authenticated and returned the authoritative role.
  const params = useLocalSearchParams<{ expected?: string }>();
  const expectedFamily: RoleFamily | null =
    params.expected === 'member' || params.expected === 'trainer' || params.expected === 'owner'
      ? params.expected
      : null;
  const [roleMismatch, setRoleMismatch] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [successName, setSuccessName] = useState('');
  const passwordRef = useRef<TextInput>(null);

  const identifierValid = looksLikeIdentifier(identifier);
  const passwordValid = password.length >= 8;
  const errorText = useMemo(() => messageFor(error, isOnline), [error, isOnline]);
  const compact = width < 360 || height < 700;
  const identifierError =
    identifierTouched && identifier.length > 0 && !identifierValid
      ? 'Enter a valid email address or mobile number.'
      : null;
  const passwordError =
    passwordTouched && password.length > 0 && !passwordValid
      ? 'Your password is at least 8 characters.'
      : null;

  function changeIdentifier(value: string) {
    setIdentifier(value);
    setError(null);
    setRoleMismatch(null);
  }

  function continueToPassword() {
    setIdentifierTouched(true);
    if (!identifierValid || busy) return;
    setError(null);
    setStep('password');
    requestAnimationFrame(() => passwordRef.current?.focus());
  }

  async function submit() {
    setPasswordTouched(true);
    if (!identifierValid || !passwordValid || busy) return;
    setBusy(true);
    setError(null);
    setRoleMismatch(null);
    try {
      // This existing endpoint authenticates both email and mobile identifiers,
      // then returns the authoritative role used for navigation. `expected`
      // is NOT part of this request — the server decides the role, full stop.
      const user = await signIn(identifier, password);

      // Additive guard, not an authorization decision: the backend already
      // said what this account is. If the person told us on the previous
      // screen that they were an owner and this is a member account, refuse
      // to continue and say so plainly rather than silently dropping them
      // into the member app.
      const actual = roleFamily(user.role);
      if (expectedFamily && expectedFamily !== actual) {
        await signOut();
        setRoleMismatch(
          `You chose "${CHOSEN_LABEL[expectedFamily]}", but you signed in with ${ACTUAL_LABEL[actual]} ` +
            `account. Choose the right option, or contact your SLAM branch if this looks wrong.`,
        );
        setStep('password');
        return;
      }

      setSuccessName(user.full_name.split(' ')[0] || 'there');
      setStep('success');
      setTimeout(() => router.replace(homeRouteForRole(user.role) as never), 500);
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

  function backToIdentifier() {
    setPassword('');
    setPasswordTouched(false);
    setError(null);
    setRoleMismatch(null);
    setStep('identify');
  }

  const isPasswordStep = step === 'password';
  const isReset = step === 'reset';

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[styles.hero, compact ? styles.heroCompact : null]}
            accessible
            accessibilityLabel="GymFlow AI. Train smarter, perform better. Your fitness journey, all in one place."
          >
            <Row gap="md" align="center">
              <SlamLogo width={112} />
              <Text style={styles.wordmark}>GymFlow AI</Text>
            </Row>
            <View style={styles.headline}>
              <Text style={[styles.editorial, compact ? styles.editorialCompact : null]}>Train smarter.</Text>
              <Text style={[styles.editorial, styles.editorialAccent, compact ? styles.editorialCompact : null]}>
                Perform better.
              </Text>
              <Text variant="body" tone={color.textSecondary} style={styles.tagline}>
                Your fitness journey, all in one place.
              </Text>
            </View>
          </View>

          <View style={styles.panel}>
            {step === 'success' ? (
              <Stack gap="md" style={styles.success}>
                <Text style={styles.welcome}>SLAM</Text>
                <Text style={styles.successGreeting}>{greeting(successName)}</Text>
                <Text variant="body" tone={color.textSecondary}>Let's get moving.</Text>
              </Stack>
            ) : (
              <>
                <Text accessibilityRole="header" style={styles.welcome}>
                  {isReset ? 'Reset your password' : 'Welcome back.'}
                </Text>
                {!isOnline ? <OfflineNotice message={OFFLINE_MESSAGE} /> : null}
                {roleMismatch ? (
                  <Banner tone="critical" icon="alert-circle-outline" testID="login-role-mismatch">
                    {roleMismatch}
                  </Banner>
                ) : null}
                {errorText ? (
                  <Banner tone="critical" icon="alert-circle-outline" testID="login-error">
                    {errorText}
                  </Banner>
                ) : null}

                {step === 'identify' ? (
                  <Stack gap="md">
                    <Input
                      label="Mobile number or email"
                      testID="login-identifier"
                      value={identifier}
                      onChangeText={changeIdentifier}
                      onBlur={() => setIdentifierTouched(true)}
                      error={identifierError}
                      hint="Indian mobile numbers can be entered with or without +91."
                      placeholder="Enter mobile number or email"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      textContentType="username"
                      returnKeyType="next"
                      onSubmitEditing={continueToPassword}
                    />
                    <Button
                      title="Continue"
                      size="lg"
                      testID="login-continue"
                      disabled={!identifierValid || busy}
                      loading={busy}
                      onPress={continueToPassword}
                      style={styles.primary}
                    />
                  </Stack>
                ) : null}

                {isPasswordStep ? (
                  <Stack gap="md">
                    <Pressable
                      onPress={backToIdentifier}
                      accessibilityRole="button"
                      accessibilityLabel="Change mobile number or email"
                      testID="change-identifier"
                      hitSlop={space.sm}
                    >
                      <Text variant="label" tone={GOLD}>{identifier.trim()}</Text>
                    </Pressable>
                    <Input
                      ref={passwordRef}
                      label="Password"
                      testID="login-password"
                      toggleTestID="toggle-password"
                      value={password}
                      onChangeText={(value) => { setPassword(value); setError(null); }}
                      onBlur={() => setPasswordTouched(true)}
                      error={passwordError}
                      placeholder="Your GymFlow password"
                      secure
                      autoCapitalize="none"
                      autoComplete="current-password"
                      textContentType="password"
                      returnKeyType="go"
                      onSubmitEditing={() => void submit()}
                    />
                    <Pressable
                      onPress={() => { setError(null); setStep('reset'); }}
                      accessibilityRole="button"
                      accessibilityLabel="Forgot password"
                      testID="forgot-password"
                      hitSlop={space.sm}
                      style={styles.forgot}
                    >
                      <Text variant="label" tone={color.textSecondary}>Forgot password?</Text>
                    </Pressable>
                    <Button
                      title="Sign in"
                      size="lg"
                      testID="login-submit"
                      loading={busy}
                      disabled={!identifierValid || !passwordValid || busy}
                      onPress={() => void submit()}
                      style={styles.primary}
                    />
                    {roleMismatch ? (
                      <Pressable
                        onPress={() => router.replace('/(auth)/role-select')}
                        accessibilityRole="button"
                        testID="login-choose-role"
                      >
                        <Text variant="label" tone={GOLD} style={styles.centered}>
                          Choose a different role
                        </Text>
                      </Pressable>
                    ) : null}
                  </Stack>
                ) : null}

                {isReset ? (
                  <Stack gap="md">
                    <Text variant="body" tone={color.textSecondary}>
                      Enter the mobile number or email linked to your GymFlow account.
                    </Text>
                    <Input
                      label="Mobile number or email"
                      testID="reset-identifier"
                      value={identifier}
                      onChangeText={changeIdentifier}
                      onBlur={() => setIdentifierTouched(true)}
                      error={identifierError}
                      placeholder="Enter mobile number or email"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      textContentType="username"
                    />
                    <Banner tone="info" icon="information-circle-outline">
                      {RESET_UNAVAILABLE}
                    </Banner>
                    <Pressable onPress={backToIdentifier} accessibilityRole="button" testID="reset-back">
                      <Text variant="label" tone={GOLD} style={styles.centered}>Back to sign in</Text>
                    </Pressable>
                  </Stack>
                ) : null}

                <Row gap="xs" justify="center" style={styles.signup}>
                  <Text variant="label" tone={color.textTertiary}>Don't have an account?</Text>
                  <Text variant="label" tone={GOLD}>Contact your SLAM branch</Text>
                </Row>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function buildStyles() {
  return StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: space.xl },
  hero: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xxl },
  heroCompact: { paddingBottom: space.lg },
  wordmark: { fontFamily: font.displaySemi, fontSize: 17, letterSpacing: -0.4, color: color.text },
  headline: { paddingTop: space.xxl },
  editorial: { fontFamily: font.display, fontSize: 40, lineHeight: 44, letterSpacing: -1.4, color: color.text },
  editorialCompact: { fontSize: 30, lineHeight: 34, letterSpacing: -1 },
  editorialAccent: { fontFamily: font.displayItalic, color: GOLD },
  tagline: { paddingTop: space.md },
  panel: {
    flexGrow: 1,
    gap: space.lg,
    backgroundColor: color.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.xl,
    paddingTop: space.xl,
    paddingBottom: space.xxl,
  },
  welcome: { fontFamily: font.displaySemi, fontSize: 26, lineHeight: 32, letterSpacing: -0.6, color: color.text },
  success: { alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 260 },
  successGreeting: { fontFamily: font.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.8, color: color.text },
  forgot: { alignSelf: 'flex-end' },
  primary: { backgroundColor: GOLD },
  signup: { paddingTop: space.sm },
  centered: { textAlign: 'center' },
});
}
