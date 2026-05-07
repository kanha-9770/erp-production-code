"use client"

/**
 * EmploymentTab — read-only display of org membership, role assignments,
 * the linked HR Employee record (if any), and document-status badges.
 *
 * Salary fields are gated behind `isAdmin` so the tab is safe to render for
 * the user's own viewing (non-admins shouldn't see compensation here).
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
    <div className="space-y-6">
      <OrganizationCard user={user} />
      <RolesCard user={user} />

      {!e ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <IdCard className="h-4 w-4 text-primary" />
              HR record
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p>
              No HR Employee record is linked to your user account yet. Ask your
              admin to attach one — until then, attendance, payroll and leave
              records won&apos;t show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <EmployeeIdentityCard e={e} />
          <EmployeeContactCard e={e} />
          <EmployeeWorkCard e={e} />
          <DocumentsCard e={e} />
          {showSalary && <CompensationCard e={e} />}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Organization
// ─────────────────────────────────────────────────────────────────────────────

function OrganizationCard({ user }: { user: ProfileUser }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Organization
        </CardTitle>
      </CardHeader>
      <CardContent>
        {user.organization ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{user.organization.name}</div>
              <div className="text-xs text-muted-foreground tabular-nums truncate">
                {user.organization.id}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {user.isOrgOwner && (
                <Badge variant="default" className="text-[10px] px-1.5 h-5">
                  Owner
                </Badge>
              )}
              {user.isAdmin && !user.isOrgOwner && (
                <Badge variant="secondary" className="text-[10px] px-1.5 h-5">
                  Admin
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No organization assigned.</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles & Units
// ─────────────────────────────────────────────────────────────────────────────

function RolesCard({ user }: { user: ProfileUser }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Roles & assignments
        </CardTitle>
        <CardDescription>
          Where you sit in the org and what you&apos;re authorised to do.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {user.unitAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {user.unitAssignments.map((ua) => (
              <li key={`${ua.unit.id}:${ua.role.id}`} className="flex items-center gap-3 p-3">
                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Briefcase className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{ua.role.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {ua.unit.name}
                    {ua.notes ? ` · ${ua.notes}` : ""}
                  </div>
                </div>
                {ua.role.isAdmin && (
                  <Badge variant="default" className="text-[10px] px-1.5 h-5 shrink-0">
                    Admin
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee record cards
// ─────────────────────────────────────────────────────────────────────────────

type Emp = NonNullable<ProfileUser["employee"]>

function EmployeeIdentityCard({ e }: { e: Emp }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <IdCard className="h-4 w-4 text-primary" />
          Identity (HR record)
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <KV label="Full name" value={e.employeeName} />
        <KV label="Gender" value={e.gender} />
        <KV label="Date of birth" value={formatDate(e.dob)} />
        <KV label="Native place" value={e.nativePlace} />
        <KV label="Country" value={e.country} />
        <KV label="Status" value={e.status} />
        <KV label="Permanent address" value={e.permanentAddress} className="sm:col-span-2" />
        <KV label="Current address" value={e.currentAddress} className="sm:col-span-2" />
      </CardContent>
    </Card>
  )
}

function EmployeeContactCard({ e }: { e: Emp }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          Contact (HR record)
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <KV
          label="Personal contact"
          value={e.personalContact}
          icon={<Phone className="h-3 w-3" />}
        />
        <KV label="Alternate 1" value={e.alternateNo1} icon={<Phone className="h-3 w-3" />} />
        <KV label="Alternate 2" value={e.alternateNo2} icon={<Phone className="h-3 w-3" />} />
        <KV
          label="Primary email"
          value={e.emailAddress1}
          icon={<Mail className="h-3 w-3" />}
        />
        <KV
          label="Secondary email"
          value={e.emailAddress2}
          icon={<Mail className="h-3 w-3" />}
          className="sm:col-span-2"
        />
      </CardContent>
    </Card>
  )
}

function EmployeeWorkCard({ e }: { e: Emp }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          Work
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <KV label="Designation" value={e.designation} />
        <KV label="Department" value={e.department} />
        <KV label="Company" value={e.companyName} />
        <KV label="Engagement team" value={e.employeeEngagementTeamName} />
        <KV label="Shift" value={e.shiftType} icon={<Clock className="h-3 w-3" />} />
        <KV label="In time" value={e.inTime} icon={<Clock className="h-3 w-3" />} />
        <KV label="Out time" value={e.outTime} icon={<Clock className="h-3 w-3" />} />
        <KV label="Joined" value={formatDate(e.dateOfJoining)} icon={<Calendar className="h-3 w-3" />} />
        <KV
          label="Left"
          value={formatDate(e.dateOfLeaving)}
          icon={<Calendar className="h-3 w-3" />}
        />
        <KV label="Years of agreement" value={e.yearsOfAgreement} />
      </CardContent>
    </Card>
  )
}

function DocumentsCard({ e }: { e: Emp }) {
  const docs = [
    { label: "Aadhar", value: e.aadharCardNo },
    { label: "Bank account", value: e.bankAccountNo },
    { label: "IFSC", value: e.ifscCode },
    { label: "Bank", value: e.bankName },
  ]
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Documents
        </CardTitle>
        <CardDescription>Identity & banking on file.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {docs.map((d) => (
          <div
            key={d.label}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              {d.value ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{d.label}</div>
                <div className="text-sm font-medium truncate">
                  {d.value ? maskSensitive(String(d.value)) : "Not on file"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function CompensationCard({ e }: { e: Emp }) {
  const fmt = (n: number | null | undefined) =>
    n == null
      ? "—"
      : new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Banknote className="h-4 w-4 text-primary" />
          Compensation
          <Badge variant="secondary" className="text-[10px] px-1.5 h-5 ml-2">
            Admin only
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <KV label="Total CTC" value={fmt(e.totalSalary)} />
        <KV label="Take-home" value={fmt(e.givenSalary)} />
        <KV label="Bonus" value={fmt(e.bonusAmount)} />
        <KV label="Night allowance" value={fmt(e.nightAllowance)} />
        <KV label="Overtime" value={fmt(e.overTime)} />
        <KV label="Increment month" value={e.incrementMonth} />
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function KV({
  label,
  value,
  icon,
  className,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium mt-0.5 break-words">{value || "—"}</div>
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
