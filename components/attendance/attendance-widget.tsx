"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  LogIn,
  LogOut,
  Loader2,
  CalendarOff,
  PartyPopper,
  CheckCircle2,
  AlertTriangle,
  Plane,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { FaceCaptureDialog } from "@/components/attendance/face-capture-dialog";

type WidgetState =
  | "PRE_SHIFT"
  | "LATE"
  | "WORKING"
  | "DONE"
  | "HOLIDAY"
  | "ON_LEAVE"
  | "WEEKLY_OFF";

interface AttendanceStatusPayload {
  state: WidgetState;
  date: string;
  checkedIn: boolean;
  checkedOut: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  expectedInAt: string;
  expectedOutAt: string;
  graceMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  isHoliday: boolean;
  holidayName: string | null;
  isWeeklyOff: boolean;
  isOnLeave: boolean;
  leaveType: string | null;
  isHalfDayLeave: boolean;
  isAutoCheckedOut: boolean;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  faceCapture: {
    mode: "OFF" | "OPTIONAL" | "REQUIRED";
    maxKb: number;
  };
  geofence: {
    mode: "OFF" | "CAPTURE" | "ENFORCE";
    lat: number | null;
    lng: number | null;
    radiusM: number | null;
  };
  shift: { start: string; end: string };
}

const REFRESH_MS = 60_000;
const GEO_TIMEOUT_MS = 15_000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatHMS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function formatHM(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

function generateIdempotencyKey() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `att-${Date.now()}-${rand}`;
}

function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

type GeoResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: GeoFailureReason; message: string };

type GeoFailureReason =
  | "unsupported"
  | "insecure"
  | "denied"
  | "unavailable"
  | "timeout";

async function captureGeo(): Promise<GeoResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Your browser does not support location services.",
    };
  }
  // Geolocation only works on a secure origin. On plain HTTP (other than
  // localhost) the browser denies the request immediately, which is the
  // single most common cause of "we couldn't read your location" — call
  // it out so the admin/user knows to switch to HTTPS.
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return {
      ok: false,
      reason: "insecure",
      message:
        "Location only works over HTTPS. Open the site using https:// (or localhost).",
    };
  }
  return new Promise<GeoResult>((resolve) => {
    let settled = false;
    const finish = (r: GeoResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const timeout = setTimeout(
      () =>
        finish({
          ok: false,
          reason: "timeout",
          message:
            "Location request timed out. Check your GPS/Wi-Fi and try again.",
        }),
      GEO_TIMEOUT_MS,
    );
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout);
        finish({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        clearTimeout(timeout);
        if (err.code === err.PERMISSION_DENIED) {
          finish({
            ok: false,
            reason: "denied",
            message:
              "Location permission is blocked. Click the lock icon in your browser's address bar and allow location for this site.",
          });
          return;
        }
        if (err.code === err.POSITION_UNAVAILABLE) {
          finish({
            ok: false,
            reason: "unavailable",
            message:
              "Your device couldn't determine your position. Check that Wi-Fi or GPS is enabled.",
          });
          return;
        }
        if (err.code === err.TIMEOUT) {
          finish({
            ok: false,
            reason: "timeout",
            message:
              "Location request timed out. Check your GPS/Wi-Fi and try again.",
          });
          return;
        }
        finish({
          ok: false,
          reason: "unavailable",
          message: err.message || "Couldn't read your location.",
        });
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: GEO_TIMEOUT_MS },
    );
  });
}

interface UseAttendanceState {
  loading: boolean;
  busy: boolean;
  error: string | null;
  status: AttendanceStatusPayload | null;
  punch: (
    type: "IN" | "OUT",
    photoUrl?: string | null,
    geo?: { lat: number; lng: number } | null,
  ) => Promise<void>;
  refresh: () => Promise<void>;
}

