/**
 * The account avatar and the menu behind it.
 *
 * Two ideas hold this together.
 *
 * First, **the role map is the permission boundary**. Rows are not rendered and
 * then hidden — a role's list is the only list that exists for it, so there is
 * no path by which a member is handed an owner row. Anything a role cannot do
 * is absent from its array, not conditionally suppressed inside a shared one.
 *
 * Second, **every row goes somewhere that already exists**. This menu creates no
 * routes. It is a faster way into screens the app already has, and where a
 * capability has no screen because the backend has no model for it, the row says
 * so rather than opening an apology.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';

import type { Role, User } from '../api/types';
import {
  Avatar,
  Badge,
  Button,
  Divider,
  HIT_TARGET,
  NavRow,
  Row,
  Sheet,
  Spacer,
  Stack,
  Text,
  color,
  space,
} from '../design';
import { useAuth } from '../store/AuthContext';

type IconName = keyof typeof Ionicons.glyphMap;

/* ------------------------------------------------------------------ labels */

const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  owner: 'Owner',
  branch_manager: 'Branch manager',
  trainer: 'Trainer',
  member: 'Member',
};

/* --------------------------------------------------------------- the rows */

export interface AccountRow {
  key: string;
  label: string;
  detail?: string;
  icon: IconName;
  /** An existing route. Omitted when the row opens something in place. */
  route?: string;
  /** Rows the backend cannot yet answer render quiet and do not navigate. */
  unavailable?: string;
}

/**
 * What each role can reach, and nothing more.
 *
 * Gym rows use gym icons — `business` for a branch, `barbell` for training —
 * rather than the generic glyphs a settings menu would use, because "which gym"
 * is the question an owner asks most often and it should be findable by shape.
 */
const ROWS: Record<Role, AccountRow[]> = {
  member: [
    {
      key: 'details',
      label: 'Account details',
      detail: 'Profile, security and preferences',
      icon: 'person-outline',
      route: '/(member)/profile',
    },
    {
      key: 'membership',
      label: 'My membership',
      detail: 'Plan, validity and sessions left',
      icon: 'card-outline',
      route: '/(member)/pt',
    },
    {
      key: 'attendance',
      label: 'Attendance',
      detail: 'Check-ins, streak and time in the gym',
      icon: 'footsteps-outline',
      route: '/(member)/visits',
    },
    {
      key: 'trainer',
      label: 'My trainer',
      detail: 'Who is coaching you, and what is next',
      icon: 'barbell-outline',
      route: '/(member)/pt',
    },
    {
      key: 'feedback',
      label: 'My feedback',
      detail: 'Ratings you left your trainers, and their status',
      icon: 'star-outline',
      route: '/(member)/reviews',
    },
    {
      key: 'alerts',
      label: 'Notifications',
      detail: 'Updates from your branch',
      icon: 'notifications-outline',
      route: '/(member)/alerts',
    },
  ],

  trainer: [
    {
      key: 'details',
      label: 'Account details',
      detail: 'Profile, PIN, security and preferences',
      icon: 'person-outline',
      route: '/(trainer)/profile',
    },
    {
      key: 'clients',
      label: 'My clients',
      detail: 'Everyone assigned to you',
      icon: 'people-outline',
      route: '/(trainer)/clients',
    },
    {
      key: 'sessions',
      label: "Today's sessions",
      detail: 'Your day, on the rail',
      icon: 'calendar-outline',
      route: '/(trainer)/sessions',
    },
    {
      key: 'availability',
      label: 'Availability',
      detail: 'Hours you can take PT',
      icon: 'time-outline',
      route: '/(trainer)/availability',
    },
    {
      key: 'alerts',
      label: 'Notifications',
      detail: 'Updates from your branch',
      icon: 'notifications-outline',
      route: '/(trainer)/alerts',
    },
  ],

  owner: ownerRows(),
  branch_manager: ownerRows(),
  super_admin: ownerRows(),
};

/**
 * Owner, branch manager and super admin share a menu.
 *
 * They differ in *scope*, not in capability, and the server already enforces
 * that scope — a branch manager's `/branches` returns one gym where an owner's
 * returns three. Giving them three near-identical arrays would be three places
 * to forget to change something.
 */
function ownerRows(): AccountRow[] {
  return [
    {
      key: 'details',
      label: 'Account details',
      detail: 'Profile, security and preferences',
      icon: 'person-outline',
      route: '/(owner)/profile',
    },
    {
      key: 'members',
      label: 'Members',
      detail: 'Journeys, PT and who is in the gym',
      icon: 'people-circle-outline',
      route: '/(owner)/members',
    },
    {
      key: 'trainers',
      label: 'Trainers',
      detail: 'The roster and how it is performing',
      icon: 'barbell-outline',
      route: '/(owner)/trainers',
    },
    {
      key: 'payments',
      label: 'Payments',
      detail: 'Collected and outstanding',
      icon: 'card-outline',
      route: '/(owner)/payments',
    },
    {
      key: 'broadcast',
      label: 'Send a broadcast',
      detail: 'Reach members or trainers with an announcement',
      icon: 'megaphone-outline',
      route: '/(owner)/broadcast',
    },
    {
      key: 'operations',
      label: 'Operations',
      detail: 'Business rules and automations',
      icon: 'construct-outline',
      route: '/(owner)/settings',
    },
    {
      key: 'alerts',
      label: 'Notifications',
      detail: 'Everything needing attention',
      icon: 'notifications-outline',
      route: '/(owner)/alerts',
    },
  ];
}

