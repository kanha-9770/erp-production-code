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
  ShieldCheck,
  ShieldAlert,
  Archive,
} from "lucide-react";
import {
  formatDateLong,
  formatHM,
  formatTimeShort,
  mapsLink,
  workedMinutesFor,
} from "./attendance-format";
import { useUserTimezone } from "@/lib/user-timezone";

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
  // Face-match score recorded at each punch (Euclidean distance — lower is
  // better). Null when face verification was off or the user wasn't
  // enrolled. Compared against the org's configured threshold to display
  // a "verified" badge on the photo.
  checkInFaceMatch?: number | null;
  checkOutFaceMatch?: number | null;
  // Snapshot of the org's configured threshold at view time. Passed in
  // by the parent (my-attendance / team-attendance) since it doesn't live
  // on the record itself.
  faceMatchThreshold?: number | null;
  // Org's current photo-retention window in days. Used to label an empty
  // photo slot as "expired" (file auto-deleted by the daily cleanup
  // sweeper) vs "skipped" (storage was never asked for). 0 / null means
  // the org keeps photos forever, so an empty slot can only mean
  // "skipped" — never "expired".
  facePhotoRetentionDays?: number | null;
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
  // Re-render when the user changes their timezone so check-in/out times
  // and the date label flip to the new zone live.
  useUserTimezone();
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
              {/* Always render a SheetDescription so Radix Dialog's a11y
                  contract is satisfied (otherwise it logs a "Missing
                  Description or aria-describedby" console warning).
                  Falls back to a generic line on My Attendance where
                  userName/userEmail aren't on the record; team views
                  keep showing the employee name as before. */}
              <SheetDescription>
                {record.userName ??
                  record.userEmail ??
                  "Attendance details for the selected date."}
              </SheetDescription>
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
                time={record.checkInAt ? formatTimeShort(record.checkInAt) : record.checkInTime || "—"}
                photo={record.checkInPhoto}
                lat={record.checkInLat}
                lng={record.checkInLng}
                source={record.checkInSource}
                ipAddress={record.ipAddress ?? null}
                accent="emerald"
                distanceM={record.checkInDistanceM ?? null}
                outsideRadius={record.checkInOutsideRadius ?? null}
                locationMissing={record.checkInLocationMissing ?? null}
                faceMatch={record.checkInFaceMatch ?? null}
                faceMatchThreshold={record.faceMatchThreshold ?? null}
                recordDate={record.date}
                retentionDays={record.facePhotoRetentionDays ?? null}
              />
              <PunchPanel
                title="Check-Out"
                time={record.checkOutAt ? formatTimeShort(record.checkOutAt) : record.checkOutTime || "—"}
                photo={record.checkOutPhoto}
                lat={record.checkOutLat}
                lng={record.checkOutLng}
                source={record.checkOutSource}
                ipAddress={null}
                accent="red"
                distanceM={record.checkOutDistanceM ?? null}
                outsideRadius={record.checkOutOutsideRadius ?? null}
                locationMissing={record.checkOutLocationMissing ?? null}
                faceMatch={record.checkOutFaceMatch ?? null}
                faceMatchThreshold={record.faceMatchThreshold ?? null}
                recordDate={record.date}
                retentionDays={record.facePhotoRetentionDays ?? null}
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

