/**
 * "How are you using GymFlow?" — the first screen anyone sees, before login.
 *
 * The tapped role is passed to `/(auth)/login` as `expected` — **context
 * only**. It is never sent to the server, never influences the API call, and
 * never grants anything. All it does is let the login screen say "this is a
 * Member account" if you picked Owner and signed in with a member's
 * credentials. The authoritative role is always `user.role` from the
 * authenticated backend session (`homeRouteForRole` in `index.tsx`); a
 * mismatch is refused, not honoured.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Row, Screen, SlamLogo, Stack, Text, color, space } from '../../src/design';

type ExpectedRole = 'member' | 'trainer' | 'owner';

const OPTIONS: { label: string; icon: string; expected: ExpectedRole }[] = [
  { label: "I'm a Member", icon: '🏋️', expected: 'member' },
  { label: "I'm a Trainer", icon: '🎯', expected: 'trainer' },
  { label: "I'm a Gym Owner", icon: '📊', expected: 'owner' },
];

export default function RoleSelectScreen() {
  const router = useRouter();

  const continueToLogin = (expected: ExpectedRole) =>
    router.push({ pathname: '/(auth)/login', params: { expected } });

  return (
    <Screen edges={['top', 'bottom']} background="auth">
      <View style={styles.container}>
        <Stack gap="xl" style={styles.hero}>
          <Row gap="md" align="center">
            <SlamLogo width={96} />
            <Text style={styles.wordmark}>GymFlow</Text>
          </Row>
          <Text accessibilityRole="header" style={styles.question}>
            How are you using GymFlow?
          </Text>
        </Stack>

        <Stack gap="md" style={styles.options}>
          {OPTIONS.map((option) => (
            <Button
              key={option.label}
              title={`${option.icon}  ${option.label}`}
              size="lg"
              variant="secondary"
              onPress={() => continueToLogin(option.expected)}
              accessibilityLabel={option.label}
              style={styles.optionButton}
            />
          ))}
        </Stack>

        <Text variant="label" tone={color.textTertiary} style={styles.footnote}>
          This only helps us show you the right screen. Your account role is always confirmed
          when you sign in.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
  },
  hero: { alignItems: 'center', marginTop: space.xl },
  wordmark: { fontSize: 28, fontWeight: '700', color: color.text },
  question: { fontSize: 20, fontWeight: '600', color: color.text, textAlign: 'center' },
  options: { marginBottom: space.md },
  optionButton: { width: '100%' },
  footnote: { textAlign: 'center' },
});
