/**
 * Account — the member's personal area.
 *
 * `ProfilePanel` owns identity, preferences, security and support; the rows
 * below are the Activity section, and they are only the ones a member can
 * actually reach. Diet, medical notes, challenges, rewards and wearables have
 * no data source in GymFlow yet, and a row that opens an apology is worse than
 * no row at all.
 */

import React from 'react';

import { ProfilePanel } from '../../src/components/ProfilePanel';

export default function MemberAccountScreen() {
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
          label: 'My membership and PT',
          detail: 'Plan, sessions remaining and your trainer',
          icon: 'card-outline',
          route: '/(member)/pt',
        },
        {
          label: 'Progress',
          detail: 'Your workouts, sessions and measurements',
          icon: 'stats-chart-outline',
          route: '/(member)/progress',
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
