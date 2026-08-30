/**
 * ScreenBackground — the low-opacity editorial photo behind a few screens.
 *
 * What matters: it is texture, not a wallpaper (opacity stays low, and lower
 * still in light mode), it never eats a touch or shows up in the a11y tree,
 * each variant pulls its intended asset, and `Screen` only renders it when a
 * screen opts in.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { Screen, ScreenBackground, resolveTreatment } from '../src/design';

// The layer hides itself from assistive tech, which also hides it from the
// default RNTL queries — opt those back in for the elements under test.
const HIDDEN = { includeHiddenElements: true } as const;
const byId = (id: string) => screen.getByTestId(id, HIDDEN);

const SPOTLIGHT = require('../assets/backgrounds/gym-spotlight.jpg');
const FLOOR = require('../assets/backgrounds/gym-floor.jpg');
const NEON = require('../assets/backgrounds/gym-neon.jpg');

let mockScheme: 'light' | 'dark' = 'dark';
jest.mock('../src/store/ThemeContext', () => ({
  useTheme: () => ({ preference: 'system', resolvedScheme: mockScheme, setPreference: jest.fn() }),
}));

beforeEach(() => {
  mockScheme = 'dark';
});

describe('resolveTreatment', () => {
  it('uses the per-variant default intensity when none is given', () => {
    // owner defaults to "subtle", member to "medium" — owner must be quieter.
    expect(resolveTreatment('owner', undefined, 'dark').photoOpacity).toBeLessThan(
      resolveTreatment('member', undefined, 'dark').photoOpacity,
    );
  });

  it('an explicit intensity overrides the default', () => {
    expect(resolveTreatment('member', 'subtle', 'dark').photoOpacity).toBe(
      resolveTreatment('owner', 'subtle', 'dark').photoOpacity,
    );
  });

  it('holds the photo back and leans on the scrim in light mode', () => {
    const dark = resolveTreatment('member', 'medium', 'dark');
    const light = resolveTreatment('member', 'medium', 'light');
    expect(light.photoOpacity).toBeLessThan(dark.photoOpacity);
    expect(light.scrimOpacity).toBeGreaterThan(dark.scrimOpacity);
    expect(light.blurRadius).toBeGreaterThan(0);
    expect(dark.blurRadius).toBe(0);
  });

  it('never lets the photo approach wallpaper opacity', () => {
    for (const variant of ['member', 'trainer', 'owner', 'auth'] as const) {
      for (const scheme of ['light', 'dark'] as const) {
        for (const step of ['subtle', 'low', 'medium', 'bold'] as const) {
          expect(resolveTreatment(variant, step, scheme).photoOpacity).toBeLessThanOrEqual(0.25);
        }
      }
    }
  });
});

describe('ScreenBackground', () => {
  it('maps each variant to its intended asset', () => {
    render(<ScreenBackground variant="member" testID="bg" />);
    expect(byId('bg-image').props.source).toBe(SPOTLIGHT); // aspirational
    screen.unmount();

    render(<ScreenBackground variant="trainer" testID="bg" />);
    expect(byId('bg-image').props.source).toBe(NEON); // dark, understated
    screen.unmount();

    render(<ScreenBackground variant="owner" testID="bg" />);
    expect(byId('bg-image').props.source).toBe(NEON); // shares the trainer feel
    screen.unmount();

    render(<ScreenBackground variant="auth" testID="bg" />);
    expect(byId('bg-image').props.source).toBe(FLOOR); // strong treatment carries it
  });

  it('renders the photo at the resolved low opacity', () => {
    render(<ScreenBackground variant="member" intensity="low" testID="bg" />);
    const expected = resolveTreatment('member', 'low', 'dark').photoOpacity;
    expect(byId('bg-image').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: expected })]),
    );
  });

  it('is inert: no touches, hidden from assistive tech', () => {
    render(<ScreenBackground variant="member" testID="bg" />);
    const root = byId('bg');
    expect(root.props.pointerEvents).toBe('none');
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});

describe('Screen opt-in', () => {
  it('stays background-free by default', () => {
    render(
      <Screen>
        <React.Fragment />
      </Screen>,
    );
    expect(screen.queryByTestId('screen-background', HIDDEN)).toBeNull();
  });

  it('renders the background layer once a screen asks for one', () => {
    render(
      <Screen background="member">
        <React.Fragment />
      </Screen>,
    );
    expect(byId('screen-background')).toBeTruthy();
    expect(byId('screen-background-image').props.source).toBe(SPOTLIGHT);
  });
});
