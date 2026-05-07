"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  MapPin,
  ImageOff,
  Clock,
  AlertTriangle,
} from "lucide-react";
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
  // Server-computed geofence flags. `null` for outsideRadius means the org
  // has no geofence configured; `true` means the user punched outside the
  // configured radius. `locationMissing` is true when the geofence IS
  // configured but the punch carries no GPS at all (denied permission, on
  // an insecure origin, etc.) — a hint that the user dodged the check.
  checkInDistanceM?: number | null;
  checkInOutsideRadius?: boolean | null;
  checkInLocationMissing?: boolean | null;
  checkOutDistanceM?: number | null;
  checkOutOutsideRadius?: boolean | null;
  checkOutLocationMissing?: boolean | null;
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
              <SheetTitle className="flex items-center gap-2 flex-wrap">
                {formatDateLong(record.date)}
                {record.isAutoCheckedOut && (
                  <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                    auto checkout
                  </Badge>
                )}
                {(record.checkInOutsideRadius ||
                  record.checkOutOutsideRadius) && (
                  <Badge className="ml-2 text-[10px] uppercase bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Out of radius
                  </Badge>
                )}
                {!record.checkInOutsideRadius &&
                  !record.checkOutOutsideRadius &&
                  (record.checkInLocationMissing ||
                    record.checkOutLocationMissing) && (
                    <Badge className="ml-2 text-[10px] uppercase bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      No location
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
                distanceM={record.checkInDistanceM ?? null}
                outsideRadius={record.checkInOutsideRadius ?? null}
                locationMissing={record.checkInLocationMissing ?? null}
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
                distanceM={record.checkOutDistanceM ?? null}
                outsideRadius={record.checkOutOutsideRadius ?? null}
                locationMissing={record.checkOutLocationMissing ?? null}
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
  distanceM,
  outsideRadius,
  locationMissing,
}: {
  title: string;
  time: string | null;
  photo: string | null;
  lat: number | null;
  lng: number | null;
  source: string | null;
  ipAddress: string | null;
  accent: "emerald" | "red";
  distanceM: number | null;
  outsideRadius: boolean | null;
  locationMissing: boolean | null;
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
      {locationMissing && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-semibold">No location captured</span>
            <span className="block text-amber-800">
              The user punched without sharing GPS — geofence check could not run.
            </span>
          </span>
        </div>
      )}
      {outsideRadius === true && (
        <div className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">
          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-semibold">Outside the office radius</span>
            {distanceM != null && (
              <span className="block text-red-700">
                {distanceM}m from the configured centre
              </span>
            )}
          </span>
        </div>
      )}
      {outsideRadius === false && distanceM != null && (
        <div className="text-[11px] text-emerald-700">
          Within radius · {distanceM}m from centre
        </div>
      )}
      {ipAddress && (
        <div className="text-[11px] text-gray-500 break-all">IP {ipAddress}</div>
      )}
    </div>
  );
}
