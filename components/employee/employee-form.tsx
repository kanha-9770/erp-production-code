"use client";

/**
 * Shared Employee form, used by /employee-master/new and (future) edit page.
 * Pure client component — the page wires the create-or-update mutation and
 * handles navigation.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings2 } from "lucide-react";
import type { EmployeeDetail } from "@/lib/api/employees";

// Drop the employee form's builder ID here when you have it; the
// "Customize form" button below targets /builder/<this-id>. Leave empty to
// fall back to the form list so a user can still get to the builder.
const EMPLOYEE_BUILDER_FORM_ID = "";

const customizeHref = EMPLOYEE_BUILDER_FORM_ID
  ? `/builder/${EMPLOYEE_BUILDER_FORM_ID}`
  : "/forms";

export interface EmployeeFormValues {
  employeeName: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";
  department: string;
  designation: string;
  companyName: string;
  employeeEngagementTeamName: string;

  emailAddress1: string;
  emailAddress2: string;
  personalContact: string;
  alternateNo1: string;
  alternateNo2: string;

  dob: string;
  dateOfJoining: string;
  dateOfLeaving: string;
  nativePlace: string;
  country: string;
  permanentAddress: string;
  currentAddress: string;

  shiftType: string;
  inTime: string;
  outTime: string;

  totalSalary: string;
  givenSalary: string;
  bonusAmount: string;
  nightAllowance: string;
  overTime: string;
  oneHourExtra: string;
  incrementMonth: string;
  yearsOfAgreement: string;
  bonusAfterYears: string;

  bankName: string;
  bankAccountNo: string;
  ifscCode: string;
  aadharCardNo: string;

  companySimIssue: boolean;
}

const EMPTY: EmployeeFormValues = {
  employeeName: "",
  gender: "OTHER",
  status: "ACTIVE",
  department: "",
  designation: "",
  companyName: "",
  employeeEngagementTeamName: "",

  emailAddress1: "",
  emailAddress2: "",
  personalContact: "",
  alternateNo1: "",
  alternateNo2: "",

  dob: "",
  dateOfJoining: "",
  dateOfLeaving: "",
  nativePlace: "",
  country: "India",
  permanentAddress: "",
  currentAddress: "",

  shiftType: "",
  inTime: "",
  outTime: "",

  totalSalary: "",
  givenSalary: "",
  bonusAmount: "",
  nightAllowance: "",
  overTime: "",
  oneHourExtra: "",
  incrementMonth: "",
  yearsOfAgreement: "",
  bonusAfterYears: "",

  bankName: "",
  bankAccountNo: "",
  ifscCode: "",
  aadharCardNo: "",

  companySimIssue: false,
};

export function fromEmployee(e: EmployeeDetail): EmployeeFormValues {
  const numStr = (v: string | number | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  const dateStr = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
  return {
    employeeName: e.employeeName ?? "",
    gender: (e.gender ?? "OTHER") as EmployeeFormValues["gender"],
    status: (e.status ?? "ACTIVE") as EmployeeFormValues["status"],
    department: e.department ?? "",
    designation: e.designation ?? "",
    companyName: e.companyName ?? "",
    employeeEngagementTeamName: e.employeeEngagementTeamName ?? "",

    emailAddress1: e.emailAddress1 ?? "",
    emailAddress2: e.emailAddress2 ?? "",
    personalContact: e.personalContact ?? "",
    alternateNo1: e.alternateNo1 ?? "",
    alternateNo2: e.alternateNo2 ?? "",

    dob: dateStr(e.dob),
    dateOfJoining: dateStr(e.dateOfJoining),
    dateOfLeaving: dateStr(e.dateOfLeaving),
    nativePlace: e.nativePlace ?? "",
    country: e.country ?? "",
    permanentAddress: e.permanentAddress ?? "",
    currentAddress: e.currentAddress ?? "",

    shiftType: e.shiftType ?? "",
    inTime: e.inTime ?? "",
    outTime: e.outTime ?? "",

    totalSalary: numStr(e.totalSalary),
    givenSalary: numStr(e.givenSalary),
    bonusAmount: numStr(e.bonusAmount),
    nightAllowance: numStr(e.nightAllowance),
    overTime: numStr(e.overTime),
    oneHourExtra: numStr(e.oneHourExtra),
    incrementMonth: e.incrementMonth != null ? String(e.incrementMonth) : "",
    yearsOfAgreement: e.yearsOfAgreement != null ? String(e.yearsOfAgreement) : "",
    bonusAfterYears: e.bonusAfterYears != null ? String(e.bonusAfterYears) : "",

    bankName: e.bankName ?? "",
    bankAccountNo: e.bankAccountNo ?? "",
    ifscCode: e.ifscCode ?? "",
    aadharCardNo: e.aadharCardNo ?? "",

    companySimIssue: !!e.companySimIssue,
  };
}

export function toApiPayload(values: EmployeeFormValues): Record<string, any> {
  const trimOrNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    employeeName: values.employeeName.trim(),
    gender: values.gender,
    status: values.status,
    department: trimOrNull(values.department),
    designation: trimOrNull(values.designation),
    companyName: trimOrNull(values.companyName),
    employeeEngagementTeamName: trimOrNull(values.employeeEngagementTeamName),

    emailAddress1: trimOrNull(values.emailAddress1),
    emailAddress2: trimOrNull(values.emailAddress2),
    personalContact: trimOrNull(values.personalContact),
    alternateNo1: trimOrNull(values.alternateNo1),
    alternateNo2: trimOrNull(values.alternateNo2),

    dob: values.dob || null,
    dateOfJoining: values.dateOfJoining || null,
    dateOfLeaving: values.dateOfLeaving || null,
    nativePlace: trimOrNull(values.nativePlace),
    country: trimOrNull(values.country),
    permanentAddress: trimOrNull(values.permanentAddress),
    currentAddress: trimOrNull(values.currentAddress),

    shiftType: trimOrNull(values.shiftType),
    inTime: trimOrNull(values.inTime),
    outTime: trimOrNull(values.outTime),

    totalSalary: values.totalSalary,
    givenSalary: values.givenSalary,
    bonusAmount: values.bonusAmount,
    nightAllowance: values.nightAllowance,
    overTime: values.overTime,
    oneHourExtra: values.oneHourExtra,
    incrementMonth: values.incrementMonth,
    yearsOfAgreement: values.yearsOfAgreement,
    bonusAfterYears: values.bonusAfterYears,

    bankName: trimOrNull(values.bankName),
    bankAccountNo: trimOrNull(values.bankAccountNo),
    ifscCode: trimOrNull(values.ifscCode),
    aadharCardNo: trimOrNull(values.aadharCardNo),

    companySimIssue: values.companySimIssue,
  };
}

export interface EmployeeFormProps {
  initial?: EmployeeDetail | null;
  onSubmit: (payload: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  submitLabel?: string;
}

export function EmployeeForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
}: EmployeeFormProps) {
  const [values, setValues] = useState<EmployeeFormValues>(() =>
    initial ? fromEmployee(initial) : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setValues(fromEmployee(initial));
  }, [initial]);

  const set = <K extends keyof EmployeeFormValues>(
    k: K,
    v: EmployeeFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.employeeName.trim()) return setError("Employee name is required");
    if (
      values.emailAddress1 &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.emailAddress1)
    )
      return setError("Primary email is not a valid address");
    if (
      values.totalSalary !== "" &&
      Number(values.totalSalary) < 0
    )
      return setError("Total salary must be a non-negative number");

    await onSubmit(toApiPayload(values));
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *" className="sm:col-span-2">
            <Input
              value={values.employeeName}
              onChange={(e) => set("employeeName", e.target.value)}
              placeholder="e.g. Ananya Sharma"
            />
          </Field>
          <Field label="Gender">
            <Select
              value={values.gender}
              onValueChange={(v) =>
                set("gender", v as EmployeeFormValues["gender"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={values.status}
              onValueChange={(v) =>
                set("status", v as EmployeeFormValues["status"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="ON_LEAVE">On leave</SelectItem>
                <SelectItem value="TERMINATED">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date of birth">
            <Input
              type="date"
              value={values.dob}
              onChange={(e) => set("dob", e.target.value)}
            />
          </Field>
          <Field label="Native place">
            <Input
              value={values.nativePlace}
              onChange={(e) => set("nativePlace", e.target.value)}
            />
          </Field>
          <Field label="Country">
            <Input
              value={values.country}
              onChange={(e) => set("country", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Role */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role & organization</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Department">
            <Input
              value={values.department}
              onChange={(e) => set("department", e.target.value)}
              placeholder="e.g. Engineering"
            />
          </Field>
          <Field label="Designation">
            <Input
              value={values.designation}
              onChange={(e) => set("designation", e.target.value)}
              placeholder="e.g. Senior Software Engineer"
            />
          </Field>
          <Field label="Company">
            <Input
              value={values.companyName}
              onChange={(e) => set("companyName", e.target.value)}
            />
          </Field>
          <Field label="Engagement team">
            <Input
              value={values.employeeEngagementTeamName}
              onChange={(e) =>
                set("employeeEngagementTeamName", e.target.value)
              }
            />
          </Field>
          <Field label="Date of joining">
            <Input
              type="date"
              value={values.dateOfJoining}
              onChange={(e) => set("dateOfJoining", e.target.value)}
            />
          </Field>
          <Field label="Date of leaving">
            <Input
              type="date"
              value={values.dateOfLeaving}
              onChange={(e) => set("dateOfLeaving", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary email">
            <Input
              type="email"
              value={values.emailAddress1}
              onChange={(e) => set("emailAddress1", e.target.value)}
              placeholder="user@company.com"
            />
          </Field>
          <Field label="Secondary email">
            <Input
              type="email"
              value={values.emailAddress2}
              onChange={(e) => set("emailAddress2", e.target.value)}
            />
          </Field>
          <Field label="Personal contact">
            <Input
              value={values.personalContact}
              onChange={(e) => set("personalContact", e.target.value)}
              placeholder="+91 98xxxxxxxx"
            />
          </Field>
          <Field label="Alternate no. 1">
            <Input
              value={values.alternateNo1}
              onChange={(e) => set("alternateNo1", e.target.value)}
            />
          </Field>
          <Field label="Alternate no. 2">
            <Input
              value={values.alternateNo2}
              onChange={(e) => set("alternateNo2", e.target.value)}
            />
          </Field>
          <Field label="Permanent address" className="sm:col-span-2">
            <Textarea
              value={values.permanentAddress}
              onChange={(e) => set("permanentAddress", e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="Current address" className="sm:col-span-2">
            <Textarea
              value={values.currentAddress}
              onChange={(e) => set("currentAddress", e.target.value)}
              rows={2}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Shift */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shift</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Shift type">
            <Input
              value={values.shiftType}
              onChange={(e) => set("shiftType", e.target.value)}
              placeholder="e.g. General, Night"
            />
          </Field>
          <Field label="In time">
            <Input
              value={values.inTime}
              onChange={(e) => set("inTime", e.target.value)}
              placeholder="09:30"
            />
          </Field>
          <Field label="Out time">
            <Input
              value={values.outTime}
              onChange={(e) => set("outTime", e.target.value)}
              placeholder="18:30"
            />
          </Field>
        </CardContent>
      </Card>

      {/* Compensation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compensation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Total salary (CTC)">
            <Input
              type="number"
              inputMode="decimal"
              value={values.totalSalary}
              onChange={(e) => set("totalSalary", e.target.value)}
            />
          </Field>
          <Field label="Take-home (given salary)">
            <Input
              type="number"
              inputMode="decimal"
              value={values.givenSalary}
              onChange={(e) => set("givenSalary", e.target.value)}
            />
          </Field>
          <Field label="Bonus amount">
            <Input
              type="number"
              inputMode="decimal"
              value={values.bonusAmount}
              onChange={(e) => set("bonusAmount", e.target.value)}
            />
          </Field>
          <Field label="Night allowance">
            <Input
              type="number"
              inputMode="decimal"
              value={values.nightAllowance}
              onChange={(e) => set("nightAllowance", e.target.value)}
            />
          </Field>
          <Field label="Overtime rate">
            <Input
              type="number"
              inputMode="decimal"
              value={values.overTime}
              onChange={(e) => set("overTime", e.target.value)}
            />
          </Field>
          <Field label="One-hour extra">
            <Input
              type="number"
              inputMode="decimal"
              value={values.oneHourExtra}
              onChange={(e) => set("oneHourExtra", e.target.value)}
            />
          </Field>
          <Field label="Increment month (1–12)">
            <Input
              type="number"
              min={1}
              max={12}
              value={values.incrementMonth}
              onChange={(e) => set("incrementMonth", e.target.value)}
            />
          </Field>
          <Field label="Years of agreement">
            <Input
              type="number"
              value={values.yearsOfAgreement}
              onChange={(e) => set("yearsOfAgreement", e.target.value)}
            />
          </Field>
          <Field label="Bonus after years">
            <Input
              type="number"
              value={values.bonusAfterYears}
              onChange={(e) => set("bonusAfterYears", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Bank & ID */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bank & identification</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Bank name">
            <Input
              value={values.bankName}
              onChange={(e) => set("bankName", e.target.value)}
            />
          </Field>
          <Field label="Account number">
            <Input
              value={values.bankAccountNo}
              onChange={(e) => set("bankAccountNo", e.target.value)}
            />
          </Field>
          <Field label="IFSC code">
            <Input
              value={values.ifscCode}
              onChange={(e) => set("ifscCode", e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Aadhaar number">
            <Input
              value={values.aadharCardNo}
              onChange={(e) => set("aadharCardNo", e.target.value)}
            />
          </Field>
          <Field label="Company SIM issued" className="sm:col-span-2">
            <div className="flex items-center gap-3 pt-1">
              <Switch
                checked={values.companySimIssue}
                onCheckedChange={(c) => set("companySimIssue", c)}
              />
              <span className="text-sm text-muted-foreground">
                {values.companySimIssue ? "Yes — SIM issued" : "No"}
              </span>
            </div>
          </Field>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-2">
        <Button asChild type="button" variant="link" className="px-0 self-start">
          <Link href={customizeHref} className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Customize form — add custom fields in builder
          </Link>
        </Button>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : submitLabel ?? "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
