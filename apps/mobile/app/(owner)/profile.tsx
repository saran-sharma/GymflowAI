/** Account — the owner's profile, and the doors to everything that is not a tab. */

import React from 'react';

import { ProfilePanel } from '../../src/components/ProfilePanel';

export default function OwnerAccountScreen() {
  return (
    <ProfilePanel
      links={[
        {
          label: 'Payments',
          detail: 'Outstanding charges and what has come in',
          icon: 'card-outline',
          route: '/(owner)/payments',
        },
        {
          label: 'Incentives',
          detail: 'Who qualified this cycle',
          icon: 'ribbon-outline',
          route: '/(owner)/incentives',
        },
        {
          label: 'Branch performance',
          detail: 'Compare all three SLAM branches',
          icon: 'stats-chart-outline',
          route: '/(owner)/performance',
        },
        {
          label: 'PT opportunities',
          detail: 'Members who finished Day 45',
          icon: 'trophy-outline',
          route: '/(owner)/opportunities',
        },
        {
          label: 'Group classes',
          detail: 'Announce classes and see turnout',
          icon: 'people-outline',
          route: '/(owner)/classes',
        },
        {
          label: 'Corrections',
          detail: 'Approve attendance exceptions',
          icon: 'create-outline',
          route: '/(owner)/corrections',
        },
        {
          label: 'Alerts',
          detail: 'Everything needing attention',
          icon: 'notifications-outline',
          route: '/(owner)/alerts',
        },
        {
          label: 'Operations',
          detail: 'Business rules and automations',
          icon: 'construct-outline',
          route: '/(owner)/settings',
        },
      ]}
    />
  );
}
