"use client"

/**
 * OverviewTab — at-a-glance dashboard for the user's profile.
 *
 * Three rows:
 *   1. Stat tiles  — completeness, security score, sessions count, last login.
 *   2. Cards       — employment summary (manager / dept / designation),
 *                     "complete your profile" punch-list.
 *   3. Activity    — recent login attempts, sourced from /api/auth/activity.
 *
 * Pure read-only; mutations live on the per-section tabs.
 */

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Mail,
  ShieldCheck,
  Smartphone,
  Briefcase,
  Building2,
  Activity as ActivityIcon,
  AlertTriangle,
} from "lucide-react"
import type { ProfileUser, ProfileTabId } from "./types"
import { getProfileCompleteness, displayName, formatDate } from "./profile-utils"

interface OverviewTabProps {
  user: ProfileUser
  onJumpTab: (tab: ProfileTabId) => void
}

export default function OverviewTab({ user, onJumpTab }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <StatTiles user={user} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileCompletenessCard user={user} onJumpTab={onJumpTab} />
        <EmploymentSummaryCard user={user} onJumpTab={onJumpTab} />
      </div>
      <RecentActivityCard />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat tiles
// ─────────────────────────────────────────────────────────────────────────────

function StatTiles({ user }: { user: ProfileUser }) {
  const [stats, setStats] = useState<{
    sessionsCount: number | null
    lastSuccess: string | null
    lastFailed: string | null
  }>({ sessionsCount: null, lastSuccess: null, lastFailed: null })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/auth/sessions", { credentials: "include", cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ sessions: [] })),
      fetch("/api/auth/activity?limit=20", { credentials: "include", cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ events: [] })),
    ]).then(([s, a]) => {
      if (cancelled) return
      const events: Array<{ status: string; createdAt: string }> = a.events ?? []
      const lastSuccess = events.find((e) => e.status === "Success")?.createdAt ?? null
      const lastFailed = events.find((e) => e.status === "Failed")?.createdAt ?? null
      setStats({
        sessionsCount: Array.isArray(s.sessions) ? s.sessions.length : 0,
        lastSuccess,
        lastFailed,
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { pct } = getProfileCompleteness(user)

  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Profile complete"
        value={`${pct}%`}
        sub={pct === 100 ? "All set" : `${100 - pct}% to go`}
        tone={pct >= 80 ? "good" : pct >= 50 ? "warn" : "alert"}
        icon={<CheckCircle2 className="h-4 w-4" />}
      />
      <Tile
        label="Security"
        value={user.email_verified ? "Healthy" : "At risk"}
        sub={user.email_verified ? "Email verified" : "Verify your email"}
        tone={user.email_verified ? "good" : "alert"}
        icon={<ShieldCheck className="h-4 w-4" />}
      />
      <Tile
        label="Active sessions"
        value={stats.sessionsCount === null ? "—" : String(stats.sessionsCount)}
        sub="Across all devices"
        tone="neutral"
        icon={<ActivityIcon className="h-4 w-4" />}
        loading={stats.sessionsCount === null}
      />
      <Tile
        label="Last sign-in"
        value={stats.lastSuccess ? relativeTime(stats.lastSuccess) : "—"}
        sub={stats.lastFailed ? `Last failed ${relativeTime(stats.lastFailed)}` : "No failures recorded"}
        tone="neutral"
        icon={<Clock className="h-4 w-4" />}
        loading={stats.lastSuccess === null && stats.lastFailed === null}
      />
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
  tone,
  icon,
  loading,
}: {
  label: string
  value: string
  sub: string
  tone: "good" | "warn" | "alert" | "neutral"
  icon: React.ReactNode
  loading?: boolean
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "alert"
          ? "text-destructive"
          : "text-foreground"
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>{label}</span>
          <span className={toneCls}>{icon}</span>
        </div>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className={`text-xl sm:text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
        )}
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile completeness card
// ─────────────────────────────────────────────────────────────────────────────

function ProfileCompletenessCard({
  user,
  onJumpTab,
}: {
  user: ProfileUser
  onJumpTab: (tab: ProfileTabId) => void
}) {
  const { pct, items } = getProfileCompleteness(user)
  const missing = items.filter((i) => !i.done)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Complete your profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Ring pct={pct} />
          <div className="min-w-0">
            <div className="text-2xl font-bold tabular-nums">{pct}%</div>
            <p className="text-xs text-muted-foreground">
              {pct === 100
                ? "Everything looks complete."
                : `${missing.length} item${missing.length === 1 ? "" : "s"} left to fill in.`}
            </p>
          </div>
        </div>

        {missing.length > 0 && (
          <ul className="space-y-1.5">
            {missing.slice(0, 5).map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => onJumpTab(m.tab as ProfileTabId)}
                  className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="flex-1 truncate">{m.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Ring({ pct }: { pct: number }) {
  const r = 28
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  const tone =
    pct >= 80 ? "stroke-emerald-500" : pct >= 50 ? "stroke-amber-500" : "stroke-destructive"
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      className="shrink-0 -rotate-90"
      aria-hidden
    >
      <circle cx="36" cy="36" r={r} className="stroke-muted fill-none" strokeWidth="6" />
      <circle
        cx="36"
        cy="36"
        r={r}
        className={`fill-none transition-all duration-700 ${tone}`}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
      />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Employment summary
// ─────────────────────────────────────────────────────────────────────────────

function EmploymentSummaryCard({
  user,
  onJumpTab,
}: {
  user: ProfileUser
  onJumpTab: (tab: ProfileTabId) => void
}) {
  const e = user.employee
  const hasEmpRecord = !!e
  const primaryRole = user.unitAssignments[0]?.role?.name ?? null

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-base">Employment</CardTitle>
        <button
          type="button"
          onClick={() => onJumpTab("employment")}
          className="text-xs font-medium text-primary hover:underline"
        >
          View full record
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        <KV icon={<Building2 className="h-3.5 w-3.5" />} label="Organization" value={user.organization?.name ?? "—"} />
        <KV
          icon={<Briefcase className="h-3.5 w-3.5" />}
          label="Designation"
          value={e?.designation ?? primaryRole ?? "—"}
        />
        <KV
          icon={<Briefcase className="h-3.5 w-3.5" />}
          label="Department"
          value={e?.department ?? user.department ?? "—"}
        />
        <KV
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Joined"
          value={formatDate(e?.dateOfJoining ?? user.joinDate)}
        />
        <KV
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Work email"
          value={e?.emailAddress1 ?? user.email}
          badge={user.email_verified ? "Verified" : "Unverified"}
          badgeTone={user.email_verified ? "good" : "warn"}
        />
        {!hasEmpRecord && (
          <p className="text-xs text-muted-foreground pt-1">
            No HR employee record linked yet. Contact your admin to attach one.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function KV({
  icon,
  label,
  value,
  badge,
  badgeTone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  badge?: string
  badgeTone?: "good" | "warn"
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="flex-1 truncate font-medium">{value}</span>
      {badge && (
        <Badge
          variant={badgeTone === "good" ? "default" : "outline"}
          className="text-[10px] px-1.5 h-5 shrink-0"
        >
          {badgeTone === "good" ? <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> : null}
          {badge}
        </Badge>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent activity (last 5)
// ─────────────────────────────────────────────────────────────────────────────

function RecentActivityCard() {
  const [rows, setRows] = useState<
    Array<{ id: number; status: string; reason: string | null; createdAt: string; ipAddress: string | null }> | null
  >(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/activity?limit=5", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.success) setRows(j.events ?? [])
      })
      .catch(() => setRows([]))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ActivityIcon className="h-4 w-4 text-primary" />
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-2.5 text-sm">
                <span
                  className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                    r.status === "Success"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {r.status === "Success" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                </span>
                <span className="flex-1 truncate">
                  {r.status === "Success" ? "Successful sign-in" : `Failed: ${r.reason ?? "unknown"}`}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {relativeTime(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const secs = Math.round(diff / 1000)
  if (secs < 60) return "just now"
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
