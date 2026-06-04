"use client";

/**
 * useSidebarBadges — fetches per-route "pending / needs-action" counts for the
 * sidebar (GET /api/sidebar/badges) and keeps them fresh.
 *
 * Returns a `{ [path]: count }` map. Refreshes on mount, on a 60s interval, on
 * window focus, and whenever the route changes (so acting on a request updates
 * the badge shortly after you navigate). Failures resolve to the last known
 * map — badges never break navigation.
 */

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const REFRESH_MS = 60_000;

export function useSidebarBadges(): Record<string, number> {
  const pathname = usePathname();
  const [badges, setBadges] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sidebar/badges", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; badges?: Record<string, number> }
        | null;
      if (json?.success && json.badges && typeof json.badges === "object") {
        setBadges(json.badges);
      }
    } catch {
      /* keep last-known counts */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Re-check shortly after navigation (e.g. after approving on an inbox page).
  useEffect(() => {
    const t = setTimeout(load, 800);
    return () => clearTimeout(t);
  }, [pathname, load]);

  return badges;
}
