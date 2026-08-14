/**
 * The Member module's contract.
 *
 * The thing worth pinning here is the distinction between an own workout and a
 * PT session. It is the one piece of this module that is easy to break by
 * accident — a shared card, a reused label — and impossible for a member to
 * recover from, because a day they thought was coached is a day nobody
 * coached them.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import {
  JourneyBar,
  KindTag,
  NotConnected,
  PtLine,
  TodayCard,
  kindMeta,
} from '../src/components/member';

async function draw(element: React.ReactElement) {
  const result = render(element);
  await act(async () => {});
  return result;
}

describe('a session always says which kind it is', () => {
  it('names all four kinds distinctly', () => {
    const labels = Object.values(kindMeta).map((meta) => meta.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(
      expect.arrayContaining(['Own workout', 'PT session', 'Group class', 'Rest & recovery']),
    );
  });

  it('gives own work and coached work different colours', () => {
    // Same shape, different hue — that is the whole distinction.
    expect(kindMeta.own_workout.hue).not.toBe(kindMeta.pt_session.hue);
  });

  it('renders the label for each kind', async () => {
    await draw(<KindTag kind="pt_session" />);
    expect(screen.getByText('PT session')).toBeTruthy();
  });
});

describe("today's card", () => {
  it('leads with the kind, the title and one action', async () => {
    await draw(
      <TodayCard
        kind="own_workout"
        title="Push — Chest & Shoulders"
        subtitle="Day 12 of 45"
        cta="Start today’s workout"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Own workout')).toBeTruthy();
    expect(screen.getByText('Push — Chest & Shoulders')).toBeTruthy();
    expect(screen.getByText('Day 12 of 45')).toBeTruthy();
    expect(screen.getByText('Start today’s workout')).toBeTruthy();
  });

  it('fires its action once', async () => {
    const onPress = jest.fn();
    await draw(<TodayCard kind="own_workout" title="Pull" cta="Start" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Start'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when there is nothing to do', async () => {
    const onPress = jest.fn();
    await draw(
      <TodayCard kind="rest" title="Rest & recovery" cta="Nothing to do today" onPress={onPress} disabled />,
    );
    fireEvent.press(screen.getByLabelText('Nothing to do today'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a PT day as PT, not as a workout', async () => {
    await draw(
      <TodayCard
        kind="pt_session"
        title="Coach Vikas"
        subtitle="Session 5 of 12 · 19:00"
        cta="Open your PT session"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('PT session')).toBeTruthy();
    expect(screen.queryByText('Own workout')).toBeNull();
  });
});

describe('the 45-day programme', () => {
  it('separates the day from the total', async () => {
    await draw(<JourneyBar currentDay={12} totalDays={45} daysCompleted={11} completionPct={26.7} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('/ 45')).toBeTruthy();
    expect(screen.getByText('33 to go')).toBeTruthy();
    expect(screen.getByText('11 days completed')).toBeTruthy();
  });

  it('does not promise a day past the end of the programme', async () => {
    await draw(<JourneyBar currentDay={45} totalDays={45} completionPct={100} />);
    expect(screen.getByText('0 to go')).toBeTruthy();
  });

  it('names the assessment phase rather than calling it training', async () => {
    await draw(<JourneyBar currentDay={2} totalDays={45} phase="assessment" />);
    expect(screen.getByText('Assessment phase')).toBeTruthy();
  });
});

describe('a PT session states the trainer and the count', () => {
  it('reads the way the studio says it out loud', async () => {
    await draw(
      <PtLine
        trainerName="Coach Vikas"
        sessionNumber={5}
        packageSize={12}
        when="Today · 19:00"
      />,
    );
    expect(screen.getByText('Coach Vikas')).toBeTruthy();
    expect(screen.getByText('Session 5 of 12 · Today · 19:00')).toBeTruthy();
  });

  it('omits the package size rather than inventing one', async () => {
    await draw(<PtLine trainerName={null} sessionNumber={3} packageSize={null} when="Fri · 07:00" />);
    expect(screen.getByText('Your trainer')).toBeTruthy();
    expect(screen.getByText('Session 3 · Fri · 07:00')).toBeTruthy();
  });
});

describe('missing data is named, not faked', () => {
  it('says what is absent and why', async () => {
    await draw(
      <NotConnected
        title="No scan on file"
        detail="Weight and body fat appear here once your branch connects its InBody machine."
      />,
    );
    expect(screen.getByText('No scan on file')).toBeTruthy();
    expect(
      screen.getByText('Weight and body fat appear here once your branch connects its InBody machine.'),
    ).toBeTruthy();
  });
});
