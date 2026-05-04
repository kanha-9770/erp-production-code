"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, MapPin, ImageOff, Clock } from "lucide-react";
import {
  formatDateLong,
  formatHM,
  formatTimeShort,
  mapsLink,
  workedMinutesFor,
} from "./attendance-format";

export interface AttendanceRecord {
  id: string;
  date: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  checkedIn: boolean;
  checkedOut: boolean;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  lateMinutes: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  isAutoCheckedOut: boolean;
  status: string | null;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkInSource: string | null;
  checkOutSource: string | null;
  ipAddress?: string | null;
}

interface Props {
  record: AttendanceRecord | null;
  onClose: () => void;
}

export function AttendanceRecordDetail({ record, onClose }: Props) {
  return (
    <Sheet open={!!record} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {record && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {formatDateLong(record.date)}
                {record.isAutoCheckedOut && (
                  <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                    auto checkout
                  </Badge>
                )}
              </SheetTitle>
              {(record.userName || record.userEmail) && (
                <SheetDescription>
                  {record.userName ?? record.userEmail}
                </SheetDescription>
              )}
            </SheetHeader>

            {/* Stats row */}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Stat
                label="Worked"
                value={formatHM(workedMinutesFor(record))}
              />
              <Stat
                label="Late"
                value={record.lateMinutes ? formatHM(record.lateMinutes) : "—"}
                accent={record.lateMinutes > 0 ? "amber" : undefined}
              />
              <Stat
                label="Overtime"
                value={
                  record.overtimeMinutes ? formatHM(record.overtimeMinutes) : "—"
                }
                accent={record.overtimeMinutes > 0 ? "blue" : undefined}
              />
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PunchPanel
                title="Check-In"
                time={record.checkInTime || formatTimeShort(record.checkInAt)}
                photo={record.checkInPhoto}
                lat={record.checkInLat}
                lng={record.checkInLng}
                source={record.checkInSource}
                ipAddress={record.ipAddress ?? null}
                accent="emerald"
              />
              <PunchPanel
                title="Check-Out"
                time={record.checkOutTime || formatTimeShort(record.checkOutAt)}
                photo={record.checkOutPhoto}
                lat={record.checkOutLat}
                lng={record.checkOutLng}
                source={record.checkOutSource}
                ipAddress={null}
                accent="red"
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber" | "blue";
}) {
  return (
    <div className="rounded-md border border-black/10 bg-white px-3 py-2">
      <div
        className={[
          "text-sm font-semibold tabular-nums",
          accent === "amber" && "text-amber-700",
          accent === "blue" && "text-blue-700",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}

function PunchPanel({
  title,
  time,
  photo,
  lat,
  lng,
  source,
  ipAddress,
  accent,
}: {
  title: string;
  time: string | null;
  photo: string | null;
  lat: number | null;
  lng: number | null;
  source: string | null;
  ipAddress: string | null;
  accent: "emerald" | "red";
}) {
  const accentClass =
    accent === "emerald"
      ? "border-emerald-200 bg-emerald-50/50"
      : "border-red-200 bg-red-50/50";
  const link = mapsLink(lat, lng);

  return (
    <div className={`rounded-lg border ${accentClass} p-3 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">
          {title}
        </div>
        {source && (
          <Badge variant="outline" className="text-[10px] uppercase">
            {source.toLowerCase()}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 text-base font-medium text-gray-900">
        <Clock className="h-4 w-4 text-gray-500" />
        {time ?? "—"}
      </div>
      <div className="aspect-[4/3] w-full overflow-hidden rounded-md border border-black/10 bg-gray-100">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <a href={photo} target="_blank" rel="noreferrer noopener">
            <img
              src={photo}
              alt={`${title} photo`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </a>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
            <ImageOff className="h-4 w-4 mr-1" />
            No photo
          </div>
        )}
      </div>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1 text-xs text-blue-700 hover:underline"
        >
          <MapPin className="h-3 w-3" />
          {lat?.toFixed(5)}, {lng?.toFixed(5)}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <div className="text-xs text-gray-500">No location captured</div>
      )}
      {ipAddress && (
        <div className="text-[11px] text-gray-500 break-all">IP {ipAddress}</div>
      )}
    </div>
  );
}
