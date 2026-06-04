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
  RefreshCw,
  MapPin,
  MapPinOff,
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
import { formatTimeShort } from "@/components/attendance/attendance-format";
import { useUserTimezone } from "@/lib/user-timezone";
import { setOrgTimezone, useOrgTimezone, formatTimeInOrgZone } from "@/lib/org-timezone";
import { descriptorToBase64 } from "@/lib/face/descriptor";

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
  reportTimezone?: string;
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
  // Short leave is a fixed few-hour window the employee works around — the day
  // stays a normal working day (check-in CTA active), with this note surfaced.
  isShortLeave: boolean;
  shortLeaveWindow: { start: string; end: string } | null;
  // Note for ANY partial leave today (half-day or short) — the day stays a
  // normal working day; the widget shows this and keeps the check-in CTA active.
  partialLeaveNote: string | null;
  isAutoCheckedOut: boolean;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  faceCapture: {
    mode: "OFF" | "OPTIONAL" | "REQUIRED";
    maxKb: number;
  };
  faceVerify: {
    mode: "OFF" | "WARN" | "ENFORCE";
    threshold: number;
    enrolled: boolean;
  };
  faceLiveness: {
    mode: "OFF" | "PERMISSIVE" | "STRICT";
  };
  geofence: {
    mode: "OFF" | "CAPTURE" | "ENFORCE";
    lat: number | null;
    lng: number | null;
    radiusM: number | null;
  };
  shift: { start: string; end: string; isCustom: boolean };
  overtime: {
    availableAt: string | null;
    optedIn: boolean;
    startedAt: string | null;
    maxHoursPerDay: number;
    requiresOptIn: boolean;
  };
}

const REFRESH_MS = 60_000;
// Two-stage geo budget: try GPS-grade accuracy first with a tight timeout,
// then fall back to coarse positioning. The previous budget (8s + 12s = 20s)
// felt like a hard freeze on indoor punches; trimmed to 5s + 5s so the upper
// bound is 10s and the user sees a marked-attendance response sooner.
const GEO_HIGH_ACCURACY_TIMEOUT_MS = 5_000;
const GEO_LOW_ACCURACY_TIMEOUT_MS = 5_000;
// Anything worse than this means the device is using cell-tower / IP / Wi-Fi
// triangulation, not real GPS, so we surface a warning before the user trusts
// the reading for a punch.
const GEO_LOW_ACCURACY_WARN_M = 200;

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
  | { ok: true; lat: number; lng: number; accuracy: number }
  | { ok: false; reason: GeoFailureReason; message: string };

type GeoFailureReason =
  | "unsupported"
  | "insecure"
  | "denied"
  | "unavailable"
  | "timeout";

function isInsecureOrigin(): boolean {
  if (typeof window === "undefined") return false;
  // Browsers treat localhost as a secure context regardless of protocol, so
  // exempt those host patterns. Anything else served over plain HTTP is
  // insecure as far as the Geolocation API is concerned.
  const host = window.location.hostname;
  const isLocalhost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1" ||
    host.endsWith(".localhost");
  if (window.location.protocol !== "https:" && !isLocalhost) return true;
  // Modern browsers also expose `isSecureContext` directly. Trust it when
  // present — it covers edge cases like file://, mixed-content frames, etc.
  if (typeof window.isSecureContext === "boolean" && !window.isSecureContext) {
    return true;
  }
  return false;
}