async function uploadFacePhoto(blob: Blob, type: "IN" | "OUT"): Promise<string> {
  const fd = new FormData();
  // The server is permissive about extension; the inferred MIME is what
  // it actually validates against.
  fd.append("photo", blob, `attendance_${type}_${Date.now()}.jpg`);
  fd.append("type", type);
  const res = await fetch("/api/attendance/photo", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const json = await res.json();
  if (!res.ok || !json?.success || !json.url) {
    throw new Error(json?.error ?? "Photo upload failed");
  }
  return json.url as string;
}

function useAttendance(enabled: boolean): UseAttendanceState {
  const [status, setStatus] = useState<AttendanceStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/attendance/today", {
        credentials: "include",
        cache: "no-store",
      });
      if (!aliveRef.current) return;
      if (res.status === 401) {
        // Not signed in — widget hides itself.
        setStatus(null);
        setError(null);
        return;
      }
      const json = await res.json();
      if (json?.success) {
        setStatus(json.status as AttendanceStatusPayload);
        setError(null);
      } else {
        setError(json?.error ?? "Could not load attendance");
      }
    } catch (e: any) {
      if (!aliveRef.current) return;
      setError(e?.message ?? "Network error");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    aliveRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => {
        aliveRef.current = false;
      };
    }
    fetchStatus();
    const id = setInterval(fetchStatus, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, fetchStatus]);

  const punch = useCallback(
    async (
      type: "IN" | "OUT",
      photoUrl: string | null = null,
      preCapturedGeo: { lat: number; lng: number } | null = null,
    ) => {
      if (busy) return;
      setBusy(true);
      const idempotencyKey = generateIdempotencyKey();

      // Optimistic flip — we know the next reasonable state before the
      // server confirms. The response will replace this with the truth.
      const optimistic: AttendanceStatusPayload | null = status
        ? {
            ...status,
            checkedIn: type === "IN" ? true : status.checkedIn,
            checkedOut: type === "OUT" ? true : status.checkedOut,
            canCheckIn: type === "IN" ? false : status.canCheckIn,
            canCheckOut: type === "IN" ? true : type === "OUT" ? false : status.canCheckOut,
            state: type === "IN" ? "WORKING" : "DONE",
            checkInAt:
              type === "IN" && !status.checkInAt
                ? new Date().toISOString()
                : status.checkInAt,
            checkOutAt:
              type === "OUT" && !status.checkOutAt
                ? new Date().toISOString()
                : status.checkOutAt,
          }
        : null;
      const previous = status;
      if (optimistic) setStatus(optimistic);

      let geo: { lat: number; lng: number } | null = preCapturedGeo;
      if (!geo) {
        const r = await captureGeo();
        geo = r.ok ? { lat: r.lat, lng: r.lng } : null;
      }

      try {
        const res = await fetch("/api/attendance/punch", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            type,
            geo,
            idempotencyKey,
            source: "WEB",
            photoUrl,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          // Roll back to previous state.
          setStatus(previous);
          setError(json?.error ?? "Failed to punch");
          throw new Error(json?.error ?? "Failed to punch");
        }
        setStatus(json.status as AttendanceStatusPayload);
        setError(null);
      } finally {
        setBusy(false);
      }
    },
    [busy, status],
  );

  return {
    loading,
    busy,
    error,
    status,
    punch,
    refresh: fetchStatus,
  };
}

interface AttendanceWidgetProps {
  enabled?: boolean;
  className?: string;
  collapsed?: boolean;
}

