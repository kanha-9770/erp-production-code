"use client";

/**
 * Shared Staffing Plan form, used by /hr/recruitment/staffing-plan create + edit sheets.
 * Pure client component — the page wires the create-or-update mutation and
 * handles navigation.
 *
 * The screenshot lists nine static fields; the "Customize form" link at the
 * bottom routes users to the form builder when they need additional fields
 * beyond the static set. Set STAFFING_BUILDER_FORM_ID once you know it.
 */

import { useEffect, useMemo, useState } from "react";
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
import { Settings2, Calculator } from "lucide-react";
import type {
  EmploymentType,
  StaffingPlan,
  StaffingPlanStatus,
} from "@/lib/api/staffing-plans";

const STAFFING_BUILDER_FORM_ID = "";

const customizeHref = STAFFING_BUILDER_FORM_ID
  ? `/builder/${STAFFING_BUILDER_FORM_ID}`
  : "/forms";

export const EMPLOYMENT_TYPE_OPTIONS: Array<{
  value: EmploymentType;
  label: string;
}> = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
  { value: "TEMPORARY", label: "Temporary" },
  { value: "CONSULTANT", label: "Consultant" },
];

export const STATUS_OPTIONS: Array<{
  value: StaffingPlanStatus;
  label: string;
}> = [
  { value: "DRAFT", label: "Draft" },
  { value: "OPEN", label: "Open" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "FILLED", label: "Filled" },
  { value: "CANCELLED", label: "Cancelled" },
];

export interface StaffingPlanFormValues {
  profileName: string;
  department: string;
  designation: string;
  employmentType: EmploymentType;
  vacancies: string;
  estimatedCostPerPerson: string;
  status: StaffingPlanStatus;
  notes: string;
}

const EMPTY: StaffingPlanFormValues = {
  profileName: "",
  department: "",
  designation: "",
  employmentType: "FULL_TIME",
  vacancies: "1",
  estimatedCostPerPerson: "",
  status: "DRAFT",
  notes: "",
};