function tryGetPosition(opts: PositionOptions): Promise<GeoResult> {
  return new Promise<GeoResult>((resolve) => {
    let settled = false;
    const finish = (r: GeoResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    // Belt-and-suspenders timeout: some browsers ignore the PositionOptions
    // timeout and hang. Add a hard ceiling slightly past the requested one.
    const hardTimeout = setTimeout(
      () =>
        finish({
          ok: false,
          reason: "timeout",
          message:
            "Location request timed out. Check your GPS/Wi-Fi and try again.",
        }),
      (opts.timeout ?? GEO_HIGH_ACCURACY_TIMEOUT_MS) + 500,
    );
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(hardTimeout);
        finish({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        clearTimeout(hardTimeout);
        // Surface the raw browser message alongside our hint so anyone
        // diagnosing in production can see the underlying cause (e.g.
        // "Only secure origins are allowed", "User denied Geolocation").
        const raw = err?.message ? ` (${err.message})` : "";
        if (err.code === err.PERMISSION_DENIED) {
          // PERMISSION_DENIED on an HTTP origin almost always means the
          // browser blocked it for being insecure, not that the user
          // clicked "block". Re-check protocol because some browsers
          // report isSecureContext inconsistently.
          if (
            typeof window !== "undefined" &&
            window.location.protocol !== "https:" &&
            window.location.hostname !== "localhost" &&
            window.location.hostname !== "127.0.0.1"
          ) {
            finish({
              ok: false,
              reason: "insecure",
              message: `This site is on HTTP — browsers block location on insecure origins.${raw} Move the site to https:// to enable check-in location.`,
            });
            return;
          }
          finish({
            ok: false,
            reason: "denied",
            message: `Location permission is blocked for this site. Click the lock/info icon in your browser's address bar → Site settings → Location → Allow, then refresh.${raw}`,
          });
          return;
        }
        if (err.code === err.POSITION_UNAVAILABLE) {
          finish({
            ok: false,
            reason: "unavailable",
            message: `Your device couldn't determine your position. Check that Wi-Fi or GPS is enabled.${raw}`,
          });
          return;
        }
        if (err.code === err.TIMEOUT) {
          finish({
            ok: false,
            reason: "timeout",
            message: `Location request timed out. Check your GPS/Wi-Fi and try again.${raw}`,
          });
          return;
        }
        finish({
          ok: false,
          reason: "unavailable",
          message: `Couldn't read your location.${raw}`,
        });
      },
      opts,
    );
  });
}

async function captureGeo(): Promise<GeoResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Your browser does not support location services.",
    };
  }
  // Geolocation only works on a secure origin. On plain HTTP the browser
  // throws PERMISSION_DENIED with the misleading message "User denied
  // Geolocation: Only secure origins are allowed" — even though the user
  // never saw a prompt. Detect this up front so the popup tells the admin
  // "you're on HTTP" instead of accusing the user of denying the prompt.
  if (isInsecureOrigin()) {
    return {
      ok: false,
      reason: "insecure",
      message:
        "This site is being served over HTTP. Browsers only allow location on https:// (or localhost). Ask your admin to put the site behind HTTPS.",
    };
  }

  // Stage 1: GPS-grade fix. maximumAge: 0 forces a fresh reading instead of
  // a cached one (the most common source of "wrong location" reports).
  const high = await tryGetPosition({
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: GEO_HIGH_ACCURACY_TIMEOUT_MS,
  });
  if (high.ok) return high;

  // Permission/secure-origin/unsupported failures won't be cured by another
  // attempt — short-circuit so the user sees the real reason instead of a
  // duplicated error after another long wait.
  if (
    high.reason === "denied" ||
    high.reason === "insecure" ||
    high.reason === "unsupported"
  ) {
    return high;
  }

  // Stage 2: coarse fallback. enableHighAccuracy: false uses cell-tower /
  // Wi-Fi positioning, which works indoors and through walls where GPS
  // cannot get a fix. Accuracy will be worse (often hundreds of metres) but
  // a coarse reading beats no reading at all — and the UI surfaces the
  // accuracy so the user knows.
  const low = await tryGetPosition({
    enableHighAccuracy: false,
    maximumAge: 0,
    timeout: GEO_LOW_ACCURACY_TIMEOUT_MS,
  });
  if (low.ok) return low;
  // Surface the original (more informative) timeout/unavailable message
  // rather than the fallback's, since they're typically the same shape.
  return high;
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
    faceMatch?: number | null,
    livenessPassed?: boolean | null,
  ) => Promise<void>;
  refresh: () => Promise<void>;
  // Shared with the component so handleClick can flag the next IN punch as a
  // self-service early return (the ref lives in the hook with punch()).
  endLeaveEarlyRef: { current: boolean };
}