// Classify the photo slot when no URL is present. We can usually tell
// the difference between "the org told us not to upload" and "the
// daily cleanup sweeper deleted it" based on row age vs the org's
// retention setting:
//   • A row OLDER than retentionDays + verification ran   → likely deleted
//   • A row younger than retentionDays + verification ran → likely never stored
//   • Verification didn't run + no photo                  → legacy "no capture"
//   • retentionDays=0/null                                → org keeps forever,
//                                                           so a null URL can't
//                                                           be "expired"; treat
//                                                           as never-stored.
type PhotoState = "present" | "expired" | "skipped" | "missing";
function classifyPhoto(
  photo: string | null,
  rowDate: string | null,
  faceMatch: number | null,
  retentionDays: number | null,
): PhotoState {
  if (photo) return "present";
  const verificationRan = typeof faceMatch === "number";
  if (!verificationRan) return "missing";
  if (!retentionDays || retentionDays <= 0 || !rowDate) return "skipped";
  // Compare date strings lexicographically — Attendance.date is stored as
  // YYYY-MM-DD so a simple string compare against the cutoff works without
  // any timezone math.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  const y = cutoff.getUTCFullYear();
  const m = String(cutoff.getUTCMonth() + 1).padStart(2, "0");
  const d = String(cutoff.getUTCDate()).padStart(2, "0");
  const cutoffStr = `${y}-${m}-${d}`;
  return rowDate < cutoffStr ? "expired" : "skipped";
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
  faceMatch,
  faceMatchThreshold,
  recordDate,
  retentionDays,
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
  faceMatch: number | null;
  faceMatchThreshold: number | null;
  recordDate: string | null;
  retentionDays: number | null;
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
        {(() => {
          const state = classifyPhoto(photo, recordDate, faceMatch, retentionDays);
          if (state === "present") {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={photo!} target="_blank" rel="noreferrer noopener">
                <img
                  src={photo!}
                  alt={`${title} photo`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </a>
            );
          }
          if (state === "expired") {
            // Photo existed once and was deleted by the retention sweep.
            // Distinct icon + amber tint so HR / managers immediately
            // know this isn't a missing-data bug — the file aged out.
            return (
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center"
                title={
                  retentionDays
                    ? `Auto-deleted after the ${retentionDays}-day retention window. The verification score below is the audit trail.`
                    : undefined
                }
              >
                <Archive className="h-5 w-5 text-amber-500" />
                <div className="text-[11px] font-medium text-amber-800">
                  Photo expired
                </div>
                <div className="text-[10px] text-amber-700/80 leading-tight">
                  Deleted after {retentionDays}-day retention
                </div>
              </div>
            );
          }
          if (state === "skipped") {
            // Storage was deliberately skipped (Never store / mismatch-only
            // + verified). Different copy from "missing" so it's clear the
            // ABSENCE was intentional — the score below is the proof.
            return (
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center"
                title="Storage was skipped because identity was already proven by the face match score."
              >
                <ShieldCheck className="h-5 w-5 text-emerald-500/80" />
                <div className="text-[11px] font-medium text-gray-600">
                  Photo not stored
                </div>
                <div className="text-[10px] text-gray-500 leading-tight">
                  Match score is the proof
                </div>
              </div>
            );
          }
          // Verification didn't run, no photo. Legacy / no-capture punch.
          return (
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
              <ImageOff className="h-4 w-4 mr-1" />
              No photo
            </div>
          );
        })()}
      </div>
      {/* Face verification badge — only shown when a match score was
          recorded at punch time. Threshold may be null on historical
          rows captured before verification was enabled. */}
      {typeof faceMatch === "number" && (
        <div
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
            faceMatchThreshold != null && faceMatch <= faceMatchThreshold
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {faceMatchThreshold != null && faceMatch <= faceMatchThreshold ? (
            <>
              <ShieldCheck className="h-3 w-3" />
              <span>
                Face verified · score {faceMatch.toFixed(2)}
                {faceMatchThreshold != null && (
                  <span className="opacity-70">
                    {" "}
                    (≤ {faceMatchThreshold.toFixed(2)})
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <ShieldAlert className="h-3 w-3" />
              <span>
                Match score {faceMatch.toFixed(2)}
                {faceMatchThreshold != null && (
                  <span className="opacity-70">
                    {" "}
                    · threshold {faceMatchThreshold.toFixed(2)}
                  </span>
                )}
              </span>
            </>
          )}
        </div>
      )}
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
            <span className="font-semibold">Off-site</span>
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
          Within the office · {distanceM}m from centre
        </div>
      )}
      {ipAddress && (
        <div className="text-[11px] text-gray-500 break-all">IP {ipAddress}</div>
      )}
    </div>
  );
}
