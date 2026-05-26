"use client";

/**
 * Profile cover banner.
 *
 * Renders a wide hero strip at the top of the profile page using the
 * ERP's accent purple (#5a4d96, the same colour the sidebar uses). The
 * gradient AND the overlaid SVG pattern both rotate by day-of-week, so
 * the user sees a different "Monday" look than a "Friday" look — small
 * touch but it makes a page that otherwise rarely changes feel alive.
 *
 * Why this approach:
 *   - Inline SVG patterns are < 1 KB each and don't add a network
 *     round-trip. No new asset files in `public/` to ship.
 *   - We pick the variant from `new Date().getDay()` at render time on
 *     the client (see `useDayIndex`). Computing it on the server would
 *     pin the banner to the server's timezone — fine in production
 *     where servers are typically UTC, but the user's "today" is what
 *     matters for "changes every day".
 *   - The pattern is white at low alpha over a purple gradient — keeps
 *     the surface usable as a backdrop for the avatar + name without
 *     ever fighting them for attention.
 *
 * Visual contract:
 *   - Full bleed width (caller controls margins).
 *   - Caller controls height via `className` (e.g. `h-32 sm:h-40`).
 *   - Always rounded at the bottom corners — the banner is treated as
 *     a header that the avatar overlaps from below.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// ERP accent — same value the sidebar reads from
// `components/layout/sidebar.tsx` (ACCENT = "#5a4d96"). Mirrored here
// so the banner doesn't have to import a layout module just for one
// hex code, and so designers can tweak banner-only shades without
// touching the canonical sidebar accent.
const ACCENT = "#5a4d96";

// 7 day-keyed variants. Each pairs a gradient (two purple stops) with a
// repeating SVG pattern URL. The pattern is rendered with white +
// alpha so it reads as a subtle texture over the purple, regardless
// of the specific gradient picked.
//
// Keep tiles small (≤80px) so the repeat is dense enough to read as
// "pattern" rather than "icon". `encodeURIComponent` is used on the
// SVG string at build time below — no per-render cost.
interface Variant {
  // Tailwind-free gradient as a raw CSS background-image string so we
  // can compose it with the SVG pattern in a single declaration.
  gradient: string;
  // Inline SVG, URL-encoded for a `url("…")` value.
  pattern: string;
  // Friendly name shown to assistive tech.
  label: string;
}

function svgUrl(svg: string): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

// Each tile is rendered against the gradient via mix-blend; using
// `rgba(255,255,255,0.18)` for the strokes/fills gives the same
// "frosted chalk" feel on every gradient.
const STROKE = "rgba(255,255,255,0.22)";
const FILL = "rgba(255,255,255,0.16)";

const VARIANTS: Variant[] = [
  // Sunday — soft dot grid. Lightest, most "weekend".
  {
    label: "Sunday — dots",
    gradient: `linear-gradient(135deg, #6a5da6 0%, #5a4d96 50%, #4a3d86 100%)`,
    pattern: svgUrl(
      `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><circle cx='10' cy='10' r='1.5' fill='${FILL}'/><circle cx='30' cy='30' r='1.5' fill='${FILL}'/></svg>`,
    ),
  },
  // Monday — clean diagonal pinstripes. "Get to work" energy.
  {
    label: "Monday — diagonal lines",
    gradient: `linear-gradient(135deg, #4a3d86 0%, #5a4d96 60%, #7a6db8 100%)`,
    pattern: svgUrl(
      `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M0 32 L32 0' stroke='${STROKE}' stroke-width='1'/><path d='M-8 8 L8 -8' stroke='${STROKE}' stroke-width='1'/><path d='M24 40 L40 24' stroke='${STROKE}' stroke-width='1'/></svg>`,
    ),
  },
  // Tuesday — gentle sine waves.
  {
    label: "Tuesday — waves",
    gradient: `linear-gradient(120deg, #5a4d96 0%, #7a6db8 50%, #5a4d96 100%)`,
    pattern: svgUrl(
      `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='30' viewBox='0 0 60 30'><path d='M0 15 Q 15 0 30 15 T 60 15' fill='none' stroke='${STROKE}' stroke-width='1.2'/></svg>`,
    ),
  },
  // Wednesday — chat-bubble doodles. Closest to the screenshot the
  // user pinned for inspiration.
  {
    label: "Wednesday — doodles",
    gradient: `linear-gradient(160deg, #5a4d96 0%, #6a5da6 50%, #4a3d86 100%)`,
    pattern: svgUrl(
      `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><g fill='none' stroke='${STROKE}' stroke-width='1.2' stroke-linejoin='round' stroke-linecap='round'><rect x='8' y='10' width='22' height='16' rx='4'/><path d='M14 26 L12 30 L18 26'/><circle cx='58' cy='20' r='8'/><circle cx='58' cy='20' r='2' fill='${STROKE}'/><path d='M14 56 Q22 48 30 56 T 46 56'/><rect x='52' y='52' width='18' height='14' rx='3'/><path d='M58 66 L56 70 L62 66'/></g></svg>`,
    ),
  },
  // Thursday — hexagonal honeycomb. Geometric, balanced.
  {
    label: "Thursday — hexagons",
    gradient: `linear-gradient(135deg, #5a4d96 0%, #4a3d86 70%, #5a4d96 100%)`,
    pattern: svgUrl(
      `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='48' viewBox='0 0 56 48'><g fill='none' stroke='${STROKE}' stroke-width='1.1'><path d='M14 4 L28 12 L28 28 L14 36 L0 28 L0 12 Z'/><path d='M42 4 L56 12 L56 28 L42 36 L28 28 L28 12 Z'/><path d='M14 36 L28 44'/><path d='M42 36 L28 44'/></g></svg>`,
    ),
  },
  // Friday — pluses. Playful, end-of-week vibe.
  {
    label: "Friday — pluses",
    gradient: `linear-gradient(135deg, #7a6db8 0%, #5a4d96 50%, #4a3d86 100%)`,
    pattern: svgUrl(
      `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><g stroke='${STROKE}' stroke-width='1.3' stroke-linecap='round'><path d='M10 6 L10 14 M6 10 L14 10'/><path d='M30 26 L30 34 M26 30 L34 30'/></g></svg>`,
    ),
  },
  // Saturday — concentric circles. Mellow.
  {
    label: "Saturday — circles",
    gradient: `linear-gradient(135deg, #6a5da6 0%, #5a4d96 50%, #6a5da6 100%)`,
    pattern: svgUrl(
      `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><g fill='none' stroke='${STROKE}' stroke-width='1.1'><circle cx='15' cy='15' r='4'/><circle cx='15' cy='15' r='8'/><circle cx='45' cy='45' r='4'/><circle cx='45' cy='45' r='8'/></g></svg>`,
    ),
  },
];

/**
 * Returns the local-day index 0-6 after hydration. During SSR and the
 * first client paint we return 0 so the markup matches between server
 * and client (avoiding a hydration warning); the real day kicks in on
 * the next render, which is fine because the banner is purely
 * decorative.
 */
function useDayIndex(): number {
  const [day, setDay] = useState<number>(0);
  useEffect(() => {
    setDay(new Date().getDay());
  }, []);
  return day;
}

interface DailyBannerProps {
  className?: string;
}

export function DailyBanner({ className }: DailyBannerProps) {
  const day = useDayIndex();
  const variant = VARIANTS[day];

  return (
    <div
      role="img"
      aria-label={`Profile banner — ${variant.label}`}
      className={cn(
        "relative w-full overflow-hidden",
        // Soft inner border that picks up the ERP accent without ever
        // making the banner feel boxed-in.
        "ring-1 ring-inset ring-white/10",
        className,
      )}
      style={{
        // Pattern on top, gradient underneath. Two background layers in
        // a single declaration so the browser only has to compose once.
        backgroundImage: `${variant.pattern}, ${variant.gradient}`,
        backgroundColor: ACCENT,
      }}
    >
      {/* Soft vignette at the bottom — gives the avatar that overlaps
          the banner edge a little more contrast against the pattern. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-black/15"
      />
    </div>
  );
}