export function fromPlan(p: StaffingPlan): StaffingPlanFormValues {
  const numStr = (v: string | number | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  return {
    profileName: p.profileName ?? "",
    department: p.department ?? "",
    designation: p.designation ?? "",
    employmentType: (p.employmentType ?? "FULL_TIME") as EmploymentType,
    vacancies: p.vacancies != null ? String(p.vacancies) : "1",
    estimatedCostPerPerson: numStr(p.estimatedCostPerPerson),
    status: (p.status ?? "DRAFT") as StaffingPlanStatus,
    notes: p.notes ?? "",
  };
}

export function toApiPayload(v: StaffingPlanFormValues): Record<string, any> {
  return {
    profileName: v.profileName.trim(),
    department: v.department.trim(),
    designation: v.designation.trim(),
    employmentType: v.employmentType,
    vacancies: v.vacancies,
    estimatedCostPerPerson: v.estimatedCostPerPerson,
    status: v.status,
    notes: v.notes.trim() || null,
  };
}

export interface StaffingPlanFormProps {
  initial?: StaffingPlan | null;
  onSubmit: (payload: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  submitLabel?: string;
  /**
   * Optional department list to populate the dropdown — typically the union
   * of departments already in use on existing employees, so HR keeps using a
   * consistent vocabulary. The user can still type a new value with the
   * "Other" entry which switches the field to free-text.
   */
  departmentOptions?: string[];
}

export function StaffingPlanForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  departmentOptions,
}: StaffingPlanFormProps) {
  const [values, setValues] = useState<StaffingPlanFormValues>(() =>
    initial ? fromPlan(initial) : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [deptMode, setDeptMode] = useState<"select" | "custom">(() => {
    if (!initial) return "select";
    if (!departmentOptions || departmentOptions.length === 0) return "custom";
    return departmentOptions.includes(initial.department) ? "select" : "custom";
  });

  useEffect(() => {
    if (initial) setValues(fromPlan(initial));
  }, [initial]);

  const set = <K extends keyof StaffingPlanFormValues>(
    k: K,
    v: StaffingPlanFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  // Live preview of the total — matches what the server computes on save.
  const totalPreview = useMemo(() => {
    const vac = parseFloat(values.vacancies);
    const cpp = parseFloat(values.estimatedCostPerPerson);
    if (!Number.isFinite(vac) || !Number.isFinite(cpp)) return null;
    return vac * cpp;
  }, [values.vacancies, values.estimatedCostPerPerson]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.profileName.trim()) return setError("Profile Name is required");
    if (!values.department.trim()) return setError("Department is required");
    if (!values.designation.trim()) return setError("Designation is required");
    if (!values.employmentType) return setError("Employment Type is required");
    const vac = parseInt(values.vacancies, 10);
    if (!Number.isFinite(vac) || vac < 1)
      return setError("Number of Vacancies must be at least 1");
    if (
      values.estimatedCostPerPerson !== "" &&
      Number(values.estimatedCostPerPerson) < 0
    )
      return setError("Estimated Cost Per Person cannot be negative");

    await onSubmit(toApiPayload(values));
  };

  const showDeptSelect =
    deptMode === "select" && departmentOptions && departmentOptions.length > 0;

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <span className="inline-flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">
                1
              </span>
              Staffing Plan
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Role, vacancies and cost estimation
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="New Staffing Plan ID">
            <Input
              value="# will be generated on submit"
              disabled
              className="text-muted-foreground italic"
            />
          </Field>
          <Field label="Profile Name *">
            <Input
              value={values.profileName}
              onChange={(e) => set("profileName", e.target.value)}
              placeholder="e.g. Senior Developer"
            />
          </Field>

          <Field label="Department *">
            {showDeptSelect ? (
              <div className="flex gap-1">
                <Select
                  value={values.department || ""}
                  onValueChange={(v) => {
                    if (v === "__custom__") {
                      setDeptMode("custom");
                      set("department", "");
                      return;
                    }
                    set("department", v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentOptions!.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">
                      <span className="text-muted-foreground">
                        + Add new department…
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex gap-1">
                <Input
                  value={values.department}
                  onChange={(e) => set("department", e.target.value)}
                  placeholder="e.g. Engineering"
                />
                {departmentOptions && departmentOptions.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDeptMode("select")}
                  >
                    Pick existing
                  </Button>
                )}
              </div>
            )}
          </Field>

          <Field label="Designation *">
            <Input
              value={values.designation}
              onChange={(e) => set("designation", e.target.value)}
              placeholder="Job title"
            />
          </Field>
          <Field label="Employment Type *">
            <Select
              value={values.employmentType}
              onValueChange={(v) =>
                set("employmentType", v as EmploymentType)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
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

          <Field label="No. of Vacancies *">
            <Input
              type="number"
              min={1}
              step={1}
              value={values.vacancies}
              onChange={(e) => set("vacancies", e.target.value)}
            />
          </Field>
          <Field label="Estimated Cost Per Person">
            <Input
              type="number"
              inputMode="decimal"
              value={values.estimatedCostPerPerson}
              onChange={(e) =>
                set("estimatedCostPerPerson", e.target.value)
              }
              placeholder="Annual"
            />
          </Field>

          <Field label="Total Estimated Cost" className="sm:col-span-2">
            <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-semibold tabular-nums text-base">
                {totalPreview != null
                  ? new Intl.NumberFormat("en-IN", {
                      maximumFractionDigits: 0,
                    }).format(totalPreview)
                  : "0.00"}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                Auto · Vacancies × Cost Per Person
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {"{No. of Vacancies}"} × {"{Estimated Cost Per Person}"}
            </p>
          </Field>

          <Field label="Status">
            <Select
              value={values.status}
              onValueChange={(v) =>
                set("status", v as StaffingPlanStatus)
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
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder="Hiring rationale, headcount source, approver name…"
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
