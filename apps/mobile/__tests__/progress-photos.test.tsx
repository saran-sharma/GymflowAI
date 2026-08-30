/**
 * Member → Progress Photos.
 *
 * What matters: photos load and render, "Add photo" -> pick -> upload calls
 * the multipart endpoint with the chosen angle/date, a denied photo
 * permission shows a message instead of crashing, the per-photo visibility
 * switches call the update endpoint, and delete calls the delete endpoint.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';

import ProgressPhotosScreen from '../app/(member)/progress-photos';

const mockList = jest.fn();
const mockUpload = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  myProgressPhotos: (...a: unknown[]) => mockList(...a),
  uploadProgressPhoto: (...a: unknown[]) => mockUpload(...a),
  updateProgressPhoto: (...a: unknown[]) => mockUpdate(...a),
  deleteProgressPhoto: (...a: unknown[]) => mockDelete(...a),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const withToken = (fn: (t: string) => Promise<unknown>) => fn('token');
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => ({ withToken }) }));

function aPhoto(partial: Record<string, unknown> = {}) {
  return {
    id: 1,
    member_id: 3,
    angle: 'front',
    taken_on: '2026-08-01',
    note: null,
    width: 1080,
    height: 1440,
    content_type: 'image/jpeg',
    byte_size: 12345,
    trainer_visible: false,
    owner_visible: false,
    image_url: '/api/v1/progress-photos/1/image?token=abc',
    created_at: '2026-08-01T09:00:00Z',
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([aPhoto()]);
  mockUpload.mockResolvedValue(aPhoto({ id: 2 }));
  mockUpdate.mockResolvedValue(aPhoto({ trainer_visible: true }));
  mockDelete.mockResolvedValue({ message: 'ok' });
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: true,
    status: 'granted',
  });
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///tmp/pick.jpg', mimeType: 'image/jpeg', fileName: 'pick.jpg' }],
  });
});

async function draw() {
  const r = render(<ProgressPhotosScreen />);
  await act(async () => {});
  return r;
}

it('loads and renders the private gallery', async () => {
  await draw();
  expect(screen.getByTestId('progress-photo-grid')).toBeTruthy();
  expect(screen.getByTestId('progress-photo-1')).toBeTruthy();
  expect(screen.getByText(/Nobody at the gym sees a photo/)).toBeTruthy();
});

it('add -> choose from library -> upload posts the file with the angle and date', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('progress-photo-add'));
  fireEvent.press(screen.getByTestId('progress-photo-library'));
  await act(async () => {});
  fireEvent.press(screen.getByTestId('progress-photo-upload-angle-side'));
  fireEvent.changeText(screen.getByTestId('progress-photo-date'), '2026-08-30');
  fireEvent.press(screen.getByTestId('progress-photo-upload'));
  await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
  expect(mockUpload).toHaveBeenCalledWith(
    expect.objectContaining({ uri: 'file:///tmp/pick.jpg', angle: 'side', taken_on: '2026-08-30' }),
    'token',
  );
});

it('a denied photo permission shows a message and does not upload', async () => {
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false,
    status: 'denied',
  });
  await draw();
  fireEvent.press(screen.getByTestId('progress-photo-add'));
  fireEvent.press(screen.getByTestId('progress-photo-library'));
  await act(async () => {});
  expect(screen.getByTestId('progress-photo-add-error')).toBeTruthy();
  expect(mockUpload).not.toHaveBeenCalled();
});

it('toggling "my trainer can see this" calls the update endpoint', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('progress-photo-1'));
  await act(async () => {});
  fireEvent(screen.getByTestId('progress-photo-trainer-visible-1'), 'valueChange', true);
  await waitFor(() =>
    expect(mockUpdate).toHaveBeenCalledWith(1, { trainer_visible: true }, 'token'),
  );
});

it('delete calls the delete endpoint', async () => {
  await draw();
  fireEvent.press(screen.getByTestId('progress-photo-1'));
  await act(async () => {});
  fireEvent.press(screen.getByTestId('progress-photo-delete'));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(1, 'token'));
});

it('offers before/after only once there are two photos', async () => {
  mockList.mockResolvedValue([aPhoto(), aPhoto({ id: 2, taken_on: '2026-08-20' })]);
  await draw();
  fireEvent.press(screen.getByTestId('progress-photo-compare'));
  expect(mockPush).toHaveBeenCalledWith('/(member)/progress-compare');
});
