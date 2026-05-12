"use client";

/**
 * Shared Employee Referral form, used by the in-page create sheet on
 * /employee-referral.
 *
 * Two halves:
 *   Top    — referred candidate (name/email/phone/resume/designation)
 *   Bottom — referring employee (lookup from Employee Master; auto-fills
 *            the first-name + department snapshot)
 *
 * Picking an Employee from the dropdown pre-fills first name + department
 * but leaves the fields editable so HR can correct them if Employee Master
 * is stale.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings2, Upload, FileText, X } from "lucide-react";
import { useUploadFileMutation } from "@/lib/api/upload";
import type { EmployeeListItem } from "@/lib/api/employees";
import type {
  EmployeeReferral,
  EmployeeReferralStatus,
} from "@/lib/api/employee-referrals";

const EMPLOYEE_REFERRAL_BUILDER_FORM_ID = "";

const customizeHref = EMPLOYEE_REFERRAL_BUILDER_FORM_ID
  ? `/builder/${EMPLOYEE_REFERRAL_BUILDER_FORM_ID}`
  : "/forms";

const NONE = "__none__";

export const STATUS_OPTIONS: Array<{
  value: EmployeeReferralStatus;
  label: string;
}> = [
  { value: "NEW", label: "New" },
  { value: "REVIEWED", label: "Reviewed" },
  { value: "INTERVIEWING", label: "Interviewing" },
  { value: "HIRED", label: "Hired" },
  { value: "REJECTED", label: "Rejected" },
];

export interface EmployeeReferralFormValues {
  referralCode: string;
  applicantName: string;
  applicantEmail: string;
  applicantMobile: string;
  applicantResumeUrl: string;
  applicantResumeName: string;

  referralDate: string;
  designation: string;

  referringEmployeeId: string;
  referrerFirstName: string;
  referrerDepartment: string;

  remark: string;
  status: EmployeeReferralStatus;
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY: EmployeeReferralFormValues = {
  referralCode: "",
  applicantName: "",
  applicantEmail: "",
  applicantMobile: "",
  applicantResumeUrl: "",
  applicantResumeName: "",
  referralDate: today(),
  designation: "",
  referringEmployeeId: "",
  referrerFirstName: "",
  referrerDepartment: "",
  remark: "",
  status: "NEW",
};

export function fromReferral(r: EmployeeReferral): EmployeeReferralFormValues {
  return {
    referralCode: r.referralCode ?? "",
    applicantName: r.applicantName ?? "",
    applicantEmail: r.applicantEmail ?? "",
    applicantMobile: r.applicantMobile ?? "",
    applicantResumeUrl: r.applicantResumeUrl ?? "",
    applicantResumeName: r.applicantResumeName ?? "",
    referralDate: r.referralDate ? r.referralDate.slice(0, 10) : today(),
    designation: r.designation ?? "",
    referringEmployeeId: r.referringEmployeeId ?? "",
    referrerFirstName: r.referrerFirstName ?? "",
    referrerDepartment: r.referrerDepartment ?? "",
    remark: r.remark ?? "",
    status: (r.status ?? "NEW") as EmployeeReferralStatus,
  };
}

export function toApiPayload(
  v: EmployeeReferralFormValues,
): Record<string, any> {
  return {
    referralCode: v.referralCode.trim() || null,
    applicantName: v.applicantName.trim(),
    applicantEmail: v.applicantEmail.trim(),
    applicantMobile: v.applicantMobile.trim(),
    applicantResumeUrl: v.applicantResumeUrl.trim() || null,
    applicantResumeName: v.applicantResumeName.trim() || null,
    referralDate: v.referralDate || null,
    designation: v.designation.trim() || null,
    referringEmployeeId: v.referringEmployeeId,
    referrerFirstName: v.referrerFirstName.trim(),
    referrerDepartment: v.referrerDepartment.trim() || null,
    remark: v.remark.trim() || null,
    status: v.status,
  };
}

export interface EmployeeReferralFormProps {
  initial?: EmployeeReferral | null;
  onSubmit: (payload: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  submitLabel?: string;
  /** Employees that can be picked as the referrer. */
  employees?: EmployeeListItem[];
}

