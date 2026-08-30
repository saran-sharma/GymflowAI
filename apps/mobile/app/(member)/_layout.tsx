/**
 * Member navigation: HOME, WORKOUT, PT, PROGRESS.
 *
 * Four tabs, matching the member's actual journey. Account is reached from the
 * initials avatar in the top-right of Home instead of occupying a tab of its
 * own — the account menu (`AccountSheet`) already surfaces attendance,
 * membership, trainer and notifications, so nothing that worked before lost
 * its route.
 */

import { Tabs } from 'expo-router';
import React from 'react';

import { renderTabBar, roleAccent, tabIcon, tabScreenOptions } from '../../src/design';

export default function MemberLayout() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={renderTabBar(roleAccent.member)}
      screenOptions={tabScreenOptions({ accent: roleAccent.member })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="workout" options={{ title: 'Workout', tabBarIcon: tabIcon('barbell') }} />
      <Tabs.Screen name="pt" options={{ title: 'PT', tabBarIcon: tabIcon('person') }} />
      <Tabs.Screen
        name="progress"
        options={{ title: 'Progress', tabBarIcon: tabIcon('stats-chart') }}
      />
      {/* First-run only: shown by a redirect from Home when the member has no
          saved intake yet. Never a tab. */}
      <Tabs.Screen name="onboarding" options={{ href: null }} />
      {/* Reached from the account avatar/sheet on Home, not a tab of its own. */}
      <Tabs.Screen name="profile" options={{ href: null }} />
      {/* Reached from home and from the account sheet, not tabs of their own. */}
      <Tabs.Screen name="classes" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="visits" options={{ href: null }} />
      {/* Pushed from the workout chart while a member is mid-set. */}
      <Tabs.Screen name="exercise/[itemId]" options={{ href: null }} />
      {/* Pushed from Progress's compact strength rows. */}
      <Tabs.Screen name="progress-exercise" options={{ href: null }} />
    </Tabs>
  );
}
