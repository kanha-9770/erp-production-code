"use client";

/**
 * Shared Job Opening form, used by the in-page create sheet on
 * /job-opening (and the future edit page).
 *
 * Live job postings are usually spawned from a StaffingPlan — when one is
 * picked the static fields (profile, company, department, designation, type,
 * vacancies) auto-fill from the plan but stay editable so HR can override
 * anything before publishing.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings2, Globe } from "lucide-react";
import { EMPLOYMENT_TYPE_OPTIONS } from "@/components/staffing-plan/staffing-plan-form";
import type { EmploymentType, StaffingPlan } from "@/lib/api/staffing-plans";
import type { JobOpening, JobOpeningStatus } from "@/lib/api/job-openings";

const JOB_OPENING_BUILDER_FORM_ID = "";

const customizeHref = JOB_OPENING_BUILDER_FORM_ID
  ? `/builder/${JOB_OPENING_BUILDER_FORM_ID}`
  : "/forms";

const NONE = "__none__";

export const STATUS_OPTIONS: Array<{
  value: JobOpeningStatus;
  label: string;
}> = [
  { value: "DRAFT", label: "Draft" },
  { value: "OPEN", label: "Open" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export interface JobOpeningFormValues {
  staffingPlanId: string;
  profileName: string;
  company: string;
  department: string;
  designation: string;
  employmentType: EmploymentType;
  vacancies: string;
  status: JobOpeningStatus;
  publishOnWebsite: boolean;
  salaryApprox: string;
  jobDescription: string;
}

const EMPTY: JobOpeningFormValues = {
  staffingPlanId: "",
  profileName: "",
  company: "",
  department: "",
  designation: "",
  employmentType: "FULL_TIME",
  vacancies: "1",
  status: "OPEN",
  publishOnWebsite: false,
  salaryApprox: "",
  jobDescription: "",
};

export function fromOpening(o: JobOpening): JobOpeningFormValues {
  return {
    staffingPlanId: o.staffingPlanId ?? "",
    profileName: o.profileName ?? "",
    company: o.company ?? "",
    department: o.department ?? "",
    designation: o.designation ?? "",
    employmentType: (o.employmentType ?? "FULL_TIME") as EmploymentType,
    vacancies: o.vacancies != null ? String(o.vacancies) : "1",
    status: (o.status ?? "OPEN") as JobOpeningStatus,
    publishOnWebsite: !!o.publishOnWebsite,
    salaryApprox: o.salaryApprox ?? "",
    jobDescription: o.jobDescription ?? "",
  };
}

export function toApiPayload(v: JobOpeningFormValues): Record<string, any> {
  return {
    staffingPlanId: v.staffingPlanId || null,
    profileName: v.profileName.trim(),
    company: v.company.trim(),
    department: v.department.trim(),
    designation: v.designation.trim(),
    employmentType: v.employmentType,
    vacancies: v.vacancies,
    status: v.status,
    publishOnWebsite: v.publishOnWebsite,
    salaryApprox: v.salaryApprox.trim() || null,
    jobDescription: v.jobDescription.trim(),
  };
}

export interface JobOpeningFormProps {
  initial?: JobOpening | null;
  onSubmit: (payload: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  submitLabel?: string;
  /** Active staffing plans to pick from. The select pre-fills role fields. */
  staffingPlans?: StaffingPlan[];
}

export function JobOpeningForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  staffingPlans = [],
}: JobOpeningFormProps) {
  const [values, setValues] = useState<JobOpeningFormValues>(() =>
    initial ? fromOpening(initial) : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setValues(fromOpening(initial));
  }, [initial]);

  const set = <K extends keyof JobOpeningFormValues>(
    k: K,
    v: JobOpeningFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  // Picking a staffing plan auto-fills role fields. We replace the values
  // wholesale (instead of merging) so a freshly picked plan can't leak old
  // mismatched fields, but jobDescription / salary / publish remain whatever
  // the user typed since the plan doesn't carry those.
  const onPickPlan = (planId: string) => {
    if (planId === NONE) {
      set("staffingPlanId", "");
      return;
    }
    const plan = staffingPlans.find((p) => p.id === planId);
    if (!plan) {
      set("staffingPlanId", planId);
      return;
    }
    setValues((prev) => ({
      ...prev,
      staffingPlanId: plan.id,
      profileName: plan.profileName,
      department: plan.department,
      designation: plan.designation,
      employmentType: plan.employmentType,
      vacancies: String(plan.vacancies ?? 1),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.profileName.trim()) return setError("Profile Name is required");
    if (!values.company.trim()) return setError("Company is required");
    if (!values.department.trim()) return setError("Department is required");
    if (!values.designation.trim()) return setError("Designation is required");
    if (!values.jobDescription.trim())
      return setError("Job Description is required");
    const vac = parseInt(values.vacancies, 10);
    if (!Number.isFinite(vac) || vac < 1)
      return setError("Number of Vacancies must be at least 1");

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
              Job Opening
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Live job posting details
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Job Opening ID">
            <Input
              value="# will be generated on submit"
              disabled
              className="text-muted-foreground italic"
            />
          </Field>
          <Field
            label="Staffing Plan"
            hint={
              staffingPlans.length === 0
                ? "No staffing plans yet — fields below stay manual."
                : "Pick a plan to auto-fill the role fields."
            }
          >
            <Select
              value={values.staffingPlanId || NONE}
              onValueChange={onPickPlan}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  <span className="text-muted-foreground">
                    None — fill manually
                  </span>
                </SelectItem>
                {staffingPlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.profileName}
                    {p.planCode ? ` · ${p.planCode}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Profile Name *">
            <Input
              value={values.profileName}
              onChange={(e) => set("profileName", e.target.value)}
              placeholder="e.g. Senior Developer"
            />
          </Field>
          <Field label="Department *">
            <Input
              value={values.department}
              onChange={(e) => set("department", e.target.value)}
              placeholder="e.g. Engineering"
            />
          </Field>

          <Field label="Company *">
            <Input
              value={values.company}
              onChange={(e) => set("company", e.target.value)}
            />
          </Field>
          <Field label="No. of Vacancies *">
            <Input
              type="number"
              min={1}
              step={1}
              value={values.vacancies}
              onChange={(e) => set("vacancies", e.target.value)}
            />
          </Field>

          <Field label="Employment Type *">
            <Select
              value={values.employmentType}
              onValueChange={(v) => set("employmentType", v as EmploymentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Designation *">
            <Input
              value={values.designation}
              onChange={(e) => set("designation", e.target.value)}
              placeholder="Job title"
            />
          </Field>

          <Field label="Status *">
            <Select
              value={values.status}
              onValueChange={(v) => set("status", v as JobOpeningStatus)}
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
          <Field label="Make visible on public career page">
            <label className="inline-flex items-center gap-2 h-10 cursor-pointer select-none">
              <Checkbox
                checked={values.publishOnWebsite}
                onCheckedChange={(c) =>
                  set("publishOnWebsite", c === true)
                }
              />
              <span className="inline-flex items-center gap-1.5 text-sm">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                Publish on Website
              </span>
            </label>
          </Field>

          <Field label="Salary Approx">
            <Input
              value={values.salaryApprox}
              onChange={(e) => set("salaryApprox", e.target.value)}
              placeholder="e.g. 10–15 LPA"
            />
          </Field>
          <div className="hidden sm:block" />

          <Field label="Job Description *" className="sm:col-span-2">
            <Textarea
              value={values.jobDescription}
              onChange={(e) => set("jobDescription", e.target.value)}
              rows={5}
              placeholder="Responsibilities and requirements"
            />
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
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
