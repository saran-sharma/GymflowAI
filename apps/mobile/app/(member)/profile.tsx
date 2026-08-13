/** Member profile, plus the screens that are not tabs. */

import React from 'react';

import { ProfilePanel } from '../../src/components/ProfilePanel';

export default function MemberProfileScreen() {
  return (
    <ProfilePanel
      links={[
        { label: 'Group classes', detail: 'See and reply to class announcements', icon: 'people-outline', route: '/(member)/classes' },
        { label: 'Updates', detail: 'Your in-app alerts', icon: 'notifications-outline', route: '/(member)/alerts' },
        { label: 'Gym visits', detail: 'Your check-in history', icon: 'footsteps-outline', route: '/(member)/visits' },
      ]}
    />
  );
}
