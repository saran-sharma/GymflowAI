/** Entry point. Sends each role to the app built for it. */

import { Redirect } from 'expo-router';
import React from 'react';

import { Loading } from '../src/components/ui';
import { homeRouteForRole, useAuth } from '../src/store/AuthContext';

export default function Index() {
  const { status, user } = useAuth();

  if (status === 'loading') return <Loading label="Starting GymFlow" />;
  if (status === 'anonymous' || !user) return <Redirect href="/(auth)/login" />;
  return <Redirect href={homeRouteForRole(user.role) as never} />;
}
