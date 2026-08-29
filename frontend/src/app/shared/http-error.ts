/**
 * Turns a failed request into something worth showing the applicant.
 *
 * Every screen used to collapse each failure into one message, so a portal that
 * could not reach its own API told people their Udyam number could not be
 * checked, or that they hold no certificates. The cause matters: an unreachable
 * server is not the applicant's problem to fix, an expired session is a sign-in,
 * and a rejected request usually carries a reason the API already wrote.
 */
export function httpErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = error as { status?: number; error?: { message?: string } } | null;
  if (!e) return fallback;

  // Angular reports a network failure, a refused connection or a CORS block as
  // status 0. Behind a proxy — the dev server, or IIS in front of the API —
  // the same situation arrives as a 502/503/504 instead: the front door
  // answered, the API behind it did not. Both mean the request never reached
  // the API, which is a different thing to tell the applicant than a fault in
  // what they typed.
  if (e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504) {
    return 'The portal could not reach the server. Please try again in a moment.';
  }

  if (e.status === 401) return 'Your session has expired. Please sign in again.';
  if (e.status === 403) return 'You do not have access to this.';

  const message = e.error?.message;
  if (typeof message === 'string' && message.trim()) return message;

  if (e.status === 404) return 'That could not be found.';
  if (typeof e.status === 'number' && e.status >= 500) {
    return 'The server had a problem handling that. Please try again in a moment.';
  }

  return fallback;
}
