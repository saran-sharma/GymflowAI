/**
 * Sign in.
 *
 * The screen answers one question — how do I get into GymFlow, quickly and
 * confidently — so it is built as two halves. The top is atmosphere: the
 * wordmark and one editorial line, in Fraunces, doing the job a hero image
 * would do if this product had photography. The bottom is a panel that rises
 * over it holding everything a person actually touches, which puts the fields
 * and the primary action inside thumb reach on a tall phone.
 *
 * **There is no role selector.** There used to be four chips above the form,
 * and they were always a lie: `signIn` never sent the role, and routing has
 * always used the role the *server* returned. Asking someone to declare who
 * they are before proving who they are is a question the app cannot act on —
 * and one human can be a member at one branch and a trainer at another. The
 * role is now determined after authentication, which is what already happened.
 *
 * Passkey, Apple, Google and Create account are drawn because the design calls
 * for them and then say plainly that they are not wired up. GymFlow has no
 * WebAuthn endpoint, no OAuth client, and no self-signup — members are created
 * by their branch. A button that looks live and does nothing is worse than one
 * that explains itself.
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
  alpha,
  color,
  font,
  radii,
  roleAccent,
  space,
} from '../../src/design';
import { homeRouteForRole, useAuth } from '../../src/store/AuthContext';
import { OFFLINE_MESSAGE, useNetwork } from '../../src/store/NetworkContext';

/** Auth wears gold: it belongs to no role until the server names one. */
const GOLD = roleAccent.auth;

const HELP_TEXT =
  'Ask your SLAM branch manager to reset your password or check your account. ' +
  'Nagalkeni, Boganhalli and Alandur can all help.';

