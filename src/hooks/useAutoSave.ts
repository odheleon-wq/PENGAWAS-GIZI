import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearScopedDraftBackup,
  saveScopedDraftBackup,
} from '../utils/sessionStorage';

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions<T> {
  /** Current editable value */
  value: T;
  /** Canonical serialization string of the last value loaded from server/store */
  serverHash: string;
  /** Async save callback */
  onSave: (value: T) => Promise<void>;
  /** Optional unique key to disable or reset tracking when switching documents/dates */
  scopeKey: string;
  /** Optional uid for emergency localStorage draft backup */
  uid?: string;
  /** Whether auto-save is active (e.g., disable before required fields exist) */
  enabled?: boolean;
  /** Debounce delay in ms (default 850ms) */
  delayMs?: number;
  /** Custom serializer to compare draft vs server (defaults to JSON.stringify) */
  serialize?: (val: T) => string;
}

export interface UseAutoSaveResult {
  status: AutoSaveStatus;
  lastSavedAtLabel: string;
  errorMessage: string | null;
  /** Call when resetting/loading fresh data from server so it won't immediately re-trigger a write */
  markSynced: (hash: string) => void;
  /** Immediately flush any pending changes */
  flushNow: () => Promise<void>;
}

function formatClockLabel(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}.${mm}.${ss}`;
}

export function useAutoSave<T>({
  value,
  serverHash,
  onSave,
  scopeKey,
  uid,
  enabled = true,
  delayMs = 850,
  serialize,
}: UseAutoSaveOptions<T>): UseAutoSaveResult {
  const serializeFn = serialize || ((v: T) => JSON.stringify(v));
  const currentHash = serializeFn(value);

  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAtLabel, setLastSavedAtLabel] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lastSyncedHashRef = useRef<string>(serverHash);
  const lastScopeKeyRef = useRef<string>(scopeKey);
  const latestValueRef = useRef<T>(value);
  const latestHashRef = useRef<string>(currentHash);
  const onSaveRef = useRef(onSave);
  const enabledRef = useRef(enabled);
  const uidRef = useRef(uid);
  const scopeRef = useRef(scopeKey);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<boolean>(false);

  latestValueRef.current = value;
  latestHashRef.current = currentHash;
  onSaveRef.current = onSave;
  enabledRef.current = enabled;
  uidRef.current = uid;
  scopeRef.current = scopeKey;

  // When switching scope/document, update baseline hash without flushing old hash wrongly
  if (lastScopeKeyRef.current !== scopeKey) {
    lastScopeKeyRef.current = scopeKey;
    lastSyncedHashRef.current = serverHash;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // Keep baseline synced when server snapshot catches up to what we already saved
  useEffect(() => {
    if (serverHash === latestHashRef.current) {
      lastSyncedHashRef.current = serverHash;
    }
  }, [serverHash]);

  const markSynced = useCallback((hash: string) => {
    lastSyncedHashRef.current = hash;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  const executeSave = useCallback(async () => {
    if (!enabledRef.current) return;
    const hashToSave = latestHashRef.current;
    if (hashToSave === lastSyncedHashRef.current) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setStatus('saving');
    setErrorMessage(null);
    const snapshotValue = latestValueRef.current;

    try {
      await onSaveRef.current(snapshotValue);
      lastSyncedHashRef.current = hashToSave;
      if (uidRef.current && scopeRef.current) {
        clearScopedDraftBackup(uidRef.current, scopeRef.current);
      }
      setLastSavedAtLabel(formatClockLabel());
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal menyimpan otomatis.'
      );
    } finally {
      inFlightRef.current = false;
      // If user kept typing while in flight, schedule another pass
      if (
        enabledRef.current &&
        latestHashRef.current !== lastSyncedHashRef.current &&
        !timerRef.current
      ) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void executeSave();
        }, delayMs);
      }
    }
  }, [delayMs]);

  const flushNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await executeSave();
  }, [executeSave]);

  // Debounce save whenever currentHash differs from lastSyncedHashRef
  useEffect(() => {
    if (!enabled) return;
    if (currentHash === lastSyncedHashRef.current) {
      return;
    }

    // Always write synchronous localStorage draft backup first so nothing is lost on sudden close
    if (uid && scopeKey) {
      saveScopedDraftBackup(uid, scopeKey, value);
    }

    setStatus('pending');
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void executeSave();
    }, delayMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentHash, enabled, delayMs, uid, scopeKey, value, executeSave]);

  // Flush on page hide / tab switch / unmount
  useEffect(() => {
    const handleVisibilityOrHide = () => {
      if (
        document.visibilityState === 'hidden' &&
        enabledRef.current &&
        latestHashRef.current !== lastSyncedHashRef.current
      ) {
        if (uidRef.current && scopeRef.current) {
          saveScopedDraftBackup(uidRef.current, scopeRef.current, latestValueRef.current);
        }
        void executeSave();
      }
    };

    const handleBeforeUnload = () => {
      if (
        enabledRef.current &&
        latestHashRef.current !== lastSyncedHashRef.current
      ) {
        if (uidRef.current && scopeRef.current) {
          saveScopedDraftBackup(uidRef.current, scopeRef.current, latestValueRef.current);
        }
        void executeSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrHide);
    window.addEventListener('pagehide', handleBeforeUnload);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrHide);
      window.removeEventListener('pagehide', handleBeforeUnload);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (
        enabledRef.current &&
        latestHashRef.current !== lastSyncedHashRef.current
      ) {
        void executeSave();
      }
    };
  }, [executeSave]);

  return {
    status,
    lastSavedAtLabel,
    errorMessage,
    markSynced,
    flushNow,
  };
}
