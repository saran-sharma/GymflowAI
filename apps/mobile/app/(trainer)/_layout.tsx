/**
 * Trainer navigation: DESK, CLIENTS, SESSIONS, ATTENDANCE.
 *
 * The desk is what a trainer opens the app for — the floor, their day, their
 * clients and where they stand on the incentive. Shift check-in, the scanner,
 * PT split view, availability, client detail, corrections, classes and updates
 * are pushed over the tabs rather than competing for a slot. Account is
 * reached from the initials avatar in the top-right of the desk instead.
 *
 * Every non-tab route is declared with `href: null` on purpose. A file under
 * this directory that is not listed becomes a tab of its own, which is how a
 * screen nobody meant to promote ends up in the bottom bar.
 */

import { Tabs } from 'expo-router';
import React from 'react';

import { renderTabBar, roleAccent, tabIcon, tabScreenOptions } from '../../src/design';

export default function TrainerLayout() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={renderTabBar(roleAccent.trainer)}
      screenOptions={tabScreenOptions({ compact: true, accent: roleAccent.trainer })}
    >
      <Tabs.Screen name="index" options={{ title: 'Desk', tabBarIcon: tabIcon('grid') }} />
      <Tabs.Screen name="clients" options={{ title: 'Clients', tabBarIcon: tabIcon('people') }} />
      <Tabs.Screen
        name="sessions"
        options={{ title: 'Sessions', tabBarIcon: tabIcon('barbell') }}
      />
      <Tabs.Screen
        name="attendance"
        options={{ title: 'Attendance', tabBarIcon: tabIcon('time') }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
      {/* Reached from the desk and from the account sheet, not tabs of their own. */}
      <Tabs.Screen name="shift" options={{ href: null }} />
      <Tabs.Screen name="scan" options={{ href: null }} />
      <Tabs.Screen name="availability" options={{ href: null }} />
      <Tabs.Screen name="corrections" options={{ href: null }} />
      <Tabs.Screen name="classes" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="pt/[id]" options={{ href: null }} />
      <Tabs.Screen name="client/[id]" options={{ href: null }} />
      <Tabs.Screen name="plan/[id]" options={{ href: null }} />
      {/* The pre-templates PPL split-by-split editor. No longer linked from
          the UI (Edit programming now opens plan/[id]) but left reachable
          so an existing 45-day-journey member's WorkoutPlan can still be
          edited directly if ever needed. */}
      <Tabs.Screen name="plan-legacy/[id]" options={{ href: null }} />
      <Tabs.Screen name="plan-day/[dayId]" options={{ href: null }} />
      <Tabs.Screen name="templates" options={{ href: null }} />
      <Tabs.Screen name="template-preview/[templateId]" options={{ href: null }} />
    </Tabs>
  );
}
