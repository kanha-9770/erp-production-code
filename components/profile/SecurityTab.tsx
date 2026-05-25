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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Lock, Loader2 } from "lucide-react"
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

