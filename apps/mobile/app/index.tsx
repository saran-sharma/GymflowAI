/**
 * Entry point. Sends each role to the app built for it.
 *
 * The one frame before that decision is the first thing anyone sees, so it is
 * drawn from the design system rather than the legacy component set — the
 * handover from the native splash into the app should not change colour.
 */

import { Redirect } from 'expo-router';
import React from 'react';

import { Loading } from '../src/design';
import { homeRouteForRole, useAuth } from '../src/store/AuthContext';

export default function Index() {
  const { status, user } = useAuth();

  if (status === 'loading') return <Loading label="Starting GymFlow" />;
  if (status === 'anonymous' || !user) return <Redirect href="/(auth)/role-select" />;
  return <Redirect href={homeRouteForRole(user.role) as never} />;
}
