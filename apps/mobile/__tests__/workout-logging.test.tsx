/**
 * Workout logging carries three rules that are easy to break silently.
 *
 * A load of zero is a bodyweight set, not a missing weight. "No previous
 * session" is a statement, not an empty row. And the rest timer has to survive
 * the phone going to sleep — the case that never shows up in a simulator and
 * always shows up in a gym.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type {
  ExerciseSession,
  PersonalRecord,
  WorkoutSet,
  WorkoutSetHistory,
} from '../src/api/types';
import {
  PreviousPerformance,
  RecordNote,
  RestBar,
  SetRow,
  clockLabel,
  loadLabel,
  recordDetail,
  setLabel,
  useRestTimer,
  volume,
} from '../src/components/workout';

async function draw(element: React.ReactElement) {
  const result = render(element);
  await act(async () => {});
  return result;
}

function aSet(partial: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 1,
    session_item_id: 10,
    set_number: 1,
    weight_kg: 60,
    reps: 8,
    rpe: null,
    completed_at: '2026-08-17T09:00:00Z',
    ...partial,
  };
}

/* ----------------------------------------------------------- formatting */

describe('a load reads the way a lifter says it', () => {
  it('calls zero bodyweight rather than 0 kg', () => {
    // The column stores 0 for a pull-up because that is the honest number.
    // Reading it back as a weight would look like the app lost the value.
    expect(loadLabel(0)).toBe('Bodyweight');
    expect(setLabel(aSet({ weight_kg: 0, reps: 12 }))).toBe('BW × 12');
  });

  it('keeps a half but not a pointless decimal', () => {
    expect(loadLabel(60)).toBe('60 kg');
    expect(loadLabel(62.5)).toBe('62.5 kg');
  });

  it('counts volume in kilograms moved', () => {
    expect(
      volume([aSet({ weight_kg: 60, reps: 8 }), aSet({ id: 2, weight_kg: 50, reps: 10 })]),
    ).toBe(980);
  });

  it('gives bodyweight sets no measurable volume rather than guessing one', () => {
    expect(volume([aSet({ weight_kg: 0, reps: 20 })])).toBe(0);
  });
});

/* ------------------------------------------------------- previous work */

function aHistory(sessions: WorkoutSetHistory['sessions']): WorkoutSetHistory {
  return {
    exercise: 'Bench Press',
    sessions,
    heaviest: sessions[0]?.sets[0] ?? null,
    best_volume_kg: sessions[0]?.volume_kg ?? null,
    best_volume_on: sessions[0]?.session_date ?? null,
  };
}

function aPastSession(sets: WorkoutSet[], partial: Partial<ExerciseSession> = {}): ExerciseSession {
  return {
    session_id: 3,
    session_date: '2026-08-12',
    split: 'push',
    split_label: 'Push',
    program_day_name: null,
    sets,
    volume_kg: sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0),
    top_weight_kg: Math.max(...sets.map((s) => s.weight_kg), 0),
    total_reps: sets.reduce((sum, s) => sum + s.reps, 0),
    average_rpe: null,
    ...partial,
  };
}

describe('previous performance', () => {
  it('says outright when there is no history', async () => {
    // An empty `sessions` list is a real answer from the server. A blank block
    // would read as a failed load, and the member could not tell them apart.
    await draw(<PreviousPerformance history={aHistory([])} />);
    expect(screen.getByText(/First time logging this lift/)).toBeTruthy();
  });

  it('treats a session that logged nothing the same as no session', async () => {
    await draw(<PreviousPerformance history={aHistory([aPastSession([])])} />);
    expect(screen.getByText(/First time logging this lift/)).toBeTruthy();
  });

  it('handles the request not having landed yet', async () => {
    await draw(<PreviousPerformance history={null} />);
    expect(screen.getByText(/First time logging this lift/)).toBeTruthy();
  });

  it('lists each set on its own line, as a lifter reads them', async () => {
    // Stacked, not run together: this is glanced at between sets, and
    // `60 × 8 · 60 × 8 · 57.5 × 10` has to be parsed rather than read.
    const sets = [
      aSet({ id: 1, weight_kg: 60, reps: 8 }),
      aSet({ id: 2, weight_kg: 60, reps: 8 }),
      aSet({ id: 3, weight_kg: 57.5, reps: 10 }),
    ];
    await draw(<PreviousPerformance history={aHistory([aPastSession(sets)])} />);

    expect(screen.getAllByText('60 kg × 8')).toHaveLength(2);
    expect(screen.getByText('57.5 kg × 10')).toBeTruthy();
  });

  it('shows an RPE beside the set that carried one', async () => {
    const sets = [aSet({ id: 1, rpe: 8 }), aSet({ id: 2, rpe: null })];
    await draw(<PreviousPerformance history={aHistory([aPastSession(sets)])} />);
    expect(screen.getAllByText(/RPE 8/)).toHaveLength(1);
  });

  it('offers the history only when there is more than the last session', async () => {
    const one = aHistory([aPastSession([aSet()])]);
    const { rerender } = await draw(<PreviousPerformance history={one} onOpenHistory={() => {}} />);
    expect(screen.queryByText(/History ·/)).toBeNull();

    const two = aHistory([
      aPastSession([aSet()]),
      aPastSession([aSet()], { session_id: 4, session_date: '2026-08-09' }),
    ]);
    rerender(<PreviousPerformance history={two} onOpenHistory={() => {}} />);
    expect(screen.getByText('History · 2 sessions')).toBeTruthy();
  });
});

