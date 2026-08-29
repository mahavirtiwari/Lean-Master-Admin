/**
 * Timestamps for applicant-facing screens.
 *
 * The API stores and returns UTC; the scheme is run to Indian time, so that is
 * what gets shown — pinned to Asia/Kolkata rather than the viewer's machine
 * clock, so a laptop left on another timezone does not quietly restate when
 * something happened.
 */

const IST = 'Asia/Kolkata';

/** Reads an API timestamp. A value with no offset is UTC, as the API sends it. */
function parse(iso: string): Date | null {
  if (!iso) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  const d = new Date(hasZone ? iso : iso + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "29 Aug 2026" */
export function istDate(iso: string, fallback = '—'): string {
  const d = parse(iso);
  if (!d) return fallback;
  return d.toLocaleDateString('en-IN', {
    timeZone: IST, day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** "29 Aug 2026, 08:13 AM" */
export function istDateTime(iso: string, fallback = ''): string {
  const d = parse(iso);
  if (!d) return fallback;
  const date = istDate(iso);
  const time = d.toLocaleTimeString('en-IN', {
    timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true,
  });
  return `${date}, ${time.toUpperCase()}`;
}
