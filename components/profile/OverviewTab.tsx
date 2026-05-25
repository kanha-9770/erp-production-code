"use client"

/**
 * OverviewTab — minimalist, professional summary.
 *
 * Replaces the previous design which had:
 *   - a gradient banner
 *   - a welcome message
 *   - inline contact chips with tone-tinted icons
 *   - TWO progress bars (one in the hero, one in the checklist)
 *   - a hashtag-marker checklist with "Add" buttons
 *   - a 5-row employment card with colored verification badges
 *
 * The new design is three sections in a single column. Each section is
 * just a small uppercase label and a definition list of key→value rows
 * with subtle dividers. No cards, no shadows, no gradients, no tone
 * tints — the entire visual language is type and one accent on the
 * "Verified" indicator. Same vibe as Linear / Vercel / Stripe settings.
 *
 *   ── PROFILE SETUP ───── (only when < 100% complete) ──
 *   [progress bar]                                  60%
 *   3 more details to finish.       [ Continue → ]
 *
 *   ── ABOUT ─────────────────────────────────────────
 *   Role             Engineering Manager
 *   Department       Engineering
 *   Organization     Acme Corporation
 *   Joined           Jun 24, 2024
 *
 *   ── CONTACT ───────────────────────────────────────
 *   Email            john@co.io  ✓ Verified
 *   Phone            +1 555 0100
 *   Location         San Francisco, CA
 *
 * When the profile is fully set up, the Profile setup section is
 * omitted entirely — no congratulations banner, no "you're done"
 * filler. Just About + Contact.
 */

import { Button } from "@/components/ui/button"
import { Check, ArrowRight } from "lucide-react"
import type { ProfileUser, ProfileTabId } from "./types"
import { getProfileCompleteness, formatDate } from "./profile-utils"

interface OverviewTabProps {
  user: ProfileUser
  onJumpTab: (tab: ProfileTabId) => void
}

export default function OverviewTab({ user, onJumpTab }: OverviewTabProps) {
  const { pct, items } = getProfileCompleteness(user)
  const remainingItems = items.filter((i) => !i.done)
  const isComplete = pct >= 100

  const e = user.employee
  const primaryRole = user.unitAssignments[0]?.role?.name ?? null

  // "About" — always show every row. Missing values render as em-dash
  // so the layout stays consistent regardless of how filled in the
  // profile is.
  const aboutRows: Row[] = [
    { label: "Role", value: e?.designation ?? primaryRole ?? "—" },
    {
      label: "Department",
      value: e?.department ?? user.department ?? "—",
    },
    { label: "Organization", value: user.organization?.name ?? "—" },
    {
      label: "Joined",
      value: formatDate(e?.dateOfJoining ?? user.joinDate),
    },
  ]

  // "Contact" — only include rows that have data. An entire row of
  // em-dashes for contact info would feel like dead weight.
  const contactRows: Row[] = [
    {
      label: "Email",
      value: user.email,
      status: user.email_verified ? "verified" : "unverified",
    },
  ]
  if (user.mobile || user.phone) {
    contactRows.push({
      label: "Phone",
      value: user.mobile ?? user.phone ?? "",
    })
  }
  if (user.location) {
    contactRows.push({ label: "Location", value: user.location })
  }

  return (
    <div className="space-y-8">
      {!isComplete && (
        <ProfileSetupSection
          pct={pct}
          remaining={remainingItems.length}
          nextTab={(remainingItems[0]?.tab as ProfileTabId) ?? "personal"}
          onJumpTab={onJumpTab}
        />
      )}

      <Section title="About">
        <DefList rows={aboutRows} />
      </Section>

      <Section title="Contact">
        <DefList rows={contactRows} />
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile setup — the only "actionable" block. Subtle card to set it
// apart from the read-only About/Contact sections below.
// ─────────────────────────────────────────────────────────────────────────────

function ProfileSetupSection({
  pct,
  remaining,
  nextTab,
  onJumpTab,
}: {
  pct: number
  remaining: number
  nextTab: ProfileTabId
  onJumpTab: (tab: ProfileTabId) => void
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium">Profile setup</h3>
        <span className="text-sm tabular-nums text-muted-foreground">
          {pct}%
        </span>
      </div>
      {/* Single neutral progress bar — no tone tinting, no gradient.
          The number above tells you the score; the colour shouldn't. */}
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-foreground transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {remaining} more {remaining === 1 ? "detail" : "details"} to
          finish.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onJumpTab(nextTab)}
          className="h-8"
        >
          Continue
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section — small uppercase label + content. The label sets the
// hierarchy; the content does the rest.
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-3">
        {title}
      </h3>
      {children}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Definition list — minimal key→value rows separated by hairline borders.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  label: string
  value: string
  // Optional verification badge — rendered only on the email row.
  status?: "verified" | "unverified"
}

function DefList({ rows }: { rows: Row[] }) {
  return (
    <dl className="divide-y divide-border border-y border-border">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4 py-3.5"
        >
          <dt className="text-sm text-muted-foreground shrink-0">
            {row.label}
          </dt>
          <dd className="text-sm font-medium text-right min-w-0 flex items-center gap-2 justify-end">
            <span className="truncate">{row.value}</span>
            {row.status === "verified" && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-normal text-emerald-600 dark:text-emerald-400 shrink-0">
                <Check className="h-3 w-3" strokeWidth={2.5} />
                Verified
              </span>
            )}
            {row.status === "unverified" && (
              <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400 shrink-0">
                Unverified
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
