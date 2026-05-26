"use client"

/**
 * PreferencesTab — appearance, language, timezone, date format, density.
 *
 * Theme is driven by `next-themes` (provider is mounted in app/layout.tsx).
 * We use `useTheme()` so the choice persists across navigations and is
 * shared with any other component that reads the theme. Density is set as
 * a `data-density` attribute on <html>; non-theme prefs persist to
 * localStorage and are mirrored to /api/auth/preferences best-effort.
 */

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import { notifyTimezoneChanged } from "@/lib/user-timezone"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
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
  ZoomOut,
  ZoomIn,
  Check,
  ChevronsUpDown,
  Locate,
} from "lucide-react"

type ThemeChoice = "light" | "dark" | "system"
type Density = "comfortable" | "compact"

interface Prefs {
  language: string
  timezone: string
  dateFormat: "auto" | "iso" | "us" | "eu"
  density: Density
  // Compact-mode fine-tune. Multiplier applied to the root font-size so the
  // entire app shrinks proportionally. 1.0 = full size; 0.7 = very compact.
  // Only honoured when density === "compact"; in comfortable mode we always
  // apply 1.0 regardless of the saved value.
  densityScale: number
}

const STORAGE_KEY = "profile.preferences.v1"

// Compact-mode bounds. We deliberately cap the floor at 0.85 — anything
// lower scales `max-w-*` containers down so far that pages develop big
// empty gutters, text gets uncomfortable to read, and shadcn pills /
// badges start to overlap. 15% compaction is plenty for a "tight" feel
// without breaking layouts.
const DENSITY_MIN = 0.85
const DENSITY_MAX = 1
const DENSITY_DEFAULT_COMPACT = 0.92

// Mobile gets a tighter UI by default (compact @ 85%) — matches the
// bootstrap script in app/layout.tsx so the first-paint density and the
// React-applied density agree before the user ever saves a preference.
// Mirrors hooks/use-mobile.tsx (MOBILE_BREAKPOINT = 768).
function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.matchMedia("(max-width: 767px)").matches
  } catch {
    return false
  }
}

function defaultPrefs(): Prefs {
  // Auto-detect timezone once on first render so users on UTC don't need to
  // hunt for their zone in the dropdown.
  let tz = "UTC"
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    /* ignore */
  }
  const mobile = isMobileViewport()
  return {
    language: "en",
    timezone: tz,
    dateFormat: "auto",
    density: mobile ? "compact" : "comfortable",
    densityScale: mobile ? DENSITY_MIN : 1,
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

// Last-resort fallback used when the browser doesn't expose
// `Intl.supportedValuesOf` (older Safari, old Chromium). On any modern
// browser we replace this with the full ~600-entry IANA list at runtime.
const FALLBACK_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Asia/Tehran",
  "Asia/Jerusalem",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "America/Toronto",
  "Australia/Sydney",
  "Australia/Perth",
  "Pacific/Auckland",
  "Pacific/Honolulu",
]

function buildTimezoneList(currentValue: string): string[] {
  const list = new Set<string>()
  // Modern browsers (Chrome 99+, Firefox 121+, Safari 15.4+) expose the
  // canonical IANA list so we don't have to maintain it ourselves.
  try {
    const intlAny = Intl as any
    if (typeof intlAny.supportedValuesOf === "function") {
      const arr = intlAny.supportedValuesOf("timeZone") as string[]
      for (const tz of arr) list.add(tz)
    }
  } catch {
    /* ignore */
  }
  if (list.size === 0) {
    for (const tz of FALLBACK_TIMEZONES) list.add(tz)
  }
  // Always include the current saved value so the picker can highlight
  // it even if the browser doesn't recognise it (legacy aliases like
  // "Asia/Calcutta", or a value the user typed in via /api).
  if (currentValue) list.add(currentValue)
  return Array.from(list).sort()
}

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

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1
  if (n < DENSITY_MIN) return DENSITY_MIN
  if (n > DENSITY_MAX) return DENSITY_MAX
  return n
}

