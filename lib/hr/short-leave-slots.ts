/**
 * Short-leave slot math — a tiny, dependency-free helper shared by the leave
 * apply form (client) and the leave service (server) so both derive the exact
 * same windows from one source of truth.
 *
 * A short leave is a FIXED-duration absence equal to the org's
 * `shortLeaveHours` window (Attendance Config → "Short-leave window (hours)").
 * The employee can't pick an arbitrary time — they choose one of two PRESET
 * slots anchored to the shift:
 *
 *   • Start of shift : shiftStart            → shiftStart + window
 *   • End of shift   : shiftEnd  − window    → shiftEnd
 *
 * The slot id reuses the existing LeaveDuration enum values
 * (HALF_DAY_FIRST = start-anchored, HALF_DAY_SECOND = end-anchored) so no
 * schema enum change is needed — only the concrete clock times are new.
 */

export type ShortLeaveSlotId = "HALF_DAY_FIRST" | "HALF_DAY_SECOND";

export interface ShortLeaveSlot {
  id: ShortLeaveSlotId;
  /** Human label for the slot, e.g. "Start of shift". */
  label: string;
  /** "HH:MM" in the org's shift clock. */
  startTime: string;
  endTime: string;
}

function toMinutes(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function fromMinutes(total: number): string {
  // Clamp into a single day so a window that runs past midnight (mis-config)
  // still renders a sane label instead of a negative/overflowing time.
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Build the two preset short-leave slots for a shift + window. Returns `[]`
 * when the shift times or window are missing/invalid so callers can fall back
 * to a "configure attendance settings first" hint instead of rendering broken
 * times. The window must be strictly positive and shorter than the shift span.
 */
export function computeShortLeaveSlots(
  shiftStart: string | null | undefined,
  shiftEnd: string | null | undefined,
  windowHours: number | null | undefined,
): ShortLeaveSlot[] {
  const startMin = toMinutes(shiftStart);
  const endMin = toMinutes(shiftEnd);
  const win = Math.round((Number(windowHours) || 0) * 60);
  if (startMin == null || endMin == null) return [];
  if (win <= 0) return [];
  // Window can't be longer than the shift itself — otherwise the two slots
  // would overlap or invert.
  if (endMin - startMin < win) return [];
  return [
    {
      id: "HALF_DAY_FIRST",
      label: "Start of shift",
      startTime: fromMinutes(startMin),
      endTime: fromMinutes(startMin + win),
    },
    {
      id: "HALF_DAY_SECOND",
      label: "End of shift",
      startTime: fromMinutes(endMin - win),
      endTime: fromMinutes(endMin),
    },
  ];
}

/** Resolve the concrete slot for a chosen duration, or null if it doesn't map. */
export function slotForDuration(
  duration: string,
  shiftStart: string | null | undefined,
  shiftEnd: string | null | undefined,
  windowHours: number | null | undefined,
): ShortLeaveSlot | null {
  const slots = computeShortLeaveSlots(shiftStart, shiftEnd, windowHours);
  return slots.find((s) => s.id === duration) ?? null;
}

/** "2h", "1.5h", "0.5h" — compact label for a window length in hours. */
export function formatWindowHours(hours: number | null | undefined): string {
  const h = Number(hours) || 0;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}
