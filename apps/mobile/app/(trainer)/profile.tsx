import React from 'react';

import { ProfilePanel } from '../../src/components/ProfilePanel';

/** Trainers manage the PIN they use to check in, so the panel shows it. */
export default function TrainerProfileScreen() {
  return <ProfilePanel showPin />;
}
