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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Card,
  Divider,
  NavRow,
  Screen,
  SlamLogo,
  Stack,
  Text,
  color,
  space,
} from '../../src/design';

type ExpectedRole = 'member' | 'trainer' | 'owner';

const OPTIONS: {
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  expected: ExpectedRole;
}[] = [
  {
    label: "I'm a Member",
    detail: 'Today’s workout, PT and your progress',
    icon: 'person-outline',
    expected: 'member',
  },
  {
    label: "I'm a Trainer",
    detail: 'Your shift, clients and sessions',
    icon: 'clipboard-outline',
    expected: 'trainer',
  },
  {
    label: "I'm a Gym Owner",
    detail: 'Accountability and what needs attention',
    icon: 'bar-chart-outline',
    expected: 'owner',
  },
];

export default function RoleSelectScreen() {
  const router = useRouter();

  const continueToLogin = (expected: ExpectedRole) =>
    router.push({ pathname: '/(auth)/login', params: { expected } });

  return (
    <Screen edges={['top', 'bottom']} background="auth">
      <View style={styles.container}>
        <Stack gap="xl">
          <Stack gap="sm">
            <SlamLogo width={132} />
            <Text variant="caption" caps tone={color.textTertiary}>
              GymFlow
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text variant="title" accessibilityRole="header">
              How are you{'\n'}using GymFlow?
            </Text>
            <Text variant="body" tone={color.textSecondary}>
              Pick the app built for you. You’ll still sign in to your own account.
            </Text>
          </Stack>
        </Stack>

        <Card gap="none" style={styles.list}>
          {OPTIONS.map((option, index) => (
            <React.Fragment key={option.expected}>
              {index > 0 ? <Divider /> : null}
              <NavRow
                label={option.label}
                detail={option.detail}
                icon={option.icon}
                onPress={() => continueToLogin(option.expected)}
                testID={`role-${option.expected}`}
              />
            </React.Fragment>
          ))}
        </Card>

        {/* Fine print sits under the list; the editorial photo fills the rest of
            the viewport rather than a pinned footnote with a gap above it. */}
        <Text variant="label" tone={color.textTertiary}>
          This only helps us show you the right screen. Your account role is always confirmed when
          you sign in.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
    paddingBottom: space.xl,
    gap: space.xl,
  },
  list: { paddingVertical: space.xs },
});
