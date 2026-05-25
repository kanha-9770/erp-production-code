"use client";

/**
 * Mobile bottom bar.
 *
 * Layout (matches the mockup with check-in/out added back to the left):
 *
 *   [⏵ In]  [⏷ Out]                       [▦ Grid]  [👤 Profile]
 *
 * Left cluster — punch actions:
 *   - Tappable icon buttons for Check In and Check Out
 *   - Disabled (40% opacity) when not applicable per server status
 *   - Spinner while a request is in flight
 *   - Optimistic flip so the UI responds instantly; rolls back on error
 *
 * Right cluster — navigation:
 *   - Grid icon → / (dashboard / module launcher)
 *   - Profile chip → /profile
 *
 * Visual:
 *   - NO border-top. The previous version used `border-t` which read as
 *     a second header line stacked under the page content. Replaced
 *     with a soft upward shadow so the bar reads as floating glass.
 *   - Frosted background (`bg-background/90 backdrop-blur-xl`) matches
 *     the top app bar's frosted look — top and bottom feel coherent.
 *   - `pb-[env(safe-area-inset-bottom)]` keeps icons clear of the iOS
 *     home indicator.
 *
 * Self-contained — does NOT import from attendance-widget.tsx (which
 * pulls in face-api.js, geofence dialogs, ~1500 lines we don't need).
 * Inlines a ~60-line `usePunch` so the bottom bar stays light.
 *
 * Face-capture / geofence policy:
 *   - If org's faceCapture.mode === "REQUIRED", refuse to punch from
 *     here and surface a toast pointing at the full sidebar widget.
 *   - If geofence.mode !== "OFF", best-effort 4s GPS read; if it
 *     doesn't return in time we send `null` and let the server decide.
 *
 * Z-index ladder (unchanged):
 *   z-30: this bar       → covered by the overlay when sidebar opens
 *   z-40: sidebar overlay
 *   z-50: sidebar drawer
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, User, LogIn, LogOut, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Mirror of AttendanceStatusPayload from attendance-widget.tsx — only
// the fields we care about. Duplicated rather than imported so we
// don't drag the widget's transitive deps (face-api, etc.) into the
// layout chunk.
interface AttStatus {
  canCheckIn: boolean;
  canCheckOut: boolean;
  checkedIn: boolean;
  checkedOut: boolean;
  faceCapture: { mode: "OFF" | "OPTIONAL" | "REQUIRED" };
  geofence: { mode: "OFF" | "CAPTURE" | "ENFORCE" };
}

const REFRESH_MS = 60_000;
const GEO_TIMEOUT_MS = 4_000;

function makeIdempotencyKey(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function tryGetGeo(
  timeoutMs: number,
): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    // External timeout in case the browser's own timeout doesn't fire
    // (some Android builds wait for the user to grant permission and
    // never time out the prompt itself).
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: timeoutMs },
    );
  });
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { toast } = useToast();
  const isHome = pathname === "/";
  // Both /profile and /profile/[id] count as the profile area.
  const isProfile = !!pathname?.startsWith("/profile");

  const [status, setStatus] = useState<AttStatus | null>(null);
  const [busy, setBusy] = useState<"IN" | "OUT" | null>(null);
  const aliveRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/today", {
        credentials: "include",
        cache: "no-store",
      });
      if (!aliveRef.current) return;
      // 401 = signed-out. The route guard handles redirect; here we
      // just hide attendance UI so the bar still works for nav.
      if (res.status === 401) {
        setStatus(null);
        return;
      }
      const json = await res.json();
      if (json?.success && json.status) {
        setStatus(json.status as AttStatus);
      }
    } catch {
      // Best-effort. A flaky network leaves the punch buttons disabled
      // (status stays null), but Grid + Profile still work.
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
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
  }, [fetchStatus]);

  const punch = useCallback(
    async (type: "IN" | "OUT") => {
      if (busy) return;

      // Bail out if the org requires the camera capture flow — the
      // bottom bar deliberately doesn't carry face-api.
      if (status?.faceCapture.mode === "REQUIRED") {
        toast({
          title: "Camera capture required",
          description: "Open the attendance widget in the sidebar to check in.",
        });
        return;
      }

      setBusy(type);

      // Optimistic flip — same shape the full widget uses
      // (attendance-widget.tsx). Server response replaces this on
      // success; `previous` is restored on failure.
      const previous = status;
      if (status) {
        setStatus({
          ...status,
          checkedIn: type === "IN" ? true : status.checkedIn,
          checkedOut: type === "OUT" ? true : status.checkedOut,
          canCheckIn: type === "IN" ? false : status.canCheckIn,
          canCheckOut:
            type === "IN"
              ? true
              : type === "OUT"
                ? false
                : status.canCheckOut,
        });
      }

      // Skip the GPS prompt entirely when geofence is off — saves ~4s
      // and avoids surfacing the browser permission dialog for no
      // reason.
      const geo =
        status && status.geofence.mode !== "OFF"
          ? await tryGetGeo(GEO_TIMEOUT_MS)
          : null;
      const idempotencyKey = makeIdempotencyKey();

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
            photoUrl: null,
            faceMatch: null,
            livenessPassed: null,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          setStatus(previous);
          toast({
            title: type === "IN" ? "Check-in failed" : "Check-out failed",
            description: json?.error ?? "Try again from the attendance widget.",
            variant: "destructive",
          });
          return;
        }
        setStatus(json.status as AttStatus);
        toast({ title: type === "IN" ? "Checked in" : "Checked out" });
      } catch (e) {
        setStatus(previous);
        toast({
          title: "Network error",
          description: e instanceof Error ? e.message : "Could not punch",
          variant: "destructive",
        });
      } finally {
        setBusy(null);
      }
    },
    [busy, status, toast],
  );

  // Derived enable/disable. Server's flag AND we haven't already
  // optimistically flipped — so a double-tap can't fire two opposing
  // requests.
  const canIn = !!status?.canCheckIn && !status.checkedIn;
  const canOut = !!status?.canCheckOut && status.checkedIn && !status.checkedOut;

  return (
    <nav
      className={cn(
        "md:hidden fixed bottom-0 left-0 right-0 z-30",
        // safe-area inset keeps icons clear of the iOS home indicator.
        "pb-[env(safe-area-inset-bottom)]",
        // No border-top. The previous border read as a stacked second
        // header line; we use a soft upward shadow so the bar reads
        // as floating chrome instead.
        "bg-background/90 backdrop-blur-xl backdrop-saturate-150",
        "shadow-[0_-8px_20px_-12px_rgba(0,0,0,0.15)]",
      )}
      aria-label="Quick actions"
    >
      <div className="flex items-center justify-between gap-2 px-4 h-14">
        {/* Left: punch actions. Disabled state is automatic — buttons
            stay visible (no layout shift between days) but go 40% and
            ignore taps. */}
        <div className="flex items-center gap-2">
          <PunchIcon
            type="IN"
            available={canIn}
            busy={busy === "IN"}
            onClick={() => punch("IN")}
          />
          <PunchIcon
            type="OUT"
            available={canOut}
            busy={busy === "OUT"}
            onClick={() => punch("OUT")}
          />
        </div>

        {/* Right: nav shortcuts. */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            prefetch={false}
            aria-label="Dashboard"
            aria-current={isHome ? "page" : undefined}
            className={cn(
              "flex items-center justify-center h-9 w-9 rounded-lg",
              "transition-colors duration-150",
              "active:scale-90 transition-transform",
              "touch-manipulation select-none",
              isHome
                ? "bg-muted text-foreground"
                : "text-foreground/80 hover:text-foreground hover:bg-muted/60",
            )}
          >
            <LayoutGrid className="h-5 w-5" />
          </Link>
          <Link
            href="/profile"
            prefetch={false}
            aria-label="Profile"
            aria-current={isProfile ? "page" : undefined}
            className={cn(
              "flex items-center justify-center h-9 w-9 rounded-full",
              "transition-colors duration-150",
              "active:scale-90 transition-transform",
              "touch-manipulation select-none",
              isProfile
                ? "bg-primary/15 text-primary"
                : "bg-muted text-foreground/80 hover:bg-muted/70",
            )}
          >
            <User className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

function PunchIcon({
  type,
  available,
  busy,
  onClick,
}: {
  type: "IN" | "OUT";
  available: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const Icon = type === "IN" ? LogIn : LogOut;
  const label = type === "IN" ? "Check in" : "Check out";
  // `disabled` covers both: server says no (already checked in, weekly
  // off, etc.) AND a request is in flight.
  const disabled = !available || busy;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex items-center justify-center h-9 w-9 rounded-lg",
        "transition-colors duration-150",
        "active:scale-90 transition-transform",
        "touch-manipulation select-none",
        "disabled:opacity-40 disabled:active:scale-100",
        // Emerald for check-in (go), amber for check-out (caution-y).
        // Slate when disabled so the button is visible but clearly
        // not actionable.
        !disabled && type === "IN" &&
          "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400",
        !disabled && type === "OUT" &&
          "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-400",
        disabled && "bg-muted/50 text-muted-foreground",
      )}
    >
      {busy ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Icon className="h-5 w-5" />
      )}
    </button>
  );
}
