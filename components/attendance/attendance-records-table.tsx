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
import { Camera, MapPin, Edit3 } from "lucide-react";
import {
  formatDateLong,
  formatHM,
  formatTimeShort,
  workedMinutesFor,
} from "./attendance-format";
import type { AttendanceRecord } from "./attendance-record-detail";

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
  if (record.checkedOut) {
    return {
      label: "Done",
      className: "bg-gray-100 text-gray-700 border-gray-200",
    };
  }
  if (record.checkedIn) {
    return {
      label: "Working",
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
                  {r.checkInTime || formatTimeShort(r.checkInAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {r.checkOutTime || formatTimeShort(r.checkOutAt)}
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
                    <div className="flex items-center gap-1 text-emerald-700">
                      <Camera className="h-3.5 w-3.5" />
                      <span className="text-xs">
                        {r.checkInPhoto && r.checkOutPhoto
                          ? "in / out"
                          : r.checkInPhoto
                            ? "in"
                            : "out"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {hasGeo ? (
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
