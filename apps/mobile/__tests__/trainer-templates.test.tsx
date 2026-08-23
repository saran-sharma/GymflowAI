/**
 * Browsing workout templates and applying one to a member.
 *
 * Push / Pull / Legs shows up here as one card among several — the point of
 * the whole templates system — and applying a template is a real API call
 * that hands back the member's own independent copy, never a local stand-in.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import WorkoutTemplatesScreen from '../app/(trainer)/templates';
import TemplatePreviewScreen from '../app/(trainer)/template-preview/[templateId]';
import { ApiError } from '../src/api/client';
import type { WorkoutTemplate } from '../src/api/types';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, canGoBack: () => true, back: jest.fn() }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

const mockWorkoutTemplates = jest.fn();
const mockWorkoutTemplate = jest.fn();
const mockApplyWorkoutTemplate = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  workoutTemplates: (...a: unknown[]) => mockWorkoutTemplates(...a),
  workoutTemplate: (...a: unknown[]) => mockWorkoutTemplate(...a),
  applyWorkoutTemplate: (...a: unknown[]) => mockApplyWorkoutTemplate(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

function aTemplate(partial: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
  return {
    id: 3,
    key: 'ppl_6day',
    name: 'Push / Pull / Legs',
    description: "SLAM's original six-day chart.",
    category: 'push',
    image_key: 'push',
    is_system: true,
    branch_id: null,
    days: [
      {
        id: 30,
        order_index: 0,
        name: 'Push A',
        category: 'push',
        image_key: 'push',
        estimated_duration_minutes: 60,
        exercises: [
          {
            id: 300,
            order_index: 0,
            exercise: 'Barbell Bench Press',
            sets: 4,
            reps: '8-10',
            rest_seconds: 90,
            notes: null,
          },
        ],
      },
    ],
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ memberId: '42', name: 'Aditya Rao' });
});

describe('the templates list', () => {
  it('shows PPL as one option among the default pack, not the only one', async () => {
    mockWorkoutTemplates.mockResolvedValue([
      aTemplate(),
      aTemplate({ id: 1, key: 'beginner_full_body_3day', name: 'Beginner Full Body', category: 'full_body' }),
    ]);
    render(<WorkoutTemplatesScreen />);
    await act(async () => {});
    expect(screen.getByText('Push / Pull / Legs')).toBeTruthy();
    expect(screen.getByText('Beginner Full Body')).toBeTruthy();
  });

  it('opening a template carries the member id into the preview route', async () => {
    mockWorkoutTemplates.mockResolvedValue([aTemplate()]);
    render(<WorkoutTemplatesScreen />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('template-3'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(trainer)/template-preview/[templateId]',
        params: { templateId: '3', memberId: '42', name: 'Aditya Rao' },
      }),
    );
  });
});

describe('previewing and applying a template', () => {
  beforeEach(() => {
    mockUseLocalSearchParams.mockReturnValue({ templateId: '3', memberId: '42', name: 'Aditya Rao' });
  });

  it('shows every day and its exercises before anything is applied', async () => {
    mockWorkoutTemplate.mockResolvedValue(aTemplate());
    render(<TemplatePreviewScreen />);
    await act(async () => {});
    expect(screen.getByText('Push A')).toBeTruthy();
    expect(screen.getByText(/Barbell Bench Press/)).toBeTruthy();
  });

  it('applying calls the real endpoint and lands back on that member’s program', async () => {
    mockWorkoutTemplate.mockResolvedValue(aTemplate());
    mockApplyWorkoutTemplate.mockResolvedValue({ id: 9 });
    render(<TemplatePreviewScreen />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('apply-template'));

    await waitFor(() => expect(mockApplyWorkoutTemplate).toHaveBeenCalledWith(42, 3, 'token'));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(trainer)/plan/[id]',
        params: { id: '42', name: 'Aditya Rao' },
      }),
    );
  });

  it('surfaces a server error rather than pretending the apply worked', async () => {
    mockWorkoutTemplate.mockResolvedValue(aTemplate());
    mockApplyWorkoutTemplate.mockRejectedValue(new ApiError(403, 'forbidden', 'Not allowed'));
    render(<TemplatePreviewScreen />);
    await act(async () => {});
    fireEvent.press(screen.getByTestId('apply-template'));
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
