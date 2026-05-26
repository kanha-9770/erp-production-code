"use client";

/**
 * Mobile bottom bar.
 *
 * Layout:
 *
 *   [⏱ Attendance pill]                 [🔔 Bell]  [▦ Apps]  [👤 Profile]
 *
 * Left cluster — Attendance:
 *   - Reuses the same `<AttendanceWidget />` the sidebar uses, in
 *     `collapsed` mode (icon-only pill). Tapping it opens the widget's
 *     own Popover — the exact same UI the desktop sidebar shows, with
 *     check-in / check-out buttons, geofence info, live worked-time
 *     counter, face-capture flow, etc. We don't reimplement any of
 *     that here; the widget is self-contained.
 *
 * Right cluster — Bell, Apps, Profile:
 *   - Bell  → reuses `<NotificationBell />` (same component as the
 *     sidebar). Its own Popover shows the notification list + detail
 *     dialog.
 *   - Apps  → opens an in-place Quick Access dialog (Google-favorites
 *     style 3-col icon grid). The top hamburger still opens the full
 *     sidebar; this is a thumb-zone shortcut to the *top* features.
 *   - Profile chip → /profile.
 *
 * Why reuse the sidebar widgets rather than build mobile-specific copies?
 *   - They own a lot of subtle state — geofence prompts, idempotency
 *     keys, face-capture, optimistic punch flips, notification polling,
 *     mark-read mutations. Duplicating that logic for mobile inevitably
 *     drifts out of sync (and we already had a duplicated punch path
 *     here that needed maintenance).
 *   - The popovers position themselves with `side="top"` (attendance)
 *     and `align="end"` (bell), which puts them above / left of the
 *     trigger — exactly where they need to go on a bottom bar.
 *
 * Z-index ladder (unchanged):
 *   z-30: this bar       → covered by the sidebar overlay when open
 *   z-40: sidebar overlay
 *   z-50: sidebar drawer / dialogs / popovers
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutGrid,
  User,
  Home,
  Clock,
  CalendarDays,
  Wallet,
  Users,
  Settings,
  Boxes,
  Inbox,
  Briefcase,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AttendanceWidget } from "@/components/attendance/attendance-widget";
import { NotificationBell } from "@/components/layout/notification-bell";
import { GlobalSearchDialog } from "@/components/layout/GlobalSearchDialog";

interface MobileBottomNavProps {
  /**
   * Opens the mobile sidebar drawer. Kept on the prop surface so the
   * parent (ConditionalLayout) can wire it from the top hamburger; the
   * grid icon in *this* bar no longer uses it (the grid opens the
   * Quick Access dialog instead — opening the sidebar from the bottom
   * bar surprised users).
   */
  onOpenMenu?: () => void;
}

// Quick Access tiles. Curated set of the most-used pages — kept to 9
// so the 3×3 grid stays balanced (matches the Google-favorites visual).
// Each entry pairs a route with a Lucide icon and an accent colour for
// the round tile background. Tailwind arbitrary classes work in both
// light and dark mode without extra CSS.
interface QuickTile {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // tile background + icon colour — kept together so a designer can
  // tweak one feature without hunting through two arrays.
  tone: string;
}

