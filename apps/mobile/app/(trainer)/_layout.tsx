/**
 * Trainer navigation: SHIFT, ATTENDANCE, SESSIONS, PROFILE.
 *
 * The scanner, PT split view, corrections, classes and updates are pushed over
 * the tabs rather than competing for a slot — the shift is what a trainer opens
 * the app for.
 */

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

import { colors, spacing } from '../../src/theme';

export default function TrainerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: spacing.sm,
          paddingTop: spacing.sm,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Shift',
          tabBarIcon: ({ color, size }) => <Ionicons name="flash" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Pushed over the tabs, not tabs of their own. */}
      <Tabs.Screen name="scan" options={{ href: null }} />
      <Tabs.Screen name="corrections" options={{ href: null }} />
      <Tabs.Screen name="classes" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="pt/[id]" options={{ href: null }} />
    </Tabs>
  );
}
