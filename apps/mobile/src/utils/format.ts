/**
 * Display formatting.
 *
 * Every timestamp the API returns is a server-recorded UTC instant. These
 * helpers render it in the device's locale for reading only — no business
 * decision is ever made from a value produced here.
 */

export function timeOfDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' });
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

export function duration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value)}%`;
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** "in 12 min" / "24 min ago", for the shift countdown on the trainer screen. */
export function relativeMinutes(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;

  const minutes = Math.round((target - now) / 60000);
  if (minutes === 0) return 'now';
  if (minutes > 0) {
    if (minutes < 60) return `in ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `in ${hours}h ${minutes % 60}m`;
  }
  const ago = Math.abs(minutes);
  if (ago < 60) return `${ago} min ago`;
  return `${Math.floor(ago / 60)}h ${ago % 60}m ago`;
}

/**
 * Money, in the shortest form that is still exact enough to act on.
 *
 * SLAM talks in lakhs, so ₹1,86,000 reads as ₹1.86L on a tile — but only above
 * a lakh. Below that the rounding hides more than it saves, and a trainer
 * chasing ₹4,800 needs the actual number.
 */
export function money(amount: number | null | undefined, currency = 'INR'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  if (Math.abs(amount) >= 100000) return `${symbol}${(amount / 100000).toFixed(2)}L`;
  return `${symbol}${Math.round(amount).toLocaleString('en-IN')}`;
}
