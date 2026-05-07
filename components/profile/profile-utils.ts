/**
 * Profile-area utilities. Pure functions, no React.
 *
 * `getProfileCompleteness` — scores how filled-in the profile is so the
 * Overview tab can show a ring + a punch list of what's still empty.
 * Weighted: identity fields count more than nice-to-haves so the score
 * reflects actual coverage, not a count of optional toggles.
 */

import type { ProfileUser } from "./types"

export interface CompletenessItem {
  key: string
  label: string
  done: boolean
  weight: number
  // Tab the user should jump to in order to fill this in.
  tab: "personal" | "employment" | "preferences" | "security"
}

export function getProfileCompleteness(u: ProfileUser): {
  pct: number
  items: CompletenessItem[]
} {
  const items: CompletenessItem[] = [
    { key: "name", label: "Name", done: !!(u.first_name && u.last_name), weight: 3, tab: "personal" },
    { key: "username", label: "Username", done: !!u.username, weight: 1, tab: "personal" },
    { key: "phone", label: "Phone number", done: !!u.phone, weight: 2, tab: "personal" },
    { key: "mobile", label: "Mobile", done: !!u.mobile, weight: 2, tab: "personal" },
    { key: "location", label: "Location", done: !!u.location, weight: 1, tab: "personal" },
    { key: "department", label: "Department", done: !!u.department, weight: 1, tab: "personal" },
    { key: "avatar", label: "Profile photo", done: !!u.avatar, weight: 1, tab: "personal" },
    { key: "verified-email", label: "Verified email", done: !!u.email_verified, weight: 3, tab: "personal" },
    { key: "verified-mobile", label: "Verified mobile", done: !!u.mobile_verified, weight: 1, tab: "personal" },
  ]
  const total = items.reduce((s, i) => s + i.weight, 0)
  const earned = items.reduce((s, i) => s + (i.done ? i.weight : 0), 0)
  const pct = total === 0 ? 0 : Math.round((earned / total) * 100)
  return { pct, items }
}

/**
 * Display name fallback chain. We never want a blank name in the UI so this
 * cascades: full name → first name → username → email → "User".
 */
export function displayName(u: ProfileUser): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim()
  return full || u.first_name || u.username || u.email || "User"
}

export function initialsOf(u: ProfileUser): string {
  const a = (u.first_name ?? "").trim()[0]
  const b = (u.last_name ?? "").trim()[0]
  if (a && b) return (a + b).toUpperCase()
  if (a) return a.toUpperCase()
  if (u.username) return u.username[0].toUpperCase()
  if (u.email) return u.email[0].toUpperCase()
  return "U"
}

export function formatDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString(undefined, opts ?? { year: "numeric", month: "short", day: "numeric" })
}
