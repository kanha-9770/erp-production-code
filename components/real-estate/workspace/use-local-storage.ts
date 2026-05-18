"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * SSR-safe localStorage state. Reads on mount (so the server render is the
 * default), writes synchronously thereafter.
 *
 * Sync strategy:
 *   - Cross-tab: the browser's `storage` event keeps two tabs in agreement.
 *   - Same-tab: the `storage` event does NOT fire for writes from the same
 *     window, so two `useLocalStorage(key)` instances inside the same page
 *     used to drift apart (e.g. DataTable's own prefs vs. ManageColumns's
 *     prefs both keyed by the same table id). We now broadcast our own
 *     `same-window` event so every hook subscribed to `key` re-syncs after
 *     any other hook writes.
 */

// Custom event name carries the key + the new value. Anything subscribed
// to the same key catches it. We use CustomEvent (not StorageEvent) so we
// don't conflict with browser cross-tab events.
const SAME_WINDOW_EVENT = "use-local-storage:same-window";
interface SameWindowDetail<T> {
  key: string;
  value: T;
}

export function useLocalStorage<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      // Bad JSON — ignore and fall back to initial.
    } finally {
      setHydrated(true);
    }
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded — drop silently.
    }
    // Notify other hooks in THIS window that the value changed. We dispatch
    // after the write so listeners reading window.localStorage as a fallback
    // see the latest. This is what fixes the dialog vs. table sync gap.
    try {
      window.dispatchEvent(
        new CustomEvent<SameWindowDetail<T>>(SAME_WINDOW_EVENT, {
          detail: { key, value },
        }),
      );
    } catch {
      // CustomEvent not constructible — IE-only edge case, ignore.
    }
  }, [key, value, hydrated]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        // ignore
      }
    };
    const onSameWindow = (e: Event) => {
      const ce = e as CustomEvent<SameWindowDetail<T>>;
      if (!ce.detail || ce.detail.key !== key) return;
      // Identity check on value object would skip equal-but-different
      // references; functional setState handles dedup naturally because
      // React bails on identical state with Object.is.
      setValue(ce.detail.value);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SAME_WINDOW_EVENT, onSameWindow as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        SAME_WINDOW_EVENT,
        onSameWindow as EventListener,
      );
    };
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) =>
        typeof next === "function" ? (next as (p: T) => T)(prev) : next,
      );
    },
    [],
  );

  const reset = useCallback(() => {
    setValue(initial);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    // Broadcast reset too so other instances drop back to defaults.
    try {
      window.dispatchEvent(
        new CustomEvent<SameWindowDetail<T>>(SAME_WINDOW_EVENT, {
          detail: { key, value: initial },
        }),
      );
    } catch {
      // ignore
    }
  }, [key, initial]);

  return [value, update, reset];
}