/** Why each of the alternative sign-in routes cannot run yet. */
const UNAVAILABLE = {
  passkey:
    'Passkeys need a WebAuthn endpoint GymFlow does not have yet. Sign in with your password.',
  social: 'GymFlow has no OAuth client configured, and no way to link a Google or Apple account.',
  signup:
    'Accounts are created by your SLAM branch, not from the app. ' +
    'Nagalkeni, Boganhalli and Alandur can all set one up.',
} as const;

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
  const { width, height } = useWindowDimensions();

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

  // A 320pt phone in landscape, or a small device with the keyboard up, has no
  // room for a 44pt headline. The lockup stays; the editorial line steps down.
  const compact = width < 360 || height < 700;

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
      // The server decides the role. Nothing on this screen influences it.
      const user = await signIn(identifier, password);
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
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* ------------------------------------------------ atmosphere */}
          <View style={[styles.hero, compact ? styles.heroCompact : null]}>
            <Row gap="md" align="center">
              <SlamLogo width={112} />
              <Text style={styles.wordmark}>GymFlow AI</Text>
            </Row>

            <View style={styles.headline}>
              <Text style={[styles.editorial, compact ? styles.editorialCompact : null]}>
                Train smarter.
              </Text>
              <Text
                style={[
                  styles.editorial,
                  styles.editorialAccent,
                  compact ? styles.editorialCompact : null,
                ]}
              >
                Perform better.
              </Text>
              <Text variant="body" tone={color.textSecondary} style={styles.tagline}>
                Smart operations across every SLAM branch.
              </Text>
            </View>
          </View>

          {/* ----------------------------------------------------- panel */}
          <View style={styles.panel}>
            <Text style={styles.welcome}>Welcome back.</Text>

            {!isOnline ? <OfflineNotice message={OFFLINE_MESSAGE} /> : null}

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

            <Stack gap="md">
              <Input
                label="Email / phone"
                testID="login-email"
                value={identifier}
                onChangeText={setIdentifier}
                onBlur={() => setTouched(true)}
                error={identifierError}
                placeholder="you@slam.fit"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />

              <Input
                ref={passwordRef}
                label="Password"
                testID="login-password"
                toggleTestID="toggle-password"
                value={password}
                onChangeText={setPassword}
                onBlur={() => setTouched(true)}
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
                onPress={() => setNotice(HELP_TEXT)}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
                testID="forgot-password"
                hitSlop={space.sm}
                style={styles.forgot}
              >
                <Text variant="label" tone={color.textSecondary}>
                  Forgot password?
                </Text>
              </Pressable>
            </Stack>

            <Button
              title="Sign in"
              size="lg"
              testID="login-submit"
              loading={busy}
              disabled={!canSubmit}
              onPress={() => void submit()}
              style={styles.primary}
            />

            {/* The alternatives. Drawn as the design asks, honest about being
                unbuilt — each says why rather than failing silently. */}
            <Pressable
              onPress={() => setNotice(UNAVAILABLE.passkey)}
              accessibilityRole="button"
              accessibilityLabel="Sign in with a passkey"
              accessibilityHint="Not available in this build"
              testID="passkey"
              style={({ pressed }) => [styles.passkey, pressed ? styles.pressed : null]}
            >
              <Ionicons name="finger-print-outline" size={20} color={GOLD} />
              <View style={styles.grow}>
                <Text variant="label">Sign in with a passkey</Text>
                <Text variant="caption" tone={color.textQuiet}>
                  Not available yet
                </Text>
              </View>
            </Pressable>

            <Row gap="sm" align="center" style={styles.divider}>
              <View style={styles.rule} />
              <Text variant="caption" caps tone={color.textQuiet}>
                Continue with
              </Text>
              <View style={styles.rule} />
            </Row>

            <Row gap="sm" align="stretch">
              {(['Apple', 'Google'] as const).map((provider) => (
                <Pressable
                  key={provider}
                  onPress={() => setNotice(UNAVAILABLE.social)}
                  accessibilityRole="button"
                  accessibilityLabel={`Continue with ${provider}`}
                  accessibilityHint="Not available in this build"
                  testID={`social-${provider.toLowerCase()}`}
                  style={({ pressed }) => [styles.social, pressed ? styles.pressed : null]}
                >
                  <Ionicons
                    name={provider === 'Apple' ? 'logo-apple' : 'logo-google'}
                    size={16}
                    color={color.textSecondary}
                  />
                  <Text variant="label" tone={color.textSecondary}>
                    {provider}
                  </Text>
                </Pressable>
              ))}
            </Row>

            <Row gap="xs" justify="center" style={styles.signup}>
              <Text variant="label" tone={color.textTertiary}>
                Don&apos;t have an account?
              </Text>
              <Pressable
                onPress={() => setNotice(UNAVAILABLE.signup)}
                accessibilityRole="button"
                accessibilityLabel="Create account"
                testID="contact-branch"
                hitSlop={space.sm}
              >
                <Text variant="label" tone={GOLD}>
                  Contact your branch
                </Text>
              </Pressable>
            </Row>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: space.xl },

  hero: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xxl },
  wordmark: {
    fontFamily: font.displaySemi,
    fontSize: 17,
    letterSpacing: -0.4,
    color: color.text,
  },
  heroCompact: { paddingBottom: space.lg },
  headline: { paddingTop: space.xxl },
  editorial: {
    fontFamily: font.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.4,
    color: color.text,
  },
  editorialCompact: { fontSize: 30, lineHeight: 34, letterSpacing: -1 },
  editorialAccent: { fontFamily: font.displayItalic, color: GOLD },
  tagline: { paddingTop: space.md },

  // The panel rises over the page, which is what puts the fields and the
  // primary action within thumb reach rather than centred on the screen.
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
  welcome: {
    fontFamily: font.displaySemi,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: color.text,
  },

  forgot: { alignSelf: 'flex-end' },
  primary: { backgroundColor: GOLD },

  passkey: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.lg,
    borderRadius: radii.lg,
    backgroundColor: color.surfaceInput,
    borderWidth: 1,
    borderColor: alpha(GOLD, 0.2),
  },
  social: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: color.surfaceInput,
    borderWidth: 1,
    borderColor: color.border,
  },
  pressed: { opacity: 0.7 },

  divider: { paddingTop: space.xs },
  rule: { flex: 1, height: 1, backgroundColor: color.border },
  signup: { paddingTop: space.sm },
});
