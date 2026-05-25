"use client";

/**
 * Shared Appointment Letter form, used by the in-page create sheet on
 * /appointment-letter.
 *
 * Letters are usually generated after a Job Offer is accepted — picking
 * the offer auto-fills applicant, company and links the underlying
 * application. The "Signed" checkbox flips status to SIGNED and stamps the
 * Signed Date with today if it's empty.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Settings2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { JobApplication } from "@/lib/api/job-applications";
import type { JobOffer } from "@/lib/api/job-offers";
import type {
  AppointmentLetter,
  AppointmentLetterStatus,
} from "@/lib/api/appointment-letters";
import {
  useCustomFormFields,
  type CustomFieldValues,
} from "@/lib/forms/use-custom-form-fields";
import { CustomFieldsRenderer } from "@/components/forms/custom-fields-renderer";

async function ensureAppointmentLetterBuilderHref(): Promise<{ href: string; created: boolean }> {
  const res = await fetch("/api/forms/ensure-appointment-letter-form", {
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
  value: AppointmentLetterStatus;
  label: string;
}> = [
  { value: "DRAFT", label: "Draft" },
  { value: "ISSUED", label: "Issued" },
  { value: "SIGNED", label: "Signed" },
  { value: "REVOKED", label: "Revoked" },
];

export interface AppointmentLetterFormValues {
  jobOfferId: string;
  jobApplicationId: string;

  applicantName: string;
  applicantEmail: string;
  company: string;

  appointmentDate: string;
  templateName: string;
  status: AppointmentLetterStatus;

  title: string;
  introduction: string;
  description: string;
  closingNotes: string;

  signed: boolean;
  signedDate: string;
  customFields: CustomFieldValues;
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY: AppointmentLetterFormValues = {
  jobOfferId: "",
  jobApplicationId: "",
  applicantName: "",
  applicantEmail: "",
  company: "",
  appointmentDate: today(),
  templateName: "",
  status: "DRAFT",
  title: "",
  introduction: "",
  description: "",
  closingNotes: "",
  signed: false,
  signedDate: "",
  customFields: {},
};

export function fromLetter(l: AppointmentLetter): AppointmentLetterFormValues {
  return {
    jobOfferId: l.jobOfferId ?? "",
    jobApplicationId: l.jobApplicationId ?? "",
    applicantName: l.applicantName ?? "",
    applicantEmail: l.applicantEmail ?? "",
    company: l.company ?? "",
    appointmentDate: l.appointmentDate ? l.appointmentDate.slice(0, 10) : today(),
    templateName: l.templateName ?? "",
    status: (l.status ?? "DRAFT") as AppointmentLetterStatus,
    title: l.title ?? "",
    introduction: l.introduction ?? "",
    description: l.description ?? "",
    closingNotes: l.closingNotes ?? "",
    signed: !!l.signed,
    signedDate: l.signedDate ? l.signedDate.slice(0, 10) : "",
    customFields: ((l as any).customFields as CustomFieldValues) ?? {},
  };
}

export function toApiPayload(
  v: AppointmentLetterFormValues,
): Record<string, any> {
  return {
    jobOfferId: v.jobOfferId || null,
    jobApplicationId: v.jobApplicationId || null,
    applicantName: v.applicantName.trim(),
    applicantEmail: v.applicantEmail.trim() || null,
    company: v.company.trim() || null,
    appointmentDate: v.appointmentDate || null,
    templateName: v.templateName.trim() || null,
    status: v.status,
    title: v.title.trim() || null,
    introduction: v.introduction.trim() || null,
    description: v.description.trim() || null,
    closingNotes: v.closingNotes.trim() || null,
    signed: v.signed,
    signedDate: v.signedDate || null,
    customFields: v.customFields ?? {},
  };
}

export interface AppointmentLetterFormProps {
  initial?: AppointmentLetter | null;
  onSubmit: (payload: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  submitLabel?: string;
  /** Accepted offers — the typical source for an appointment letter. */
  jobOffers?: JobOffer[];
  /** Applications, used to allow direct linking without an offer. */
  jobApplications?: JobApplication[];
}

