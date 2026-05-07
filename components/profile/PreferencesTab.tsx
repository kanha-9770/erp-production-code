"use client"

/**
 * PreferencesTab — appearance, language, timezone, date format, density.
 *
 * Theme is wired through `next-themes` if the project already provides it
 * (the shadcn defaults do). We read the current theme from a tiny client
 * helper that reads `document.documentElement.classList`, and write it
 * directly to localStorage + classList — that way we don't introduce a
 * new dependency on the theme provider's context if one isn't mounted.
 *
 * Locale / timezone / dateFormat / density are persisted to localStorage
 * (key: 'profile.preferences.v1') and POSTed to /api/auth/preferences as
 * a best-effort, mirroring the notifications storage strategy.
 */

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2,
  Save,
  Sun,
  Moon,
  Monitor,
  Globe,
  Languages,
  Clock,
  LayoutGrid,
} from "lucide-react"

type ThemeChoice = "light" | "dark" | "system"
type Density = "comfortable" | "compact"

interface Prefs {
  theme: ThemeChoice
  language: string
  timezone: string
  dateFormat: "auto" | "iso" | "us" | "eu"
  density: Density
}

const STORAGE_KEY = "profile.preferences.v1"

function defaultPrefs(): Prefs {
  // Auto-detect timezone once on first render so users on UTC don't need to
  // hunt for their zone in the dropdown.
  let tz = "UTC"
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    /* ignore */
  }
  return {
    theme: "system",
    language: "en",
    timezone: tz,
    dateFormat: "auto",
    density: "comfortable",
  }
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
]

const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Cairo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "Pacific/Auckland",
]

const DATE_FORMATS: Array<{ value: Prefs["dateFormat"]; label: string; sample: string }> = [
  { value: "auto", label: "Auto (locale)", sample: new Date().toLocaleDateString() },
  { value: "iso", label: "ISO 8601", sample: new Date().toISOString().slice(0, 10) },
  { value: "us", label: "MM/DD/YYYY", sample: formatUS(new Date()) },
  { value: "eu", label: "DD/MM/YYYY", sample: formatEU(new Date()) },
]

function formatUS(d: Date) {
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
}
function formatEU(d: Date) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}
function pad(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

function applyTheme(t: ThemeChoice) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  const isDark =
    t === "dark" ||
    (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  root.classList.toggle("dark", isDark)
  // Persist the user-chosen value so other tabs can pick it up.
  try {
    localStorage.setItem("theme", t)
  } catch {
    /* ignore */
  }
}

function applyDensity(d: Density) {
  if (typeof document === "undefined") return
  document.documentElement.dataset.density = d
}

export default function PreferencesTab() {
  const { toast } = useToast()
  const [saved, setSaved] = useState<Prefs>(defaultPrefs())
  const [draft, setDraft] = useState<Prefs>(defaultPrefs())
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const merged = raw ? { ...defaultPrefs(), ...(JSON.parse(raw) as Prefs) } : defaultPrefs()
      setSaved(merged)
      setDraft(merged)
      // Apply on mount so the user lands in their chosen mode.
      applyTheme(merged.theme)
      applyDensity(merged.density)
    } catch {
      /* ignore */
    } finally {
      setHydrated(true)
    }
  }, [])

  // Live-preview theme changes so the user sees the effect of their pick
  // before they commit. Density is the same.
  useEffect(() => {
    if (!hydrated) return
    applyTheme(draft.theme)
    applyDensity(draft.density)
  }, [draft.theme, draft.density, hydrated])

  const dirty = useMemo(
    () => JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft],
  )

  const save = async () => {
    setBusy(true)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
      await fetch("/api/auth/preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: draft }),
      }).catch(() => null)
      setSaved(draft)
      toast({ title: "Preferences saved" })
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const discard = () => {
    setDraft(saved)
    applyTheme(saved.theme)
    applyDensity(saved.density)
  }

  return (
    <div className="space-y-6">
      {/* Theme */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Sun className="h-4 w-4 text-primary" />
            Appearance
          </CardTitle>
          <CardDescription>Pick how the app looks. Switches instantly.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            <ThemeOption
              label="Light"
              icon={<Sun className="h-4 w-4" />}
              active={draft.theme === "light"}
              onClick={() => setDraft({ ...draft, theme: "light" })}
              preview="bg-white text-slate-900 border-slate-200"
            />
            <ThemeOption
              label="Dark"
              icon={<Moon className="h-4 w-4" />}
              active={draft.theme === "dark"}
              onClick={() => setDraft({ ...draft, theme: "dark" })}
              preview="bg-slate-900 text-slate-100 border-slate-700"
            />
            <ThemeOption
              label="System"
              icon={<Monitor className="h-4 w-4" />}
              active={draft.theme === "system"}
              onClick={() => setDraft({ ...draft, theme: "system" })}
              preview="bg-gradient-to-br from-white to-slate-900 text-slate-700 border-slate-300"
            />
          </div>

          <div className="mt-6 space-y-2 max-w-md">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Density
            </Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border p-1 bg-muted/20">
              {(["comfortable", "compact"] as Density[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDraft({ ...draft, density: d })}
                  className={`h-9 text-xs font-medium rounded-sm transition-colors flex items-center justify-center gap-1.5 ${
                    draft.density === d
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Locale + tz */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Region & language
          </CardTitle>
          <CardDescription>
            Used for date/time formatting and (eventually) localised UI strings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 max-w-2xl">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Languages className="h-3 w-3" />
              Language
            </Label>
            <Select
              value={draft.language}
              onValueChange={(v) => setDraft({ ...draft, language: v })}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              UI translation rolls out per module. English is the fallback.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Time zone
            </Label>
            <Select
              value={draft.timezone}
              onValueChange={(v) => setDraft({ ...draft, timezone: v })}
            >
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz} ({tzOffset(tz)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Date format
            </Label>
            <div className="grid sm:grid-cols-4 gap-2">
              {DATE_FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setDraft({ ...draft, dateFormat: f.value })}
                  className={`rounded-md border p-3 text-left transition-colors ${
                    draft.dateFormat === f.value
                      ? "border-primary bg-primary/5"
                      : "border-input hover:bg-muted"
                  }`}
                >
                  <div className="text-xs font-medium">{f.label}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                    {f.sample}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save bar */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Changes preview live. Click <span className="font-medium">Save preferences</span> to keep them.
        </p>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={discard} disabled={!dirty || busy}>
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
    </div>
  )
}

function ThemeOption({
  label,
  icon,
  active,
  onClick,
  preview,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  preview: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-lg border p-3 transition-all ${
        active ? "border-primary ring-2 ring-primary/30 shadow-sm" : "border-input hover:bg-muted"
      }`}
    >
      <div
        className={`h-12 w-full rounded-md border mb-2 flex items-center justify-center text-xs font-mono ${preview}`}
      >
        Aa
      </div>
      <div className="flex items-center justify-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </div>
    </button>
  )
}

function tzOffset(tz: string): string {
  try {
    const d = new Date()
    const fmt = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    })
    const parts = fmt.formatToParts(d)
    const off = parts.find((p) => p.type === "timeZoneName")?.value ?? ""
    return off || "GMT"
  } catch {
    return "GMT"
  }
}