export function AttendanceWidget({
  enabled = true,
  className,
  collapsed = false,
}: AttendanceWidgetProps) {
  const { toast } = useToast();
  const { loading, busy, error, status, punch } = useAttendance(enabled);
  const [now, setNow] = useState<number>(() => Date.now());
  const [open, setOpen] = useState(false);
  // Camera capture flow. `captureType` records which punch is pending so
  // the dialog's confirm handler knows whether to fire IN or OUT after
  // upload completes. `captureBusy` covers the upload window — the punch
  // hook's `busy` only kicks in once we POST to /punch.
  const [captureType, setCaptureType] = useState<"IN" | "OUT" | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  // Out-of-radius / GPS-unavailable confirmation. When set, the AlertDialog
  // is shown; on Continue we punch with the captured geo (or null), on
  // Cancel we drop it. Photo URL is preserved so the face-capture flow
  // doesn't lose its uploaded image when the user has to confirm.
  const [geoConfirm, setGeoConfirm] = useState<{
    type: "IN" | "OUT";
    photoUrl: string | null;
    geo: { lat: number; lng: number } | null;
    message: string;
  } | null>(null);

  const punchWithGeoCheck = useCallback(
    async (type: "IN" | "OUT", photoUrl: string | null) => {
      const fence = status?.geofence;
      const inFenceMode =
        !!fence &&
        fence.mode !== "OFF" &&
        fence.lat != null &&
        fence.lng != null &&
        fence.radiusM != null;

      const geoResult = await captureGeo();
      const geo = geoResult.ok
        ? { lat: geoResult.lat, lng: geoResult.lng }
        : null;

      if (inFenceMode) {
        if (!geo) {
          setGeoConfirm({
            type,
            photoUrl,
            geo: null,
            message: `${geoResult.ok ? "" : geoResult.message + " "}Do you want to continue with check-${type === "IN" ? "in" : "out"} anyway?`,
          });
          return;
        }
        const dist = distanceMeters(geo.lat, geo.lng, fence!.lat!, fence!.lng!);
        if (dist > fence!.radiusM!) {
          setGeoConfirm({
            type,
            photoUrl,
            geo,
            message: `You are ${Math.round(dist)}m away from the office (allowed radius: ${fence!.radiusM}m). Do you want to continue?`,
          });
          return;
        }
      }

      await punch(type, photoUrl, geo);
      toast({
        title:
          type === "IN"
            ? "You are checked in successfully"
            : "You are checked out successfully",
        description: inFenceMode
          ? "You are within the office radius"
          : type === "IN"
            ? "Have a great day"
            : "Working time recorded",
      });
    },
    [status?.geofence, punch, toast],
  );

  // 1Hz tick drives the live working-time counter and the lateness
  // countdown. We only run it when the user is currently working OR pre-shift,
  // since DONE / HOLIDAY / WEEKLY_OFF have nothing animating.
  useEffect(() => {
    if (!status) return;
    if (status.state !== "WORKING" && status.state !== "PRE_SHIFT") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status?.state]);

  const checkInTimestamp = useMemo(() => {
    if (!status?.checkInAt) return null;
    const t = new Date(status.checkInAt).getTime();
    return Number.isFinite(t) ? t : null;
  }, [status?.checkInAt]);

  const liveSeconds = useMemo(() => {
    if (!checkInTimestamp) return 0;
    if (status?.checkedOut && status.checkOutAt) {
      const end = new Date(status.checkOutAt).getTime();
      return Math.max(0, Math.round((end - checkInTimestamp) / 1000));
    }
    return Math.max(0, Math.round((now - checkInTimestamp) / 1000));
  }, [checkInTimestamp, now, status?.checkedOut, status?.checkOutAt]);

  const handleClick = useCallback(
    async (type: "IN" | "OUT") => {
      // Face-capture flow: if the org has it on, defer the actual punch
      // until the dialog produces (or skips) a photo.
      const mode = status?.faceCapture.mode ?? "OFF";
      if (mode === "OPTIONAL" || mode === "REQUIRED") {
        setCaptureType(type);
        return;
      }
      try {
        await punchWithGeoCheck(type, null);
      } catch (e: any) {
        toast({
          title: "Punch failed",
          description: e?.message ?? "Try again in a moment",
          variant: "destructive",
        });
      }
    },
    [punchWithGeoCheck, toast, status?.faceCapture.mode],
  );

  const handleCapturedPhoto = useCallback(
    async (blob: Blob) => {
      const type = captureType;
      if (!type) return;
      setCaptureBusy(true);
      try {
        const photoUrl = await uploadFacePhoto(blob, type);
        setCaptureType(null);
        await punchWithGeoCheck(type, photoUrl);
      } catch (e: any) {
        toast({
          title: "Punch failed",
          description: e?.message ?? "Try again",
          variant: "destructive",
        });
      } finally {
        setCaptureBusy(false);
      }
    },
    [captureType, punchWithGeoCheck, toast],
  );

  const handleSkipCapture = useCallback(async () => {
    const type = captureType;
    if (!type) return;
    if (status?.faceCapture.mode === "REQUIRED") {
      // Defensive — the dialog hides Skip in REQUIRED mode, but if it
      // somehow fires we refuse to send a photo-less punch.
      return;
    }
    setCaptureType(null);
    try {
      await punchWithGeoCheck(type, null);
    } catch (e: any) {
      toast({
        title: "Punch failed",
        description: e?.message ?? "Try again",
        variant: "destructive",
      });
    }
  }, [captureType, punchWithGeoCheck, toast, status?.faceCapture.mode]);

  if (!enabled) return null;

  if (loading && !status) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-black/10 bg-white/60 px-2 py-1.5 text-xs text-gray-500",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {!collapsed && <span>Attendance…</span>}
      </div>
    );
  }

  // Authentication absent or transient error → render nothing rather than
  // a broken-looking pill in the sidebar.
  if (!status) return null;

  const palette = paletteForState(status.state);
  const Icon = iconForState(status.state);

  // Compact pill view (always visible in sidebar).
  const pill = (
    <button
      type="button"
      className={cn(
        "group relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
        "border",
        palette.surface,
        palette.border,
        palette.text,
        "hover:brightness-[0.97]",
      )}
      aria-label="Attendance"
    >
      <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", palette.iconClass)} />
      {!collapsed && (
        <span className="flex-1 truncate text-left font-medium">
          {primaryLabel(status, liveSeconds)}
        </span>
      )}
      {!collapsed && (
        <span className={cn("text-[10px] opacity-80", palette.subText)}>
          {secondaryLabel(status)}
        </span>
      )}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={className}>{pill}</div>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        className="w-80 p-0 overflow-hidden"
      >
        <div className={cn("px-4 py-3 border-b", palette.headerBg)}>
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", palette.iconClass)} />
            <div className="flex-1">
              <div className={cn("text-sm font-semibold", palette.headerText)}>
                {headlineForState(status)}
              </div>
              <div className="text-[11px] text-gray-600">
                Shift {status.shift.start} – {status.shift.end}
                {" · "}grace {status.graceMinutes}m
              </div>
            </div>
          </div>

          {(status.state === "WORKING" || status.state === "PRE_SHIFT") && (
            <div className="mt-2 flex items-baseline gap-2 font-mono">
              <span className="text-2xl tabular-nums text-gray-900">
                {status.state === "WORKING"
                  ? formatHMS(liveSeconds)
                  : countdownLabel(status, now)}
              </span>
              <span className="text-[11px] text-gray-500">
                {status.state === "WORKING" ? "since check-in" : "until shift"}
              </span>
            </div>
          )}
        </div>

        <div className="px-4 py-3 space-y-2">
          <Row label="Date" value={status.date} />
          {status.checkInAt && (
            <Row
              label="Checked in"
              value={
                <>
                  {status.checkInTime ?? "—"}
                  {status.lateMinutes > 0 && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">
                      late by {formatHM(status.lateMinutes)}
                    </span>
                  )}
                </>
              }
            />
          )}
          {status.checkOutAt && (
            <Row
              label="Checked out"
              value={
                <>
                  {status.checkOutTime ?? "—"}
                  {status.isAutoCheckedOut && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-500">
                      auto
                    </span>
                  )}
                </>
              }
            />
          )}
          {status.workedMinutes > 0 && (
            <Row label="Worked" value={formatHM(status.workedMinutes)} />
          )}
          {status.overtimeMinutes > 0 && (
            <Row
              label="Overtime"
              value={
                <span className="text-blue-700">
                  {formatHM(status.overtimeMinutes)}
                </span>
              }
            />
          )}
          {status.geofence.mode !== "OFF" && (
            <div className="text-[11px] text-gray-500 pt-1 border-t mt-2">
              Geofence: {status.geofence.mode.toLowerCase()}
              {status.geofence.radiusM ? ` · ${status.geofence.radiusM}m` : ""}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 pt-1">
          {error && (
            <div className="mb-2 flex items-start gap-1.5 text-[11px] text-red-700">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <ActionButton
            status={status}
            busy={busy}
            onClick={async (t) => {
              await handleClick(t);
              setOpen(false);
            }}
          />
          <Link
            href="/attendance"
            onClick={() => setOpen(false)}
            className="mt-3 block text-center text-[11px] text-gray-500 hover:text-gray-800 hover:underline"
          >
            View full history
          </Link>
        </div>
      </PopoverContent>

      {captureType && status && (
        <FaceCaptureDialog
          open={!!captureType}
          onOpenChange={(o) => {
            if (!o) setCaptureType(null);
          }}
          mode={status.faceCapture.mode === "REQUIRED" ? "REQUIRED" : "OPTIONAL"}
          actionLabel={captureType === "IN" ? "Check In" : "Check Out"}
          busy={captureBusy || busy}
          onCapture={handleCapturedPhoto}
          onSkip={
            status.faceCapture.mode === "OPTIONAL" ? handleSkipCapture : undefined
          }
        />
      )}

      <AlertDialog
        open={!!geoConfirm}
        onOpenChange={(o) => {
          if (!o) setGeoConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {geoConfirm?.geo
                ? "You are not in the office radius"
                : "Location unavailable"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {geoConfirm?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const c = geoConfirm;
                if (!c) return;
                setGeoConfirm(null);
                try {
                  await punch(c.type, c.photoUrl, c.geo);
                  toast({
                    title:
                      c.type === "IN"
                        ? "You are checked in successfully"
                        : "You are checked out successfully",
                    description: "Recorded outside the office radius",
                  });
                } catch (e: any) {
                  toast({
                    title: "Punch failed",
                    description: e?.message ?? "Try again",
                    variant: "destructive",
                  });
                }
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function ActionButton({
  status,
  busy,
  onClick,
}: {
  status: AttendanceStatusPayload;
  busy: boolean;
  onClick: (type: "IN" | "OUT") => Promise<void>;
}) {
  if (
    status.state === "HOLIDAY" ||
    status.state === "ON_LEAVE" ||
    status.state === "WEEKLY_OFF"
  ) {
    return null;
  }
  if (status.canCheckOut) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onClick("OUT")}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogOut className="h-4 w-4" />
        )}
        Check Out
      </button>
    );
  }
  if (status.canCheckIn) {
    const isLate = status.state === "LATE";
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onClick("IN")}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-60",
          isLate
            ? "bg-amber-500 text-white hover:bg-amber-600"
            : "bg-emerald-600 text-white hover:bg-emerald-700",
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogIn className="h-4 w-4" />
        )}
        Check In{isLate ? " (Late)" : ""}
      </button>
    );
  }
  // DONE: nothing to do.
  return (
    <div className="flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
      <CheckCircle2 className="h-3.5 w-3.5" />
      All set for today
    </div>
  );
}