/* ------------------------------------------------------- personal records */

function aRecord(partial: Partial<PersonalRecord> = {}): PersonalRecord {
  return {
    kind: 'heaviest_weight',
    weight_kg: 65,
    reps: 6,
    volume_kg: null,
    previous_weight_kg: 60,
    previous_reps: 8,
    previous_volume_kg: null,
    ...partial,
  };
}

describe('a personal record', () => {
  it('renders nothing at all when none were beaten', async () => {
    const { toJSON } = await draw(<RecordNote records={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('names what was beaten as well as what was done', async () => {
    await draw(<RecordNote records={[aRecord()]} />);
    expect(screen.getByText('Heaviest ever')).toBeTruthy();
    expect(screen.getByText('65 kg × 6 · was 60 kg × 8')).toBeTruthy();
  });

  it('states a volume record in kilograms moved', async () => {
    await draw(
      <RecordNote
        records={[
          aRecord({
            kind: 'session_volume',
            volume_kg: 960,
            previous_volume_kg: 480,
            previous_weight_kg: null,
            previous_reps: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText('Best session for this lift')).toBeTruthy();
    expect(screen.getByText('960 kg moved · was 480 kg')).toBeTruthy();
  });

  it('says only what it did when there is nothing to compare against', () => {
    const detail = recordDetail(aRecord({ previous_weight_kg: null, previous_reps: null }));
    expect(detail).toBe('65 kg × 6');
    expect(detail).not.toMatch(/was/);
  });

  it('shows two records at once without ranking them', async () => {
    await draw(
      <RecordNote records={[aRecord(), aRecord({ kind: 'session_volume', volume_kg: 960 })]} />,
    );
    expect(screen.getByText('Heaviest ever')).toBeTruthy();
    expect(screen.getByText('Best session for this lift')).toBeTruthy();
  });
});

/* ------------------------------------------------------------- a set row */

describe('a logged set', () => {
  it('shows the load, the reps and an RPE only when one was recorded', async () => {
    await draw(<SetRow entry={aSet({ rpe: 7.5 })} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('60 kg')).toBeTruthy();
    expect(screen.getByText('× 8')).toBeTruthy();
    expect(screen.getByText('RPE 7.5')).toBeTruthy();
  });

  it('shows no RPE badge at all when the member did not give one', async () => {
    await draw(<SetRow entry={aSet({ rpe: null })} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.queryByText(/RPE/)).toBeNull();
  });

  it('separates editing from deleting, because their costs differ', async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    await draw(<SetRow entry={aSet()} onEdit={onEdit} onDelete={onDelete} />);

    fireEvent.press(screen.getByLabelText(/Edit\.$/));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Delete set 1'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does nothing while a save is in flight', async () => {
    const onEdit = jest.fn();
    await draw(<SetRow entry={aSet()} disabled onEdit={onEdit} onDelete={() => {}} />);
    fireEvent.press(screen.getByLabelText(/Edit\.$/));
    expect(onEdit).not.toHaveBeenCalled();
  });
});

/* --------------------------------------------------------- rest timer */

describe('the rest timer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function Harness({ seconds }: { seconds: number }) {
    const timer = useRestTimer();
    return (
      <>
        <RestBar timer={timer} />
        <SetRow
          entry={aSet()}
          onEdit={() => timer.start(seconds)}
          onDelete={() => timer.extend(30)}
        />
      </>
    );
  }

  it('shows nothing until a rest is started', async () => {
    await draw(<Harness seconds={60} />);
    expect(screen.queryByText('Resting')).toBeNull();
  });

  it('counts down from the rest the plan prescribed', async () => {
    await draw(<Harness seconds={90} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/Edit\.$/));
    });
    expect(screen.getByText('1:30')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('1:00')).toBeTruthy();
  });

  /**
   * The reason the timer holds a deadline instead of counting its own ticks.
   * A phone that sleeps stops delivering intervals, so a tick-counting timer
   * comes back still claiming a minute to run.
   */
  it('is correct after the phone stops delivering ticks', async () => {
    await draw(<Harness seconds={60} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/Edit\.$/));
    });

    // Wall clock moves past the deadline; no intervals fire in between.
    await act(async () => {
      jest.setSystemTime(Date.now() + 120_000);
      jest.advanceTimersByTime(250);
    });

    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByText('Rest over')).toBeTruthy();
  });

  it('never counts past zero into negative time', async () => {
    await draw(<Harness seconds={5} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/Edit\.$/));
    });
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('0:00')).toBeTruthy();
  });

  it('adds thirty seconds to what is left, not to a fresh minute', async () => {
    await draw(<Harness seconds={60} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/Edit\.$/));
    });
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(screen.getByText('0:40')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Delete set 1'));
    });
    expect(screen.getByText('1:10')).toBeTruthy();
  });

  it('can be skipped, because a timer must never block the next set', async () => {
    await draw(<Harness seconds={60} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/Edit\.$/));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Skip'));
    });
    expect(screen.queryByText('Resting')).toBeNull();
  });
});

describe('the clock label', () => {
  it('pads seconds so the figure does not jump width', () => {
    expect(clockLabel(65)).toBe('1:05');
    expect(clockLabel(9)).toBe('0:09');
    expect(clockLabel(600)).toBe('10:00');
  });

  it('never renders negative time', () => {
    expect(clockLabel(-5)).toBe('0:00');
  });
});
