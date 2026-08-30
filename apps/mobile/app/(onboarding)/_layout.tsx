/**
 * The first-run onboarding group — outside the role tab navigators on
 * purpose. A member with no `MemberIntake` is redirected here from
 * `(member)/index.tsx`; finishing (or skipping) navigates into `/(member)`.
 * Keeping it its own navigator makes that hop a clean group-to-group
 * `replace`, and keeps required onboarding separate from the later
 * profile / health-readiness assessment.
 */
import { Stack } from 'expo-router';
import React from 'react';

import { colors } from '../../src/theme';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
