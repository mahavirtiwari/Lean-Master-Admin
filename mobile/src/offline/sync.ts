import { ApiError, OfflineError, request } from '../api/client';
import { dropFromOutbox, pending, recordFailure } from './db';

/** How many times a queued request is retried before it is given up on. */
const MAX_ATTEMPTS = 5;

export interface SyncResult {
  sent: number;
  failed: number;
  abandoned: number;
}

/**
 * Replays whatever could not be sent, oldest first.
 *
 * In order and one at a time, because the wizard's steps depend on each other —
 * the SPOC details are meaningless before the unit has been chosen. The first
 * one that cannot be sent stops the run: sending later entries past a failed
 * earlier one would apply them out of sequence.
 *
 * A request the server refuses is dropped rather than retried. A 409 on a plant
 * that is already registered will be refused every time, and a queue that never
 * drains is worse than losing the entry — the applicant is told either way.
 */
export async function drainOutbox(): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, failed: 0, abandoned: 0 };
  const queued = await pending();

  for (const entry of queued) {
    try {
      await request(entry.path, {
        method: entry.method as 'POST' | 'PUT' | 'DELETE',
        body: entry.body ? (JSON.parse(entry.body) as unknown) : undefined,
        anonymous: true,
      });

      await dropFromOutbox(entry.id);
      result.sent += 1;
    } catch (error) {
      if (error instanceof ApiError) {
        // The server has an opinion, and it will not change on a retry.
        await dropFromOutbox(entry.id);
        result.abandoned += 1;
        continue;
      }

      if (error instanceof OfflineError) {
        await recordFailure(entry.id, 'unreachable');
        result.failed += 1;

        if (entry.attempts + 1 >= MAX_ATTEMPTS) {
          await dropFromOutbox(entry.id);
          result.abandoned += 1;
        }

        // Stop the run: later entries depend on this one having landed.
        break;
      }

      await recordFailure(entry.id, String(error));
      result.failed += 1;
      break;
    }
  }

  return result;
}
