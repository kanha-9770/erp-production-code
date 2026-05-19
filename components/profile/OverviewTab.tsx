"use client"

/**
 * OverviewTab — at-a-glance dashboard for the user's profile.
 *
 * Layout:
 *   1. Hero strip   — gradient banner with key contact info + a prominent
 *                      profile-completion bar and a primary "Edit profile"
 *                      action. Anchors the page.
 *   2. KPI tiles    — four substantial cards (completeness, security,
 *                      sessions, last sign-in) with iconography, tone
 *                      colours and trend captions.
 *   3. Cards row    — a Setup-Checklist (left, wider) and an Employment
 *                      details panel (right).
 *   4. Activity     — recent login attempts with status, IP and time.
 *
 * Pure read-only; mutations live on the per-section tabs.
 */

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Briefcase,
  Building2,
  Activity as ActivityIcon,
  TrendingUp,
  ArrowUpRight,
  CalendarDays,
  Network,
  Edit3,
  Sparkles,
  Hash,
  IdCard,
  ListChecks,
  Wallet,
  ReceiptText,
} from "lucide-react"
import type { ProfileUser, ProfileTabId } from "./types"
import { getProfileCompleteness, formatDate } from "./profile-utils"

interface OverviewTabProps {
  user: ProfileUser
  onJumpTab: (tab: ProfileTabId) => void
}

