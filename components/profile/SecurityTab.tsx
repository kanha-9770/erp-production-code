"use client"

/**
 * SecurityTab — change password + active sessions + recent activity.
 *
 * Mounted from /profile#security. The standalone /profile/security route
 * still works and renders the same component (no duplication of logic).
 *
 * Three sections, each backed by a real API:
 *   1. Change password         → POST /api/auth/change-password
 *   2. Active sessions         → GET /api/auth/sessions, DELETE one or all
 *   3. Recent login activity   → GET /api/auth/activity
 */

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  Lock,
  Monitor,
  Smartphone,
  Tablet,
  LogOut,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Activity,
} from "lucide-react"
import { PasswordInput } from "@/components/auth/PasswordInput"
import { checkPassword } from "@/lib/auth/password-policy"

interface SessionRow {
  id: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  expiresAt: string
  isCurrent: boolean
}

interface ActivityRow {
  id: number
  status: string
  reason: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

export default function SecurityTab() {
  return (
    <div className="space-y-6">
      <ChangePasswordCard />
      <ActiveSessionsCard />
      <RecentActivityCard />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 — Change password
// ─────────────────────────────────────────────────────────────────────────────

function ChangePasswordCard() {
  const { toast } = useToast()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)

  const strength = checkPassword(next)
  const canSubmit =
    current.length > 0 &&
    next.length >= 10 &&
    next === confirm &&
    next !== current &&
    strength.ok &&
    !busy

  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const j = await res.json()
      if (!res.ok || !j.success) throw new Error(j.error || "Failed to change password")
      toast({ title: "Password updated", description: "Other devices were signed out." })
      setCurrent("")
      setNext("")
      setConfirm("")
    } catch (e: any) {
      toast({
        title: "Could not change password",
        description: e.message,
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4 text-primary" />
          Change password
        </CardTitle>
        <CardDescription>
          Use a unique password — at least 10 characters with a mix of letters,
          numbers and symbols. Other signed-in devices will be signed out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Current password
          </Label>
          <PasswordInput
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            placeholder="Your current password"
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            New password
          </Label>
          <PasswordInput
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 10 characters"
            withMeter
            withChecklist
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Confirm new password
          </Label>
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="Re-enter the new password"
            disabled={busy}
          />
          {confirm.length > 0 && confirm !== next && (
            <p className="text-xs text-destructive">Passwords don&apos;t match</p>
          )}
        </div>

        <Button onClick={submit} disabled={!canSubmit} className="h-10">
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Updating…
            </>
          ) : (
            "Update password"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 — Active sessions
// ─────────────────────────────────────────────────────────────────────────────

function ActiveSessionsCard() {
  const { toast } = useToast()
  const [rows, setRows] = useState<SessionRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/sessions", { cache: "no-store", credentials: "include" })
      const j = await res.json()
      if (j.success) setRows(j.sessions ?? [])
      else throw new Error(j.error || "Failed to load sessions")
    } catch (e: any) {
      toast({ title: "Could not load sessions", description: e.message, variant: "destructive" })
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const revokeOne = async (id: string, isCurrent: boolean) => {
    if (isCurrent && !confirm("Sign out this device? You'll be returned to the sign-in page.")) return
    setRevokingId(id)
    try {
      const res = await fetch(`/api/auth/sessions/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      const j = await res.json()
      if (!res.ok || !j.success) throw new Error(j.error || "Failed to revoke")
      if (j.isSelf) {
        window.location.href = "/login"
        return
      }
      toast({ title: "Session revoked" })
      await load()
    } catch (e: any) {
      toast({ title: "Could not revoke", description: e.message, variant: "destructive" })
    } finally {
      setRevokingId(null)
    }
  }

  const revokeOthers = async () => {
    if (!confirm("Sign out all other devices? They'll need to sign in again.")) return
    setBusy(true)
    try {
      const res = await fetch("/api/auth/sessions", { method: "DELETE", credentials: "include" })
      const j = await res.json()
      if (!res.ok || !j.success) throw new Error(j.error || "Failed to revoke")
      toast({ title: `${j.revoked} session${j.revoked === 1 ? "" : "s"} signed out` })
      await load()
    } catch (e: any) {
      toast({ title: "Could not revoke", description: e.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const otherCount = (rows ?? []).filter((s) => !s.isCurrent).length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="h-4 w-4 text-primary" />
              Active sessions
            </CardTitle>
            <CardDescription>
              Devices currently signed in to your account. Revoke any you don&apos;t recognise.
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={load} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((s) => (
              <SessionRowItem
                key={s.id}
                row={s}
                onRevoke={() => revokeOne(s.id, s.isCurrent)}
                disabled={revokingId === s.id}
              />
            ))}
          </ul>
        )}

        {otherCount > 0 && (
          <Button variant="outline" onClick={revokeOthers} disabled={busy} className="h-9">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing out…
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4 mr-2" /> Sign out other devices ({otherCount})
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function SessionRowItem({
  row,
  onRevoke,
  disabled,
}: {
  row: SessionRow
  onRevoke: () => void
  disabled: boolean
}) {
  const ua = parseUserAgent(row.userAgent)
  return (
    <li className="flex items-center gap-3 p-3">
      <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
        {ua.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{ua.label}</span>
          {row.isCurrent && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0 h-5">
              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
              This device
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums truncate">
          {row.ipAddress || "Unknown IP"} · started {timeAgo(row.createdAt)} · expires{" "}
          {timeAgo(row.expiresAt)}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRevoke}
        disabled={disabled}
        className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        {disabled ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revoke"}
      </Button>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 — Recent login activity
// ─────────────────────────────────────────────────────────────────────────────

function RecentActivityCard() {
  const { toast } = useToast()
  const [rows, setRows] = useState<ActivityRow[] | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/auth/activity?limit=30", {
          cache: "no-store",
          credentials: "include",
        })
        const j = await res.json()
        if (j.success) setRows(j.events ?? [])
        else throw new Error(j.error || "Failed to load activity")
      } catch (e: any) {
        toast({
          title: "Could not load activity",
          description: e.message,
          variant: "destructive",
        })
      }
    })()
  }, [toast])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Recent sign-in activity
        </CardTitle>
        <CardDescription>
          The last 30 successful and failed sign-in attempts on your account.
          Spot anything suspicious? Change your password right away.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((r) => (
              <ActivityRowItem key={r.id} row={r} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityRowItem({ row }: { row: ActivityRow }) {
  const ok = row.status === "Success"
  const ua = parseUserAgent(row.userAgent)
  return (
    <li className="flex items-center gap-3 p-3">
      <span
        className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
          ok
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-destructive/10 text-destructive"
        }`}
      >
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          {ok ? "Successful sign-in" : "Failed sign-in"}
          {!ok && row.reason && (
            <span className="ml-2 text-muted-foreground font-normal">— {row.reason}</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums truncate">
          {ua.label} · {row.ipAddress || "Unknown IP"} · {timeAgo(row.createdAt)}
        </div>
      </div>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseUserAgent(ua: string | null): { label: string; icon: React.ReactNode } {
  if (!ua) return { label: "Unknown device", icon: <Monitor className="h-4 w-4" /> }
  const u = ua.toLowerCase()
  let icon: React.ReactNode = <Monitor className="h-4 w-4" />
  if (u.includes("iphone") || u.includes("android"))
    icon = <Smartphone className="h-4 w-4" />
  else if (u.includes("ipad") || u.includes("tablet"))
    icon = <Tablet className="h-4 w-4" />

  const browser =
    /(edg|edge)\//i.test(u) ? "Edge"
      : /firefox\//i.test(u) ? "Firefox"
        : /chrome\//i.test(u) ? "Chrome"
          : /safari\//i.test(u) ? "Safari"
            : "Browser"
  const os =
    /windows nt/i.test(u) ? "Windows"
      : /mac os x|macintosh/i.test(u) ? "macOS"
        : /android/i.test(u) ? "Android"
          : /iphone|ipad/i.test(u) ? "iOS"
            : /linux/i.test(u) ? "Linux"
              : "Unknown OS"
  return { label: `${browser} on ${os}`, icon }
}

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const abs = Math.abs(diff)
  const seconds = Math.round(abs / 1000)
  const minutes = Math.round(seconds / 60)
  const hours = Math.round(minutes / 60)
  const days = Math.round(hours / 24)
  const future = diff < 0
  const fmt = (n: number, unit: string) =>
    future ? `in ${n} ${unit}${n === 1 ? "" : "s"}` : `${n} ${unit}${n === 1 ? "" : "s"} ago`
  if (seconds < 60) return future ? "in seconds" : "just now"
  if (minutes < 60) return fmt(minutes, "min")
  if (hours < 24) return fmt(hours, "hr")
  if (days < 30) return fmt(days, "day")
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}