interface UploadFacePhotoResult {
  // Null when the server accepted the punch but skipped storing the JPEG
  // (facePhotoStoreAfterVerify = NEVER / ON_MISMATCH_ONLY + verified).
  // The attendance row will hold null for checkInPhoto / checkOutPhoto in
  // that case; the verification metadata below is still authoritative.
  url: string | null;
  // Verification fields. Null when face verification is OFF or the user
  // isn't enrolled (in WARN mode). Always populated when the server
  // accepted the photo under WARN/ENFORCE mode with a stored enrollment.
  faceMatch: number | null;
  verified: boolean;
}

async function uploadFacePhoto(
  blob: Blob,
  type: "IN" | "OUT",
  descriptor: Float32Array | null,
  faceCount: number,
  livenessPassed: boolean | null,
): Promise<UploadFacePhotoResult> {
  const fd = new FormData();
  // The server is permissive about extension; the inferred MIME is what
  // it actually validates against.
  fd.append("photo", blob, `attendance_${type}_${Date.now()}.jpg`);
  fd.append("type", type);
  if (descriptor) fd.append("descriptor", descriptorToBase64(descriptor));
  // faceCount is the anti-proxy signal — server uses it to reject multi-
  // face frames even if the client UI somehow allowed them through.
  fd.append("faceCount", String(faceCount));
  // livenessPassed: omitted when liveness was disabled, "true" / "false"
  // when the client ran the check. Server uses faceLivenessMode to
  // decide whether to enforce.
  if (livenessPassed !== null) {
    fd.append("livenessPassed", livenessPassed ? "true" : "false");
  }
  const res = await fetch("/api/attendance/photo", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const json = await res.json();
  // `json.url` is now optional — the server may legitimately return null
  // when storage was skipped (verification succeeded + facePhotoStoreAfterVerify
  // = NEVER / ON_MISMATCH_ONLY). Treat that as success.
  if (!res.ok || !json?.success) {
    // Surface the structured error code so callers can show a tailored
    // toast (e.g. "Please enroll your face first" for FACE_NOT_ENROLLED).
    const err = new Error(json?.error ?? "Photo upload failed");
    (err as any).code = json?.code ?? null;
    throw err;
  }
  return {
    url: typeof json.url === "string" && json.url.length > 0 ? json.url : null,
    faceMatch:
      typeof json.faceMatch === "number" && Number.isFinite(json.faceMatch)
        ? json.faceMatch
        : null,
    verified: !!json.verified,
  };
}

function useAttendance(enabled: boolean): UseAttendanceState {
  const [status, setStatus] = useState<AttendanceStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);
  // Idempotency keys for punches this instance initiated. The punch handler
  // already updates local state from the server response, so when the
  // `attendance:punch` broadcast comes back to us we skip the redundant
  // refetch — only OTHER mounted widgets (dashboard card, sidebar pill,
  // mobile bottom-nav) act on it.
  const ownPunchKeysRef = useRef<Set<string>>(new Set());
  // Set true for one IN punch when the user chose "Return early & check in" on
  // a full-day-leave day. Read when building the punch body, reset after.
  const endLeaveEarlyRef = useRef(false);

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
        const payload = json.status as AttendanceStatusPayload;
        // Cache the org's reportTimezone so every attendance display
        // helper renders check-in/out in the same zone — including the
        // ones mounted before this fetch resolves.
        setOrgTimezone(payload.reportTimezone);
        setStatus(payload);
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
    // Cross-widget sync: when any attendance widget punches, every other
    // mounted instance refetches immediately so the dashboard card, sidebar
    // pill and mobile bottom-nav stay in lock-step instead of waiting out
    // the 60s poll. Skip the key we fired ourselves — that instance already
    // has the fresh status from the punch response.
    const onPunch = (e: Event) => {
      const key = (e as CustomEvent).detail?.idempotencyKey as
        | string
        | undefined;
      if (key && ownPunchKeysRef.current.has(key)) {
        ownPunchKeysRef.current.delete(key);
        return;
      }
      fetchStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("attendance:punch", onPunch);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("attendance:punch", onPunch);
    };
  }, [enabled, fetchStatus]);

  const punch = useCallback(
    async (
      type: "IN" | "OUT",
      photoUrl: string | null = null,
      preCapturedGeo: { lat: number; lng: number } | null = null,
      faceMatch: number | null = null,
      livenessPassed: boolean | null = null,
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

      // Trust the geo passed in by the caller. The only path into punch() is
      // through punchWithGeoCheck, which has already attempted captureGeo();
      // re-trying here would double the GPS wait on indoor punches (up to
      // another 10s for nothing — the second attempt almost always fails the
      // same way the first did).
      const geo: { lat: number; lng: number } | null = preCapturedGeo;

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
            faceMatch,
            livenessPassed,
            endLeaveEarly: endLeaveEarlyRef.current,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          // Roll back to previous state.
          setStatus(previous);
          setError(json?.error ?? "Failed to punch");
          // Attach the server's structured code so the caller's catch
          // block can render a tailored toast for FACE_CAPTURE_REQUIRED,
          // FACE_VERIFY_REQUIRED, LIVENESS_REQUIRED, etc. The widget
          // refreshes status on these so a stale-cache client picks up
          // the new mode and re-prompts properly next time.
          if (json?.code === "FACE_CAPTURE_REQUIRED" ||
              json?.code === "FACE_VERIFY_REQUIRED" ||
              json?.code === "LIVENESS_REQUIRED") {
            fetchStatus();
          }
          const err = new Error(json?.error ?? "Failed to punch");
          (err as any).code = json?.code ?? null;
          throw err;
        }
        const next = json.status as AttendanceStatusPayload;
        setOrgTimezone(next.reportTimezone);
        setStatus(next);
        setError(null);
        // Broadcast a window event so other attendance views (My
        // Attendance table, Team Attendance, dashboard summary) can
        // refetch their own data without the user having to reload.
        // The widget itself doesn't need this — it already updates from
        // the punch response — but the rest of the app does. Idempotency-
        // key is included so listeners can dedupe if they need to.
        if (typeof window !== "undefined") {
          // Mark this key as ours so our own listener ignores the echo and
          // doesn't fire a redundant refetch (we already have the response).
          ownPunchKeysRef.current.add(idempotencyKey);
          window.dispatchEvent(
            new CustomEvent("attendance:punch", {
              detail: { type, idempotencyKey, at: Date.now() },
            }),
          );
        }
      } finally {
        setBusy(false);
        endLeaveEarlyRef.current = false;
      }
    },
    [busy, status, fetchStatus],
  );

  return {
    loading,
    busy,
    error,
    status,
    punch,
    refresh: fetchStatus,
    endLeaveEarlyRef,
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
  // Re-render when the org's reportTimezone changes (admin saved a new
  // value in Attendance Configuration) so the popover's check-in/out
  // clock labels switch zones without a page reload. Attendance times
  // are anchored to the org's zone — not the viewing user's — so HR and
  // the employee always see the same wall-clock for the same row.
  useOrgTimezone();
  // Kept for any user-zone-aware labels rendered elsewhere in the widget.
  useUserTimezone();
  const { loading, busy, error, status, punch, refresh, endLeaveEarlyRef } =
    useAttendance(enabled);
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
    geo: { lat: number; lng: number };
    faceMatch: number | null;
    livenessPassed: boolean | null;
    message: string;
  } | null>(null);

  // Live location check shown in the popover. Lets the user verify in real
  // time whether their current GPS reading is inside the configured radius
  // before they commit to a punch — avoids the "I checked in but it logged
  // me as outside" surprise.
  type LiveGeo =
    | { state: "idle" }
    | { state: "checking" }
    | {
        state: "ok";
        lat: number;
        lng: number;
        accuracy: number;
        distanceM: number | null;
        inside: boolean | null;
        at: number;
      }
    | { state: "error"; message: string; at: number };
  const [liveGeo, setLiveGeo] = useState<LiveGeo>({ state: "idle" });

  const refreshLiveLocation = useCallback(async () => {
    setLiveGeo({ state: "checking" });
    const r = await captureGeo();
    if (!r.ok) {
      setLiveGeo({ state: "error", message: r.message, at: Date.now() });
      return;
    }
    const fence = status?.geofence;
    const haveFence =
      !!fence &&
      fence.mode !== "OFF" &&
      fence.lat != null &&
      fence.lng != null &&
      fence.radiusM != null;
    const distanceM = haveFence
      ? distanceMeters(r.lat, r.lng, fence!.lat!, fence!.lng!)
      : null;
    const inside =
      haveFence && distanceM != null ? distanceM <= fence!.radiusM! : null;
    setLiveGeo({
      state: "ok",
      lat: r.lat,
      lng: r.lng,
      accuracy: r.accuracy,
      distanceM,
      inside,
      at: Date.now(),
    });
  }, [status?.geofence]);

  const punchWithGeoCheck = useCallback(
    async (
      type: "IN" | "OUT",
      photoUrl: string | null,
      faceMatch: number | null = null,
      livenessPassed: boolean | null = null,
      preCapturedGeoResult: GeoResult | null = null,
    ) => {
      const fence = status?.geofence;
      const inFenceMode =
        !!fence &&
        fence.mode !== "OFF" &&
        fence.lat != null &&
        fence.lng != null &&
        fence.radiusM != null;

      // Caller can hand us a geo reading that was captured in parallel with
      // the photo upload (face-capture flow). Avoids running geolocation
      // twice and serially when we already have a fresh fix.
      const geoResult = preCapturedGeoResult ?? (await captureGeo());

      // Location is mandatory for every punch — in-office or off-site —
      // regardless of geofenceMode. Without a successful fix we refuse the
      // punch outright (no "continue anyway" escape) so attendance rows
      // always carry coordinates.
      if (!geoResult.ok) {
        toast({
          title: `Location is required to check ${type === "IN" ? "in" : "out"}`,
          description: geoResult.message,
          variant: "destructive",
        });
        return;
      }

      const geo = { lat: geoResult.lat, lng: geoResult.lng };

      if (inFenceMode) {
        const dist = distanceMeters(geo.lat, geo.lng, fence!.lat!, fence!.lng!);
        if (dist > fence!.radiusM!) {
          setGeoConfirm({
            type,
            photoUrl,
            geo,
            faceMatch,
            livenessPassed,
            message: `You are ${Math.round(dist)}m away from the office (allowed radius: ${fence!.radiusM}m). Do you want to continue?`,
          });
          return;
        }
      }

      await punch(type, photoUrl, geo, faceMatch, livenessPassed);
      // Show the punch time in the success toast so the user sees the
      // same wall-clock value HR sees on the row — formatted in the
      // org's reportTimezone via the shared org-tz cache.
      const punchTime = formatTimeInOrgZone(new Date());
      toast({
        title:
          type === "IN"
            ? `Checked in at ${punchTime}`
            : `Checked out at ${punchTime}`,
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
    async (type: "IN" | "OUT", opts?: { endLeaveEarly?: boolean }) => {
      // Set fresh on every click so the flag never leaks from a prior,
      // abandoned attempt. It rides through the face-capture flow (if any)
      // until the actual punch reads it, then punch() resets it.
      endLeaveEarlyRef.current = type === "IN" && !!opts?.endLeaveEarly;
      // Face-capture flow: if the org has it on, defer the actual punch
      // until the dialog produces (or skips) a photo.
      const mode = status?.faceCapture.mode ?? "OFF";
      // Preflight: if verification is ENFORCE and this user has no
      // FaceEnrollment, the upload will be rejected with FACE_NOT_ENROLLED.
      // Catch it here so the user doesn't sit through the camera flow
      // first. Friendly toast pointing at where to enroll.
      if (
        (mode === "OPTIONAL" || mode === "REQUIRED") &&
        status?.faceVerify?.mode === "ENFORCE" &&
        status?.faceVerify?.enrolled === false
      ) {
        toast({
          title: "Your face is not enrolled yet",
          description:
            "Go to Profile → Personal info and upload (or take) a clear, front-facing photo. Your admin can also add it from Employee Master.",
          variant: "destructive",
        });
        return;
      }
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

  // Self-service early return: end today's full-day leave and check in. The
  // backend (recordPunch) shortens/cancels the leave when it sees endLeaveEarly.
  const handleReturnEarly = useCallback(async () => {
    await handleClick("IN", { endLeaveEarly: true });
    setOpen(false);
  }, [handleClick]);

  const handleCapturedPhoto = useCallback(
    async (
      blob: Blob,
      descriptor: Float32Array | null,
      faceCount: number,
      livenessPassed: boolean | null,
    ) => {
      const type = captureType;
      if (!type) return;
      setCaptureBusy(true);
      try {
        // Kick off GPS in parallel with the FTP photo upload. The photo
        // upload to Hostinger and the geolocation lookup are independent —
        // serializing them was the main reason check-in felt slow on
        // indoor (weak GPS) punches.
        const geoPromise = captureGeo();
        const result = await uploadFacePhoto(
          blob,
          type,
          descriptor,
          faceCount,
          livenessPassed,
        );
        setCaptureType(null);
        // Optional toast when verification ran — gives the user feedback
        // that face check actually happened. We only show in WARN mode
        // here; in ENFORCE the success itself implies verification.
        if (
          status?.faceVerify?.mode === "WARN" &&
          result.faceMatch != null
        ) {
          toast({
            title: result.verified
              ? "Identity verified"
              : "Face did not match enrollment",
            description: `Match score ${result.faceMatch.toFixed(2)} (lower is better).`,
          });
        }
        const geoResult = await geoPromise;
        await punchWithGeoCheck(
          type,
          result.url,
          result.faceMatch,
          livenessPassed,
          geoResult,
        );
      } catch (e: any) {
        // Tailor the message for the structured error codes the photo
        // route emits under ENFORCE.
        const code = e?.code as string | undefined;
        let title = "Punch failed";
        let description = e?.message ?? "Try again";
        if (code === "FACE_NOT_ENROLLED") {
          title = "Please enroll your face first";
          description =
            "Go to Profile → Personal info and upload (or take) a clear, front-facing photo.";
        } else if (code === "FACE_MISMATCH") {
          title = "Face does not match enrollment";
          description =
            "Make sure your face is well-lit and centered, then retake.";
        } else if (code === "MULTIPLE_FACES") {
          title = "Multiple faces detected";
          description =
            "Only you should be in the frame. Ask others to step aside and retake.";
        } else if (code === "LIVENESS_FAILED") {
          title = "Liveness check failed";
          description =
            "The photo appears static. Real selfies have natural micro-motion — please retake while looking at the camera.";
        } else if (code === "FACE_CAPTURE_REQUIRED") {
          // Server-side guard fired — almost always means the client had
          // a stale faceCapture.mode snapshot. The /punch handler
          // refreshes status automatically so the next click hits the
          // dialog properly.
          title = "Face capture is required";
          description =
            "Your organization now requires a face photo for every punch. Please try again — the camera will open.";
        } else if (code === "FACE_VERIFY_REQUIRED") {
          title = "Face verification is required";
          description =
            "Your organization requires identity verification for every punch. Please retake the photo through the app.";
        } else if (code === "LIVENESS_REQUIRED") {
          title = "Liveness check is required";
          description =
            "Your organization requires a strict liveness check. Please retake while looking at the camera so motion is captured.";
        }
        toast({ title, description, variant: "destructive" });
      } finally {
        setCaptureBusy(false);
      }
    },
    [captureType, punchWithGeoCheck, toast, status?.faceVerify?.mode],
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
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(20rem,calc(100vw-1.5rem))] p-0 overflow-hidden"
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
                {status.shift.isCustom && (
                  <span
                    className="ml-1 text-[10px] text-emerald-700"
                    title="Your shift differs from the company default."
                  >
                    (custom)
                  </span>
                )}
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
                  {formatTimeShort(status.checkInAt)}
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
                  {formatTimeShort(status.checkOutAt)}
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
            <div className="pt-2 border-t mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-500">
                  Geofence: {status.geofence.mode.toLowerCase()}
                  {status.geofence.radiusM
                    ? ` · ${status.geofence.radiusM}m`
                    : ""}
                </div>
                <button
                  type="button"
                  onClick={refreshLiveLocation}
                  disabled={liveGeo.state === "checking"}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {liveGeo.state === "checking" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  {liveGeo.state === "checking"
                    ? "Checking…"
                    : liveGeo.state === "idle"
                      ? "Check location"
                      : "Refresh"}
                </button>
              </div>

              {liveGeo.state === "ok" && (
                <div
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-[11px]",
                    liveGeo.inside === true &&
                      "border-emerald-200 bg-emerald-50 text-emerald-800",
                    liveGeo.inside === false &&
                      "border-red-200 bg-red-50 text-red-800",
                    liveGeo.inside === null &&
                      "border-gray-200 bg-gray-50 text-gray-700",
                  )}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    {liveGeo.inside === true && (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        You are within the office
                      </>
                    )}
                    {liveGeo.inside === false && (
                      <>
                        <MapPinOff className="h-3.5 w-3.5" />
                        You are Off-site
                      </>
                    )}
                    {liveGeo.inside === null && (
                      <>
                        <MapPin className="h-3.5 w-3.5" />
                        Location captured
                      </>
                    )}
                  </div>
                  {liveGeo.distanceM != null && (
                    <div className="mt-1">
                      {Math.round(liveGeo.distanceM)}m from office
                      {status.geofence.radiusM != null &&
                        ` · allowed ${status.geofence.radiusM}m`}
                    </div>
                  )}
                  <div className="mt-0.5 text-[10px] opacity-80">
                    Accuracy ±{Math.round(liveGeo.accuracy)}m · updated{" "}
                    {formatTimeShort(new Date(liveGeo.at).toISOString())}
                  </div>
                  {liveGeo.accuracy > GEO_LOW_ACCURACY_WARN_M && (
                    <div className="mt-1.5 flex items-start gap-1 text-[10px] text-amber-700">
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>
                        Reading is approximate (±
                        {Math.round(liveGeo.accuracy)}m). Your device is using
                        Wi-Fi/cell-tower positioning instead of GPS — move
                        outdoors or enable GPS for an exact fix.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {liveGeo.state === "error" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>{liveGeo.message}</span>
                  </div>
                </div>
              )}
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
          {status.partialLeaveNote && (
            <div className="mb-2 flex items-start gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] text-sky-800">
              <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{status.partialLeaveNote}</span>
            </div>
          )}
          <OvertimeToggle
            status={status}
            now={new Date(now)}
            onChanged={refresh}
          />
          <ActionButton
            status={status}
            busy={busy}
            onClick={async (t) => {
              await handleClick(t);
              setOpen(false);
            }}
            onReturnEarly={handleReturnEarly}
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
          // When face verification is ENFORCE, refuse to confirm a frame
          // with no detected face — saves a round-trip and gives the user
          // immediate feedback before they hit the upload endpoint.
          requireFaceDetected={status.faceVerify?.mode === "ENFORCE"}
          // Only run face-api descriptor extraction when verification is
          // actually on. With mode OFF (today's default), there's no
          // point computing a fingerprint nobody will check, and the
          // 7MB-models / tfjs-init cost would just delay every punch.
          extractDescriptor={
            !!status.faceVerify && status.faceVerify.mode !== "OFF"
          }
          // Anti-spoofing motion check. PERMISSIVE/STRICT both run the
          // check; STRICT also blocks on detector errors.
          requireLiveness={
            !!status.faceLiveness && status.faceLiveness.mode !== "OFF"
          }
          strictLiveness={status.faceLiveness?.mode === "STRICT"}
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
              You are not in the office radius
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
                  await punch(
                    c.type,
                    c.photoUrl,
                    c.geo,
                    c.faceMatch,
                    c.livenessPassed,
                  );
                  toast({
                    title:
                      c.type === "IN"
                        ? "You are checked in successfully"
                        : "You are checked out successfully",
                    description: "Recorded Off-site",
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

/**
 * Opt-in overtime toggle. ALWAYS visible whenever the org has opt-in OT
 * enabled — the toggle is rendered disabled with an explanatory hint when
 * the user can't act on it yet (not checked in, before shift end + buffer,
 * already checked out, or on a holiday / leave). The button only becomes
 * clickable in two cases:
 *
 *   - To turn OT ON: user is actively working AND `now >= availableAt`.
 *   - To turn OT OFF: an OT session is currently in progress (regardless
 *     of clock — pausing should always be possible).
 *
 * Toggling fires `POST /api/attendance/overtime` and re-fetches the
 * status so the elapsed-time counter reflects the new session.
 */
function OvertimeToggle({
  status,
  now,
  onChanged,
}: {
  status: AttendanceStatusPayload;
  now: Date;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Whole card is hidden only when the feature itself is off org-wide.
  if (!status.overtime.requiresOptIn) return null;

  const availableAt = status.overtime.availableAt
    ? new Date(status.overtime.availableAt)
    : null;
  const isAvailable = availableAt ? now >= availableAt : true;
  const optedIn = status.overtime.optedIn;
  const isWorking = status.canCheckOut; // checked-in, not checked-out

  // Disabled when:
  //  • a network round-trip is in flight,
  //  • the user is trying to TURN ON OT but can't (not working OR shift
  //    + buffer hasn't elapsed). They can always TURN OFF an active
  //    session so a pause is never blocked.
  const canTurnOn = isWorking && isAvailable;
  const canTurnOff = optedIn; // pause is always allowed mid-session
  const disabled = busy || (optedIn ? !canTurnOff : !canTurnOn);

  // Pick the most actionable hint to show below the "Overtime" label.
  // Order: in-session > not-checked-in > waiting-for-clock > ready.
  const hint = optedIn && status.overtime.startedAt
    ? `Started ${formatTimeShort(status.overtime.startedAt)}`
    : !isWorking
      ? "Check in first to enable overtime"
      : !isAvailable && availableAt
        ? `Available at ${formatTimeShort(availableAt.toISOString())}`
        : "Toggle on to start your OT session";

  const handleToggle = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/attendance/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ optIn: !optedIn }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to toggle overtime");
      }
      await onChanged();
    } catch (e: any) {
      setErr(e?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "mb-2 rounded-md border px-3 py-2 text-xs flex items-center justify-between gap-2",
        optedIn
          ? "border-blue-300 bg-blue-50"
          : canTurnOn
            ? "border-gray-200 bg-white"
            : "border-gray-200 bg-gray-50",
      )}
    >
      <div className="min-w-0">
        <div
          className={cn(
            "font-medium",
            optedIn ? "text-blue-800" : "text-gray-800",
          )}
        >
          Overtime
          {status.overtime.maxHoursPerDay > 0 && (
            <span className="ml-1 text-[10px] text-gray-500 font-normal">
              · max {status.overtime.maxHoursPerDay}h/day
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">{hint}</div>
        {err && (
          <div className="text-[10px] text-red-600 mt-0.5">{err}</div>
        )}
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-pressed={optedIn}
        // `title` exposes the same hint on hover so a disabled toggle is
        // discoverable on desktops (where the underlying text below is
        // small and might be missed).
        title={hint}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          optedIn ? "bg-blue-600" : "bg-gray-300",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow",
            optedIn ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

function ActionButton({
  status,
  busy,
  onClick,
  onReturnEarly,
}: {
  status: AttendanceStatusPayload;
  busy: boolean;
  onClick: (type: "IN" | "OUT") => Promise<void>;
  onReturnEarly?: () => void;
}) {
  const [confirmingReturn, setConfirmingReturn] = useState(false);

  // Full-day leave today: instead of nothing, offer a self-service early
  // return — ending the leave from today onward and checking in. (Partial
  // leaves never reach ON_LEAVE; they keep the normal check-in button.)
  if (status.state === "ON_LEAVE" && status.isOnLeave && onReturnEarly) {
    if (!confirmingReturn) {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmingReturn(true)}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
        >
          <LogIn className="h-4 w-4" />
          Return early &amp; check in
        </button>
      );
    }
    return (
      <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
        <p className="text-[11px] text-amber-800">
          End your {status.leaveType ? `${status.leaveType} ` : ""}leave early and
          return today? Today onward is freed and the days are refunded to your
          balance.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingReturn(false)}
            className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirmingReturn(false);
              onReturnEarly();
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Confirm &amp; check in
          </button>
        </div>
      </div>
    );
  }

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
      return status.checkInAt ? formatTimeShort(status.checkInAt) : "in";
    case "LATE":
      return `${status.lateMinutes}m late`;
    case "DONE":
      return status.checkOutAt ? formatTimeShort(status.checkOutAt) : "";
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
