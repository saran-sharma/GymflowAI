/** Trainer profile: identity, check-in PIN, and the screens that are not tabs. */

import React from 'react';

import { ProfilePanel } from '../../src/components/ProfilePanel';

export default function TrainerProfileScreen() {
  return (
    <ProfilePanel
      showPin
      links={[
        { label: 'Corrections', detail: 'Appeal a late mark or missing check-out', icon: 'create-outline', route: '/(trainer)/corrections' },
        { label: 'Group classes', detail: 'Rosters and class attendance', icon: 'people-outline', route: '/(trainer)/classes' },
        { label: 'Updates', detail: 'Your in-app alerts', icon: 'notifications-outline', route: '/(trainer)/alerts' },
      ]}
    />
  );
}
