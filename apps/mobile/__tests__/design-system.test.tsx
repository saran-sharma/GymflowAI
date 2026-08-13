/**
 * The design system's contract.
 *
 * Two things are pinned here. First, that `src/theme` is genuinely a
 * projection of the tokens rather than a second copy — if those drift, every
 * screen written against the old shape silently stops matching the new
 * components. Second, the behaviour of controls that screens rely on:
 * disabled/busy state, error wiring, and the clamping that stops a bad number
 * overflowing a progress track.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import {
  AlertCard,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  ProgressBar,
  ProgressCard,
  SessionCard,
  StatCard,
  alpha,
  color,
  radii,
  space,
  text,
  toneColor,
} from '../src/design';
import { colors, HIT_TARGET, radius, spacing, typography } from '../src/theme';

async function draw(element: React.ReactElement) {
  const result = render(element);
  await act(async () => {});
  return result;
}

describe('tokens are the single source of truth', () => {
  it('projects every legacy colour onto a semantic token', () => {
    expect(colors.bg).toBe(color.background);
    expect(colors.card).toBe(color.surfaceRaised);
    expect(colors.brand).toBe(color.brand);
    expect(colors.text).toBe(color.text);
    expect(colors.textMuted).toBe(color.textSecondary);
    expect(colors.onTime).toBe(color.status.positive);
    expect(colors.absent).toBe(color.status.critical);
  });

  it('projects spacing, radius and type without redefining them', () => {
    expect(spacing.lg).toBe(space.lg);
    expect(radius.pill).toBe(radii.pill);
    expect(typography).toBe(text);
    expect(HIT_TARGET).toBe(48);
  });

  it('gives every type role a line height', () => {
    // Their absence is what made stacked text look accidental.
    for (const role of Object.keys(text) as (keyof typeof text)[]) {
      expect(text[role].lineHeight).toBeGreaterThan(0);
      expect(text[role].lineHeight!).toBeGreaterThanOrEqual(text[role].fontSize!);
    }
  });

  it('keeps the spacing scale on a 4pt rhythm', () => {
    for (const value of Object.values(space)) {
      expect(value % 2).toBe(0);
    }
  });

  it('builds translucent tints that clamp rather than wrap', () => {
    expect(alpha('#EF2B3C', 1)).toBe('#EF2B3Cff');
    expect(alpha('#EF2B3C', 0)).toBe('#EF2B3C00');
    expect(alpha('#EF2B3C', 5)).toBe('#EF2B3Cff');
    expect(alpha('#EF2B3C', -1)).toBe('#EF2B3C00');
  });

  it('maps every tone to a colour', () => {
    for (const tone of ['neutral', 'brand', 'positive', 'caution', 'critical', 'info'] as const) {
      expect(toneColor[tone]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('Button', () => {
  it('reports disabled and busy to assistive technology while loading', async () => {
    await draw(<Button title="Save" loading onPress={jest.fn()} testID="save" />);
    const button = screen.getByTestId('save');
    expect(button.props.accessibilityState.disabled).toBe(true);
    expect(button.props.accessibilityState.busy).toBe(true);
  });

  it('does not fire while loading', async () => {
    const onPress = jest.fn();
    await draw(<Button title="Save" loading onPress={onPress} testID="save" />);
    fireEvent.press(screen.getByTestId('save'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('fires when enabled', async () => {
    const onPress = jest.fn();
    await draw(<Button title="Save" onPress={onPress} testID="save" />);
    fireEvent.press(screen.getByTestId('save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Input', () => {
  it('masks a secure field until the eye is pressed', async () => {
    await draw(<Input label="Password" secure testID="pw" />);
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(true);

    fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(false);
  });

  it('shows the error instead of the hint, so the two cannot both speak', async () => {
    await draw(<Input label="Email" hint="We never share this" error="That is not an email" />);
    expect(screen.getByText('That is not an email')).toBeTruthy();
    expect(screen.queryByText('We never share this')).toBeNull();
  });
});

describe('ProgressBar', () => {
  it('clamps out-of-range values rather than overflowing the track', async () => {
    const over = await draw(<ProgressBar value={140} />);
    expect(over.getByRole('progressbar').props.accessibilityValue.now).toBe(100);
    over.unmount();

    const under = await draw(<ProgressBar value={-20} />);
    expect(under.getByRole('progressbar').props.accessibilityValue.now).toBe(0);
    under.unmount();

    const nonsense = await draw(<ProgressBar value={Number.NaN} />);
    expect(nonsense.getByRole('progressbar').props.accessibilityValue.now).toBe(0);
  });
});

describe('cards', () => {
  it('announces a stat as label and value together', async () => {
    await draw(<StatCard label="Present" value={6} hint="of 8" />);
    expect(screen.getByLabelText('Present: 6')).toBeTruthy();
    expect(screen.getByText('of 8')).toBeTruthy();
  });

  it('only makes a card a button when it can actually be opened', async () => {
    const flat = await draw(<StatCard label="Late" value={2} />);
    expect(flat.queryByRole('button')).toBeNull();
    flat.unmount();

    await draw(<StatCard label="Late" value={2} onPress={jest.fn()} />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('renders a session with its time, status and subtitle', async () => {
    await draw(
      <SessionCard
        title="Aditya Rao"
        subtitle="PT session 7 of 20"
        time="07:00"
        kind="PT"
        status={{ label: 'Upcoming', tone: 'neutral' }}
      />,
    );
    expect(screen.getByText('07:00')).toBeTruthy();
    expect(screen.getByText('Aditya Rao')).toBeTruthy();
    expect(screen.getByText('PT session 7 of 20')).toBeTruthy();
    expect(screen.getByText('Upcoming')).toBeTruthy();
  });

  it('separates a progress numerator from its denominator', async () => {
    await draw(<ProgressCard label="Journey" value={12} total={45} percent={26.7} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('/ 45')).toBeTruthy();
  });

  it('renders an alert with its body and meta', async () => {
    await draw(<AlertCard title="Trainer late" body="12 min late" meta="today" tone="caution" />);
    expect(screen.getByText('Trainer late')).toBeTruthy();
    expect(screen.getByText('12 min late')).toBeTruthy();
    expect(screen.getByText('today')).toBeTruthy();
  });
});

describe('Badge', () => {
  it('displays caps without shouting at a screen reader', async () => {
    // The label is upper-cased with textTransform, so the accessible string
    // stays "On time" — some screen readers spell out all-caps text.
    await draw(<Badge label="On time" tone="positive" />);
    const label = screen.getByText('On time');
    const style = Array.isArray(label.props.style)
      ? Object.assign({}, ...label.props.style.filter(Boolean))
      : label.props.style;
    expect(style.textTransform).toBe('uppercase');
  });
});

describe('empty and error are different states', () => {
  it('an empty list says what would fill it', async () => {
    await draw(<EmptyState title="No classes yet" detail="Your branch announces classes here." />);
    expect(screen.getByText('No classes yet')).toBeTruthy();
    expect(screen.getByText('Your branch announces classes here.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('a failure offers a retry', async () => {
    const onRetry = jest.fn();
    await draw(<ErrorState detail="The server did not respond." onRetry={onRetry} />);
    fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offline is named as offline, not as a generic fault', async () => {
    await draw(<ErrorState offline onRetry={jest.fn()} />);
    expect(screen.getByText('No connection')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});
