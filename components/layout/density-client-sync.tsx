"use client";

import { useEffect } from "react";
import {
  DENSITY_MIN,
  hasDensityCookie,
  writeDensityCookie,
} from "@/lib/density-cookie";

/**
 * Replaces the mobile-detection branch of the old inline bootstrap script.
 *
 * The root layout SSRs density from the `density.v1` cookie. For users who
 * have never expressed a preference (no cookie yet), the server defaults
 * to "comfortable" — which is wrong on mobile, where compact @ 85% is the
 * preferred default. This component runs once on first visit, detects the
 * viewport, writes a default cookie, and applies the density to the live
 * DOM so the *current* page reflects it too. Every subsequent page load
 * SSRs with the cookie set, so there is no flash on future navigations.
 *
 * Renders nothing.
 */
export function DensityClientSync() {
  useEffect(() => {
    if (hasDensityCookie()) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const density = isMobile ? "compact" : "comfortable";
    const scale = isMobile ? DENSITY_MIN : 1;
    writeDensityCookie(density, scale);
    document.documentElement.dataset.density = density;
    document.documentElement.style.setProperty("--density-scale", String(scale));
  }, []);
  return null;
}
