/**
 * Density preference cookie.
 *
 * Stores the user's UI density choice in a cookie so the root layout
 * (`app/layout.tsx`) can read it on the server and render the right
 * `data-density` and `--density-scale` on `<html>` *before* the page paints.
 *
 * This replaces the old inline `<script>` bootstrap. React 19 (Next.js 16)
 * refuses to execute `<script>` tags rendered inside components and warns
 * about them — moving the source of truth to a cookie removes the script
 * entirely and lets SSR apply the preference directly.
 *
 * Format on the wire: `"<density>:<scale>"`, e.g. `"compact:0.85"` or
 * `"comfortable:1"`. Tiny, no JSON.parse on the server hot path.
 *
 * The bounds here mirror PreferencesTab's bounds so both sides agree on
 * what's clamp-able.
 */

export const DENSITY_COOKIE = "density.v1";

export type Density = "compact" | "comfortable";

export const DENSITY_MIN = 0.85;
export const DENSITY_MAX = 1;

// 1 year — density is a long-lived UI preference, not session state.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface ResolvedDensity {
  density: Density;
  scale: number;
}

export function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  if (n < DENSITY_MIN) return DENSITY_MIN;
  if (n > DENSITY_MAX) return DENSITY_MAX;
  return n;
}

export function parseDensityCookie(raw: string | undefined | null): ResolvedDensity {
  if (!raw) return { density: "comfortable", scale: 1 };
  const [d, s] = raw.split(":");
  const density: Density = d === "compact" ? "compact" : "comfortable";
  // Comfortable always pegs the scale at 1 regardless of what's stored —
  // matches PreferencesTab's `applyDensity` so a stale slider value can't
  // leak through after the user switches modes.
  const scale = density === "compact" ? clampScale(Number(s)) : 1;
  return { density, scale };
}

export function serializeDensity(density: Density, scale: number): string {
  const effective = density === "compact" ? clampScale(scale) : 1;
  return `${density}:${effective}`;
}

/**
 * Client-side cookie writer. No-op on the server. SameSite=Lax + Path=/ so
 * it travels with every request to the app and to subresources.
 */
export function writeDensityCookie(density: Density, scale: number): void {
  if (typeof document === "undefined") return;
  const value = serializeDensity(density, scale);
  document.cookie = `${DENSITY_COOKIE}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

/**
 * Cheap "does the cookie exist?" check for the first-visit mobile-default
 * effect. We don't need to parse the value — only whether the user has
 * already expressed (or had defaulted) a preference.
 */
export function hasDensityCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${DENSITY_COOKIE}=`));
}
