/**
 * The account menu's permission boundary, and the things that must not regress.
 *
 * The role map is the boundary — a role's array is the only array that exists
 * for it, so these tests assert absence rather than that something is hidden.
 * A row a member cannot use should not be in a member's list at all, because a
 * row that is merely hidden is one refactor away from being visible.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { AccountAvatar, AccountSheet, rowsForRole } from '../src/components/account';
import type { Role, User } from '../src/api/types';
import { HIT_TARGET } from '../src/design';

// jest hoists jest.mock above these declarations, so anything the factory
// closes over has to be `mock`-prefixed to be allowed out of scope.
const mockSignOut = jest.fn();
const mockPush = jest.fn();
let mockUser: User | null = null;

jest.mock('../src/store/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    signOut: mockSignOut,
    withToken: jest.fn(),
    refreshUser: jest.fn(),
    status: 'authenticated',
  }),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

function asUser(role: Role, overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'aditya.rao@member.slam.demo',
    full_name: 'Aditya Rao',
    phone: null,
    role,
    branch_id: 1,
    branch: { id: 1, name: 'SLAM Nagalkeni', code: 'NGK' },
    has_pin: false,
    ...overrides,
  } as User;
}

async function draw(element: React.ReactElement) {
  const result = render(element);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
});

describe('the role map is the permission boundary', () => {
  const keys = (role: Role) => rowsForRole(role).map((row) => row.key);

  it('gives a member nothing an owner has', () => {
    const member = keys('member');
    expect(member).toContain('membership');
    expect(member).toContain('attendance');
    for (const forbidden of ['members', 'trainers', 'payments', 'operations']) {
      expect(member).not.toContain(forbidden);
    }
  });

  it('gives a trainer their clients but not the owner controls', () => {
    const trainer = keys('trainer');
    expect(trainer).toContain('clients');
    expect(trainer).toContain('sessions');
    for (const forbidden of ['members', 'payments', 'operations', 'membership']) {
      expect(trainer).not.toContain(forbidden);
    }
  });

  it('keeps shift out of the trainer menu, as the desk brief required', () => {
    expect(keys('trainer')).not.toContain('shift');
  });

  it('gives owner, branch manager and super admin the same menu', () => {
    expect(keys('branch_manager')).toEqual(keys('owner'));
    expect(keys('super_admin')).toEqual(keys('owner'));
  });

  it('never offers an owner an InBody row', () => {
    expect(keys('owner')).not.toContain('inbody');
  });

  it('points every row at a route rather than a dead end', () => {
    for (const role of ['member', 'trainer', 'owner'] as Role[]) {
      for (const row of rowsForRole(role)) {
        expect(row.route ?? row.unavailable).toBeTruthy();
      }
    }
  });
});

describe('the account sheet', () => {
  it('shows who is signed in, from the session rather than a constant', async () => {
    mockUser = asUser('member', { phone: '+91 90000 00000' });
    await draw(<AccountSheet visible onClose={jest.fn()} />);
    expect(screen.getByText('Aditya Rao')).toBeTruthy();
    expect(screen.getByText('aditya.rao@member.slam.demo')).toBeTruthy();
    expect(screen.getByText('+91 90000 00000')).toBeTruthy();
    // The branch shows twice on purpose — as the badge beside the role, and
    // again in the gym block, which is the row an owner scans for.
    expect(screen.getAllByText('SLAM Nagalkeni').length).toBeGreaterThan(0);
  });

  it('renders a member menu without any owner row', async () => {
    mockUser = asUser('member');
    await draw(<AccountSheet visible onClose={jest.fn()} />);
    expect(screen.getByTestId('account-membership')).toBeTruthy();
    expect(screen.queryByTestId('account-payments')).toBeNull();
    expect(screen.queryByTestId('account-operations')).toBeNull();
  });

  it('navigates to an existing route and closes behind itself', async () => {
    mockUser = asUser('member');
    const onClose = jest.fn();
    await draw(<AccountSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByTestId('account-attendance'));
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/(member)/visits');
  });

  it('asks before signing out, and does not sign out until confirmed', async () => {
    mockUser = asUser('member');
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await draw(<AccountSheet visible onClose={jest.fn()} />);

    fireEvent.press(screen.getByTestId('account-sign-out'));
    expect(spy).toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();

    // Take the destructive button the alert offered and press it.
    const buttons = spy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Sign out')?.onPress?.();
    expect(mockSignOut).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('says how many gyms are visible, and does not offer to switch between them', async () => {
    mockUser = asUser('owner', { branch: null, branch_id: null });
    await draw(<AccountSheet visible onClose={jest.fn()} branchCount={3} />);
    expect(screen.getByText('3 gyms')).toBeTruthy();
    expect(screen.queryByText(/Switch gym/i)).toBeNull();
  });

  it('renders nothing when there is no session', async () => {
    mockUser = null;
    const { toJSON } = await draw(<AccountSheet visible onClose={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });
});

describe('the account avatar tap target', () => {
  it('is at least HIT_TARGET on a side, whatever the visual avatar size', async () => {
    mockUser = asUser('trainer');
    await draw(<AccountAvatar size={40} />); // the smallest size any screen uses

    const { flatten } = require('react-native').StyleSheet;
    const style = flatten(screen.getByTestId('account-avatar').props.style) as {
      minWidth?: number;
      minHeight?: number;
    };
    expect(style.minWidth).toBeGreaterThanOrEqual(HIT_TARGET);
    expect(style.minHeight).toBeGreaterThanOrEqual(HIT_TARGET);
    // hitSlop is still present as extra forgiveness on top of the box.
    expect(screen.getByTestId('account-avatar').props.hitSlop).toBeDefined();
  });
});
