"use client";

/**
 * Shared Job Offer form, used by the in-page create sheet on /job-offer.
 *
 * The screenshot has two side-by-side selects ("Applicant Name" linked to
 * a staffing plan / "Job Application ID" linked to an opening). Both pick
 * the same underlying JobApplication — picking either updates the other so
 * the user can search by whichever they remember.
 *
 * Picking an application auto-fills the applicant snapshot and shows the
 * derived staffing-plan / opening hints below the selects.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Settings2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { JobApplication } from "@/lib/api/job-applications";
import type { JobOffer, JobOfferStatus } from "@/lib/api/job-offers";
import {
  useCustomFormFields,
  type CustomFieldValues,
} from "@/lib/forms/use-custom-form-fields";
import { CustomFieldsRenderer } from "@/components/forms/custom-fields-renderer";

async function ensureJobOfferBuilderHref(): Promise<{ href: string; created: boolean }> {
  const res = await fetch("/api/forms/ensure-job-offer-form", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success || !json?.formId) {
    throw new Error(json?.error ?? `Failed to open form builder (${res.status})`);
  }
  return { href: `/builder/${json.formId}`, created: !!json.created };
}

const NONE = "__none__";

export const STATUS_OPTIONS: Array<{
  value: JobOfferStatus;
  label: string;
}> = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "EXPIRED", label: "Expired" },
];

export interface JobOfferFormValues {
  jobApplicationId: string;
  applicantName: string;
  applicantEmail: string;
  offerDate: string;
  status: JobOfferStatus;
  jobOfferTerm: string;
  valueDescription: string;
  termsAndConditions: string;
  customFields: CustomFieldValues;
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY: JobOfferFormValues = {
  jobApplicationId: "",
  applicantName: "",
  applicantEmail: "",
  offerDate: today(),
  status: "DRAFT",
  jobOfferTerm: "",
  valueDescription: "",
  termsAndConditions: "",
  customFields: {},
};

export function fromOffer(o: JobOffer): JobOfferFormValues {
  return {
    jobApplicationId: o.jobApplicationId ?? "",
    applicantName: o.applicantName ?? "",
    applicantEmail: o.applicantEmail ?? "",
    offerDate: o.offerDate ? o.offerDate.slice(0, 10) : today(),
    status: (o.status ?? "DRAFT") as JobOfferStatus,
    jobOfferTerm: o.jobOfferTerm ?? "",
    valueDescription: o.valueDescription ?? "",
    termsAndConditions: o.termsAndConditions ?? "",
    customFields: ((o as any).customFields as CustomFieldValues) ?? {},
  };
}

export function toApiPayload(v: JobOfferFormValues): Record<string, any> {
  return {
    jobApplicationId: v.jobApplicationId || null,
    applicantName: v.applicantName.trim(),
    applicantEmail: v.applicantEmail.trim() || null,
    offerDate: v.offerDate || null,
    status: v.status,
    jobOfferTerm: v.jobOfferTerm.trim() || null,
    valueDescription: v.valueDescription.trim() || null,
    termsAndConditions: v.termsAndConditions.trim() || null,
    customFields: v.customFields ?? {},
  };
}

export interface JobOfferFormProps {
  initial?: JobOffer | null;
  onSubmit: (payload: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  submitLabel?: string;
  /** Applications available to extend an offer to. */
  jobApplications?: JobApplication[];
}

