/**
 * The bottom tab bar's active-tab bookkeeping.
 *
 * expo-router hides a route from the bar by giving it `tabBarButton: () =>
 * null` — a function, not the literal `null` — rather than removing it from
 * `state.routes`. A filter that compares against `null` never excludes it,
 * so every pushed detail screen (`member/[id]`, `broadcast`, `marketing/
 * [source]`, …) silently joined the divisor used for the pill's width and
 * position. That is what "stuck under Trainers" actually was: not a
 * Trainers-specific bug, but the pill answering a question — "which of these
 * eighteen routes is active" — nobody meant to ask.
 *
 * These tests build a `state.routes` shaped the way expo-router really
 * produces it once a few hidden screens have been visited, and assert the
 * bar still identifies the correct tab as active from among the four real
 * ones — not from among however many hidden routes happen to have
 * accumulated in history by that point.
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { AnimatedTabBar } from '../src/design/navigation';

const REAL_TABS = ['index', 'members', 'trainers', 'marketing'] as const;
const TITLES: Record<string, string> = {
  index: 'Dashboard',
  members: 'Members',
  trainers: 'Trainers',
  marketing: 'Marketing',
};
// Hidden detail screens a session accumulates in `state.routes` over time —
// none of these ever get a tab bar button of their own. `profile` is hidden
// too now: Account is reached from the avatar in the top-right, not a tab.
const HIDDEN_ROUTES = [
  'member/[id]',
  'marketing/[source]',
  'broadcast',
  'payments',
  'settings',
  'profile',
];

function tabBarButtonOptions(name: string) {
  // Mirrors expo-router's own useScreens.ts: a real tab never sets
  // `tabBarButton`; a screen hidden via `href: null` gets `() => null`.
  return REAL_TABS.includes(name as (typeof REAL_TABS)[number])
    ? { title: TITLES[name] }
    : { title: name, tabBarButton: () => null };
}

/** A `state.routes` array with hidden routes interleaved among the tabs, the
 * way real navigation history actually accumulates them. */
function buildRoutes(activeName: string) {
  const names = [
    ...REAL_TABS.slice(0, 2),
    HIDDEN_ROUTES[0],
    REAL_TABS[2],
    HIDDEN_ROUTES[1],
    REAL_TABS[3],
    HIDDEN_ROUTES[2],
    HIDDEN_ROUTES[3],
    HIDDEN_ROUTES[4],
    HIDDEN_ROUTES[5],
  ];
  const routes = names.map((name, i) => ({ key: `${name}-${i}`, name }));
  const index = routes.findIndex((r) => r.name === activeName);
  return { routes, index };
}

function buildDescriptors(routes: { key: string; name: string }[]) {
  const descriptors: Record<string, { options: ReturnType<typeof tabBarButtonOptions> }> = {};
  for (const route of routes) {
    descriptors[route.key] = { options: tabBarButtonOptions(route.name) };
  }
  return descriptors;
}

function renderBar(activeName: string) {
  const { routes, index } = buildRoutes(activeName);
  const descriptors = buildDescriptors(routes);
  const navigation = { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() };
  return render(
    <AnimatedTabBar
      state={{ routes, index } as never}
      descriptors={descriptors as never}
      navigation={navigation as never}
      insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
    />,
  );
}

describe('which tab reads as active', () => {
  it.each(REAL_TABS.map((name) => [name, TITLES[name]] as const))(
    'marks %s selected when it is the active route, with the other three unselected',
    async (name, title) => {
      renderBar(name);
      const selected = screen.getByRole('tab', { name: title });
      expect(selected.props.accessibilityState.selected).toBe(true);

      for (const other of REAL_TABS) {
        if (other === name) continue;
        const tab = screen.getByRole('tab', { name: TITLES[other] });
        expect(tab.props.accessibilityState.selected).toBe(false);
      }
    },
  );

  it('renders exactly the four real tabs regardless of how many hidden routes are in history', () => {
    renderBar('trainers');
    expect(screen.getAllByRole('tab')).toHaveLength(REAL_TABS.length);
  });
});

describe('standing on a hidden route right now', () => {
  // `rawIndex` is -1 here — the *current* route (not just older ones in
  // history) has no tab button of its own. That used to fall through
  // `Math.max(0, -1)` straight onto tab 0, lighting up whichever tab
  // happened to be first regardless of where the member actually was.
  it('keeps the tab it was pushed from selected, not tab zero, once on a hidden route', () => {
    // Land on "trainers" first, then push a hidden detail screen from there.
    const { routes, index: trainersIndex } = buildRoutes('trainers');
    const hiddenIndex = routes.findIndex((r) => r.name === HIDDEN_ROUTES[1]);
    const descriptors = buildDescriptors(routes);
    const navigation = { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() };

    const { rerender } = render(
      <AnimatedTabBar
        state={{ routes, index: trainersIndex } as never}
        descriptors={descriptors as never}
        navigation={navigation as never}
        insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Trainers' }).props.accessibilityState.selected).toBe(
      true,
    );

    rerender(
      <AnimatedTabBar
        state={{ routes, index: hiddenIndex } as never}
        descriptors={descriptors as never}
        navigation={navigation as never}
        insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Trainers' }).props.accessibilityState.selected).toBe(
      true,
    );
    expect(screen.getByRole('tab', { name: 'Dashboard' }).props.accessibilityState.selected).toBe(
      false,
    );
  });
});
