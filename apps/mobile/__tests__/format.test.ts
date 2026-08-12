/** Display helpers. Nothing here makes a business decision — see format.ts. */

import { duration, initials, percent, relativeMinutes, timeOfDay } from '../src/utils/format';

describe('duration', () => {
  it('renders hours and minutes', () => {
    expect(duration(178)).toBe('2h 58m');
    expect(duration(120)).toBe('2h');
    expect(duration(45)).toBe('45m');
  });

  it('shows a dash rather than "0m" for nothing worked', () => {
    expect(duration(0)).toBe('—');
    expect(duration(null)).toBe('—');
    expect(duration(undefined)).toBe('—');
  });
});

describe('percent', () => {
  it('rounds to a whole number', () => {
    expect(percent(94.4)).toBe('94%');
    expect(percent(0)).toBe('0%');
  });

  it('does not invent a value when there is none', () => {
    expect(percent(null)).toBe('—');
  });
});

describe('initials', () => {
  it('takes at most two initials', () => {
    expect(initials('Vikas Menon')).toBe('VM');
    expect(initials('Rahul Prasad Deshpande')).toBe('RP');
    expect(initials('Divya')).toBe('D');
  });

  it('never renders an empty avatar', () => {
    expect(initials('   ')).toBe('?');
  });
});

describe('timeOfDay', () => {
  it('is a dash when nothing was recorded', () => {
    expect(timeOfDay(null)).toBe('—');
    expect(timeOfDay(undefined)).toBe('—');
    expect(timeOfDay('not-a-date')).toBe('—');
  });

  it('renders a real timestamp', () => {
    expect(timeOfDay('2026-08-12T12:30:00Z')).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('relativeMinutes', () => {
  const now = new Date('2026-08-12T12:00:00Z').getTime();

  it('counts forward to a shift that has not started', () => {
    expect(relativeMinutes('2026-08-12T12:12:00Z', now)).toBe('in 12 min');
    expect(relativeMinutes('2026-08-12T14:30:00Z', now)).toBe('in 2h 30m');
  });

  it('counts back from one that has', () => {
    expect(relativeMinutes('2026-08-12T11:36:00Z', now)).toBe('24 min ago');
  });

  it('says "now" at the boundary', () => {
    expect(relativeMinutes('2026-08-12T12:00:00Z', now)).toBe('now');
  });

  it('returns null when there is no shift', () => {
    expect(relativeMinutes(null, now)).toBeNull();
  });
});
