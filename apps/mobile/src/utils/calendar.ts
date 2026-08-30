/**
 * Calendar-date arithmetic that is safe in every timezone.
 *
 * These are NOT display helpers (see `format.ts` for those). They decide
 * *which day is which* — which pip on the week strip is "today", which
 * `planned_on` rows fall inside this week — so they must never disagree with
 * the server, which reckons the date in the member's branch timezone.
 *
 * The rule: a `YYYY-MM-DD` from the API is a plain calendar date with no time
 * or zone. Parse it at UTC midnight and read it back with UTC getters, so a
 * device in Asia/Kolkata (UTC+5:30) and one in America/Los_Angeles land on
 * the same day. The bug this replaces did `new Date("2026-08-30T00:00:00")`
 * (device-local midnight) then `.toISOString().slice(0, 10)` (back to UTC),
 * which silently moved every date one day earlier for any member east of
 * UTC.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a `YYYY-MM-DD` calendar date as a UTC-midnight instant. */
export function parseISODate(iso: string): Date | null {
  if (!ISO_DATE.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format a Date back to `YYYY-MM-DD` using its UTC fields. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `iso` shifted by `days` (may be negative), still `YYYY-MM-DD`. */
export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  if (!date) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
export function weekdayIndex(iso: string): number {
  const date = parseISODate(iso);
  return date ? date.getUTCDay() : 0;
}

/** Single-letter column header: S M T W T F S. */
export function weekdayInitial(iso: string): string {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][weekdayIndex(iso)] ?? '?';
}

/**
 * The Monday-to-Sunday week that contains `iso` (the SLAM week starts
 * Monday), as inclusive `YYYY-MM-DD` bounds.
 */
export function weekBounds(iso: string): { monday: string; sunday: string } | null {
  if (!parseISODate(iso)) return null;
  // getUTCDay(): 0=Sun. Days since Monday = (dow + 6) % 7.
  const backToMonday = (weekdayIndex(iso) + 6) % 7;
  const monday = addDays(iso, -backToMonday);
  return { monday, sunday: addDays(monday, 6) };
}