function paletteForState(state: WidgetState) {
  switch (state) {
    case "WORKING":
      return {
        surface: "bg-emerald-50",
        border: "border-emerald-200",
        text: "text-emerald-800",
        subText: "text-emerald-700",
        iconClass: "text-emerald-600",
        headerBg: "bg-emerald-50",
        headerText: "text-emerald-900",
      };
    case "LATE":
      return {
        surface: "bg-amber-50",
        border: "border-amber-200",
        text: "text-amber-800",
        subText: "text-amber-700",
        iconClass: "text-amber-600",
        headerBg: "bg-amber-50",
        headerText: "text-amber-900",
      };
    case "DONE":
      return {
        surface: "bg-gray-50",
        border: "border-gray-200",
        text: "text-gray-700",
        subText: "text-gray-500",
        iconClass: "text-gray-500",
        headerBg: "bg-gray-50",
        headerText: "text-gray-800",
      };
    case "HOLIDAY":
      return {
        surface: "bg-blue-50",
        border: "border-blue-200",
        text: "text-blue-800",
        subText: "text-blue-700",
        iconClass: "text-blue-600",
        headerBg: "bg-blue-50",
        headerText: "text-blue-900",
      };
    case "ON_LEAVE":
      return {
        surface: "bg-violet-50",
        border: "border-violet-200",
        text: "text-violet-800",
        subText: "text-violet-700",
        iconClass: "text-violet-600",
        headerBg: "bg-violet-50",
        headerText: "text-violet-900",
      };
    case "WEEKLY_OFF":
      return {
        surface: "bg-indigo-50",
        border: "border-indigo-200",
        text: "text-indigo-800",
        subText: "text-indigo-700",
        iconClass: "text-indigo-600",
        headerBg: "bg-indigo-50",
        headerText: "text-indigo-900",
      };
    default:
      return {
        surface: "bg-white",
        border: "border-black/10",
        text: "text-gray-800",
        subText: "text-gray-500",
        iconClass: "text-gray-500",
        headerBg: "bg-white",
        headerText: "text-gray-900",
      };
  }
}

