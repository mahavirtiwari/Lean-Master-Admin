import * as SQLite from 'expo-sqlite';

/**
 * The local store.
 *
 * Three tables, each answering a different question:
 *
 *  draft   — what the applicant has typed. Written at every step, so closing
 *            the app or walking out of signal loses nothing.
 *  outbox  — requests that could not be sent. Replayed in order when the
 *            connection returns; see sync.ts.
 *  cache   — the last good copy of anything fetched (awareness programmes, the
 *            registration guide, the dashboard), so the app opens with content
 *            rather than with spinners.
 *
 * SQLite rather than AsyncStorage because the outbox has to preserve order and
 * survive a force-quit mid-write, and because a draft is a record with fields
 * rather than one blob.
 */
let handle: SQLite.SQLiteDatabase | null = null;

const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS draft (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  session_token TEXT,
  step          INTEGER NOT NULL DEFAULT 1,
  payload       TEXT    NOT NULL DEFAULT '{}',
  updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  method      TEXT    NOT NULL,
  path        TEXT    NOT NULL,
  body        TEXT,
  created_at  TEXT    NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT
);

CREATE TABLE IF NOT EXISTS cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
`;

export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (handle) return handle;

  handle = await SQLite.openDatabaseAsync('mcls-lean.db');
  await handle.execAsync(SCHEMA);
  return handle;
}

// ------------------------------------------------------------------ draft ---

export interface StoredDraft {
  sessionToken: string | null;
  step: number;
  payload: Record<string, unknown>;
  updatedAt: string;
}

export async function readDraft(): Promise<StoredDraft | null> {
  const db = await openDatabase();

  const row = await db.getFirstAsync<{
    session_token: string | null;
    step: number;
    payload: string;
    updated_at: string;
  }>('SELECT session_token, step, payload, updated_at FROM draft WHERE id = 1');

  if (!row) return null;

  return {
    sessionToken: row.session_token,
    step: row.step,
    payload: safeParse(row.payload),
    updatedAt: row.updated_at,
  };
}

/**
 * Upserts the single draft row.
 *
 * One row, not a table of drafts: the app registers one enterprise at a time,
 * and a half-finished second draft would be impossible to tell apart from the
 * first on a screen that only ever shows one.
 */
export async function writeDraft(draft: Omit<StoredDraft, 'updatedAt'>): Promise<void> {
  const db = await openDatabase();

  await db.runAsync(
    `INSERT INTO draft (id, session_token, step, payload, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       session_token = excluded.session_token,
       step          = excluded.step,
       payload       = excluded.payload,
       updated_at    = excluded.updated_at`,
    draft.sessionToken,
    draft.step,
    JSON.stringify(draft.payload ?? {}),
    new Date().toISOString(),
  );
}

export async function clearDraft(): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM draft WHERE id = 1');
}

// ----------------------------------------------------------------- outbox ---

export interface OutboxEntry {
  id: number;
  method: string;
  path: string;
  body: string | null;
  attempts: number;
  lastError: string | null;
}

export async function enqueue(method: string, path: string, body?: unknown): Promise<void> {
  const db = await openDatabase();

  await db.runAsync(
    'INSERT INTO outbox (method, path, body, created_at) VALUES (?, ?, ?, ?)',
    method,
    path,
    body === undefined ? null : JSON.stringify(body),
    new Date().toISOString(),
  );
}

export async function pending(): Promise<OutboxEntry[]> {
  const db = await openDatabase();

  const rows = await db.getAllAsync<{
    id: number;
    method: string;
    path: string;
    body: string | null;
    attempts: number;
    last_error: string | null;
  }>('SELECT id, method, path, body, attempts, last_error FROM outbox ORDER BY id');

  return rows.map((r) => ({
    id: r.id,
    method: r.method,
    path: r.path,
    body: r.body,
    attempts: r.attempts,
    lastError: r.last_error,
  }));
}

export async function dropFromOutbox(id: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
}

export async function recordFailure(id: number, error: string): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
    error.slice(0, 400),
    id,
  );
}

export async function pendingCount(): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  return row?.n ?? 0;
}

// ------------------------------------------------------------------ cache ---

export async function putCache(key: string, value: unknown): Promise<void> {
  const db = await openDatabase();

  await db.runAsync(
    `INSERT INTO cache (key, value, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`,
    key,
    JSON.stringify(value),
    new Date().toISOString(),
  );
}

export async function getCache<T>(key: string): Promise<{ value: T; fetchedAt: string } | null> {
  const db = await openDatabase();

  const row = await db.getFirstAsync<{ value: string; fetched_at: string }>(
    'SELECT value, fetched_at FROM cache WHERE key = ?',
    key,
  );

  if (!row) return null;
  return { value: safeParse(row.value) as T, fetchedAt: row.fetched_at };
}

/**
 * A cached body that cannot be parsed is treated as absent rather than thrown:
 * a corrupt cache entry must not stop the app from starting.
 */
function safeParse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}