export function AppointmentLetterForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  jobOffers = [],
  jobApplications = [],
}: AppointmentLetterFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [openingBuilder, setOpeningBuilder] = useState(false);
  const [values, setValues] = useState<AppointmentLetterFormValues>(() =>
    initial ? fromLetter(initial) : EMPTY,
  );

  const { sections: customSections } = useCustomFormFields("appointmentLetter");
  const setCustomField = (id: string, v: unknown) =>
    setValues((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [id]: v },
    }));

  const openCustomizeBuilder = async () => {
    setOpeningBuilder(true);
    try {
      const { href, created } = await ensureAppointmentLetterBuilderHref();
      if (created) {
        toast({
          title: "Appointment Letter form created",
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setValues(fromLetter(initial));
  }, [initial]);

  const set = <K extends keyof AppointmentLetterFormValues>(
    k: K,
    v: AppointmentLetterFormValues[K],
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

  const pickOffer = (offerId: string) => {
    if (offerId === NONE) {
      set("jobOfferId", "");
      return;
    }
    const offer = jobOffers.find((o) => o.id === offerId);
    if (!offer) {
      set("jobOfferId", offerId);
      return;
    }
    setValues((prev) => ({
      ...prev,
      jobOfferId: offer.id,
      jobApplicationId: offer.jobApplicationId ?? prev.jobApplicationId,
      applicantName: prev.applicantName.trim()
        ? prev.applicantName
        : offer.applicantName,
      applicantEmail: prev.applicantEmail.trim()
        ? prev.applicantEmail
        : offer.applicantEmail ?? "",
    }));
  };

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

  // Ticking "Signed" promotes status to SIGNED and stamps today's date if the
  // user hasn't already entered one. Unticking leaves status alone — clearing
  // a signature shouldn't silently move the letter back to DRAFT, the user
  // should pick the next status explicitly via the Status select.
  const onSignedChange = (next: boolean) => {
    setValues((prev) => ({
      ...prev,
      signed: next,
      signedDate: next && !prev.signedDate ? today() : prev.signedDate,
      status: next ? "SIGNED" : prev.status,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.applicantName.trim())
      return setError("Applicant Name is required");
    if (!values.appointmentDate) return setError("Appointment Date is required");
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
              Appointment Letter
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Letter content and metadata
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Appointment Letter ID">
            <Input
              value="# will be generated on submit"
              disabled
              className="text-muted-foreground italic"
            />
          </Field>
          <Field label="Company">
            <Input
              value={values.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder="Issuing company name"
            />
          </Field>

          <Field
            label="Applicant Name"
            hint={
              values.jobOfferId
                ? `Linked via offer ${
                    jobOffers.find((o) => o.id === values.jobOfferId)
                      ?.offerCode ?? values.jobOfferId.slice(0, 8)
                  }`
                : "Pick an offer to auto-fill"
            }
          >
            <Select
              value={values.jobOfferId || NONE}
              onValueChange={pickOffer}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  <span className="text-muted-foreground">
                    — None / manual
                  </span>
                </SelectItem>
                {jobOffers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.applicantName}
                    {o.jobOpening?.profileName
                      ? ` · ${o.jobOpening.profileName}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Job Applicaiton ID"
            hint={
              linkedApp?.jobOpening
                ? `Linked opening: ${linkedApp.jobOpening.profileName}${
                    linkedApp.jobOpening.jobCode
                      ? ` · ${linkedApp.jobOpening.jobCode}`
                      : ""
                  }`
                : "Direct link to an application"
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

          <Field label="Appointment Date *">
            <Input
              type="date"
              value={values.appointmentDate}
              onChange={(e) => set("appointmentDate", e.target.value)}
            />
          </Field>
          <Field label="Appointment Letter Template">
            <Input
              value={values.templateName}
              onChange={(e) => set("templateName", e.target.value)}
              placeholder="Select an option"
            />
          </Field>

          <Field label="Introduction">
            <Textarea
              value={values.introduction}
              onChange={(e) => set("introduction", e.target.value)}
              rows={4}
              placeholder="Opening paragraph"
            />
          </Field>
          <Field label="Title">
            <Input
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Letter title"
            />
          </Field>

          <Field label="Description">
            <Textarea
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              placeholder="Body of appointment letter"
            />
          </Field>
          <Field label="Closing Notes">
            <Textarea
              value={values.closingNotes}
              onChange={(e) => set("closingNotes", e.target.value)}
              rows={4}
              placeholder="Closing paragraph"
            />
          </Field>

          <Field label="Tick when the candidate signs the appointment letter">
            <label className="inline-flex items-center gap-2 h-10 cursor-pointer select-none">
              <Checkbox
                checked={values.signed}
                onCheckedChange={(c) => onSignedChange(c === true)}
              />
              <span className="text-sm">Signed</span>
            </label>
          </Field>
          <Field
            label="Signed Date"
            hint="Date the candidate signed the letter"
          >
            <Input
              type="date"
              value={values.signedDate}
              onChange={(e) => set("signedDate", e.target.value)}
            />
          </Field>

          <Field label="Applicant snapshot — name">
            <Input
              value={values.applicantName}
              onChange={(e) => set("applicantName", e.target.value)}
              placeholder="Full name as it should appear on the letter"
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

          <Field label="Status">
            <Select
              value={values.status}
              onValueChange={(v) =>
                set("status", v as AppointmentLetterStatus)
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
