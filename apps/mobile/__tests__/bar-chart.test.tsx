/**
 * BarChart scaling — the regression guard for the physical-device finding
 * that a lift's trend rendered as eight near-identical full-height bars.
 *
 * A strength or body-composition trend moves by a small fraction of its
 * magnitude (72.5 -> 80 kg). With a zero baseline every bar is >90% tall and
 * the progression is invisible; `baseline="auto"` maps the data's own
 * min->max span across the chart so the growth is actually legible. Neither
 * mode changes the values or their order.
 */

import { render } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { BarChart } from '../src/components/programme';

const TREND = [
  { label: '20', value: 72.5 },
  { label: '23', value: 72.5 },
  { label: '26', value: 75 },
  { label: '1', value: 75 },
  { label: '7', value: 77.5 },
  { label: '16', value: 80 },
  { label: '19', value: 80 },
  { label: '22', value: 80 },
];

function barHeights(element: React.ReactElement): number[] {
  const { getAllByTestId } = render(element);
  return getAllByTestId('bar-chart-bar').map((node) => {
    const flat = StyleSheet.flatten(node.props.style) as { height?: string | number };
    const h = flat.height;
    return typeof h === 'string' ? parseFloat(h) : Number(h ?? 0);
  });
}

it('with a zero baseline a small-variance trend renders as near-flat bars (the bug)', () => {
  const heights = barHeights(<BarChart data={TREND} baseline="zero" />);
  const spread = Math.max(...heights) - Math.min(...heights);
  expect(spread).toBeLessThan(15); // every bar within ~10% of the tallest
});

it('with baseline="auto" the same trend spreads across the chart', () => {
  const heights = barHeights(<BarChart data={TREND} baseline="auto" />);
  const spread = Math.max(...heights) - Math.min(...heights);
  expect(spread).toBeGreaterThan(60); // the 72.5 -> 80 kg climb is now visible

  // Shortest real bar still visible; tallest is the max; order tracks value.
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(10);
  expect(Math.max(...heights)).toBeCloseTo(100, 0);
  expect(heights[0]).toBeLessThan(heights[2]); // 72.5 < 75
  expect(heights[2]).toBeLessThan(heights[4]); // 75 < 77.5
  expect(heights[4]).toBeLessThan(heights[5]); // 77.5 < 80
  expect(heights[5]).toBeCloseTo(heights[7], 1); // equal values -> equal bars
});

it('auto is honest when every value is identical: a flat row, not noise', () => {
  const flat = [
    { label: 'a', value: 60 },
    { label: 'b', value: 60 },
    { label: 'c', value: 60 },
  ];
  const heights = barHeights(<BarChart data={flat} baseline="auto" />);
  expect(new Set(heights)).toEqual(new Set([100]));
});

it('a zero value is still an empty slot, not a floor bar, in auto mode', () => {
  const withGap = [
    { label: 'a', value: 70 },
    { label: 'b', value: 0 },
    { label: 'c', value: 80 },
  ];
  const heights = barHeights(<BarChart data={withGap} baseline="auto" />);
  expect(heights[1]).toBe(0);
});

it('defaults to a zero baseline when no mode is given (counts chart unaffected)', () => {
  const counts = [
    { label: 'w1', value: 1 },
    { label: 'w2', value: 4 },
    { label: 'w3', value: 2 },
  ];
  const heights = barHeights(<BarChart data={counts} />);
  // 1/4, 4/4, 2/4 -> 25, 100, 50 (with the min-6 floor)
  expect(heights[0]).toBeCloseTo(25, 0);
  expect(heights[1]).toBeCloseTo(100, 0);
  expect(heights[2]).toBeCloseTo(50, 0);
});
