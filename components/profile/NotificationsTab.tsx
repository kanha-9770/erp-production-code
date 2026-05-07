"use client"

/**
 * NotificationsTab — per-channel × per-category preference grid.
 *
 * Persists to localStorage today (key: 'profile.notifications.v1') with a
 * server-write stub at /api/auth/preferences. This means prefs survive on
 * the same device but don't sync across devices yet — to do that we'd add
 * a `preferences` JSON column to User and have the stub upsert it. The UI
 * is wired so flipping that switch is a one-line change.
 *
 * Designed so the UI feels production from day one even though the storage
 * layer is local: optimistic toggles, "Save changes" button to commit, and
 * a "Reset to defaults" affordance.
 */

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Save, RotateCcw, Bell, Mail, Smartphone, Volume2 } from "lucide-react"

interface Channel {
  key: "email" | "inapp" | "push" | "sms"
  label: string
  icon: React.ReactNode
  available: boolean
  hint?: string
}

interface Category {
  key: string
  label: string
  description: string
  // Per-category default — privacy & security are non-negotiable.
  required?: ("email" | "inapp" | "push" | "sms")[]
}

const CHANNELS: Channel[] = [
  { key: "email", label: "Email", icon: <Mail className="h-3.5 w-3.5" />, available: true },
  { key: "inapp", label: "In-app", icon: <Bell className="h-3.5 w-3.5" />, available: true },
  {
    key: "push",
    label: "Push",
    icon: <Smartphone className="h-3.5 w-3.5" />,
    available: false,
    hint: "Push not enabled on this org",
  },
  {
    key: "sms",
    label: "SMS",
    icon: <Volume2 className="h-3.5 w-3.5" />,
    available: false,
    hint: "SMS not enabled on this org",
  },
]

const CATEGORIES: Category[] = [
  {
    key: "security",
    label: "Security alerts",
    description: "New device sign-ins, password changes, suspicious activity. Always on.",
    required: ["email", "inapp"],
  },
  {
    key: "account",
    label: "Account updates",
    description: "Profile changes, role assignments, organization invites.",
  },
  {
    key: "leave",
    label: "Leave & approvals",
    description: "Leave applied, approved, rejected, pending your action.",
  },
  {
    key: "payroll",
    label: "Payroll",
    description: "Payslip generated, salary credited, deductions notice.",
  },
  {
    key: "system",
    label: "System & maintenance",
    description: "Scheduled downtime, feature announcements.",
  },
  {
    key: "marketing",
    label: "Product updates",
    description: "Tips and product news. Off by default.",
  },
]

type Prefs = Record<string, Record<Channel["key"], boolean>>

function defaultPrefs(): Prefs {
  const out: Prefs = {}
  for (const c of CATEGORIES) {
    out[c.key] = {
      email: c.key !== "marketing",
      inapp: true,
      push: false,
      sms: false,
    }
  }
  return out
}

const STORAGE_KEY = "profile.notifications.v1"

