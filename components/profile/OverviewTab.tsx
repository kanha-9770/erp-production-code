"use client"

/**
 * OverviewTab — at-a-glance dashboard for the user's profile.
 *
 * Layout:
 *   1. Hero strip   — gradient banner with key contact info + a prominent
 *                      profile-completion bar and a primary "Edit profile"
 *                      action. Anchors the page.
 *   2. Cards row    — a Setup-Checklist (left, wider) and an Employment
 *                      details panel (right).
 *
 * Pure read-only; mutations live on the per-section tabs.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Briefcase,
  Building2,
  ArrowUpRight,
  CalendarDays,
  Edit3,
  Hash,
  IdCard,
  ListChecks,
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
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SetupChecklistCard user={user} onJumpTab={onJumpTab} />
        </div>
        <div className="lg:col-span-2">
          <EmploymentCard user={user} onJumpTab={onJumpTab} />
        </div>
      </div>
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
// Tone palette — shared by HeroCard + SetupChecklistCard.
// ─────────────────────────────────────────────────────────────────────────────

type ToneKey = "success" | "warn" | "danger" | "info"

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