export function EmployeeReferralForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  employees = [],
}: EmployeeReferralFormProps) {
  const [values, setValues] = useState<EmployeeReferralFormValues>(() =>
    initial ? fromReferral(initial) : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, { isLoading: uploading }] = useUploadFileMutation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initial) setValues(fromReferral(initial));
  }, [initial]);

  const set = <K extends keyof EmployeeReferralFormValues>(
    k: K,
    v: EmployeeReferralFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      const d = (e.department ?? "").trim();
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  // Pick the referring employee — auto-fill first name + department. We
  // split the stored employeeName into first/rest words rather than asking
  // Employee Master for a separate first_name field that may not exist.
  const pickEmployee = (id: string) => {
    if (id === NONE) {
      set("referringEmployeeId", "");
      return;
    }
    const emp = employees.find((e) => e.id === id);
    if (!emp) {
      set("referringEmployeeId", id);
      return;
    }
    const firstName = (emp.employeeName || "").trim().split(/\s+/)[0] || "";
    setValues((prev) => ({
      ...prev,
      referringEmployeeId: emp.id,
      referrerFirstName: prev.referrerFirstName.trim()
        ? prev.referrerFirstName
        : firstName,
      referrerDepartment: prev.referrerDepartment.trim()
        ? prev.referrerDepartment
        : emp.department ?? "",
    }));
  };

  const onResumeFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await uploadFile(fd).unwrap();
      if (!res.success || !res.imageUrl) {
        throw new Error(res.error || "Upload failed");
      }
      setValues((prev) => ({
        ...prev,
        applicantResumeUrl: res.imageUrl!,
        applicantResumeName: file.name,
      }));
    } catch (err: any) {
      setError(err?.message || "Resume upload failed");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearResume = () => {
    setValues((prev) => ({
      ...prev,
      applicantResumeUrl: "",
      applicantResumeName: "",
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.applicantName.trim())
      return setError("Applicant Name is required");
    if (!values.applicantEmail.trim())
      return setError("Applicant Email ID is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.applicantEmail))
      return setError("Applicant Email is not a valid address");
    if (!values.applicantMobile.trim())
      return setError("Applicant Mobile No. is required");
    if (!values.referralDate) return setError("Referral Date is required");
    if (!values.referringEmployeeId)
      return setError("Employee ID (referring employee) is required");
    if (!values.referrerFirstName.trim())
      return setError("Referrer First Name is required");

    await onSubmit(toApiPayload(values));
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <span className="inline-flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">
                1
              </span>
              Referral
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Referred candidate and referrer
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Referral ID *" hint="Auto-generated">
            <Input
              value={values.referralCode}
              onChange={(e) => set("referralCode", e.target.value)}
              placeholder="e.g. ER-0001"
            />
          </Field>
          <Field label="Applicant Name *">
            <Input
              value={values.applicantName}
              onChange={(e) => set("applicantName", e.target.value)}
              placeholder="Full name"
            />
          </Field>

          <Field label="Applicant Email ID *">
            <Input
              type="email"
              value={values.applicantEmail}
              onChange={(e) => set("applicantEmail", e.target.value)}
            />
          </Field>
          <Field label="Applicant Mobile No. *">
            <Input
              value={values.applicantMobile}
              onChange={(e) => set("applicantMobile", e.target.value)}
            />
          </Field>

          <Field label="Referral Date *">
            <Input
              type="date"
              value={values.referralDate}
              onChange={(e) => set("referralDate", e.target.value)}
            />
          </Field>
          <Field label="Resume">
            <div className="space-y-2">
              {values.applicantResumeUrl ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-muted/30">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a
                    href={values.applicantResumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-primary hover:underline flex-1"
                  >
                    {values.applicantResumeName ||
                      values.applicantResumeUrl.split("/").pop() ||
                      "Resume"}
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={clearResume}
                    className="h-7 w-7 shrink-0"
                    aria-label="Remove resume"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={onResumeFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {uploading ? "Uploading…" : "Choose files…"}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    PDF / DOC
                  </span>
                </div>
              )}
            </div>
          </Field>

          <Field label="Designation">
            <Input
              value={values.designation}
              onChange={(e) => set("designation", e.target.value)}
              placeholder="Applied position"
            />
          </Field>
          <Field
            label="Employee ID *"
            hint="Referring employee (lookup from Employee Master)"
          >
            <Select
              value={values.referringEmployeeId || NONE}
              onValueChange={pickEmployee}
            >
              <SelectTrigger>
                <SelectValue placeholder="Referring employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  <span className="text-muted-foreground">
                    Referring employee
                  </span>
                </SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.employeeName}
                    {emp.department ? ` · ${emp.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="First Name *">
            <Input
              value={values.referrerFirstName}
              onChange={(e) => set("referrerFirstName", e.target.value)}
              placeholder="Referrer first name"
            />
          </Field>
          <Field label="Department">
            {departmentOptions.length > 0 ? (
              <Select
                value={values.referrerDepartment || NONE}
                onValueChange={(v) =>
                  set("referrerDepartment", v === NONE ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Referrer department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>
                    <span className="text-muted-foreground">
                      Referrer department
                    </span>
                  </SelectItem>
                  {departmentOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={values.referrerDepartment}
                onChange={(e) => set("referrerDepartment", e.target.value)}
                placeholder="Referrer department"
              />
            )}
          </Field>

          <Field label="Remark" className="sm:col-span-2">
            <Textarea
              value={values.remark}
              onChange={(e) => set("remark", e.target.value)}
              rows={3}
              placeholder="Referrer remark"
            />
          </Field>

          <Field label="Status">
            <Select
              value={values.status}
              onValueChange={(v) =>
                set("status", v as EmployeeReferralStatus)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="hidden sm:block" />
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
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {hint && <p className="text-[11px] text-muted-foreground -mt-0.5">{hint}</p>}
      {children}
    </div>
  );
}
