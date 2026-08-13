/** Owner profile, and the doors to everything that is not a tab. */

import React from 'react';

import { ProfilePanel } from '../../src/components/ProfilePanel';

export default function OwnerProfileScreen() {
  return (
    <ProfilePanel
      links={[
        { label: 'Branch performance', detail: 'Compare all three SLAM branches', icon: 'stats-chart-outline', route: '/(owner)/performance' },
        { label: 'Members', detail: 'Journey progress and PT activity', icon: 'people-circle-outline', route: '/(owner)/members' },
        { label: 'PT opportunities', detail: 'Members who finished Day 45', icon: 'trophy-outline', route: '/(owner)/opportunities' },
        { label: 'Group classes', detail: 'Announce classes and see turnout', icon: 'people-outline', route: '/(owner)/classes' },
        { label: 'Corrections', detail: 'Approve attendance exceptions', icon: 'create-outline', route: '/(owner)/corrections' },
        { label: 'Alerts', detail: 'Everything needing attention', icon: 'notifications-outline', route: '/(owner)/alerts' },
        { label: 'Settings', detail: 'Business rules and automations', icon: 'settings-outline', route: '/(owner)/settings' },
      ]}
    />
  );
}