export function JobOfferForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  jobApplications = [],
}: JobOfferFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [openingBuilder, setOpeningBuilder] = useState(false);
  const [values, setValues] = useState<JobOfferFormValues>(() =>
    initial ? fromOffer(initial) : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);

  const { sections: customSections } = useCustomFormFields("jobOffer");
  const setCustomField = (id: string, v: unknown) =>
    setValues((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [id]: v },
    }));

  const openCustomizeBuilder = async () => {
    setOpeningBuilder(true);
    try {
      const { href, created } = await ensureJobOfferBuilderHref();
      if (created) {
        toast({
          title: "Job Offer form created",
          description: "Add or rearrange fields here — they'll appear in the form automatically.",
        });
      }
      router.push(href);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Couldn't open form builder",
        description: err?.message ?? "Unknown error",
      });
      setOpeningBuilder(false);
    }
  };

  useEffect(() => {
    if (initial) setValues(fromOffer(initial));
  }, [initial]);

  const set = <K extends keyof JobOfferFormValues>(
    k: K,
    v: JobOfferFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  const linkedApp = useMemo(
    () =>
      values.jobApplicationId
        ? jobApplications.find((a) => a.id === values.jobApplicationId) ?? null
        : null,
    [values.jobApplicationId, jobApplications],
  );

  // Picking an application — populate the snapshot fields. We don't clobber
  // the applicant fields if the user has already typed something custom; if
  // they want to reset, they can pick "None" first.
  const pickApplication = (id: string) => {
    if (id === NONE) {
      set("jobApplicationId", "");
      return;
    }
    const app = jobApplications.find((a) => a.id === id);
    if (!app) {
      set("jobApplicationId", id);
      return;
    }
    setValues((prev) => ({
      ...prev,
      jobApplicationId: app.id,
      applicantName: prev.applicantName.trim()
        ? prev.applicantName
        : app.applicantName,
      applicantEmail: prev.applicantEmail.trim()
        ? prev.applicantEmail
        : app.applicantEmail,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.applicantName.trim())
      return setError("Applicant Name is required");
    if (!values.offerDate) return setError("Offer Date is required");
    if (
      values.applicantEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.applicantEmail)
    )
      return setError("Applicant Email is not a valid address");
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
              Job Offer
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Offer terms and conditions
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Applicant Name"
            hint={
              linkedApp?.staffingPlan
                ? `Linked staffing plan: ${linkedApp.staffingPlan.profileName}${
                    linkedApp.staffingPlan.planCode
                      ? ` · ${linkedApp.staffingPlan.planCode}`
                      : ""
                  }`
                : "Linked staffing plan"
            }
          >
            <Select
              value={values.jobApplicationId || NONE}
              onValueChange={pickApplication}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  <span className="text-muted-foreground">—</span>
                </SelectItem>
                {jobApplications.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.applicantName}
                    {a.jobOpening?.profileName
                      ? ` · ${a.jobOpening.profileName}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Job Offer ID">
            <Input
              value="# will be generated on submit"
              disabled
              className="text-muted-foreground italic"
            />
          </Field>

          <Field
            label="Job Applicaiton ID *"
            hint={
              linkedApp?.jobOpening
                ? `Linked opening: ${linkedApp.jobOpening.profileName}${
                    linkedApp.jobOpening.jobCode
                      ? ` · ${linkedApp.jobOpening.jobCode}`
                      : ""
                  }`
                : "Linked opening"
            }
          >
            <Select
              value={values.jobApplicationId || NONE}
              onValueChange={pickApplication}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  <span className="text-muted-foreground">—</span>
                </SelectItem>
                {jobApplications.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.applicationCode || a.id.slice(0, 8)}
                    {a.applicantName ? ` · ${a.applicantName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Offer Date *">
            <Input
              type="date"
              value={values.offerDate}
              onChange={(e) => set("offerDate", e.target.value)}
            />
          </Field>

          <Field label="Status *">
            <Select
              value={values.status}
              onValueChange={(v) => set("status", v as JobOfferStatus)}
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
          <Field label="Job Offer Term">
            <Input
              value={values.jobOfferTerm}
              onChange={(e) => set("jobOfferTerm", e.target.value)}
              placeholder="Offer term summary"
            />
          </Field>

          <Field label="Value / Description">
            <Textarea
              value={values.valueDescription}
              onChange={(e) => set("valueDescription", e.target.value)}
              rows={4}
              placeholder="Compensation and description"
            />
          </Field>
          <Field label="Terms & Condition Template">
            <Textarea
              value={values.termsAndConditions}
              onChange={(e) => set("termsAndConditions", e.target.value)}
              rows={4}
            />
          </Field>

          {/* Snapshot fields — visible so HR can override the auto-filled
              applicant name / email before saving. */}
          <Field label="Applicant snapshot — name">
            <Input
              value={values.applicantName}
              onChange={(e) => set("applicantName", e.target.value)}
              placeholder="Full name as it should appear on the offer"
            />
          </Field>
          <Field label="Applicant snapshot — email">
            <Input
              type="email"
              value={values.applicantEmail}
              onChange={(e) => set("applicantEmail", e.target.value)}
              placeholder="name@example.com"
            />
          </Field>
        </CardContent>
      </Card>

      <CustomFieldsRenderer
        sections={customSections}
        values={values.customFields}
        onChange={setCustomField}
      />

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 pt-2">
        <Button
          type="button"
          variant="link"
          className="px-0 self-start gap-1.5"
          disabled={openingBuilder}
          onClick={openCustomizeBuilder}
        >
          {openingBuilder ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Settings2 className="h-3.5 w-3.5" />
          )}
          {openingBuilder
            ? "Opening builder…"
            : "Customize form — add custom fields in builder"}
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
