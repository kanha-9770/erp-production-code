"use client"

/**
 * /profile — Instagram-style profile with drill-down navigation.
 *
 * Mobile UX (the design the user actually asked for):
 *   - Default view: identity card + a vertical LIST of sections
 *     (Overview, Personal, Employment, …). No tab bar. No "second
 *     header" floating beneath the global top bar.
 *   - Tap a section → drill into it. The page swaps to show ONLY that
 *     section, with a small inline back chevron at the top of the
 *     content (NOT a fixed header bar). Tapping back returns to the
 *     list. Behaves like iOS Settings or Instagram's settings menu.
 *   - State is encoded in `location.hash`:
 *        no hash          → list view
 *        #personal etc.   → section view
 *     so back/forward + deep-links still work.
 *   - The global mobile top bar (in ConditionalLayout) is the ONLY
 *     header. The bottom nav is the ONLY bottom navigation. Nothing
 *     in this page is `position: fixed` or `position: sticky`.
 *
 * Desktop UX (≥lg):
 *   - Side-by-side: vertical section list on the left, content on the
 *     right. Same hash routing.
 *   - When no hash, defaults to Overview so the content area isn't
 *     blank.
 *
 * Tabs preserved exactly — DO NOT change the set/order without also
 * updating routing in components that deep-link to /profile#<id>.
 */

import { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  LayoutDashboard,
  User as UserIcon,
  Briefcase,
  Bell,
  Settings,
  Shield,
  LogOut,
  Building2,
  Wallet,
  Network,
  ChevronRight,
  ChevronLeft,
} from "lucide-react"
import { useGetUserQuery, useLogoutMutation } from "@/lib/api/auth"
import OverviewTab from "@/components/profile/OverviewTab"
import PersonalTab from "@/components/profile/PersonalTab"
import EmploymentTab from "@/components/profile/EmploymentTab"
import SalaryTab from "@/components/profile/SalaryTab"
import NotificationsTab from "@/components/profile/NotificationsTab"
import PreferencesTab from "@/components/profile/PreferencesTab"
import SecurityTab from "@/components/profile/SecurityTab"
import OrganizationTab from "@/components/profile/OrganizationTab"
import HierarchyTab from "@/components/profile/HierarchyTab"
import type { ProfileTabId, ProfileUser } from "@/components/profile/types"
import { displayName, initialsOf } from "@/components/profile/profile-utils"
import { DailyBanner } from "@/components/profile/DailyBanner"
import { cn } from "@/lib/utils"

interface TabDef {
  id: ProfileTabId
  label: string
  icon: React.ReactNode
  // adminOnly tabs are hidden from non-admins; a deep-link to a hidden
  // tab silently falls back to the list (mobile) / overview (desktop).
  adminOnly?: boolean
}

