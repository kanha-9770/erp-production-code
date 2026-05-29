"use client";

import { useEffect, useState } from "react";

/**
 * Org-level timezone cache for attendance displays.
 *
 * Attendance times (check-in / check-out, late minutes, OT windows) are
 * anchored to the organisation's `reportTimezone` set on the Attendance
 * Configuration page — NOT to each user's browser. That's the only way the
 * bell notification ("Checked in at 09:42"), the widget card, and the
 * records table can show the same number for the same row.
 *
 * Flow:
 *   1. Any attendance API that knows the org config (`/api/attendance/today`,
 *      `/api/attendance/history`, `/api/attendance/team`) returns
 *      `reportTimezone` on the response.
 *   2. The fetching component calls `setOrgTimezone(json.reportTimezone)`.
 *   3. Display helpers (`formatTimeShort` in `attendance-format.ts`) read
 *      the cached zone and format ISO timestamps in that zone.
 *
 * Persisted to localStorage so that on a cold reload the table can render
 * sensible times BEFORE the first /today fetch resolves.
 */

const STORAGE_KEY = "attendance.orgTz.v1";
const EVENT_NAME = "orgtz:changed";
const FALLBACK_TZ = "Asia/Kolkata";

/** Sync read. SSR-safe; returns the fallback on the server. */
export function getOrgTimezone(): string {
  if (typeof window === "undefined") return FALLBACK_TZ;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && v.trim().length > 0) return v;
  } catch {
    /* ignore */
  }
  return FALLBACK_TZ;
}

/**
 * Update the cached org tz. No-ops on the server or when the value is
 * unchanged so we don't thrash subscribers each /today poll.
 */
export function setOrgTimezone(tz: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const next = (tz ?? "").trim();
  if (!next) return;
  try {
    if (localStorage.getItem(STORAGE_KEY) === next) return;
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { timezone: next } }));
}

/**
 * React hook. Returns the current org tz and re-renders subscribers when an
 * admin changes `reportTimezone` (covered by the same-tab custom event) or
 * another tab updates it (covered by the cross-tab `storage` event).
 */
export function useOrgTimezone(): string {
  const [tz, setTz] = useState<string>(() =>
    typeof window === "undefined" ? FALLBACK_TZ : getOrgTimezone(),
  );
  useEffect(() => {
    const update = () => setTz(getOrgTimezone());
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

type DateInput = Date | string | number | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** "10:58" — hour:minute, 24-hour, in the org's reportTimezone. */
export function formatTimeInOrgZone(input: DateInput, fallback = "—"): string {
  const d = toDate(input);
  if (!d) return fallback;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: getOrgTimezone(),
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}
