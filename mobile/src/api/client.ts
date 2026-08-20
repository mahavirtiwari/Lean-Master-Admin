import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../config';
import { getCache, putCache } from '../offline/db';

/** Thrown when the server answered, but with a refusal. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown when the server could not be reached at all. */
export class OfflineError extends Error {
  constructor(message = 'No connection. Your work is saved on this device.') {
    super(message);
    this.name = 'OfflineError';
  }
}

function readsLikeProse(text: string): boolean {
  const trimmed = text.trim();

  return (
    trimmed.length > 0 &&
    trimmed.length <= 400 &&
    !trimmed.includes('\n') &&
    !trimmed.includes('Exception') &&
    !/ at [A-Z]/.test(trimmed)
  );
}

let bearer: string | null = null;

export function setBearer(token: string | null): void {
  bearer = token;
}

/** The session token, for the few calls that do not go through request(). */
export function getBearer(): string | null {
  return bearer;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skips the Authorization header — the registration wizard is anonymous. */
  anonymous?: boolean;
}

/**
 * One request.
 *
 * A refusal (4xx/5xx) and an unreachable server are different failures and are
 * raised as different errors: the first is something the applicant must fix,
 * the second is something the app can work around by saving locally. Callers
 * that blur the two end up telling somebody their details are wrong when the
 * lift simply has no signal.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer && !options.anonymous ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      let message = `That did not work (${response.status}).`;
      let code: string | undefined;

      try {
        const parsed = JSON.parse(text) as { message?: string; detail?: string; code?: string };
        code = parsed.code;

        if (parsed.message) {
          message = parsed.message;
        } else if (parsed.detail && readsLikeProse(parsed.detail)) {
          // ProblemDetails.Detail carries the exception dump outside
          // production, so it is only shown when it reads like a sentence
          // written for a person — never a stack trace.
          message = parsed.detail;
        }
      } catch {
        // A non-JSON error body is the server's own page; keep the default.
      }

      throw new ApiError(response.status, message, code);
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    // AbortError and TypeError('Network request failed') both mean the same
    // thing to the caller: the server is not reachable right now.
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A GET whose last good answer is kept.
 *
 * Returns the cached copy when the network is unavailable, so reference data —
 * the awareness programmes, the registration guide — is present offline
 * instead of leaving an empty list that looks like a fault.
 */
export async function cachedGet<T>(
  path: string,
  cacheKey: string,
  // The registration endpoints are anonymous; the dashboard is not, and
  // sending it without the bearer would simply 401.
  options: { anonymous?: boolean } = { anonymous: true },
): Promise<{ data: T | null; stale: boolean }> {
  try {
    const data = await request<T>(path, { anonymous: options.anonymous ?? true });
    await putCache(cacheKey, data);
    return { data, stale: false };
  } catch (error) {
    if (error instanceof ApiError) throw error;

    const cached = await getCache<T>(cacheKey);
    return { data: cached ? cached.value : null, stale: true };
  }
}
