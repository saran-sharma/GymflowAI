/**
 * Owner navigation: DASHBOARD, MEMBERS, TRAINERS, MARKETING, MORE.
 *
 * Members is promoted to a tab because it is the list an owner opens most
 * after the dashboard. Incentives, performance, classes, corrections, PT
 * opportunities, alerts and settings live under MORE.
 *
 * There is no Revenue tab and no InBody tab. Neither has a data source — no
 * billing model, and nothing writes body composition — and a tab that opens
 * onto an apology is worse than no tab.
 */

import { Tabs } from 'expo-router';
import React from 'react';

import { renderTabBar, roleAccent, tabIcon, tabScreenOptions } from '../../src/design';

export default function OwnerLayout() {
  return (
    <Tabs
      backBehavior="history"
      tabBar={renderTabBar(roleAccent.owner)}
      screenOptions={tabScreenOptions({ compact: true, accent: roleAccent.owner })}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid') }} />
      <Tabs.Screen
        name="members"
        options={{ title: 'Members', tabBarIcon: tabIcon('people-circle') }}
      />
      <Tabs.Screen name="trainers" options={{ title: 'Trainers', tabBarIcon: tabIcon('people') }} />
      <Tabs.Screen
        name="marketing"
        options={{ title: 'Marketing', tabBarIcon: tabIcon('megaphone') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Account', tabBarIcon: tabIcon('person-circle') }}
      />
      {/* Pushed on top of the tabs. */}
      <Tabs.Screen name="branch/[id]" options={{ href: null }} />
      <Tabs.Screen name="trainer/[id]" options={{ href: null }} />
      <Tabs.Screen name="member/[id]" options={{ href: null }} />
      <Tabs.Screen name="marketing/[source]" options={{ href: null }} />
      <Tabs.Screen name="broadcast" options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="incentives" options={{ href: null }} />
      <Tabs.Screen name="performance" options={{ href: null }} />
      <Tabs.Screen name="classes" options={{ href: null }} />
      <Tabs.Screen name="corrections" options={{ href: null }} />
      <Tabs.Screen name="opportunities" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