export default function NotificationsTab() {
  const { toast } = useToast()
  const [saved, setSaved] = useState<Prefs>(defaultPrefs())
  const [draft, setDraft] = useState<Prefs>(defaultPrefs())
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Prefs
        const merged = { ...defaultPrefs(), ...parsed }
        setSaved(merged)
        setDraft(merged)
      }
    } catch {
      /* ignore corrupted blob */
    } finally {
      setHydrated(true)
    }
  }, [])

  const dirty = useMemo(
    () => JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft],
  )

  const toggle = (cat: string, channel: Channel["key"]) => {
    const required = CATEGORIES.find((c) => c.key === cat)?.required ?? []
    if (required.includes(channel)) {
      toast({
        title: "Required channel",
        description: "Security alerts can't be turned off here.",
      })
      return
    }
    setDraft((d) => ({
      ...d,
      [cat]: { ...d[cat], [channel]: !d[cat]?.[channel] },
    }))
  }

  const reset = () => setDraft(defaultPrefs())

  const save = async () => {
    setBusy(true)
    try {
      // Persist locally first so the user sees the change immediately even if
      // the server stub fails (no network, no backend yet).
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))

      // Best-effort server write — the endpoint is a no-op stub today but
      // makes the migration to DB-backed prefs a one-line swap.
      await fetch("/api/auth/preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifications: draft }),
      }).catch(() => null)

      setSaved(draft)
      toast({ title: "Notification preferences saved" })
    } catch (e: any) {
      toast({
        title: "Save failed",
        description: e?.message,
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Notification preferences
            </CardTitle>
            <CardDescription>
              Pick which events reach you and on which channels.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={!hydrated || busy}
            className="h-8 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1.5" /> Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-0">
        {/* Header row — stays on screen so users keep their bearings while scrolling. */}
        <div className="hidden sm:grid grid-cols-[1fr_repeat(4,80px)] items-center gap-3 pb-3 border-b text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Category</div>
          {CHANNELS.map((c) => (
            <div key={c.key} className="text-center flex flex-col items-center gap-0.5">
              <span className="flex items-center gap-1">
                {c.icon}
                {c.label}
              </span>
              {!c.available && (
                <span className="text-[9px] font-normal text-muted-foreground/70 normal-case">
                  unavailable
                </span>
              )}
            </div>
          ))}
        </div>

        <ul className="divide-y">
          {CATEGORIES.map((cat) => (
            <li key={cat.key} className="grid sm:grid-cols-[1fr_repeat(4,80px)] gap-3 py-4">
              <div className="min-w-0">
                <div className="text-sm font-medium">{cat.label}</div>
                <div className="text-xs text-muted-foreground">{cat.description}</div>
                {/* Mobile: stack channel switches under the category title. */}
                <div className="grid grid-cols-4 gap-2 mt-3 sm:hidden">
                  {CHANNELS.map((ch) => (
                    <ChannelSwitch
                      key={ch.key}
                      channel={ch}
                      checked={!!draft[cat.key]?.[ch.key]}
                      forced={cat.required?.includes(ch.key) ?? false}
                      onCheckedChange={() => toggle(cat.key, ch.key)}
                      compact
                    />
                  ))}
                </div>
              </div>
              {/* Desktop: each channel column. */}
              {CHANNELS.map((ch) => (
                <div key={ch.key} className="hidden sm:flex justify-center items-start">
                  <ChannelSwitch
                    channel={ch}
                    checked={!!draft[cat.key]?.[ch.key]}
                    forced={cat.required?.includes(ch.key) ?? false}
                    onCheckedChange={() => toggle(cat.key, ch.key)}
                  />
                </div>
              ))}
            </li>
          ))}
        </ul>

        <div className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Stored on this device.{" "}
            <span className="text-muted-foreground/70">
              Sync-across-devices ships with the next backend update.
            </span>
          </p>
          <div className="flex gap-2 sm:ml-auto">
            <Button
              variant="outline"
              onClick={() => setDraft(saved)}
              disabled={!dirty || busy}
            >
              Discard
            </Button>
            <Button onClick={save} disabled={!dirty || busy} className="h-10">
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" /> Save preferences
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ChannelSwitch({
  channel,
  checked,
  forced,
  onCheckedChange,
  compact,
}: {
  channel: Channel
  checked: boolean
  forced: boolean
  onCheckedChange: () => void
  compact?: boolean
}) {
  const disabled = !channel.available || forced
  return (
    <div className="flex flex-col items-center gap-1">
      {compact && (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          {channel.icon}
          {channel.label}
        </span>
      )}
      <Switch
        checked={forced ? true : checked}
        onCheckedChange={() => !disabled && onCheckedChange()}
        disabled={disabled}
        title={
          forced
            ? "Required for security alerts"
            : !channel.available
              ? channel.hint
              : undefined
        }
      />
    </div>
  )
}
