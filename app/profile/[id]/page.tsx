"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useGetEmployeeQuery,
  type EmployeeStatus,
} from "@/lib/api/employees";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  User2,
  Mail,
  Phone,
  Briefcase,
  Building2,
  Calendar,
  CreditCard,
  MapPin,
  Landmark,
  FileText,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";

const STATUS_VARIANT: Record<EmployeeStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ON_LEAVE: "outline",
  TERMINATED: "destructive",
};

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString()}`;
}

function fmtBool(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const { data, isLoading, isError } = useGetEmployeeQuery(id as string, {
    skip: !id,
  });
  const e = data?.employee;

  if (isLoading) return <LoadingShell />;

  if (isError || !e) {
    return (
      <div className="min-h-screen bg-muted/20">
        <div className="container mx-auto max-w-3xl p-6">
          <Button variant="ghost" size="sm" asChild className="mb-6">
            <Link href="/employee-master">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back to Employee Master
            </Link>
          </Button>
          <Card className="p-10 text-center">
            <User2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <h2 className="text-lg font-semibold">Employee not found</h2>
            <p className="text-sm text-muted-foreground mt-1">
              This profile no longer exists or you don&apos;t have access to view it.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const fullAddress = (
    line1: string | null,
    line2: string | null,
    city: string | null,
    state: string | null,
    postal: string | null,
    country: string | null,
  ) => {
    const parts = [line1, line2, city, state, postal, country].filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  };

  const showExitCard =
    e.status === "TERMINATED" ||
    !!e.resignationLetterDate ||
    !!e.dateOfLeaving ||
    !!e.reasonOfLeaving ||
    e.noticeServed != null;

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="container mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/employee-master")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Employee Master
          </Button>
        </div>

        {/* Identity card */}
        <div className="relative overflow-hidden rounded-xl border bg-background shadow-sm">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-primary/10 via-violet-500/10 to-cyan-500/10 dark:from-primary/20 dark:via-violet-500/15 dark:to-cyan-500/15"
          />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 sm:p-6">
            <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-primary/10 ring-4 ring-background shadow-md flex items-center justify-center overflow-hidden shrink-0">
              {e.employeeImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.employeeImage}
                  alt={e.employeeName}
                  className="h-full w-full object-cover"
                  onError={(ev) => {
                    const img = ev.currentTarget;
                    img.style.display = "none";
                    const fb = img.nextElementSibling as HTMLElement | null;
                    if (fb) fb.style.display = "block";
                  }}
                />
              ) : null}
              <User2
                className="h-10 w-10 text-primary"
                style={{ display: e.employeeImage ? "none" : "block" }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight uppercase truncate">
                  {e.employeeName}
                </h1>
                <Badge
                  variant={STATUS_VARIANT[e.status ?? "ACTIVE"]}
                  className="text-[10px]"
                >
                  {e.status ?? "ACTIVE"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 shrink-0" />
                {e.designation || "No designation"} · {e.department || "No department"}
              </p>
              {e.companyName ? (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <Building2 className="h-3 w-3 shrink-0" />
                  {e.companyName}
                  {e.branch ? <> · {e.branch}</> : null}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Personal */}
          <Section title="Personal" icon={<User2 className="h-3.5 w-3.5" />}>
            <Fact label="Salutation" value={e.salutation} />
            <Fact label="First name" value={e.firstName} />
            <Fact label="Last name" value={e.lastName} />
            <Fact label="Date of birth" value={fmtDate(e.dob)} />
            <Fact label="Gender" value={e.gender} />
            <Fact label="Marital status" value={e.maritalStatus} />
            <Fact label="Blood group" value={e.bloodGroup} />
            <Fact label="Nationality" value={e.nationality} />
            <Fact label="Place of birth" value={e.placeOfBirth} />
            <Fact label="Native place" value={e.nativePlace} />
          </Section>

          {/* Contact */}
          <Section title="Contact" icon={<Mail className="h-3.5 w-3.5" />}>
            <Fact label="Personal email" value={e.emailAddress1?.toUpperCase() ?? null} />
            <Fact label="Company email" value={e.emailAddress2?.toUpperCase() ?? null} />
            <Fact label="Cell number" value={e.personalContact} mono />
            <Fact label="Alternate no 1" value={e.alternateNo1} mono />
            <Fact label="Alternate no 2" value={e.alternateNo2} mono />
            <Fact
              label="Emergency contact"
              value={
                e.emergencyContactName
                  ? `${e.emergencyContactName}${e.emergencyRelation ? ` (${e.emergencyRelation})` : ""}${e.emergencyPhone ? ` · ${e.emergencyPhone}` : ""}`
                  : null
              }
            />
          </Section>

          {/* Addresses */}
          <Section title="Addresses" icon={<MapPin className="h-3.5 w-3.5" />} className="lg:col-span-2">
            <Fact
              label="Current address"
              value={fullAddress(
                e.currentAddressLine1,
                e.currentAddressLine2,
                e.currentCity,
                e.currentState,
                e.currentPostalCode,
                e.currentCountry,
              )}
              wide
            />
            <Fact label="Current accommodation" value={e.currentAccommodationType} />
            <Fact
              label="Permanent address"
              value={
                e.permanentSameAsCurrent
                  ? "Same as current"
                  : fullAddress(
                      e.permanentAddressLine1,
                      e.permanentAddressLine2,
                      e.permanentCity,
                      e.permanentState,
                      e.permanentPostalCode,
                      e.permanentCountry,
                    )
              }
              wide
            />
            <Fact label="Permanent accommodation" value={e.permanentAccommodationType} />
          </Section>

          {/* Employment */}
          <Section title="Employment" icon={<Briefcase className="h-3.5 w-3.5" />}>
            <Fact label="Employment type" value={e.employmentType} />
            <Fact label="Department" value={e.department} />
            <Fact label="Designation" value={e.designation} />
            <Fact label="Company" value={e.companyName} />
            <Fact label="Branch" value={e.branch} />
            <Fact label="Date of joining" value={fmtDate(e.dateOfJoining)} />
            <Fact label="Shift" value={e.shiftType} />
            <Fact label="In time" value={e.inTime} mono />
            <Fact label="Out time" value={e.outTime} mono />
            <Fact
              label="Working hours / day"
              value={e.totalWorkingHours != null ? `${e.totalWorkingHours}h` : null}
              mono
            />
            <Fact label="Engagement team" value={e.employeeEngagementTeamName} />
            <Fact
              label="Years of agreement"
              value={e.yearsOfAgreement != null ? `${e.yearsOfAgreement} yr` : null}
            />
            <Fact label="Company SIM issued" value={fmtBool(e.companySimIssue)} />
          </Section>

          {/* Compensation */}
          <Section title="Compensation" icon={<CreditCard className="h-3.5 w-3.5" />}>
            <Fact label="Salary mode" value={e.salaryMode} />
            <Fact label="Base salary" value={fmtMoney(e.baseSalary)} mono />
            <Fact label="Total salary" value={fmtMoney(e.totalSalary)} mono />
            <Fact label="Per hour" value={fmtMoney(e.perHourSalary)} mono />
            <Fact label="Overtime applicable" value={fmtBool(e.isOvertimeApplicable)} />
            <Fact label="Overtime rate" value={fmtMoney(e.overTime)} mono />
            <Fact label="Bonus amount" value={fmtMoney(e.bonusAmount)} mono />
            <Fact
              label="Bonus after"
              value={e.bonusAfterYears != null ? `${e.bonusAfterYears} yr` : null}
            />
            <Fact
              label="Increment month"
              value={e.incrementMonth ? MONTHS[e.incrementMonth] ?? `${e.incrementMonth}` : null}
            />
            <Fact label="Night allowance" value={fmtMoney(e.nightAllowance)} mono />
            <Fact label="One hour extra" value={fmtMoney(e.oneHourExtra)} mono />
          </Section>

          {/* Bank */}
          <Section title="Bank details" icon={<Landmark className="h-3.5 w-3.5" />}>
            <Fact label="Bank name" value={e.bankName} />
            <Fact label="Account number" value={e.bankAccountNo} mono />
            <Fact label="IFSC code" value={e.ifscCode?.toUpperCase() ?? null} mono />
            <Fact label="SWIFT / BIC" value={e.swiftCode?.toUpperCase() ?? null} mono />
          </Section>

          {/* Documents */}
          <Section title="Documents" icon={<FileText className="h-3.5 w-3.5" />}>
            <Fact label="Aadhaar number" value={e.aadharCardNo} mono />
            <DocLink label="Aadhaar upload" url={e.aadharCardUpload} />
            <DocLink label="PAN upload" url={e.panCardUpload} />
            <DocLink label="Passport upload" url={e.passportUpload} />
          </Section>

          {/* Exit / Resignation — only render if there's anything to show */}
          {showExitCard ? (
            <Section
              title="Exit / Resignation"
              icon={<ShieldAlert className="h-3.5 w-3.5" />}
              className="lg:col-span-2 border-l-4 border-l-destructive/60"
            >
              <Fact label="Resignation date" value={fmtDate(e.resignationLetterDate)} />
              <Fact label="Date of leaving" value={fmtDate(e.dateOfLeaving)} />
              <Fact label="Notice served" value={fmtBool(e.noticeServed)} />
              <Fact label="Reason of leaving" value={e.reasonOfLeaving} wide />
            </Section>
          ) : null}

          {/* System */}
          <Section title="System" icon={<FileText className="h-3.5 w-3.5" />} className="lg:col-span-2">
            <Fact label="Employee ID" value={e.id} mono />
            <Fact label="User ID" value={e.userId} mono />
            <Fact label="Created" value={fmtDate(e.createdAt)} />
            <Fact label="Updated" value={fmtDate(e.updatedAt)} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  className,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-5 ${className ?? ""}`}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-3">
        {icon}
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </Card>
  );
}

function Fact({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  wide?: boolean;
}) {
  const display =
    value == null || value === "" || value === "—" ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      value
    );
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className={`text-sm break-words ${mono ? "font-mono" : ""}`}>{display}</div>
    </div>
  );
}

function DocLink({ label, url }: { label: string; url: string | null | undefined }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary inline-flex items-center gap-1 hover:underline underline-offset-2"
        >
          View <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <div className="text-sm text-muted-foreground">—</div>
      )}
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="container mx-auto max-w-5xl p-4 sm:p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="rounded-xl border bg-background p-6 flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
