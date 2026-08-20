import NetInfo from '@react-native-community/netinfo';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { request, setBearer } from '../api/client';
import { deleteItem, getItem, setItem } from './secureStore';
import { clearDraft, openDatabase, pendingCount, readDraft, writeDraft } from '../offline/db';
import { drainOutbox } from '../offline/sync';

const TOKEN_KEY = 'mcls.accessToken';
const USER_KEY = 'mcls.user';

export interface SignedInUser {
  userCode: string;
  fullName: string;
  email: string | null;
}

/** Everything the wizard has collected. Persisted after every step. */
export interface DraftState {
  sessionToken: string | null;
  step: number;
  payload: Record<string, unknown>;
}

interface AppState {
  ready: boolean;
  online: boolean;
  queued: number;

  user: SignedInUser | null;
  signIn(userId: string, password: string): Promise<void>;
  signOut(): Promise<void>;

  draft: DraftState;
  saveDraft(next: Partial<DraftState>): Promise<void>;
  resetDraft(): Promise<void>;

  sync(): Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

const EMPTY_DRAFT: DraftState = { sessionToken: null, step: 1, payload: {} };

export function AppProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);

  // Guards against two drains overlapping when connectivity flaps.
  const draining = useRef(false);

  const refreshQueued = useCallback(async () => {
    setQueued(await pendingCount());
  }, []);

  const sync = useCallback(async () => {
    if (draining.current) return;

    draining.current = true;
    try {
      await drainOutbox();
      await refreshQueued();
    } finally {
      draining.current = false;
    }
  }, [refreshQueued]);

  // ---- start-up: open the database, restore the session and the draft ----
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await openDatabase();

      const [token, storedUser, stored] = await Promise.all([
        getItem(TOKEN_KEY),
        getItem(USER_KEY),
        readDraft(),
      ]);

      if (cancelled) return;

      if (token) {
        setBearer(token);
        if (storedUser) setUser(JSON.parse(storedUser) as SignedInUser);
      }

      if (stored) {
        setDraft({
          sessionToken: stored.sessionToken,
          step: stored.step,
          payload: stored.payload,
        });
      }

      await refreshQueued();
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshQueued]);

  // ---- connectivity: drain the outbox as soon as the network returns ----
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable is null while it is still being determined; treat
      // that as connected rather than flashing an offline banner on every
      // cold start.
      const connected = Boolean(state.isConnected) && state.isInternetReachable !== false;

      setOnline((was) => {
        if (!was && connected) void sync();
        return connected;
      });
    });

    return unsubscribe;
  }, [sync]);

  const signIn = useCallback(async (userId: string, password: string) => {
    const response = await request<{
      accessToken: string;
      user: { userCode: string; fullName: string; email: string | null };
    }>('/api/auth/login', {
      method: 'POST',
      anonymous: true,
      body: { userId: userId.trim(), password },
    });

    const signedIn: SignedInUser = {
      userCode: response.user.userCode,
      fullName: response.user.fullName,
      email: response.user.email,
    };

    setBearer(response.accessToken);
    await setItem(TOKEN_KEY, response.accessToken);
    await setItem(USER_KEY, JSON.stringify(signedIn));
    setUser(signedIn);
  }, []);

  const signOut = useCallback(async () => {
    setBearer(null);
    await deleteItem(TOKEN_KEY);
    await deleteItem(USER_KEY);
    setUser(null);
  }, []);

  const saveDraft = useCallback(
    async (next: Partial<DraftState>) => {
      const merged: DraftState = {
        sessionToken: next.sessionToken ?? draft.sessionToken,
        step: next.step ?? draft.step,
        payload: { ...draft.payload, ...(next.payload ?? {}) },
      };

      setDraft(merged);
      await writeDraft(merged);
    },
    [draft],
  );

  const resetDraft = useCallback(async () => {
    setDraft(EMPTY_DRAFT);
    await clearDraft();
  }, []);

  const value = useMemo<AppState>(
    () => ({ ready, online, queued, user, signIn, signOut, draft, saveDraft, resetDraft, sync }),
    [ready, online, queued, user, signIn, signOut, draft, saveDraft, resetDraft, sync],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}
