"use client"

/**
 * /profile — production-grade profile center.
 *
 * Layout: vertical sidebar tabs on desktop (≥lg), horizontal scrollable tabs
 * on mobile. The active tab is reflected in `location.hash` so deep-links
 * (e.g. `/profile#security`) work and the browser back-button restores tab
 * state without a full reload.
 *
 * Tabs:
 *   #overview      OverviewTab
 *   #personal      PersonalTab     (replaces /profile/update-profile)
 *   #employment    EmploymentTab
 *   #notifications NotificationsTab
 *   #preferences   PreferencesTab
 *   #security      SecurityTab     (re-uses the page we shipped at /profile/security)
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
  ChevronRight,
  Building2,
} from "lucide-react"
import { useGetUserQuery, useLogoutMutation } from "@/lib/api/auth"
import OverviewTab from "@/components/profile/OverviewTab"
import PersonalTab from "@/components/profile/PersonalTab"
import EmploymentTab from "@/components/profile/EmploymentTab"
import NotificationsTab from "@/components/profile/NotificationsTab"
import PreferencesTab from "@/components/profile/PreferencesTab"
import SecurityTab from "@/components/profile/SecurityTab"
import OrganizationTab from "@/components/profile/OrganizationTab"
import type { ProfileTabId, ProfileUser } from "@/components/profile/types"
import { displayName, initialsOf } from "@/components/profile/profile-utils"

interface TabDef {
  id: ProfileTabId
  label: string
  icon: React.ReactNode
  description: string
  // When true, the tab only renders for org admins / owners. The
  // sidebar entry is hidden for everyone else, and a deep-link to the
  // hash silently falls back to the overview tab.
  adminOnly?: boolean
}

const TABS: Array<TabDef> = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutDashboard className="h-4 w-4" />,
    description: "Profile health at a glance",
  },
  {
    id: "personal",
    label: "Personal info",
    icon: <UserIcon className="h-4 w-4" />,
    description: "Name, photo, contact",
  },
  {
    id: "employment",
    label: "Employment",
    icon: <Briefcase className="h-4 w-4" />,
    description: "Org, role, HR record",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: <Bell className="h-4 w-4" />,
    description: "Email, in-app, push",
  },
  {
    id: "preferences",
    label: "Preferences",
    icon: <Settings className="h-4 w-4" />,
    description: "Theme, language, timezone",
  },
  {
    id: "security",
    label: "Security",
    icon: <Shield className="h-4 w-4" />,
    description: "Password, sessions, activity",
  },
  {
    id: "organization",
    label: "Organization",
    icon: <Building2 className="h-4 w-4" />,
    description: "Currency, org-wide settings",
    adminOnly: true,
  },
]

// Used by the hash-routing effect which runs before user data is loaded.
// Admin gating is enforced separately at render time, so a non-admin
// landing on /profile#organization will momentarily set tab state but
// the post-load re-validation below snaps them back to overview.
const ALL_TAB_IDS = new Set<ProfileTabId>(TABS.map((t) => t.id))

export default function ProfilePage() {
  const router = useRouter()
  const { toast } = useToast()
  const { data, isLoading, isError, error } = useGetUserQuery()
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation()
  const [tab, setTab] = useState<ProfileTabId>("overview")

  // Hash-routing: read on mount + react to back/forward navigation.
  useEffect(() => {
    const sync = () => {
      const h = (window.location.hash || "").replace(/^#/, "") as ProfileTabId
      setTab(ALL_TAB_IDS.has(h) ? h : "overview")
    }
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  const switchTab = useCallback((id: ProfileTabId) => {
    setTab(id)
    if (typeof window !== "undefined") {
      const next = `${window.location.pathname}#${id}`
      if (window.location.hash !== `#${id}`) {
        window.history.replaceState({}, "", next)
      }
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

  // Admin status — owners count as admins for tab visibility.
  const isAdmin = !!user?.isAdmin || !!user?.isOrgOwner
  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.adminOnly || isAdmin),
    [isAdmin],
  )
  const visibleTabIds = useMemo(
    () => new Set(visibleTabs.map((t) => t.id)),
    [visibleTabs],
  )

  // If a non-admin somehow lands on an admin-only tab (deep-link, stale
  // hash, role demotion mid-session), snap them back to a tab they can
  // actually see. Runs once per relevant change.
  useEffect(() => {
    if (user && !visibleTabIds.has(tab)) {
      setTab("overview")
      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState({}, "", window.location.pathname)
      }
    }
  }, [tab, visibleTabIds, user])

  const activeTab = useMemo(
    () => visibleTabs.find((t) => t.id === tab) ?? TABS[0],
    [tab, visibleTabs],
  )

  if (isLoading || !user) {
    return <LoadingShell />
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
        {/* Identity header */}
        <ProfileHeader
          user={user}
          onLogout={handleLogout}
          loggingOut={isLoggingOut}
        />

        {/* Mobile tab strip — sticky so navigation stays available while scrolling. */}
        <div className="lg:hidden sticky top-0 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b z-10 mt-4">
          <nav className="flex gap-1 overflow-x-auto scrollbar-hide">
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className={`flex items-center gap-1.5 px-3 h-9 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Two-column layout */}
        <div className="grid lg:grid-cols-[260px_1fr] gap-6 mt-4 lg:mt-6">
          {/* Sidebar */}
          <aside className="hidden lg:block">
            <nav className="sticky top-6 space-y-1">
              {visibleTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => switchTab(t.id)}
                  className={`group w-full flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors ${
                    tab === t.id ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span
                    className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                      tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{t.label}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {t.description}
                    </span>
                  </span>
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform ${
                      tab === t.id ? "translate-x-0.5 text-primary" : "text-muted-foreground/50"
                    }`}
                  />
                </button>
              ))}
            </nav>
          </aside>

          {/* Active tab content */}
          <main className="min-w-0">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
                  {activeTab.label}
                </h2>
                <p className="text-xs text-muted-foreground">{activeTab.description}</p>
              </div>
            </div>

            <div
              key={tab}
              className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200"
            >
              {tab === "overview" && <OverviewTab user={user} onJumpTab={switchTab} />}
              {tab === "personal" && <PersonalTab user={user} />}
              {tab === "employment" && <EmploymentTab user={user} />}
              {tab === "notifications" && <NotificationsTab />}
              {tab === "preferences" && <PreferencesTab />}
              {tab === "security" && <SecurityTab />}
              {tab === "organization" && isAdmin && (
                <OrganizationTab user={user} />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Header card — avatar, name, role chips, sign-out
// ─────────────────────────────────────────────────────────────────────────────

function ProfileHeader({
  user,
  onLogout,
  loggingOut,
}: {
  user: ProfileUser
  onLogout: () => void
  loggingOut: boolean
}) {
  const primaryRole = user.unitAssignments[0]?.role?.name
  return (
    <div className="relative overflow-hidden rounded-xl border bg-background shadow-sm">
      {/* Soft gradient banner so the identity card has a tasteful accent
          without leaning on a hard solid colour. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-primary/10 via-violet-500/10 to-cyan-500/10 dark:from-primary/20 dark:via-violet-500/15 dark:to-cyan-500/15"
      />
      <div className="relative flex items-center gap-4 p-4 sm:p-5">
        <Avatar className="h-16 w-16 sm:h-20 sm:w-20 ring-4 ring-background shadow-md shrink-0">
          {user.avatar ? (
            <AvatarImage src={user.avatar} alt={displayName(user)} />
          ) : null}
          <AvatarFallback className="text-lg font-bold bg-primary/15 text-primary">
            {initialsOf(user)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
              {displayName(user)}
            </h1>
            {user.isOrgOwner && (
              <Badge className="text-[10px] px-1.5 h-5 bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300 border-transparent">
                Owner
              </Badge>
            )}
            {user.isAdmin && !user.isOrgOwner && (
              <Badge className="text-[10px] px-1.5 h-5 bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 border-transparent">
                Admin
              </Badge>
            )}
            {user.email_verified ? (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 h-5 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-500/10"
              >
                Verified
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 h-5 text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10"
              >
                Unverified
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-1">
            {user.email}
            {primaryRole ? <> · {primaryRole}</> : null}
            {user.organization?.name ? <> · {user.organization.name}</> : null}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onLogout}
          disabled={loggingOut}
          className="h-9 hidden sm:inline-flex"
        >
          <LogOut className="h-3.5 w-3.5 mr-1.5" />
          Sign out
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onLogout}
          disabled={loggingOut}
          className="sm:hidden"
          aria-label="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading state — skeleton matches the real layout to reduce CLS.
// ─────────────────────────────────────────────────────────────────────────────

function LoadingShell() {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
        <div className="rounded-xl border bg-background p-4 sm:p-5 flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <div className="grid lg:grid-cols-[260px_1fr] gap-6 mt-6">
          <div className="hidden lg:block space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
