// Shared formatting helpers used by both My Attendance and Team Attendance
// pages. Kept tiny and pure so they're cheap to call inside table cells
// without spinning up extra deps.

import { formatDateKeyInUserZone } from "@/lib/user-timezone";
import { formatTimeInOrgZone } from "@/lib/org-timezone";

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatHM(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

export function formatHMS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function formatDateLong(yyyymmdd: string): string {
  // Date keys are calendar days, not timestamps — render them in the
  // user's chosen zone so the weekday label matches their local calendar.
  return formatDateKeyInUserZone(yyyymmdd);
}

export function formatTimeShort(iso: string | null): string {
  // ISO timestamps stored on attendance rows are absolute moments. Format
  // them in the **org's** reportTimezone (set on the Attendance
  // Configuration page) so the widget card, the records table, the bell
  // notification and HR's team view all show the same wall-clock time for
  // the same row — regardless of which zone the viewing user happens to
  // be in.
  return formatTimeInOrgZone(iso);
}

export function workedMinutesFor(record: {
  checkInAt: string | null;
  checkOutAt: string | null;
}): number {
  if (!record.checkInAt || !record.checkOutAt) return 0;
  const a = new Date(record.checkInAt).getTime();
  const b = new Date(record.checkOutAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 60_000);
}

export function mapsLink(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
}

export function shiftDays(yyyymmdd: string, delta: number): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