/** The rows this role may see. Exported so a test can assert the boundary. */
export function rowsForRole(role: Role): AccountRow[] {
  return ROWS[role] ?? ROWS.member;
}

/* ------------------------------------------------------------------- gyms */

/**
 * The gym block.
 *
 * `branches` is whatever `GET /branches` returned, which the server has already
 * scoped to this user — so "can this person see more than one gym" is answered
 * by its length and never guessed.
 *
 * There is deliberately no "Switch gym" action. GymFlow has no notion of a
 * selected branch: every endpoint scopes by role server-side, and an owner's
 * screens already show all three at once. A switcher would be a new feature
 * with a new backend contract, not a menu row, and one that appeared to work
 * while changing nothing would be worse than its absence.
 */
function GymBlock({ user, branchCount }: { user: User; branchCount: number | null }) {
  if (!user.branch && !branchCount) return null;

  return (
    <Stack gap="xs">
      <Row gap="sm">
        <Ionicons name="business-outline" size={18} color={color.textSecondary} />
        <Text variant="label" tone={color.textSecondary}>
          {user.branch ? user.branch.name : 'All SLAM branches'}
        </Text>
        <Spacer />
        {branchCount && branchCount > 1 ? (
          <Badge label={`${branchCount} gyms`} tone="info" />
        ) : null}
      </Row>
      {branchCount && branchCount > 1 ? (
        <Text variant="label" tone={color.textTertiary}>
          You can see every one of them. GymFlow scopes data by your role rather than by a selected
          gym, so there is nothing to switch between.
        </Text>
      ) : null}
    </Stack>
  );
}

/* ------------------------------------------------------------------ sheet */

export interface AccountSheetProps {
  visible: boolean;
  onClose: () => void;
  /** How many gyms `GET /branches` returned for this user, when known. */
  branchCount?: number | null;
}

/**
 * The account menu.
 *
 * Sign-out sits below a divider, in the destructive variant, behind a
 * confirmation — it is the one row in here that cannot be undone by pressing
 * back, and a mis-tap costs a password re-entry on the gym floor.
 */
export function AccountSheet({ visible, onClose, branchCount = null }: AccountSheetProps) {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const rows = useMemo(() => (user ? rowsForRole(user.role) : []), [user]);

  const go = useCallback(
    (row: AccountRow) => {
      if (!row.route) return;
      onClose();
      router.push(row.route as never);
    },
    [onClose, router],
  );

  const confirmSignOut = useCallback(() => {
    Alert.alert('Sign out?', 'You will need your password to sign back in.', [
      { text: 'Stay signed in', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          onClose();
          void signOut();
        },
      },
    ]);
  }, [onClose, signOut]);

  if (!user) return null;

  return (
    <Sheet visible={visible} onClose={onClose} testID="account-sheet">
      {/* Who, where and as what. Long names and long addresses truncate rather
          than pushing the badges off the row. */}
      <Row gap="md" style={styles.header}>
        <Avatar name={user.full_name} size={52} accent />
        <Stack gap="xxs" style={styles.grow}>
          <Text variant="heading" numberOfLines={1}>
            {user.full_name}
          </Text>
          <Text variant="label" tone={color.textTertiary} numberOfLines={1}>
            {user.email}
          </Text>
          {user.phone ? (
            <Text variant="label" tone={color.textTertiary} numberOfLines={1}>
              {user.phone}
            </Text>
          ) : null}
        </Stack>
      </Row>

      <Row gap="sm" wrap>
        <Badge label={ROLE_LABEL[user.role] ?? user.role} tone="brand" solid />
        {user.branch ? <Badge label={user.branch.name} tone="info" /> : null}
      </Row>

      <GymBlock user={user} branchCount={branchCount} />

      <Divider />

      {rows.map((row) => (
        <NavRow
          key={row.key}
          label={row.label}
          detail={row.unavailable ?? row.detail}
          icon={row.icon}
          testID={`account-${row.key}`}
          onPress={() => go(row)}
          trailing={row.unavailable ? <Badge label="Not available" tone="neutral" /> : undefined}
        />
      ))}

      <Divider />

      <Button
        title="Sign out"
        variant="destructive"
        icon="log-out-outline"
        onPress={confirmSignOut}
        testID="account-sign-out"
      />
    </Sheet>
  );
}

/* ----------------------------------------------------------------- avatar */

/**
 * The avatar, wherever an identity is already on screen.
 *
 * It owns its own sheet so a screen adds one element and gets the whole menu —
 * the alternative is every screen holding the open/closed state for something
 * it does not otherwise care about.
 */
export function AccountAvatar({
  size = 40,
  branchCount = null,
  testID = 'account-avatar',
}: {
  size?: number;
  branchCount?: number | null;
  testID?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  // The avatar keeps its visual size; the Pressable is padded out to a full
  // HIT_TARGET (48) box, centred, so the tap target meets the minimum on a
  // gym floor without the circle itself growing. `hitSlop` covers any sub-48
  // size and adds a little forgiveness on top.
  const slop = Math.max(space.xs, Math.ceil((HIT_TARGET - size) / 2));

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Account: ${user.full_name}`}
        accessibilityHint="Opens your account menu"
        hitSlop={slop}
        testID={testID}
        style={({ pressed }) => [styles.avatarTap, pressed ? styles.pressed : null]}
      >
        <Avatar name={user.full_name} size={size} accent />
      </Pressable>

      <AccountSheet visible={open} onClose={() => setOpen(false)} branchCount={branchCount} />
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  header: { paddingTop: space.sm },
  pressed: { opacity: 0.7 },
  avatarTap: {
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