export default function OverviewTab({ user, onJumpTab }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <HeroCard user={user} onJumpTab={onJumpTab} />
      <KpiGrid user={user} />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SetupChecklistCard user={user} onJumpTab={onJumpTab} />
        </div>
        <div className="lg:col-span-2">
          <EmploymentCard user={user} onJumpTab={onJumpTab} />
        </div>
      </div>
      <SalarySummaryCard onJumpTab={onJumpTab} />
      <RecentActivityCard onJumpTab={onJumpTab} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero card — gradient banner, contact info, completion bar, primary CTA.
// ─────────────────────────────────────────────────────────────────────────────

function HeroCard({
  user,
  onJumpTab,
}: {
  user: ProfileUser
  onJumpTab: (tab: ProfileTabId) => void
}) {
  const { pct } = getProfileCompleteness(user)
  const tone: ToneKey = pct >= 80 ? "success" : pct >= 50 ? "warn" : "danger"
  const e = user.employee

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <div
        aria-hidden
        className="h-1.5 w-full bg-gradient-to-r from-primary via-violet-500 to-cyan-500"
      />
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap gap-5 items-start">
          {/* Identity column */}
          <div className="flex-1 min-w-[260px] space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {user.organization?.name ?? "Profile"}
              </div>
              <div className="mt-0.5 text-xl sm:text-[1.4rem] font-semibold tracking-tight">
                Welcome back, {user.first_name || user.username || "there"}.
              </div>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                {pct === 100
                  ? "Your profile is fully set up. Review key details and recent activity below."
                  : "A few details are still missing. Finish them to unlock full functionality."}
              </p>
            </div>

            {/* Contact chips — high-density inline metadata */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              <Chip
                icon={<Mail className="h-3 w-3" />}
                label={user.email}
                tone={user.email_verified ? "success" : "warn"}
                trailing={
                  user.email_verified ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Verified
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      Unverified
                    </span>
                  )
                }
              />
              {(user.mobile || user.phone) && (
                <Chip
                  icon={<Phone className="h-3 w-3" />}
                  label={user.mobile ?? user.phone ?? ""}
                />
              )}
              {user.location && (
                <Chip
                  icon={<MapPin className="h-3 w-3" />}
                  label={user.location}
                />
              )}
              {e?.designation && (
                <Chip
                  icon={<Briefcase className="h-3 w-3" />}
                  label={e.designation}
                />
              )}
            </div>
          </div>

          {/* Completion + CTA column */}
          <div className="w-full sm:w-auto sm:min-w-[260px] sm:max-w-sm space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3.5">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Profile completeness
                </span>
                <span
                  className={cn(
                    "text-base font-bold tabular-nums tracking-tight",
                    TONE_TEXT[tone],
                  )}
                >
                  {pct}%
                </span>
              </div>
              <div className="h-2 w-full bg-background rounded-full overflow-hidden ring-1 ring-border">
                <div
                  className={cn(
                    "h-full transition-all duration-700 ease-out",
                    TONE_BAR[tone],
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {pct === 100
                  ? "Looking good — everything is filled in."
                  : `${100 - pct}% remaining to a complete profile.`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => onJumpTab("personal")}
              >
                <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                Edit profile
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => onJumpTab("security")}
              >
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                Security
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Chip({
  icon,
  label,
  tone,
  trailing,
}: {
  icon: React.ReactNode
  label: string
  tone?: ToneKey
  trailing?: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-foreground/85 max-w-full min-w-0">
      <span
        className={cn(
          "shrink-0",
          tone ? TONE_TEXT[tone] : "text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI grid — the "exec dashboard" row.
// ─────────────────────────────────────────────────────────────────────────────

type ToneKey = "success" | "warn" | "danger" | "info"

const TONE_RING: Record<ToneKey, string> = {
  success: "ring-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "ring-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "ring-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  info: "ring-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
}

const TONE_TEXT: Record<ToneKey, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-rose-600 dark:text-rose-400",
  info: "text-blue-600 dark:text-blue-400",
}

const TONE_BAR: Record<ToneKey, string> = {
  success: "bg-emerald-500",
  warn: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-blue-500",
}

function KpiGrid({ user }: { user: ProfileUser }) {
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
  const completionTone: ToneKey =
    pct >= 80 ? "success" : pct >= 50 ? "warn" : "danger"

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Kpi
        icon={<Sparkles className="h-4 w-4" />}
        label="Profile complete"
        value={`${pct}%`}
        tone={completionTone}
        trend={pct === 100 ? "All set" : `${100 - pct}% to go`}
        progress={pct}
      />
      <Kpi
        icon={
          user.email_verified ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )
        }
        label="Security"
        value={user.email_verified ? "Healthy" : "At risk"}
        tone={user.email_verified ? "success" : "danger"}
        trend={user.email_verified ? "Email verified" : "Verify your email"}
      />
      <Kpi
        icon={<Network className="h-4 w-4" />}
        label="Active sessions"
        value={stats.sessionsCount === null ? "—" : String(stats.sessionsCount)}
        tone="info"
        trend="Across all devices"
        loading={stats.sessionsCount === null}
      />
      <Kpi
        icon={<Clock className="h-4 w-4" />}
        label="Last sign-in"
        value={stats.lastSuccess ? relativeTime(stats.lastSuccess) : "—"}
        tone="info"
        trend={
          stats.lastFailed
            ? `Last failed ${relativeTime(stats.lastFailed)}`
            : "No failures recorded"
        }
        loading={stats.lastSuccess === null && stats.lastFailed === null}
      />
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  tone,
  trend,
  loading,
  progress,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: ToneKey
  trend: string
  loading?: boolean
  progress?: number
}) {
  return (
    <Card className="border-border/70 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </span>
          <span
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center ring-1",
              TONE_RING[tone],
            )}
            aria-hidden
          >
            {icon}
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div
            className={cn(
              "text-[1.65rem] font-bold tabular-nums tracking-tight leading-none",
              TONE_TEXT[tone],
            )}
          >
            {value}
          </div>
        )}
        {progress !== undefined && (
          <div className="mt-3 h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-700 ease-out",
                TONE_BAR[tone],
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <div className="text-[11px] text-muted-foreground truncate mt-2 flex items-center gap-1">
          <TrendingUp className="h-3 w-3 opacity-60" />
          {trend}
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup checklist — the GitHub-onboarding-style "todo" list.
// ─────────────────────────────────────────────────────────────────────────────

function SetupChecklistCard({
  user,
  onJumpTab,
}: {
  user: ProfileUser
  onJumpTab: (tab: ProfileTabId) => void
}) {
  const { pct, items } = getProfileCompleteness(user)
  const done = items.filter((i) => i.done).length
  const total = items.length

  return (
    <Card className="border-border/70 shadow-sm h-full">
      <CardHeader className="pb-3 flex-row items-start justify-between space-y-0 gap-3">
        <div className="min-w-0">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            Setup checklist
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Finish setting up your profile for the best experience.
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] tabular-nums shrink-0 font-mono"
        >
          {done} / {total}
        </Badge>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Inline progress strip */}
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-4">
          <div
            className={cn(
              "h-full transition-all duration-700 ease-out",
              pct >= 80
                ? TONE_BAR.success
                : pct >= 50
                  ? TONE_BAR.warn
                  : TONE_BAR.danger,
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="-mx-2 divide-y">
          {items.map((item) => {
            const isDone = item.done
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onJumpTab(item.tab as ProfileTabId)}
                  disabled={isDone}
                  className={cn(
                    "group w-full flex items-center gap-3 px-2 py-2.5 text-sm text-left rounded-md",
                    !isDone && "hover:bg-muted/50 transition-colors cursor-pointer",
                  )}
                >
                  <span
                    className={cn(
                      "h-5 w-5 rounded-full flex items-center justify-center shrink-0 ring-1 transition-colors",
                      isDone
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30"
                        : "bg-background ring-border group-hover:ring-foreground/30",
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Hash className="h-2.5 w-2.5 text-muted-foreground" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex-1 truncate font-medium",
                      isDone && "text-muted-foreground line-through",
                    )}
                  >
                    {item.label}
                  </span>
                  {!isDone && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground group-hover:text-foreground font-semibold inline-flex items-center gap-0.5 shrink-0 transition-colors">
                      Add
                      <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Employment details — clean two-column key-value layout.
// ─────────────────────────────────────────────────────────────────────────────

function EmploymentCard({
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
    <Card className="border-border/70 shadow-sm h-full">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 gap-3">
        <div className="min-w-0">
          <CardTitle className="text-base flex items-center gap-2">
            <IdCard className="h-4 w-4 text-primary" />
            Employment
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            From your HR record.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onJumpTab("employment")}
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5 shrink-0"
        >
          View details
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </CardHeader>
      <CardContent className="text-sm divide-y">
        <Row
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Organization"
          value={user.organization?.name ?? "—"}
        />
        <Row
          icon={<Briefcase className="h-3.5 w-3.5" />}
          label="Designation"
          value={e?.designation ?? primaryRole ?? "—"}
        />
        <Row
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Department"
          value={e?.department ?? user.department ?? "—"}
        />
        <Row
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          label="Joined"
          value={formatDate(e?.dateOfJoining ?? user.joinDate)}
        />
        <Row
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Work email"
          value={e?.emailAddress1 ?? user.email}
          rightSlot={
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 h-5 shrink-0",
                user.email_verified
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
              )}
            >
              {user.email_verified ? (
                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
              ) : null}
              {user.email_verified ? "Verified" : "Unverified"}
            </Badge>
          }
        />
        {!hasEmpRecord && (
          <p className="text-xs text-muted-foreground py-3">
            No HR employee record linked yet. Contact your admin to attach one.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Row({
  icon,
  label,
  value,
  rightSlot,
}: {
  icon: React.ReactNode
  label: string
  value: string
  rightSlot?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-1">
      <span className="text-muted-foreground/70 shrink-0">{icon}</span>
      <span className="text-muted-foreground w-24 sm:w-28 shrink-0 text-xs uppercase tracking-wider font-semibold">
        {label}
      </span>
      <span className="flex-1 truncate font-medium text-foreground">
        {value}
      </span>
      {rightSlot ?? null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent activity — log rows with status dot, IP and time.
// ─────────────────────────────────────────────────────────────────────────────

function RecentActivityCard({
  onJumpTab,
}: {
  onJumpTab: (tab: ProfileTabId) => void
}) {
  const [rows, setRows] = useState<Array<{
    id: number
    status: string
    reason: string | null
    createdAt: string
    ipAddress: string | null
  }> | null>(null)

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
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ActivityIcon className="h-4 w-4 text-primary" />
            Recent activity
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last 5 sign-in events on your account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onJumpTab("security")}
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5"
        >
          View all
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </CardHeader>
      <CardContent className="pt-0">
        {rows === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No recent activity.
          </p>
        ) : (
          <ul className="divide-y border rounded-lg overflow-hidden">
            {rows.map((r) => {
              const ok = r.status === "Success"
              return (
                <li
                  key={r.id}
                  className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors"
                >
                  <span
                    className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center ring-4",
                      ok
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/10"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/10",
                    )}
                  >
                    {ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {ok
                        ? "Successful sign-in"
                        : `Failed sign-in${r.reason ? ` · ${r.reason}` : ""}`}
                    </div>
                    {r.ipAddress && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        IP {r.ipAddress}
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md tabular-nums",
                      ok
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                    )}
                  >
                    {ok ? "OK" : "Fail"}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {relativeTime(r.createdAt)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Salary summary — last 3 payslips with totals, "View all" jumps to the
// dedicated Salary tab.
// ─────────────────────────────────────────────────────────────────────────────

interface SalaryRecord {
  id: string
  month: number
  year: number
  grossSalary: number
  deductions: number
  netSalary: number
  status: string
  paidAt: string | null
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function SalarySummaryCard({
  onJumpTab,
}: {
  onJumpTab: (tab: ProfileTabId) => void
}) {
  const [state, setState] = useState<{
    loading: boolean
    records: SalaryRecord[]
    noEmployee: boolean
    error: string | null
  }>({ loading: true, records: [], noEmployee: false, error: null })

  useEffect(() => {
    let cancelled = false
    fetch("/api/profile/salary", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (!j.success) {
          setState({
            loading: false,
            records: [],
            noEmployee: false,
            error: j.error ?? "Failed to load",
          })
          return
        }
        setState({
          loading: false,
          records: (j.records ?? []) as SalaryRecord[],
          noEmployee: j.reason === "no-employee-record",
          error: null,
        })
      })
      .catch((e: Error) => {
        if (cancelled) return
        setState({ loading: false, records: [], noEmployee: false, error: e.message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
    [],
  )

  const latest = state.records[0]
  const recent = state.records.slice(0, 3)
  const ytd = state.records
    .filter((r) => r.year === new Date().getFullYear())
    .reduce((s, r) => s + r.netSalary, 0)

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Salary records
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your most recent monthly pay slips.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onJumpTab("salary")}
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5 shrink-0"
        >
          View all
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </CardHeader>
      <CardContent className="pt-0">
        {state.loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : state.error ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Couldn&apos;t load salary records.
          </p>
        ) : state.noEmployee ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No HR record linked yet. Salary records will appear here once your
            admin attaches one.
          </p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No payroll records yet for your account.
          </p>
        ) : (
          <>
            {/* Summary band */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Latest net pay
                </div>
                <div className="text-base font-bold tabular-nums tracking-tight mt-0.5">
                  {latest ? fmt.format(latest.netSalary) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {latest
                    ? `${MONTHS_SHORT[latest.month - 1] ?? latest.month} ${latest.year}`
                    : ""}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Earned this year
                </div>
                <div className="text-base font-bold tabular-nums tracking-tight mt-0.5">
                  {fmt.format(ytd)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {state.records.length} slip
                  {state.records.length === 1 ? "" : "s"} on file
                </div>
              </div>
            </div>

            <ul className="divide-y border rounded-lg overflow-hidden">
              {recent.map((r) => {
                const paid = r.status === "paid"
                return (
                  <li
                    key={r.id}
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors"
                  >
                    <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <ReceiptText className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {MONTHS_SHORT[r.month - 1] ?? r.month} {r.year}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        Gross {fmt.format(r.grossSalary)} · Deductions{" "}
                        {fmt.format(r.deductions)}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md tabular-nums",
                        paid
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {r.status}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                      {fmt.format(r.netSalary)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
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