const TABS: Array<TabDef> = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "personal", label: "Personal info", icon: <UserIcon className="h-4 w-4" /> },
  { id: "employment", label: "Employment", icon: <Briefcase className="h-4 w-4" /> },
  { id: "salary", label: "Salary", icon: <Wallet className="h-4 w-4" /> },
  { id: "hierarchy", label: "Reporting structure", icon: <Network className="h-4 w-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  { id: "preferences", label: "Preferences", icon: <Settings className="h-4 w-4" /> },
  { id: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
  { id: "organization", label: "Organization", icon: <Building2 className="h-4 w-4" />, adminOnly: true },
]

const ALL_TAB_IDS = new Set<ProfileTabId>(TABS.map((t) => t.id))

/**
 * Mobile list layout — Instagram "Settings and activity" style.
 *
 * The flat TABS array stays the source of truth for routing / labels /
 * icons. This structure just decides how those tabs are *grouped* in the
 * mobile list view:
 *   - `title: null` is the lead group (no header label above it).
 *   - Items with `variant: "lead"` render as the big multi-line card at
 *     the top (avatar-circle icon + description).
 *   - Items with no variant (default) render as a single-line row.
 *   - Admin-only tabs are filtered out at render time via visibleTabIds;
 *     a group whose every item is filtered out is skipped entirely so
 *     we never render a section header above nothing.
 */
interface MobileGroupItem {
  id: ProfileTabId
  variant?: "lead"
  description?: string
}
interface MobileGroup {
  title: string | null
  items: MobileGroupItem[]
}

const MOBILE_GROUPS: MobileGroup[] = [
  {
    title: null,
    items: [
      {
        id: "personal",
        variant: "lead",
        description: "Profile, contact info, addresses, bank details",
      },
    ],
  },
  {
    title: "How you use this app",
    items: [
      { id: "overview" },
      { id: "notifications" },
    ],
  },
  {
    title: "Work",
    items: [
      { id: "employment" },
      { id: "salary" },
      { id: "hierarchy" },
    ],
  },
  {
    title: "Settings",
    items: [
      { id: "preferences" },
      { id: "security" },
    ],
  },
  {
    title: "For administrators",
    items: [
      { id: "organization" },
    ],
  },
]

export default function ProfilePage() {
  const router = useRouter()
  const { toast } = useToast()
  const { data, isLoading, isError, error } = useGetUserQuery()
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation()

  // null = no section selected. On mobile this means "show the list";
  // on desktop we fall back to "overview" so the content area isn't blank.
  const [tab, setTab] = useState<ProfileTabId | null>(null)

  useEffect(() => {
    const sync = () => {
      const h = (window.location.hash || "").replace(/^#/, "") as ProfileTabId
      setTab(ALL_TAB_IDS.has(h) ? h : null)
    }
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  const switchTab = useCallback((id: ProfileTabId | null) => {
    setTab(id)
    if (typeof window !== "undefined") {
      if (id === null) {
        if (window.location.hash) {
          window.history.replaceState({}, "", window.location.pathname)
        }
      } else if (window.location.hash !== `#${id}`) {
        window.history.replaceState({}, "", `${window.location.pathname}#${id}`)
      }
      // Scroll to top so the new view starts at the top regardless of
      // where the user was scrolled in the previous view.
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
    }
  }, [])

  // Auth gate
  useEffect(() => {
    if (isError) {
      const status = (error as any)?.status
      if (status === 401) router.push("/login")
    }
  }, [isError, error, router])

  const handleLogout = async () => {
    try {
      await logout().unwrap()
      router.push("/login")
    } catch {
      toast({ title: "Logout failed", variant: "destructive" })
    }
  }

  const user = data?.user as ProfileUser | undefined
  const isAdmin = !!user?.isAdmin || !!user?.isOrgOwner
  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.adminOnly || isAdmin),
    [isAdmin],
  )
  const visibleTabIds = useMemo(
    () => new Set(visibleTabs.map((t) => t.id)),
    [visibleTabs],
  )

  // Snap a non-admin back to the list if they deep-linked into an
  // admin-only section.
  useEffect(() => {
    if (user && tab !== null && !visibleTabIds.has(tab)) {
      setTab(null)
      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState({}, "", window.location.pathname)
      }
    }
  }, [tab, visibleTabIds, user])

  if (isLoading || !user) {
    return <LoadingShell />
  }

  const primaryRole = user.unitAssignments[0]?.role?.name
  const accessTier: "Owner" | "Admin" | "Member" = user.isOrgOwner
    ? "Owner"
    : user.isAdmin
      ? "Admin"
      : "Member"

  // On desktop the content panel always shows something — fall back to
  // overview when the user hasn't picked a section yet.
  const desktopTab: ProfileTabId = tab ?? "overview"
  const activeMobileDef = tab ? visibleTabs.find((t) => t.id === tab) : null

  // Single source of truth for rendering a tab's content. Re-used by
  // both the mobile section view and the desktop content panel.
  const renderTabContent = (id: ProfileTabId): React.ReactNode => {
    switch (id) {
      case "overview":
        return <OverviewTab user={user} onJumpTab={(next) => switchTab(next)} />
      case "personal":
        return <PersonalTab user={user} />
      case "employment":
        return <EmploymentTab user={user} />
      case "salary":
        return <SalaryTab user={user} />
      case "hierarchy":
        return <HierarchyTab />
      case "notifications":
        return <NotificationsTab />
      case "preferences":
        return <PreferencesTab />
      case "security":
        return <SecurityTab />
      case "organization":
        return isAdmin ? <OrganizationTab user={user} /> : null
      default:
        return null
    }
  }

  return (
    <div className="min-h-full bg-background pb-8">
      {/* ── Hero banner ──────────────────────────────────────────────
          Daily-rotating purple banner (matches the sidebar accent
          #5a4d96). Full-bleed — spans the entire page width like a
          LinkedIn cover, so the avatar that overlaps it from below
          reads as the focal point of a single composition. Only
          rendered on the LIST view — when the user has drilled into
          a specific section on mobile, the banner is hidden so the
          section gets the full viewport. Edit/Personal renders its
          own (narrower) banner since users spend the most time there. */}
      <div className={cn(tab !== null && "hidden lg:block")}>
        <DailyBanner className="h-32 sm:h-44" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 max-w-4xl">
        {/* ── Identity section ─────────────────────────────────────────
            Always shown on desktop. On mobile, hidden when the user
            has drilled into a specific section — the section view
            replaces it entirely so the section content gets the full
            viewport.

            The avatar uses a negative top margin to overlap the
            DailyBanner above. `ring-4 ring-background` separates it
            visually from the banner pattern. */}
        <div
          className={cn(
            // Negative top margin pulls the row UP into the banner,
            // creating the LinkedIn-style overlap. Smaller on mobile
            // (banner is shorter) than desktop.
            "-mt-12 sm:-mt-14",
            tab !== null && "hidden lg:block",
          )}
        >
          <div className="flex flex-col items-center sm:flex-row sm:items-end gap-4 sm:gap-8">
            <Avatar className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 ring-4 ring-background shadow-md">
              {user.avatar ? (
                <AvatarImage src={user.avatar} alt={displayName(user)} />
              ) : null}
              <AvatarFallback className="text-2xl font-semibold bg-muted text-foreground/70">
                {initialsOf(user)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0 w-full text-center sm:text-left sm:pb-2">
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
                  {displayName(user)}
                </h1>
                {accessTier !== "Member" && (
                  <Badge className="text-[10px] px-2 h-5 bg-primary/15 text-primary hover:bg-primary/15 border-transparent">
                    {accessTier}
                  </Badge>
                )}
              </div>

              <div className="mt-1 text-sm text-muted-foreground space-y-0.5">
                {primaryRole ? (
                  <p className="font-medium text-foreground/80">{primaryRole}</p>
                ) : null}
                <p className="truncate">
                  {user.email}
                  {user.organization?.name ? (
                    <span className="text-muted-foreground/80">
                      {" · "}
                      {user.organization.name}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 mt-4">
                <Button
                  type="button"
                  onClick={() => switchTab("personal")}
                  className="h-9 px-4"
                  size="sm"
                >
                  Edit profile
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="h-9 px-4"
                  size="sm"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── MOBILE LIST VIEW (drill-down menu) ─────────────────────
            Instagram "Settings and activity" style. A lead "Account" card
            with an avatar-circle icon and multi-line description sits at
            the top; subsequent sections render under small uppercase
            group headers. Each group is its own bordered list with
            edge-to-edge dividers. Empty groups (e.g. admin-only sections
            for non-admins) are skipped entirely. */}
        <div className={cn("lg:hidden mt-6 -mx-4 space-y-6", tab !== null && "hidden")}>
          {MOBILE_GROUPS.map((group, groupIdx) => {
            const items = group.items.filter((it) => visibleTabIds.has(it.id))
            if (items.length === 0) return null

            return (
              <div key={group.title ?? `__lead-${groupIdx}`}>
                {group.title && (
                  <h3 className="px-4 pb-2 text-[13px] font-medium text-muted-foreground">
                    {group.title}
                  </h3>
                )}
                <div className="bg-background border-y border-border">
                  {items.map((it, idx) => {
                    const def = visibleTabs.find((t) => t.id === it.id)
                    if (!def) return null
                    const notLast = idx !== items.length - 1

                    if (it.variant === "lead") {
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => switchTab(it.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-4 text-left",
                            "active:bg-muted/40 transition-colors duration-100",
                            "select-none touch-manipulation",
                            notLast && "border-b border-border",
                          )}
                        >
                          <span
                            aria-hidden
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground/80 [&>svg]:h-6 [&>svg]:w-6"
                          >
                            {def.icon}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[16px] font-semibold leading-tight">
                              {def.label === "Personal info" ? "Account" : def.label}
                            </span>
                            {it.description && (
                              <span className="mt-0.5 block text-[13px] text-muted-foreground leading-snug">
                                {it.description}
                              </span>
                            )}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        </button>
                      )
                    }

                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => switchTab(it.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3.5 text-left",
                          "active:bg-muted/40 transition-colors duration-100",
                          "select-none touch-manipulation",
                          notLast && "border-b border-border",
                        )}
                      >
                        <span className="text-muted-foreground shrink-0 [&>svg]:h-5 [&>svg]:w-5">
                          {def.icon}
                        </span>
                        <span className="flex-1 text-[15px] font-medium truncate">
                          {def.label}
                        </span>
                        {it.id === "organization" && user.organization?.name && (
                          <span className="text-[13px] text-muted-foreground truncate max-w-[40%]">
                            {user.organization.name}
                          </span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── MOBILE SECTION VIEW (after drill-down) ──────────────────
            Shown when the user has tapped a row. Layout:
              [⌫ icon-button]  Section Name
              [section content]
            One header row: a proper 40×40 circular back button (real
            tap target, no more thumb-hunting for a tiny text link)
            paired with the section title on the same line. Sits at
            the top of the SCROLL CONTENT, not a fixed bar — still
            only one "header" on screen (the global ConditionalLayout
            top bar, which shows "Profile"). */}
        <div className={cn("lg:hidden", tab === null && "hidden")}>
          <div className="flex items-center gap-3 pt-1 pb-4">
            <button
              type="button"
              onClick={() => switchTab(null)}
              aria-label="Back to profile"
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                "bg-muted/60 text-foreground hover:bg-muted",
                "active:scale-90 transition-all",
                "touch-manipulation select-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            {activeMobileDef && (
              <h2 className="text-xl font-semibold tracking-tight truncate min-w-0">
                {activeMobileDef.label}
              </h2>
            )}
          </div>


          {tab && (
            <div
              key={tab}
              className="animate-in fade-in-0 slide-in-from-right-3 duration-200"
            >
              {renderTabContent(tab)}
            </div>
          )}
        </div>

        {/* ── DESKTOP LAYOUT ─────────────────────────────────────────
            Hidden on mobile; renders the classic "sidebar + content"
            split. Only one instance of each tab is mounted at a time
            (the active one) — switching tabs unmounts the previous via
            `key={desktopTab}`. */}
        <div className="hidden lg:grid lg:grid-cols-[220px_1fr] gap-6 mt-8">
          <aside>
            <nav className="sticky top-4 space-y-0.5" aria-label="Profile sections">
              {visibleTabs.map((t) => {
                const active = desktopTab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => switchTab(t.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm",
                      "transition-colors duration-150",
                      active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span className="shrink-0">{t.icon}</span>
                    <span className="truncate">{t.label}</span>
                  </button>
                )
              })}
            </nav>
          </aside>
          <main className="min-w-0">
            <div key={desktopTab} className="animate-in fade-in-0 duration-200">
              {renderTabContent(desktopTab)}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading state — matches the real layout proportions to minimize CLS.
// ─────────────────────────────────────────────────────────────────────────────

function LoadingShell() {
  return (
    <div className="min-h-full bg-background">
      <div className="container mx-auto px-4 sm:px-6 max-w-4xl pt-5 sm:pt-8">
        <div className="flex flex-col items-center sm:flex-row sm:items-center gap-4 sm:gap-8">
          <Skeleton className="h-24 w-24 sm:h-28 sm:w-28 rounded-full shrink-0" />
          <div className="flex-1 w-full space-y-2">
            <Skeleton className="h-6 w-40 mx-auto sm:mx-0" />
            <Skeleton className="h-4 w-56 mx-auto sm:mx-0" />
            <Skeleton className="h-4 w-48 mx-auto sm:mx-0" />
            <div className="grid grid-cols-2 sm:flex gap-2 mt-4">
              <Skeleton className="h-9 sm:w-28" />
              <Skeleton className="h-9 sm:w-28" />
            </div>
          </div>
        </div>
        {/* Mobile list skeleton */}
        <div className="lg:hidden mt-6 -mx-4 bg-card border-y border-border">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5",
                i !== 5 && "border-b border-border",
              )}
            >
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-4 flex-1 max-w-[180px]" />
              <Skeleton className="h-4 w-4" />
            </div>
          ))}
        </div>
        {/* Desktop skeleton */}
        <div className="hidden lg:grid lg:grid-cols-[220px_1fr] gap-6 mt-8">
          <div className="space-y-1.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
