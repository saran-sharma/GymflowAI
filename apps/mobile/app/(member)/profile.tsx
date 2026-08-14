/**
 * More — everything a member needs occasionally.
 *
 * Only routes that exist are listed. Diet, medical notes, challenges, rewards
 * and wearables have no data source in GymFlow yet, and a menu row that opens
 * an apology is worse than no row at all.
 */

import React from 'react';

import { ProfilePanel } from '../../src/components/ProfilePanel';

export default function MemberMoreScreen() {
  return (
    <ProfilePanel
      links={[
        {
          label: 'Attendance',
          detail: 'Your check-ins, streak and time in the gym',
          icon: 'footsteps-outline',
          route: '/(member)/visits',
        },
        {
          label: 'Group classes',
          detail: 'See and reply to class announcements',
          icon: 'people-outline',
          route: '/(member)/classes',
        },
        {
          label: 'Updates',
          detail: 'Your in-app alerts',
          icon: 'notifications-outline',
          route: '/(member)/alerts',
        },
      ]}
    />
  );
}