function applyDensity(d: Density, scale: number) {
  if (typeof document === "undefined") return
  document.documentElement.dataset.density = d
  // Comfortable always pegs the root at 1.0 — the slider value only
  // matters in compact mode. Avoids the surprise of "I picked
  // comfortable but everything is still small because my old slider
  // value is hanging around".
  const effective = d === "compact" ? clampScale(scale) : 1
  document.documentElement.style.setProperty(
    "--density-scale",
    String(effective),
  )
}

export default function PreferencesTab() {
  const { toast } = useToast()
  // next-themes is the source of truth for the theme. `theme` is what the
  // user picked (light / dark / system); `setTheme` writes through to the
  // provider which handles persistence and applying the class globally.
  const { theme, setTheme } = useTheme()
  const themeChoice: ThemeChoice =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system"
  const [saved, setSaved] = useState<Prefs>(defaultPrefs())
  const [draft, setDraft] = useState<Prefs>(defaultPrefs())
  const [hydrated, setHydrated] = useState(false)
  const [busy, setBusy] = useState(false)
  // Snapshot the theme at mount so Discard can revert to it.
  const [savedTheme, setSavedTheme] = useState<ThemeChoice>("system")

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const merged = raw ? { ...defaultPrefs(), ...(JSON.parse(raw) as Prefs) } : defaultPrefs()
      // Sanitise scale in case an old/corrupt value snuck in.
      merged.densityScale = clampScale(merged.densityScale)
      setSaved(merged)
      setDraft(merged)
      applyDensity(merged.density, merged.densityScale)
    } catch {
      /* ignore */
    } finally {
      setHydrated(true)
    }
  }, [])

  // Capture the theme value once after next-themes hydrates so Discard has
  // a stable reference to revert to.
  useEffect(() => {
    if (hydrated) setSavedTheme(themeChoice)
    // We deliberately only run this when hydrated flips — themeChoice
    // updates as the user toggles, and we don't want to clobber savedTheme
    // every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  // Live-apply density and scale when the draft changes — both feed into
  // the same root font-size CSS variable so the entire app reflows
  // immediately. Theme changes flow through next-themes directly.
  useEffect(() => {
    if (!hydrated) return
    applyDensity(draft.density, draft.densityScale)
  }, [draft.density, draft.densityScale, hydrated])

  const dirty = useMemo(
    () =>
      JSON.stringify(saved) !== JSON.stringify(draft) ||
      themeChoice !== savedTheme,
    [saved, draft, themeChoice, savedTheme],
  )

  const save = async () => {
    setBusy(true)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
      await fetch("/api/auth/preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { ...draft, theme: themeChoice },
        }),
      }).catch(() => null)
      setSaved(draft)
      setSavedTheme(themeChoice)
      // Broadcast the new timezone to any other component that's reading
      // it via useUserTimezone() — attendance tables, the widget popover,
      // etc. — so they re-render with the new zone immediately.
      notifyTimezoneChanged(draft.timezone)
      toast({ title: "Preferences saved" })
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const discard = () => {
    setDraft(saved)
    setTheme(savedTheme)
    applyDensity(saved.density, saved.densityScale)
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
              active={themeChoice === "light"}
              onClick={() => setTheme("light")}
              preview="bg-white text-slate-900 border-slate-200"
            />
            <ThemeOption
              label="Dark"
              icon={<Moon className="h-4 w-4" />}
              active={themeChoice === "dark"}
              onClick={() => setTheme("dark")}
              preview="bg-slate-900 text-slate-100 border-slate-700"
            />
            <ThemeOption
              label="System"
              icon={<Monitor className="h-4 w-4" />}
              active={themeChoice === "system"}
              onClick={() => setTheme("system")}
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
                  onClick={() =>
                    setDraft({
                      ...draft,
                      density: d,
                      // When the user flips into compact mode for the first
                      // time, give them a sensible starting scale so they
                      // see an immediate effect; preserve their last
                      // chosen value if they had already tuned it.
                      densityScale:
                        d === "compact"
                          ? draft.densityScale < 1
                            ? draft.densityScale
                            : DENSITY_DEFAULT_COMPACT
                          : 1,
                    })
                  }
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

            {/* Compact-only slider. Only renders when the user actually
                wants to fine-tune; comfortable users never see it. The
                preview chip on the right shows the live scale percent so
                the change is concrete instead of abstract. */}
            {draft.density === "compact" && (
              <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    How compact?
                  </Label>
                  <span className="text-xs font-mono tabular-nums text-foreground">
                    {Math.round(draft.densityScale * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <ZoomOut
                    className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                    aria-hidden
                  />
                  <Slider
                    value={[draft.densityScale]}
                    min={DENSITY_MIN}
                    max={DENSITY_MAX}
                    step={0.01}
                    onValueChange={([v]) =>
                      setDraft({ ...draft, densityScale: clampScale(v) })
                    }
                    aria-label="Density scale"
                    className="flex-1"
                  />
                  <ZoomIn
                    className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                    aria-hidden
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Tighter ({Math.round(DENSITY_MIN * 100)}%)</span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        densityScale: DENSITY_DEFAULT_COMPACT,
                      })
                    }
                    className="hover:text-foreground underline-offset-2 hover:underline"
                  >
                    Reset to {Math.round(DENSITY_DEFAULT_COMPACT * 100)}%
                  </button>
                  <span>Roomy ({Math.round(DENSITY_MAX * 100)}%)</span>
                </div>
              </div>
            )}
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
            <TimezonePicker
              value={draft.timezone}
              onChange={(v) => setDraft({ ...draft, timezone: v })}
            />
            <p className="text-[11px] text-muted-foreground">
              All dates and times in the app render in this zone.
            </p>
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

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

