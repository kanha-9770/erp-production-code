"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MapPin, Edit3, AlertTriangle } from "lucide-react";
import {
  formatDateLong,
  formatHM,
  formatTimeShort,
  workedMinutesFor,
} from "./attendance-format";
import type { AttendanceRecord } from "./attendance-record-detail";
import { useUserTimezone } from "@/lib/user-timezone";

interface Props {
  records: AttendanceRecord[];
  showName?: boolean;
  onSelect: (record: AttendanceRecord) => void;
  // Optional — when present, shows a "Request correction" button on each
  // row that opens a regularization dialog. Used on My Attendance only;
  // the team page handles corrections via the manual-entry button instead.
  onRequestCorrection?: (record: AttendanceRecord) => void;
}

function statusBadge(record: AttendanceRecord): {
  label: string;
  className: string;
} {
  // A live punch (checked in, not yet checked out) is always "Working" —
  // the persisted status only gets stamped at checkout, so during the day
  // it would otherwise read as the previous run's value (or null).
  if (record.checkedIn && !record.checkedOut) {
    return {
      label: "Working",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    };
  }
  switch ((record.status ?? "").toUpperCase()) {
    case "PRESENT":
      return {
        label: "Present",
        className: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
    case "HALF":
    case "HALF_DAY":
      return {
        label: "Half Day",
        className: "bg-amber-100 text-amber-800 border-amber-200",
      };
    case "ABSENT":
      return {
        label: "Absent",
        className: "bg-red-100 text-red-700 border-red-200",
      };
    case "ON_LEAVE":
      return {
        label: "On Leave",
        className: "bg-blue-100 text-blue-800 border-blue-200",
      };
    case "HOLIDAY":
      return {
        label: "Holiday",
        className: "bg-purple-100 text-purple-800 border-purple-200",
      };
    case "WEEKLY_OFF":
      return {
        label: "Weekly Off",
        className: "bg-slate-100 text-slate-700 border-slate-200",
      };
    case "REGULARIZED":
      return {
        label: "Regularized",
        className: "bg-indigo-100 text-indigo-800 border-indigo-200",
      };
  }
  // Fallback for older rows where status was never written: a checked-out
  // row still counts as Present, anything else with no signal is Absent.
  if (record.checkedOut) {
    return {
      label: "Present",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    };
  }
  return {
    label: "Absent",
    className: "bg-red-100 text-red-700 border-red-200",
  };
}

export function AttendanceRecordsTable({
  records,
  showName = false,
  onSelect,
  onRequestCorrection,
}: Props) {
  // Subscribe so the rendered times update live when the user changes
  // their timezone in Profile → Preferences. The hook only triggers a
  // re-render; the actual zone is read inside the format helpers.
  useUserTimezone();
  if (records.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-500">
        No attendance records in this range.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Date</TableHead>
            {showName && <TableHead>Name</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead className="whitespace-nowrap">Check-In</TableHead>
            <TableHead className="whitespace-nowrap">Check-Out</TableHead>
            <TableHead className="whitespace-nowrap">Worked</TableHead>
            <TableHead className="whitespace-nowrap">Late</TableHead>
            <TableHead className="whitespace-nowrap">Overtime</TableHead>
            <TableHead>Proof</TableHead>
            <TableHead>Where</TableHead>
            {onRequestCorrection && <TableHead className="text-right">Fix</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r) => {
            const badge = statusBadge(r);
            const worked = workedMinutesFor(r);
            const hasGeo =
              r.checkInLat != null || r.checkOutLat != null;
            const hasPhoto = !!(r.checkInPhoto || r.checkOutPhoto);
            return (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => onSelect(r)}
              >
                <TableCell className="font-medium whitespace-nowrap">
                  {formatDateLong(r.date)}
                </TableCell>
                {showName && (
                  <TableCell className="whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {r.userName ?? r.userEmail ?? r.userId}
                    </div>
                    {r.userName && r.userEmail && (
                      <div className="text-[11px] text-gray-500">
                        {r.userEmail}
                      </div>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant="outline" className={badge.className}>
                    {badge.label}
                  </Badge>
                  {r.isAutoCheckedOut && (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-gray-500">
                      auto
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {r.checkInAt ? formatTimeShort(r.checkInAt) : r.checkInTime || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {r.checkOutAt ? formatTimeShort(r.checkOutAt) : r.checkOutTime || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {worked > 0 ? formatHM(worked) : "—"}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap tabular-nums ${
                    r.lateMinutes > 0 ? "text-amber-700" : ""
                  }`}
                >
                  {r.lateMinutes > 0 ? formatHM(r.lateMinutes) : "—"}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap tabular-nums ${
                    r.overtimeMinutes > 0 ? "text-blue-700" : ""
                  }`}
                >
                  {r.overtimeMinutes > 0 ? formatHM(r.overtimeMinutes) : "—"}
                </TableCell>
                <TableCell>
                  {hasPhoto ? (
                    <div
                      className="flex items-center gap-1"
                      // Stop the click from bubbling to the row's onSelect —
                      // clicking the photo should open the full-size preview
                      // (via the row click) but tapping the thumb itself
                      // shouldn't trigger any link the cell may carry.
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.checkInPhoto && (
                        <PhotoThumb
                          src={r.checkInPhoto}
                          alt={`Check-in selfie for ${r.userName ?? r.userEmail ?? "user"}`}
                          title="Check-in proof"
                        />
                      )}
                      {r.checkOutPhoto && (
                        <PhotoThumb
                          src={r.checkOutPhoto}
                          alt={`Check-out selfie for ${r.userName ?? r.userEmail ?? "user"}`}
                          title="Check-out proof"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.checkInOutsideRadius || r.checkOutOutsideRadius ? (
                    <Badge
                      variant="outline"
                      className="bg-red-50 text-red-800 border-red-200 text-[10px] uppercase whitespace-nowrap"
                      title={
                        r.checkInOutsideRadius && r.checkInDistanceM != null
                          ? `Check-in ${r.checkInDistanceM}m from office`
                          : r.checkOutOutsideRadius &&
                              r.checkOutDistanceM != null
                            ? `Check-out ${r.checkOutDistanceM}m from office`
                            : "Punch outside the configured radius"
                      }
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Out of radius
                    </Badge>
                  ) : r.checkInLocationMissing || r.checkOutLocationMissing ? (
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-900 border-amber-200 text-[10px] uppercase whitespace-nowrap"
                      title="The user punched without sharing GPS — geofence check did not run"
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      No location
                    </Badge>
                  ) : hasGeo ? (
                    <MapPin className="h-3.5 w-3.5 text-blue-600" />
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>
                {onRequestCorrection && (
                  <TableCell
                    className="text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onRequestCorrection(r)}
                    >
                      <Edit3 className="h-3 w-3 mr-1" />
                      Fix
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Compact photo thumbnail for the Proof column. 28×28 rounded avatar that
 * pops a large preview on hover/focus. We use a native <img> rather than
 * next/image because the photo URLs are admin-uploaded blobs from our own
 * uploader — they don't need the optimisation pipeline and skipping it
 * avoids the "remotePatterns not configured" runtime warning that next
 * /image throws for arbitrary hosts.
 */
function PhotoThumb({
  src,
  alt,
  title,
}: {
  src: string;
  alt: string;
  title: string;
}) {
  return (
    <span className="group relative inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-7 w-7 rounded-full object-cover border border-gray-200 hover:ring-2 hover:ring-blue-400 transition-shadow"
      />
      {/* Hover preview — absolute-positioned so it doesn't reflow the row
          and pointer-events-none so it never blocks the cell click. */}
      <span
        className="pointer-events-none absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        aria-hidden
      >
        <span className="block rounded-lg border border-gray-200 bg-white p-1 shadow-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="block h-40 w-40 object-cover rounded-md"
          />
          <span className="block text-[10px] text-center text-gray-500 mt-1">
            {title}
          </span>
        </span>
      </span>
    </span>
  );
}