function iconForState(state: WidgetState) {
  switch (state) {
    case "WORKING":
      return Clock;
    case "DONE":
      return CheckCircle2;
    case "HOLIDAY":
      return PartyPopper;
    case "ON_LEAVE":
      return Plane;
    case "WEEKLY_OFF":
      return CalendarOff;
    case "LATE":
      return AlertTriangle;
    default:
      return LogIn;
  }
}

function primaryLabel(status: AttendanceStatusPayload, liveSeconds: number) {
  switch (status.state) {
    case "WORKING":
      return formatHMS(liveSeconds);
    case "LATE":
      return "Check In";
    case "DONE":
      return "Done";
    case "HOLIDAY":
      return "Holiday";
    case "ON_LEAVE":
      return "On Leave";
    case "WEEKLY_OFF":
      return "Weekly off";
    default:
      return "Check In";
  }
}

function secondaryLabel(status: AttendanceStatusPayload) {
  switch (status.state) {
    case "WORKING":
      return status.checkInTime ?? "in";
    case "LATE":
      return `${status.lateMinutes}m late`;
    case "DONE":
      return status.checkOutTime ?? "";
    case "HOLIDAY":
      return status.holidayName ?? "";
    case "ON_LEAVE":
      return status.leaveType ?? "";
    case "WEEKLY_OFF":
      return "";
    default:
      return status.shift.start;
  }
}

function headlineForState(status: AttendanceStatusPayload) {
  switch (status.state) {
    case "WORKING":
      return "Working";
    case "LATE":
      return `You're ${status.lateMinutes}m late`;
    case "DONE":
      return "Checked out";
    case "HOLIDAY":
      return status.holidayName
        ? `Holiday: ${status.holidayName}`
        : "Holiday today";
    case "ON_LEAVE":
      if (status.isHalfDayLeave) {
        return status.leaveType
          ? `Half-day leave (${status.leaveType})`
          : "On half-day leave — you can still check in";
      }
      return status.leaveType
        ? `On leave (${status.leaveType})`
        : "On approved leave";
    case "WEEKLY_OFF":
      return "Weekly off";
    default:
      return "Ready to check in";
  }
}

function countdownLabel(status: AttendanceStatusPayload, now: number) {
  const expected = new Date(status.expectedInAt).getTime();
  const diff = Math.max(0, Math.floor((expected - now) / 1000));
  if (diff === 0) return "now";
  return `in ${formatHMS(diff)}`;
}
