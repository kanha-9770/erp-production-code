"use client";

import { useEffect, useState } from "react";

/**
 * Centralised access to the user's chosen timezone.
 *
 * The Profile → Preferences page writes the picked timezone to the
 * `profile.preferences.v1` localStorage entry. Any code that needs to
 * render a date/time in the user's local zone — attendance times, audit
 * timestamps, payroll dates, etc. — should:
 *
 *   import { useUserTimezone, formatTimeInUserZone } from "@/lib/user-timezone";
 *
 * and call `formatTimeInUserZone(iso)` instead of `toLocaleTimeString()`.
 *
 * Components that should re-render when the user changes their timezone
 * (e.g. an open attendance table while the user updates Preferences in a
 * different tab) call `useUserTimezone()` — it subscribes to two signals:
 *
 *   1. A same-tab `usertz:changed` CustomEvent dispatched by Preferences.
 *   2. The standard cross-tab `storage` event for the preferences key.
 */

const STORAGE_KEY = "profile.preferences.v1";
const EVENT_NAME = "usertz:changed";

function fallbackTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Read the saved timezone synchronously. SSR-safe; returns "UTC" on the server. */
export function getUserTimezone(): string {
  if (typeof window === "undefined") return "UTC";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallbackTimezone();
    const parsed = JSON.parse(raw) as { timezone?: unknown };
    if (typeof parsed?.timezone === "string" && parsed.timezone) {
      return parsed.timezone;
    }
  } catch {
    /* ignore */
  }
  return fallbackTimezone();
}

/**
 * Notify the rest of the app that the saved timezone changed. Call this
 * after writing to localStorage (Preferences `save()` does). The custom
 * event covers same-tab listeners; the browser's native `storage` event
 * covers other open tabs automatically when localStorage changes.
 */
export function notifyTimezoneChanged(tz: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: { timezone: tz } }),
  );
}

/**
 * React hook. Returns the current timezone and re-renders the calling
 * component whenever the user changes it. Use anywhere a value formatted
 * with `formatTimeInUserZone` etc. should stay in sync.
 */
export function useUserTimezone(): string {
  const [tz, setTz] = useState<string>(() =>
    typeof window === "undefined" ? "UTC" : getUserTimezone(),
  );
  useEffect(() => {
    const update = () => setTz(getUserTimezone());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) update();
    };
    window.addEventListener(EVENT_NAME, update);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, update);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return tz;
}

// ─────────────────────────────────────────────────────────────────────────
// Formatting helpers — all read the timezone at call time, so any
// component that subscribes via `useUserTimezone()` will re-render and
// pick up the new zone on its next paint.
// ─────────────────────────────────────────────────────────────────────────

type DateInput = Date | string | number | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** "10:58" — hour:minute, 24-hour, in the user's timezone. */
export function formatTimeInUserZone(input: DateInput, fallback = "—"): string {
  const d = toDate(input);
  if (!d) return fallback;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: getUserTimezone(),
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

/** "10:58:42" — hour:minute:second, 24-hour, in the user's timezone. */
export function formatTimeWithSecondsInUserZone(
  input: DateInput,
  fallback = "—",
): string {
  const d = toDate(input);
  if (!d) return fallback;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: getUserTimezone(),
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

/** "Thu, 07 May 2026" — short weekday + day-month-year, in the user's zone. */
export function formatDateInUserZone(input: DateInput, fallback = "—"): string {
  const d = toDate(input);
  if (!d) return fallback;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: getUserTimezone(),
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

/** "Thu, 07 May 2026, 10:58" — long-form date + time, in the user's zone. */
export function formatDateTimeInUserZone(
  input: DateInput,
  fallback = "—",
): string {
  const d = toDate(input);
  if (!d) return fallback;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: getUserTimezone(),
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/**
 * Render a `YYYY-MM-DD` date key in the user's zone with a friendly label.
 * Used by the attendance tables — the date is just a calendar key, not a
 * timestamp, so we construct a midday Date so DST rollovers don't bump it.
 */
export function formatDateKeyInUserZone(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length < 10) return yyyymmdd;
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return yyyymmdd;
  // Midday UTC keeps the calendar day stable across timezones.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return formatDateInUserZone(dt);
}
