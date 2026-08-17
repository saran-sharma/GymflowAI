/**
 * Member navigation: HOME, WORKOUT, PT, PROGRESS, MORE.
 *
 * Five tabs, matching the member's actual journey. Attendance, classes,
 * updates and settings live under MORE rather than competing with the four
 * things a member opens the app to do — nothing that worked before was removed
 * without a route to reach it.
 */

import { Tabs } from 'expo-router';
import React from 'react';

import { roleAccent, tabIcon, tabScreenOptions } from '../../src/design';

export default function MemberLayout() {
  return (
    <Tabs screenOptions={tabScreenOptions({ accent: roleAccent.member })}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="workout" options={{ title: 'Workout', tabBarIcon: tabIcon('barbell') }} />
      <Tabs.Screen name="pt" options={{ title: 'PT', tabBarIcon: tabIcon('person') }} />
      <Tabs.Screen
        name="progress"
        options={{ title: 'Progress', tabBarIcon: tabIcon('stats-chart') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Account', tabBarIcon: tabIcon('person-circle') }}
      />
      {/* Reached from home and from More, not tabs of their own. */}
      <Tabs.Screen name="classes" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="visits" options={{ href: null }} />
    </Tabs>
  );
}
