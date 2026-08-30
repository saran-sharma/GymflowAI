/**
 * "Share progress" — user-initiated, branded, via the OS share sheet.
 *
 * What matters: it records the share server-side first, only the fields the
 * member switched on reach the card, the card is captured and handed to the
 * OS share sheet (never auto-posted), and the disclaimer about withheld
 * personal data is shown.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { captureRef } from 'react-native-view-shot';

import type { ProgressPhoto } from '../src/api/types';
import { ShareProgress } from '../src/components/share-progress';

const mockShare = jest.fn();
jest.mock('../src/api/endpoints', () => ({ shareProgress: (...a: unknown[]) => mockShare(...a) }));

const withToken = (fn: (t: string) => Promise<unknown>) => fn('token');
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => ({ withToken }) }));

function aPhoto(partial: Record<string, unknown> = {}): ProgressPhoto {
  return {
    id: 1,
    member_id: 3,
    angle: 'front',
    taken_on: '2026-05-01',
    note: null,
    width: 1,
    height: 1,
    content_type: 'image/jpeg',
    byte_size: 10,
    trainer_visible: false,
    owner_visible: false,
    image_url: '/api/v1/progress-photos/1/image?token=abc',
    created_at: '2026-05-01T09:00:00Z',
    ...partial,
  } as ProgressPhoto;
}

const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockShare.mockResolvedValue({
    share_id: 9,
    template: 'slam_default',
    brand: { studio: 'SLAM', product: 'GymFlow' },
    caption: '',
    photo_url: '/api/v1/progress-photos/1/image?token=x',
    compare_photo_url: '/api/v1/progress-photos/2/image?token=y',
    included: { date: '30 Jul 2026', period: '12 weeks' },
  });
});

async function draw(compare = true) {
  const r = render(
    <ShareProgress
      visible
      onClose={onClose}
      photo={aPhoto()}
      comparePhoto={compare ? aPhoto({ id: 2, taken_on: '2026-07-30' }) : null}
    />,
  );
  await act(async () => {});
  return r;
}

it('renders the branded card and the withheld-data disclaimer', async () => {
  await draw();
  expect(screen.getByTestId('share-progress-card')).toBeTruthy();
  expect(screen.getByText(/Your name, contact details, member id and any/)).toBeTruthy();
});

it('records the share, then captures the card and opens the OS share sheet', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('share-progress-confirm'));

  await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));
  expect(mockShare).toHaveBeenCalledWith(
    expect.objectContaining({ photo_id: 1, compare_photo_id: 2, include_date: true }),
    'token',
  );
  await waitFor(() => expect(captureRef).toHaveBeenCalled());
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///tmp/share-card.jpg', expect.any(Object)));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it('only sends the fields the member left switched on', async () => {
  await draw();
  fireEvent(screen.getByTestId('share-toggle-date'), 'valueChange', false);
  fireEvent(screen.getByTestId('share-toggle-period'), 'valueChange', false);
  fireEvent.press(screen.getByTestId('share-progress-confirm'));
  await waitFor(() => expect(mockShare).toHaveBeenCalled());
  expect(mockShare.mock.calls[0][0]).toEqual(
    expect.objectContaining({ include_date: false, include_period: false }),
  );
});

it('shows the computed period label the server returned on the card', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('share-progress-confirm'));
  await waitFor(() => expect(screen.getByTestId('share-card-period')).toBeTruthy());
  expect(screen.getByText('12 weeks')).toBeTruthy();
});

it('a single photo (no comparison) has no period toggle', async () => {
  await draw(false);
  expect(screen.queryByTestId('share-toggle-period')).toBeNull();
  expect(screen.getByTestId('share-toggle-date')).toBeTruthy();
});
