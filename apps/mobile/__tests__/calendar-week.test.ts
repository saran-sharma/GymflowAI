/**
 * Timezone-safe calendar arithmetic — the regression guard for the
 * physical-device bug where the week strip highlighted the wrong day.
 *
 * On a Pixel 6a in Asia/Kolkata (UTC+5:30) the old `journeyToday` /
 * `weekAround` built a device-local `Date` and then read it back with
 * `.toISOString()`, which is UTC — so "today" and the whole Mon–Sun window
 * moved one calendar day earlier and the "today" pip landed on the previous
 * split (Push) while the server (correctly) said Pull.
 *
 * These helpers must give the SAME answer in every timezone, so the tests
 * run the assertions under three very different `TZ` values.
 */

import { addDays, parseISODate, weekBounds, weekdayInitial } from '../src/utils/calendar';
import { journeyToday, weekAround } from '../src/components/member';
import type { JourneyDay } from '../src/api/types';

const ZONES = ['Asia/Kolkata', 'America/Los_Angeles', 'UTC', 'Pacific/Kiritimati'];

function inZone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = previous;
  }
}

function day(planned_on: string, split: JourneyDay['split']): JourneyDay {
  return { day_number: 0, planned_on, split, status: 'pending' } as JourneyDay;
}

describe('parseISODate anchors at UTC midnight, whatever the device zone', () => {
  it.each(ZONES)('in %s', (tz) => {
    inZone(tz, () => {
      const d = parseISODate('2026-08-30');
      expect(d).not.toBeNull();
      expect(d!.toISOString()).toBe('2026-08-30T00:00:00.000Z');
    });
  });

  it('rejects a non-date string', () => {
    expect(parseISODate('not-a-date')).toBeNull();
    expect(parseISODate('2026-8-3')).toBeNull();
  });
});

describe('addDays / weekBounds / weekdayInitial are pure calendar math', () => {
  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-08-30', 1)).toBe('2026-08-31');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01'); // month boundary
    expect(addDays('2026-08-30', -1)).toBe('2026-08-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01'); // year boundary
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28'); // 2026 is not a leap year
  });

  it('weekdayInitial: 2026-08-30 is a Sunday, 2026-07-27 a Monday', () => {
    expect(weekdayInitial('2026-08-30')).toBe('S');
    expect(weekdayInitial('2026-07-27')).toBe('M');
    expect(weekdayInitial('2026-09-01')).toBe('T'); // Tuesday
  });

  it('weekBounds is the Monday–Sunday week that contains the date', () => {
    // Sun 2026-08-30 is the LAST day of its week.
    expect(weekBounds('2026-08-30')).toEqual({ monday: '2026-08-24', sunday: '2026-08-30' });
    // Mon 2026-08-24 is the FIRST day of the same week.
    expect(weekBounds('2026-08-24')).toEqual({ monday: '2026-08-24', sunday: '2026-08-30' });
    // Tue 2026-09-01 rolls into the next week.
    expect(weekBounds('2026-09-01')).toEqual({ monday: '2026-08-31', sunday: '2026-09-06' });
  });

  it.each(ZONES)('gives identical results in %s', (tz) => {
    inZone(tz, () => {
      expect(addDays('2026-08-30', 1)).toBe('2026-08-31');
      expect(weekBounds('2026-08-30')).toEqual({ monday: '2026-08-24', sunday: '2026-08-30' });
      expect(weekdayInitial('2026-08-30')).toBe('S');
    });
  });
});

describe('journeyToday: start_date + (current_day - 1), zone-independent', () => {
  it.each(ZONES)('in %s: day 35 of a journey started Mon 2026-07-27 is Sun 2026-08-30', (tz) => {
    inZone(tz, () => {
      expect(journeyToday({ start_date: '2026-07-27', current_day: 35 })).toBe('2026-08-30');
    });
  });

  it('day 1 is the start date itself; day 0 clamps to it', () => {
    expect(journeyToday({ start_date: '2026-07-27', current_day: 1 })).toBe('2026-07-27');
    expect(journeyToday({ start_date: '2026-07-27', current_day: 0 })).toBe('2026-07-27');
  });

  it('holds across a New Year boundary', () => {
    expect(journeyToday({ start_date: '2026-12-30', current_day: 5 })).toBe('2027-01-03');
  });
});

describe('weekAround: the server days that fall in this Mon–Sun week', () => {
  // A PPL week ending on Sunday 2026-08-30 (today = day 35 = Pull).
  const week: JourneyDay[] = [
    day('2026-08-23', 'legs'), // previous week — excluded
    day('2026-08-24', 'push'), // Mon
    day('2026-08-25', 'pull'), // Tue
    day('2026-08-26', 'legs'), // Wed
    day('2026-08-27', 'push'), // Thu
    day('2026-08-28', 'pull'), // Fri
    day('2026-08-29', 'legs'), // Sat
    day('2026-08-30', 'pull'), // Sun  <-- today
    day('2026-08-31', 'push'), // next week — excluded
  ];

  it.each(ZONES)('in %s: exactly Mon 24th → Sun 30th, in order', (tz) => {
    inZone(tz, () => {
      const got = weekAround(week, '2026-08-30');
      expect(got.map((d) => d.planned_on)).toEqual([
        '2026-08-24',
        '2026-08-25',
        '2026-08-26',
        '2026-08-27',
        '2026-08-28',
        '2026-08-29',
        '2026-08-30',
      ]);
      // The bug: the "today" column (planned_on === today) must be Sunday's
      // Pull, not Saturday's Legs/Push.
      const todayCol = got.find((d) => d.planned_on === '2026-08-30');
      expect(todayCol?.split).toBe('pull');
    });
  });

  it('returns [] for an unparseable anchor rather than throwing', () => {
    expect(weekAround(week, 'nope')).toEqual([]);
  });
});
