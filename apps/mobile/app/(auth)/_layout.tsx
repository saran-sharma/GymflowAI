import { Stack } from 'expo-router';
import React from 'react';

import { color } from '../../src/design';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background } }}
    />
  );
}
