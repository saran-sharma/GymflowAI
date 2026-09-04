/**
 * Ask GymFlow — the focused question sheet and its entry row.
 *
 * The surface is deliberately plain: a heading, chips, one field, one answer
 * area. These checks pin the flow (chip → answer, type → answer), that the
 * answer renders its data rows and deep link, and that a failure degrades to a
 * line rather than breaking the sheet.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { AskGymFlowRow, AskGymFlowSheet } from '../src/components/ask-gymflow';

const mockAsk = jest.fn();
const mockSuggestions = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  askGymFlow: (...a: unknown[]) => mockAsk(...a),
  askSuggestions: (...a: unknown[]) => mockSuggestions(...a),
}));

const withToken = (fn: (t: string) => Promise<unknown>) => fn('token');
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => ({ withToken }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockSuggestions.mockResolvedValue({ suggestions: ['How am I doing?', 'How was last week?'] });
  mockAsk.mockResolvedValue({
    question: 'How am I doing?',
    intent: 'overview',
    answer: 'Going well — training is consistent.\n• 12 personal records this month',
    source: 'deterministic',
    data: [{ label: 'Weekly average', value: '3' }],
    action: { label: 'See progress', route: '/(member)/progress' },
    suggestions: ['What should I work on next?'],
  });
});

async function open(props: Partial<React.ComponentProps<typeof AskGymFlowSheet>> = {}) {
  const result = render(
    <AskGymFlowSheet visible onClose={jest.fn()} onNavigate={jest.fn()} {...props} />,
  );
  await act(async () => {});
  return result;
}

it('loads suggestion chips when opened', async () => {
  await open();
  expect(screen.getByText('How am I doing?')).toBeTruthy();
  expect(screen.getByText('How was last week?')).toBeTruthy();
});

it('tapping a chip asks it and renders the answer with its data and action', async () => {
  const onNavigate = jest.fn();
  await open({ onNavigate });

  fireEvent.press(screen.getByText('How was last week?'));
  await waitFor(() => expect(screen.getByText(/training is consistent/)).toBeTruthy());

  expect(mockAsk).toHaveBeenCalledWith('How was last week?', 'token', undefined);
  expect(screen.getByText('Weekly average')).toBeTruthy();
  expect(screen.getByText('• 12 personal records this month')).toBeTruthy();

  fireEvent.press(screen.getByText('See progress'));
  expect(onNavigate).toHaveBeenCalledWith('/(member)/progress');
});

it('typing a question and pressing Ask answers it', async () => {
  await open();
  fireEvent.changeText(screen.getByTestId('ask-input'), 'am I consistent?');
  fireEvent.press(screen.getByText('Ask'));
  await waitFor(() => expect(mockAsk).toHaveBeenCalledWith('am I consistent?', 'token', undefined));
});

it('passes the member id through when asking about a client', async () => {
  await open({ memberId: 42 });
  fireEvent.press(screen.getByText('How am I doing?'));
  await waitFor(() => expect(mockAsk).toHaveBeenCalledWith('How am I doing?', 'token', 42));
});

it('shows a one-line notice when the answer call fails', async () => {
  mockAsk.mockRejectedValueOnce(Object.assign(new Error('boom'), { message: 'boom' }));
  await open();
  fireEvent.press(screen.getByText('How am I doing?'));
  await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
});

it('the entry row is a plain row, not a floating button', () => {
  const onPress = jest.fn();
  render(<AskGymFlowRow onPress={onPress} />);
  const row = screen.getByTestId('ask-gymflow-row');
  fireEvent.press(row);
  expect(onPress).toHaveBeenCalled();
  expect(screen.getByText('Ask about your training')).toBeTruthy();
});

it('fires the contextual question once when opened with initialQuestion', async () => {
  await open({ initialQuestion: 'Tell me more about: 15 unworked shifts this month' });
  await waitFor(() =>
    expect(mockAsk).toHaveBeenCalledWith(
      'Tell me more about: 15 unworked shifts this month',
      'token',
      undefined,
    ),
  );
  expect(mockAsk).toHaveBeenCalledTimes(1);
});

it('carries the member context and the contextual question together', async () => {
  await open({ memberId: 7, initialQuestion: 'What should I focus on with them?' });
  await waitFor(() =>
    expect(mockAsk).toHaveBeenCalledWith('What should I focus on with them?', 'token', 7),
  );
});
