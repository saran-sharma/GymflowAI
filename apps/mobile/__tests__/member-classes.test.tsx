/**
 * Group classes, on the member's own design system.
 *
 * This screen used to be built on `src/components/ui` and `src/theme` — the
 * legacy system every other Trainer/Owner screen not yet migrated still uses —
 * while every other Member screen had already moved to `src/design`. It was
 * the one place in Member that looked like a different app: different type,
 * different colour tokens, no dark-mode support. These tests pin the RSVP
 * behaviour through the migration, not just the visuals.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import MemberClassesScreen from '../app/(member)/classes';
import type { GroupClass } from '../src/api/types';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockList = jest.fn();
const mockRsvp = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  listClasses: (...a: unknown[]) => mockList(...a),
  rsvpClass: (...a: unknown[]) => mockRsvp(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function aClass(partial: Partial<GroupClass> = {}): GroupClass {
  return {
    id: 1,
    branch_id: 1,
    branch_name: 'SLAM Nagalkeni',
    trainer_id: 5,
    trainer_name: 'Kiran Prasad',
    name: 'Sunrise HIIT',
    description: null,
    starts_at: '2026-08-22T06:00:00Z',
    ends_at: null,
    class_date: '2026-08-22',
    capacity: 20,
    status: 'scheduled',
    announcement: null,
    yes_count: 5,
    no_count: 1,
    pending_count: 14,
    attended_count: 0,
    available: 15,
    show_up_pct: 0,
    my_response: null,
    ...partial,
  };
}

async function open() {
  const result = render(<MemberClassesScreen />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([aClass()]);
  mockRsvp.mockResolvedValue(aClass({ my_response: 'yes' }));
});

describe('answering a class', () => {
  it('sends yes and refreshes', async () => {
    await open();
    await act(async () => {
      fireEvent.press(screen.getByText('Yes'));
    });
    expect(mockRsvp).toHaveBeenCalledWith(1, 'yes', 'token');
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('marks a class the member has not answered as needing a reply', async () => {
    await open();
    expect(screen.getByText('Reply')).toBeTruthy();
  });

  it('shows the member as going once they have said yes', async () => {
    mockList.mockResolvedValue([aClass({ my_response: 'yes' })]);
    await open();
    expect(screen.getByText('Going')).toBeTruthy();
  });
});

describe('a full class', () => {
  it('disables Yes and explains why', async () => {
    mockList.mockResolvedValue([aClass({ available: 0 })]);
    await open();
    expect(screen.getByText('This class is full.')).toBeTruthy();
    expect(screen.getByLabelText('Yes').props.accessibilityState.disabled).toBe(true);
  });

  it('still lets a member already going change their answer', async () => {
    mockList.mockResolvedValue([aClass({ available: 0, my_response: 'yes' })]);
    await open();
    expect(screen.getByLabelText('Yes').props.accessibilityState.disabled).toBeFalsy();
  });
});

describe('no classes scheduled', () => {
  it('says so plainly', async () => {
    mockList.mockResolvedValue([]);
    await open();
    expect(screen.getByText('No classes scheduled')).toBeTruthy();
  });
});
