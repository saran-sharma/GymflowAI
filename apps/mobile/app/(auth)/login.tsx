/** Sign in. One screen, three roles, no branch picker — the server knows. */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ApiError, OFFLINE_CODE } from '../../src/api/client';
import { Wordmark } from '../../src/components/Brand';
import { Banner, Button, Eyebrow, OfflineNotice, Screen, Txt } from '../../src/components/ui';
import { homeRouteForRole, useAuth } from '../../src/store/AuthContext';
import { OFFLINE_MESSAGE, useNetwork } from '../../src/store/NetworkContext';
import { colors, radius, spacing, typography } from '../../src/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { isOnline } = useNetwork();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().length > 3 && password.length >= 8 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(email, password);
      router.replace(homeRouteForRole(user.role) as never);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(
        apiError?.code === OFFLINE_CODE
          ? 'Cannot reach GymFlow. Check your connection.'
          : (apiError?.message ?? 'Sign in failed. Try again.'),
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
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Wordmark />
            <Txt variant="display" style={styles.headline}>
              GymFlow AI
            </Txt>
            <Txt variant="body" color={colors.textMuted}>
              Trainer accountability across every SLAM branch.
            </Txt>
          </View>

          {!isOnline ? <OfflineNotice message={OFFLINE_MESSAGE} /> : null}

          <View style={styles.form}>
            <View style={styles.field}>
              <Eyebrow>Email</Eyebrow>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@slam.fit"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
                style={styles.input}
                accessibilityLabel="Email address"
                testID="login-email"
              />
            </View>

            <View style={styles.field}>
              <Eyebrow>Password</Eyebrow>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                style={styles.input}
                onSubmitEditing={submit}
                returnKeyType="go"
                accessibilityLabel="Password"
                testID="login-password"
              />
            </View>

            {error ? <Banner tone="danger">{error}</Banner> : null}

            <Button
              title="SIGN IN"
              size="lg"
              loading={busy}
              disabled={!canSubmit}
              onPress={submit}
              testID="login-submit"
            />
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
  header: { gap: spacing.sm },
  headline: { marginTop: spacing.lg },
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
  footer: { textAlign: 'center', lineHeight: 18 },
});
