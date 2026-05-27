"use client"

/**
 * EmploymentTab — read-only display of org membership, role assignments,
 * the linked HR Employee record (if any), and document-status badges.
 *
 * Visual model (matches the polished user dashboard):
 *   - Hero card at the top combines the user's primary employment facts
 *     (designation · department · join date) with the org name and access
 *     tier. One anchor card instead of two small ones.
 *   - Detail cards below get a tinted icon chip in their header so the
 *     page reads as themed sections rather than a stack of identical
 *     white tiles.
 *   - Documents render with explicit green/amber chips so present-vs-
 *     missing is obvious at a glance.
 *
 * Salary fields are gated behind `isAdmin` so the tab is safe to render
 * for the user's own viewing (non-admins shouldn't see compensation here).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Building2,
  Briefcase,
  Calendar,
  Clock,
  ShieldCheck,
  Mail,
  Phone,
  IdCard,
  Banknote,
  AlertTriangle,
  CheckCircle2,
  Users,
} from "lucide-react"
import type { ProfileUser } from "./types"
import { formatDate } from "./profile-utils"

export default function EmploymentTab({ user }: { user: ProfileUser }) {
  const e = user.employee
  const showSalary = user.isAdmin || user.isOrgOwner

  return (
    <div className="space-y-4 sm:space-y-5">
      <HeroCard user={user} />
      <RolesCard user={user} />

      {!e ? (
        <EmptyHrState />
      ) : (
        <>
          <SectionCard
            icon={<IdCard className="h-4 w-4" />}
            title="Identity"
            subtitle="From your HR record"
            tone="blue"
          >
            <GridKV>
              <KV label="Full name" value={e.employeeName} />
              <KV label="Gender" value={e.gender} />
              <KV label="Date of birth" value={formatDate(e.dob)} />
              <KV label="Native place" value={e.nativePlace} />
              <KV label="Country" value={e.country} />
              <KV label="Status" value={e.status} />
              <KV label="Permanent address" value={e.permanentAddress} fullWidth />
              <KV label="Current address" value={e.currentAddress} fullWidth />
            </GridKV>
          </SectionCard>

          <SectionCard
            icon={<Phone className="h-4 w-4" />}
            title="Contact"
            subtitle="Phone numbers and email addresses on file"
            tone="emerald"
          >
            <GridKV>
              <KV label="Personal contact" value={e.personalContact} icon={<Phone className="h-3 w-3" />} />
              <KV label="Alternate 1" value={e.alternateNo1} icon={<Phone className="h-3 w-3" />} />
              <KV label="Alternate 2" value={e.alternateNo2} icon={<Phone className="h-3 w-3" />} />
              <KV label="Primary email" value={e.emailAddress1} icon={<Mail className="h-3 w-3" />} />
              <KV label="Secondary email" value={e.emailAddress2} icon={<Mail className="h-3 w-3" />} fullWidth />
            </GridKV>
          </SectionCard>

          <SectionCard
            icon={<Briefcase className="h-4 w-4" />}
            title="Work"
            subtitle="Designation, team and shift details"
            tone="indigo"
          >
            <GridKV>
              <KV label="Designation" value={e.designation} />
              <KV label="Department" value={e.department} />
              <KV label="Company" value={e.companyName} />
              <KV label="Engagement team" value={e.employeeEngagementTeamName} />
              <KV label="Shift" value={e.shiftType} icon={<Clock className="h-3 w-3" />} />
              <KV label="In time" value={e.inTime} icon={<Clock className="h-3 w-3" />} />
              <KV label="Out time" value={e.outTime} icon={<Clock className="h-3 w-3" />} />
              <KV label="Joined" value={formatDate(e.dateOfJoining)} icon={<Calendar className="h-3 w-3" />} />
              <KV label="Left" value={formatDate(e.dateOfLeaving)} icon={<Calendar className="h-3 w-3" />} />
              <KV label="Years of agreement" value={e.yearsOfAgreement} />
            </GridKV>
          </SectionCard>

          <DocumentsCard e={e} />
          {showSalary && <CompensationCard e={e} />}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero — primary employment facts at a glance.
// ─────────────────────────────────────────────────────────────────────────────

function HeroCard({ user }: { user: ProfileUser }) {
  const e = user.employee
  const designation = e?.designation
  const department = e?.department
  const joined = e?.dateOfJoining ? formatDate(e.dateOfJoining) : null
  const tier = user.isOrgOwner ? "Owner" : user.isAdmin ? "Admin" : null

  return (
    <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.08] via-primary/[0.03] to-transparent">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div
            aria-hidden
            className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
          >
            <Briefcase className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Employment
            </div>
            <h2 className="mt-0.5 text-lg sm:text-xl font-semibold tracking-tight truncate">
              {designation || "No designation on file"}
            </h2>
            {(department || joined) && (
              <p className="mt-1 text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {department && <span>{department}</span>}
                {department && joined && <span className="text-muted-foreground/40">·</span>}
                {joined && <span>Joined {joined}</span>}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {user.organization ? (
                <Badge variant="secondary" className="font-normal text-[11px] bg-background/70 backdrop-blur-sm">
                  <Building2 className="h-3 w-3 mr-1" />
                  {user.organization.name}
                </Badge>
              ) : (
                <Badge variant="outline" className="font-normal text-[11px]">
                  No organization
                </Badge>
              )}
              {tier && (
                <Badge className="text-[11px] px-2 h-5 bg-primary/15 text-primary hover:bg-primary/15 border-transparent">
                  {tier}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles & assignments — kept as its own card; structurally distinct from
// employment facts above.
// ─────────────────────────────────────────────────────────────────────────────

function RolesCard({ user }: { user: ProfileUser }) {
  return (
    <SectionCard
      icon={<Users className="h-4 w-4" />}
      title="Roles & assignments"
      subtitle={
        user.unitAssignments.length === 0
          ? "You don't have any role assignments yet."
          : `${user.unitAssignments.length} ${user.unitAssignments.length === 1 ? "assignment" : "assignments"}`
      }
      tone="primary"
    >
      {user.unitAssignments.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Ask your admin to assign you to a unit.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {user.unitAssignments.map((ua) => (
            <li
              key={`${ua.unit.id}:${ua.role.id}`}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Briefcase className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{ua.role.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {ua.unit.name}
                  {ua.notes ? ` · ${ua.notes}` : ""}
                </div>
              </div>
              {ua.role.isAdmin && (
                <Badge className="text-[10px] px-1.5 h-5 shrink-0 bg-primary/15 text-primary hover:bg-primary/15 border-transparent">
                  Admin
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section shell — gives each detail card a tinted icon chip in its header
// so the page reads as themed sections instead of a stack of look-alikes.
// ─────────────────────────────────────────────────────────────────────────────

type SectionTone = "primary" | "blue" | "emerald" | "indigo" | "amber"

const TONE_CHIP: Record<SectionTone, string> = {
  primary: "bg-primary/15 text-primary",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
}

function SectionCard({
  icon,
  title,
  subtitle,
  tone,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  tone: SectionTone
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TONE_CHIP[tone])}>
            {icon}
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base leading-tight">{title}</CardTitle>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-5 pb-4">{children}</CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state for users with no linked HR record. Replaces a tiny inline
// warning with a properly framed empty state.
// ─────────────────────────────────────────────────────────────────────────────

function EmptyHrState() {
  return (
    <Card className="border-dashed">
      <CardContent className="p-6 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-medium">No HR record linked</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          Ask your admin to attach an HR Employee record to your account.
          Until then, attendance, payroll and leave data won't appear here.
        </p>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents — green/amber chips so on-file vs missing is obvious.
// ─────────────────────────────────────────────────────────────────────────────

type Emp = NonNullable<ProfileUser["employee"]>

function DocumentsCard({ e }: { e: Emp }) {
  const docs = [
    { label: "Aadhar", value: e.aadharCardNo },
    { label: "Bank account", value: e.bankAccountNo },
    { label: "IFSC", value: e.ifscCode },
    { label: "Bank", value: e.bankName },
  ]
  const onFile = docs.filter((d) => !!d.value).length
  return (
    <SectionCard
      icon={<ShieldCheck className="h-4 w-4" />}
      title="Documents"
      subtitle={`${onFile} of ${docs.length} on file`}
      tone="emerald"
    >
      <div className="grid gap-2.5 sm:grid-cols-2">
        {docs.map((d) => {
          const present = !!d.value
          return (
            <div
              key={d.label}
              className={cn(
                "flex items-center gap-2.5 rounded-md border px-3 py-2.5",
                present
                  ? "bg-emerald-500/[0.06] border-emerald-500/20"
                  : "bg-amber-500/[0.06] border-amber-500/20",
              )}
            >
              {present ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                  {d.label}
                </div>
                <div className="text-sm font-medium truncate mt-0.5">
                  {present ? maskSensitive(String(d.value)) : "Not on file"}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Compensation (admin only)
// ─────────────────────────────────────────────────────────────────────────────

function CompensationCard({ e }: { e: Emp }) {
  const fmt = (n: number | null | undefined) =>
    n == null
      ? "—"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
        }).format(n)
  return (
    <SectionCard
      icon={<Banknote className="h-4 w-4" />}
      title="Compensation"
      subtitle="Visible only to admins and the organization owner"
      tone="amber"
    >
      <GridKV>
        <KV label="Total CTC" value={fmt(e.totalSalary)} />
        <KV label="Take-home" value={fmt(e.givenSalary)} />
        <KV label="Bonus" value={fmt(e.bonusAmount)} />
        <KV label="Night allowance" value={fmt(e.nightAllowance)} />
        <KV label="Overtime" value={fmt(e.overTime)} />
        <KV label="Increment month" value={e.incrementMonth} />
      </GridKV>
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout helpers
// ─────────────────────────────────────────────────────────────────────────────

function GridKV({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">{children}</div>
}

function KV({
  label,
  value,
  icon,
  fullWidth,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : undefined}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium break-words mt-0.5">{value || "—"}</div>
    </div>
  )
}

/**
 * Mask sensitive identifiers — show first 2 + last 4 only. Aadhar/account
 * numbers often need to be visible enough to confirm but not fully exposed
 * on a screen the user might share.
 */
function maskSensitive(s: string): string {
  const v = s.trim()
  if (v.length <= 6) return v
  return `${v.slice(0, 2)}••••${v.slice(-4)}`
}
