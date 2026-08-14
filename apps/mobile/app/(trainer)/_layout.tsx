/**
 * Trainer navigation: DESK, CLIENTS, SESSIONS, ATTENDANCE, MORE.
 *
 * The desk is what a trainer opens the app for — their day, their clients and
 * where they stand on the incentive. The scanner, PT split view, availability,
 * client detail, corrections, classes and updates are pushed over the tabs
 * rather than competing for a slot.
 */

import { Tabs } from 'expo-router';
import React from 'react';

import { tabIcon, tabScreenOptions } from '../../src/design';

export default function TrainerLayout() {
  return (
    <Tabs screenOptions={tabScreenOptions({ compact: true })}>
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
      <Tabs.Screen
        name="profile"
        options={{ title: 'More', tabBarIcon: tabIcon('ellipsis-horizontal') }}
      />
      {/* Reached from the desk and from More, not tabs of their own. */}
      <Tabs.Screen name="scan" options={{ href: null }} />
      <Tabs.Screen name="availability" options={{ href: null }} />
      <Tabs.Screen name="corrections" options={{ href: null }} />
      <Tabs.Screen name="classes" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="pt/[id]" options={{ href: null }} />
      <Tabs.Screen name="client/[id]" options={{ href: null }} />
    </Tabs>
  );
}
