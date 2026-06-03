"use client";

import { Badge } from "@/components/ui/badge";

/**
 * Approved-leave description attached to an attendance row by the server
 * (lib/hr/attendance-day-fill.ts). Present on any day an approved leave
 * covers — including days the employee ALSO punched — so the leave is visible
 * instead of being hidden behind an hours-based Present / Half-Day badge.
 *
 * Lives in its own tiny module (just Badge) so the My Attendance table can show
 * the chip without statically pulling in the heavy, code-split
 * AttendanceRecordDetail panel.
 */
export interface LeaveInfo {
  typeName: string;
  /** SHORT_LEAVE = a fixed few-hour window; HALF_DAY = morning/afternoon. */
  kind: "FULL_DAY" | "HALF_DAY" | "SHORT_LEAVE";
  half: "FIRST" | "SECOND" | null;
  startTime: string | null;
  endTime: string | null;
  /** Compact label for the row chip, e.g. "Short 13:00–15:00", "½ Casual Leave". */
  chipLabel: string;
  /** Full sentence for the tooltip / detail panel. */
  detailLabel: string;
}

/**
 * Small blue chip shown next to the status badge whenever an approved leave
 * covers the day. Carries the compact label with the full sentence in a native
 * tooltip so a worked half-day / short-leave day still reveals the leave.
 */
export function LeaveChip({ leave }: { leave: LeaveInfo }) {
  return (
    <Badge
      variant="outline"
      className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] whitespace-nowrap"
      title={leave.detailLabel}
    >
      {leave.chipLabel}
    </Badge>
  );
}