const QUICK_TILES: QuickTile[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: Home,
    tone: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  },
  {
    href: "/attendance",
    label: "Attendance",
    icon: Clock,
    tone: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  {
    href: "/leave",
    label: "Leave",
    icon: CalendarDays,
    tone: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  },
  {
    href: "/payroll",
    label: "Payroll",
    icon: Wallet,
    tone: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  },
  {
    href: "/employee-master",
    label: "Employees",
    icon: Users,
    tone: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  },
  {
    href: "/inventory",
    label: "Inventory",
    icon: Boxes,
    tone: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",
  },
  {
    href: "/hr/recruitment/job-opening",
    label: "Jobs",
    icon: Briefcase,
    tone: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  },
  {
    href: "/profile#notifications",
    label: "Inbox",
    icon: Inbox,
    tone: "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    tone: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  },
];

export function MobileBottomNav({ onOpenMenu: _onOpenMenu }: MobileBottomNavProps = {}) {
  // `onOpenMenu` is intentionally unused here now — see the prop's
  // doc-comment. Kept on the public surface so ConditionalLayout's
  // wiring keeps compiling.
  void _onOpenMenu;
  const pathname = usePathname();
  const router = useRouter();
  const isProfile = !!pathname?.startsWith("/profile");
  const isChat = pathname === "/chatbot";
  const [appsOpen, setAppsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const onTileTap = useCallback(
    (href: string) => {
      setAppsOpen(false);
      // Defer navigation a beat so the close animation can start —
      // otherwise the new page paints before the overlay fades, which
      // looks janky on slower phones.
      requestAnimationFrame(() => router.push(href));
    },
    [router],
  );

  return (
    <>
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-30",
          // safe-area inset keeps icons clear of the iOS home indicator.
          "pb-[env(safe-area-inset-bottom)]",
          // Solid background + crisp hairline border. No backdrop blur
          // (it fuzzed-out content behind the bar) and no soft drop
          // shadow (which read as a gradient halo). The border is a
          // single sharp line — clear separation, no fuzz.
          "bg-background border-t border-border",
        )}
        aria-label="Quick actions"
      >
        <div className="flex items-center justify-between gap-1 px-2 h-14">
          {/* Left: Attendance pill — same component as the sidebar.
              NOT collapsed: shows the icon + a readable label like
              "Check In", "Working 03:42", "Done", "Holiday", etc., so
              the user can tell at a glance what tapping it will do.
              `max-w-[140px]` keeps it from crowding the right cluster
              now that we host 5 icons there; the pill itself uses
              `truncate` so long labels gracefully ellipsis-out.
              Tapping opens the widget's own Popover, which carries
              the real check-in / check-out buttons, geofence prompts,
              live timer, face capture, etc. */}
          <div className="min-w-0 max-w-[140px] flex-shrink">
            <AttendanceWidget className="w-full" />
          </div>

          {/* Right: nav shortcuts. Tight `gap-0.5` so 5 icons fit
              comfortably on a 360px-wide phone without the attendance
              pill on the left having to disappear. */}
          <div className="flex items-center gap-0.5">
            {/* Global search — opens a cmdk command palette over all
                static pages, modules, and shortcuts. Hard-to-find
                pages in a deep ERP become one tap + a few keystrokes
                away. */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              className={cn(
                "flex items-center justify-center h-9 w-9 rounded-lg",
                "transition-colors duration-150",
                "active:scale-90 transition-transform",
                "touch-manipulation select-none",
                "text-foreground/80 hover:text-foreground hover:bg-muted/60",
              )}
            >
              <Search className="h-5 w-5" />
            </button>

            {/* AI Chatbot — routes to the existing `/chatbot` page
                (same destination as the sidebar rail's Sparkles
                button). Active-state highlight when already on
                /chatbot so the user knows where they are. */}
            <Link
              href="/chatbot"
              prefetch={false}
              aria-label="AI Chatbot"
              aria-current={isChat ? "page" : undefined}
              className={cn(
                "flex items-center justify-center h-9 w-9 rounded-lg",
                "transition-colors duration-150",
                "active:scale-90 transition-transform",
                "touch-manipulation select-none",
                isChat
                  ? "bg-primary/15 text-primary"
                  : "text-foreground/80 hover:text-foreground hover:bg-muted/60",
              )}
            >
              <Sparkles className="h-5 w-5" />
            </Link>

            {/* Notifications — same component as the sidebar.
                Renders its own bell trigger + popover + detail
                dialog. We don't wrap it in a Link / control its
                state. */}
            <NotificationBell collapsed />

            {/* Apps grid — opens the Quick Access dialog (Google-style
                favorites). Used to open the sidebar drawer; that was
                a surprise tap target so it now opens an in-place app
                grid instead. The top hamburger still opens the sidebar. */}
            <button
              type="button"
              onClick={() => setAppsOpen(true)}
              aria-label="Quick access"
              aria-haspopup="dialog"
              aria-expanded={appsOpen}
              className={cn(
                "flex items-center justify-center h-9 w-9 rounded-lg",
                "transition-colors duration-150",
                "active:scale-90 transition-transform",
                "touch-manipulation select-none",
                "text-foreground/80 hover:text-foreground hover:bg-muted/60",
              )}
            >
              <LayoutGrid className="h-5 w-5" />
            </button>

            {/* Profile chip. Circular shape sets it apart from the
                square icon buttons next to it (matches the mockup). */}
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

      {/* Google-favorites-style Quick Access grid. */}
      <QuickAppsDialog
        open={appsOpen}
        onOpenChange={setAppsOpen}
        onTileTap={onTileTap}
      />

      {/* Global search command palette — indexes shortcuts, static
          pages, and org modules. Mounted here so its lifetime is tied
          to the bottom bar (which itself only mounts under the app
          shell, i.e. authed pages — never on /login or /form/). */}
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

function QuickAppsDialog({
  open,
  onOpenChange,
  onTileTap,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTileTap: (href: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Slimmer width + chunky radius matches the Google "Your
        // favorites" card look (see screenshot).
        className="max-w-[20rem] rounded-3xl p-5 gap-4"
      >
        <DialogHeader className="text-left space-y-0.5 pr-6">
          <DialogTitle className="text-base font-semibold">
            Quick access
          </DialogTitle>
          <DialogDescription className="text-xs">
            Jump straight to the things you use most.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-x-2 gap-y-4">
          {QUICK_TILES.map(({ href, label, icon: Icon, tone }) => (
            <button
              key={href}
              type="button"
              onClick={() => onTileTap(href)}
              className={cn(
                "flex flex-col items-center justify-start gap-1.5 px-1 py-2",
                "rounded-xl transition-colors",
                "active:scale-95 transition-transform",
                "touch-manipulation select-none",
                "hover:bg-muted/50 focus-visible:bg-muted/50 focus:outline-none",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center h-12 w-12 rounded-full",
                  tone,
                )}
              >
                <Icon className="h-6 w-6" />
              </span>
              <span className="text-[11px] font-medium text-foreground text-center leading-tight line-clamp-2">
                {label}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