// Searchable timezone picker built on Popover + Command. Replaces the
// previous shadcn Select which relied on a tiny hardcoded list — that
// list was missing most users' actual zones, so the trigger rendered as
// blank because the saved value didn't match any item.
function TimezonePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  // Compute the timezone list once per mount. The IANA list rarely
  // changes, and we don't want to rebuild it on every keystroke.
  const zones = useMemo(() => buildTimezoneList(value), [value])

  // Live clock in the chosen zone — proves to the user that picking a
  // zone actually does something. Updates every second while open and
  // every minute the rest of the time so we don't burn CPU.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(
      () => setNow(new Date()),
      open ? 1000 : 60_000,
    )
    return () => clearInterval(id)
  }, [open])

  const offset = useMemo(() => tzOffset(value), [value, now])
  const localTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en", {
        timeZone: value,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now)
    } catch {
      return "—"
    }
  }, [value, now])

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{value || "Pick a time zone"}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
              <span className="tabular-nums">{offset}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(420px,calc(100vw-2rem))] p-0"
          align="start"
        >
          <Command
            // Custom filter so users can search by either the IANA zone
            // name ("Asia/Kolkata") or its current offset ("GMT+5:30").
            filter={(item, search) => {
              const q = search.toLowerCase().trim()
              if (!q) return 1
              if (item.toLowerCase().includes(q)) return 1
              try {
                const off = tzOffset(item).toLowerCase()
                if (off.includes(q)) return 0.5
              } catch {
                /* ignore */
              }
              return 0
            }}
          >
            <CommandInput
              placeholder="Search by city or offset (e.g. Kolkata, GMT+5)…"
              className="h-9"
            />
            <div className="flex items-center justify-between px-3 py-1.5 border-b text-[11px] text-muted-foreground bg-muted/30">
              <span>{zones.length} zones</span>
              <button
                type="button"
                onClick={() => {
                  const detected = detectTimezone()
                  onChange(detected)
                  setOpen(false)
                }}
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline underline-offset-2"
              >
                <Locate className="h-3 w-3" />
                Use my system zone
              </button>
            </div>
            <CommandList>
              <CommandEmpty>No matching zones.</CommandEmpty>
              <CommandGroup>
                {zones.map((tz) => (
                  <CommandItem
                    key={tz}
                    value={tz}
                    onSelect={() => {
                      onChange(tz)
                      setOpen(false)
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          tz === value ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{tz}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {tzOffset(tz)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <div className="flex items-center justify-between rounded-md border bg-muted/20 px-2.5 py-1.5 text-[11px]">
        <span className="text-muted-foreground">Current time in this zone</span>
        <span className="font-mono tabular-nums text-foreground">
          {localTime}
          <span className="ml-1.5 text-muted-foreground">{offset}</span>
        </span>
      </div>
    </div>
  )
}
