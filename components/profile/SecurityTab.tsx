"use client"

/**
 * SecurityTab — change password only.
 *
 * Mounted from /profile#security. The standalone /profile/security route
 * still works and renders the same component (no duplication of logic).
 *
 *   1. Change password → POST /api/auth/change-password
 */

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  Lock,
  Loader2,
  ShieldCheck,
  KeyRound,
  Sparkles,
  LogOut,
} from "lucide-react"
import { PasswordInput } from "@/components/auth/PasswordInput"
import { checkPassword } from "@/lib/auth/password-policy"

export default function SecurityTab() {
  return (
    <div className="space-y-6">
      <ChangePasswordCard />
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
    <Card className="overflow-hidden">
      {/* Hero header — colored gradient strip with the lock icon, a punchy
          one-liner, and the password rules surfaced as visual chips so the
          requirements feel like progress markers instead of fine print. */}
      <CardHeader className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b space-y-3 pb-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 ring-1 ring-primary/20">
            <Lock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base sm:text-lg leading-tight">
              Change password
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-snug">
              Lock things down with something fresh. A few seconds here keeps
              your account safe.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <RuleChip icon={KeyRound} label="10+ characters" />
          <RuleChip icon={Sparkles} label="Letters · numbers · symbols" />
          <RuleChip icon={ShieldCheck} label="Unique — not reused" />
          <RuleChip icon={LogOut} label="Signs out other devices" />
        </div>
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
            <>
              <ShieldCheck className="h-4 w-4 mr-2" /> Update password
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

// Small pill that shows one password rule with an icon. Used in the
// ChangePasswordCard header so the rules feel like progress markers
// rather than legalese in a paragraph.
function RuleChip({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-background/70 backdrop-blur px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3 w-3 text-primary/80" />
      {label}
    </span>
  )
}

