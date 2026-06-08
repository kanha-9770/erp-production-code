"use client";

/**
 * Shared Job Application form, used by the in-page create sheet on
 * /job-application.
 *
 * Two cards:
 *   1. Candidate — applicant details + the role they're applying for
 *      (auto-filled when a JobOpening is picked).
 *   2. Status   — internal rating + process status.
 *
 * Picking a Job Opening pre-fills: staffing plan, department, designation,
 * employment type and the job description (with a "Copied from opening"
 * hint). All values stay editable.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneField } from "@/components/form-fields/phone-field";
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
import { Settings2, Star, Upload, FileText, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EMPLOYMENT_TYPE_OPTIONS } from "@/components/staffing-plan/staffing-plan-form";
import type { EmploymentType } from "@/lib/api/staffing-plans";
import type { JobOpening } from "@/lib/api/job-openings";
import type {
  JobApplication,
  JobApplicationStatus,
  ApplicantSource,
} from "@/lib/api/job-applications";
import { useUploadFileMutation } from "@/lib/api/upload";
import {
  useParseResumeMutation,
  type ParsedResume,
} from "@/lib/api/resume";
import {
  useCustomFormFields,
  type CustomFieldValues,
} from "@/lib/forms/use-custom-form-fields";
import { CustomFieldsRenderer } from "@/components/forms/custom-fields-renderer";

async function ensureJobApplicationBuilderHref(): Promise<{ href: string; created: boolean }> {
  const res = await fetch("/api/forms/ensure-job-application-form", {
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
  value: JobApplicationStatus;
  label: string;
}> = [
  { value: "NEW", label: "New" },
  { value: "SCREENING", label: "Screening" },
  { value: "INTERVIEWING", label: "Interviewing" },
  { value: "SHORTLISTED", label: "Shortlisted" },
  { value: "OFFERED", label: "Offered" },
  { value: "HIRED", label: "Hired" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

export const SOURCE_OPTIONS: Array<{
  value: ApplicantSource;
  label: string;
}> = [
  { value: "REFERRAL", label: "Employee referral" },
  { value: "JOB_PORTAL", label: "Job portal" },
  { value: "COMPANY_WEBSITE", label: "Company website" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "AGENCY", label: "Recruitment agency" },
  { value: "WALK_IN", label: "Walk-in" },
  { value: "CAMPUS", label: "Campus placement" },
  { value: "OTHER", label: "Other" },
];

export interface JobApplicationFormValues {
  jobOpeningId: string;
  staffingPlanId: string;
  department: string;
  designation: string;
  employmentType: EmploymentType | "";

  applicantName: string;
  applicantEmail: string;
  applicantMobile: string;
  applicantSource: ApplicantSource | "";

  applicantResumeUrl: string;
  applicantResumeName: string;

  // Data scanned out of the uploaded resume (see /api/parse-resume).
  resumeData: ParsedResume | null;
  resumeParsedText: string;
  resumeSkills: string;
  resumeTotalExperience: string;
  resumeEducation: string;
  resumeSummary: string;

  coverLetter: string;
  salaryExpectation: string;
  jobDescription: string;

  applicantRating: number; // 0 means unrated
  status: JobApplicationStatus;

  // Values for admin-added builder fields. Keyed by FormField.id; rendered
  // by <CustomFieldsRenderer/> at the bottom of the form.
  customFields: CustomFieldValues;
}

const EMPTY: JobApplicationFormValues = {
  jobOpeningId: "",
  staffingPlanId: "",
  department: "",
  designation: "",
  employmentType: "",

  applicantName: "",
  applicantEmail: "",
  applicantMobile: "",
  applicantSource: "",

  applicantResumeUrl: "",
  applicantResumeName: "",

  resumeData: null,
  resumeParsedText: "",
  resumeSkills: "",
  resumeTotalExperience: "",
  resumeEducation: "",
  resumeSummary: "",

  coverLetter: "",
  salaryExpectation: "",
  jobDescription: "",

  applicantRating: 0,
  status: "NEW",
  customFields: {},
};

export function fromApplication(a: JobApplication): JobApplicationFormValues {
  return {
    jobOpeningId: a.jobOpeningId ?? "",
    staffingPlanId: a.staffingPlanId ?? "",
    department: a.department ?? "",
    designation: a.designation ?? "",
    employmentType: (a.employmentType ?? "") as EmploymentType | "",

    applicantName: a.applicantName ?? "",
    applicantEmail: a.applicantEmail ?? "",
    applicantMobile: a.applicantMobile ?? "",
    applicantSource: (a.applicantSource ?? "") as ApplicantSource | "",

    applicantResumeUrl: a.applicantResumeUrl ?? "",
    applicantResumeName: a.applicantResumeName ?? "",

    resumeData: (a.resumeData as ParsedResume | null) ?? null,
    resumeParsedText: a.resumeParsedText ?? "",
    resumeSkills: a.resumeSkills ?? "",
    resumeTotalExperience: a.resumeTotalExperience ?? "",
    resumeEducation: a.resumeEducation ?? "",
    resumeSummary: a.resumeSummary ?? "",

    coverLetter: a.coverLetter ?? "",
    salaryExpectation: a.salaryExpectation ?? "",
    jobDescription: a.jobDescription ?? "",

    applicantRating: a.applicantRating ?? 0,
    status: (a.status ?? "NEW") as JobApplicationStatus,
    customFields: ((a as any).customFields as CustomFieldValues) ?? {},
  };
}

export function toApiPayload(v: JobApplicationFormValues): Record<string, any> {
  return {
    jobOpeningId: v.jobOpeningId || null,
    staffingPlanId: v.staffingPlanId || null,
    department: v.department.trim() || null,
    designation: v.designation.trim() || null,
    employmentType: v.employmentType || null,

    applicantName: v.applicantName.trim(),
    applicantEmail: v.applicantEmail.trim(),
    applicantMobile: v.applicantMobile.trim(),
    applicantSource: v.applicantSource || null,

    applicantResumeUrl: v.applicantResumeUrl.trim() || null,
    applicantResumeName: v.applicantResumeName.trim() || null,

    resumeData: v.resumeData,
    resumeParsedText: v.resumeParsedText.trim() || null,
    resumeSkills: v.resumeSkills.trim() || null,
    resumeTotalExperience: v.resumeTotalExperience.trim() || null,
    resumeEducation: v.resumeEducation.trim() || null,
    resumeSummary: v.resumeSummary.trim() || null,

    coverLetter: v.coverLetter.trim() || null,
    salaryExpectation: v.salaryExpectation.trim() || null,
    jobDescription: v.jobDescription.trim() || null,

    applicantRating: v.applicantRating > 0 ? v.applicantRating : null,
    status: v.status,
    customFields: v.customFields ?? {},
  };
}

export interface JobApplicationFormProps {
  initial?: JobApplication | null;
  onSubmit: (payload: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  submitting?: boolean;
  submitLabel?: string;
  /** Active openings to pick from. Picking one auto-fills role fields. */
  jobOpenings?: JobOpening[];
}

export function JobApplicationForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  jobOpenings = [],
}: JobApplicationFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [openingBuilder, setOpeningBuilder] = useState(false);
  const [values, setValues] = useState<JobApplicationFormValues>(() =>
    initial ? fromApplication(initial) : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [scanWarning, setScanWarning] = useState<string | null>(null);

  // Fields admins have added via "Customize form". Refetched on window focus
  // so adding a new field in the builder shows up here on tab-back.
  const { sections: customSections } = useCustomFormFields("jobApplication");
  const setCustomField = (id: string, v: unknown) =>
    setValues((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [id]: v },
    }));

  const openCustomizeBuilder = async () => {
    setOpeningBuilder(true);
    try {
      const { href, created } = await ensureJobApplicationBuilderHref();
      if (created) {
        toast({
          title: "Job Application form created",
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
  const [uploadFile, { isLoading: uploading }] = useUploadFileMutation();
  const [parseResume, { isLoading: scanning }] = useParseResumeMutation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initial) setValues(fromApplication(initial));
  }, [initial]);

  const set = <K extends keyof JobApplicationFormValues>(
    k: K,
    v: JobApplicationFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  const onPickOpening = (openingId: string) => {
    if (openingId === NONE) {
      set("jobOpeningId", "");
      return;
    }
    const o = jobOpenings.find((x) => x.id === openingId);
    if (!o) {
      set("jobOpeningId", openingId);
      return;
    }
    setValues((prev) => ({
      ...prev,
      jobOpeningId: o.id,
      staffingPlanId: o.staffingPlanId ?? "",
      department: o.department ?? "",
      designation: o.designation ?? "",
      employmentType: o.employmentType,
      // Only seed the JD if the user hasn't typed their own — avoid
      // overwriting an edited description when they re-pick the opening.
      jobDescription: prev.jobDescription
        ? prev.jobDescription
        : o.jobDescription ?? "",
    }));
  };

  const onResumeFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
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

      // Scan the resume into structured data. This is best-effort: a failed
      // scan must not block saving the application, but we DO surface the
      // failure as a non-blocking warning so the recruiter knows the parsed
      // columns will be empty and why (no AI provider, unreadable file, …).
      setScanWarning(null);
      try {
        const scanFd = new FormData();
        scanFd.append("file", file);
        const scan = await parseResume(scanFd).unwrap();
        setValues((prev) => ({
          ...prev,
          resumeData: scan.data,
          resumeParsedText: scan.text ?? "",
          resumeSkills: scan.skills ?? "",
          resumeTotalExperience: scan.totalExperience ?? "",
          resumeEducation: scan.education ?? "",
          resumeSummary: scan.summary ?? "",
          // Auto-fill blank applicant fields from the resume so the recruiter
          // doesn't retype them. Never overwrite something already entered.
          applicantName: prev.applicantName || scan.data?.fullName || "",
          applicantEmail: prev.applicantEmail || scan.data?.email || "",
          applicantMobile: prev.applicantMobile || scan.data?.phone || "",
        }));
        if (!scan.text && !scan.data) {
          setScanWarning(
            "Resume uploaded, but nothing could be extracted from it. The file may be a scanned image or an unsupported format.",
          );
        } else if (!scan.data) {
          setScanWarning(
            "Resume text was extracted, but the AI structured-parse step did not return data — check that an AI provider is configured for this organisation in Admin → AI Config.",
          );
        }
      } catch (scanErr: any) {
        const detail =
          scanErr?.data?.error ||
          scanErr?.error ||
          scanErr?.message ||
          "unknown error";
        console.error("[job-application] resume scan failed:", scanErr);
        setScanWarning(
          `Resume scan failed: ${detail}. The resume file itself was saved.`,
        );
      }
    } catch (err: any) {
      // RTK Query errors expose the server response on `err.data`; native
      // errors thrown above use `err.message`. Pull from both so the user
      // sees what actually went wrong (e.g. FTP unreachable, file too big)
      // instead of a generic "Resume upload failed".
      const detail =
        err?.data?.details ||
        err?.data?.error ||
        err?.error ||
        err?.message ||
        (typeof err === "string" ? err : null);
      setError(
        detail ? `Resume upload failed: ${detail}` : "Resume upload failed",
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearResume = () => {
    setScanWarning(null);
    setValues((prev) => ({
      ...prev,
      applicantResumeUrl: "",
      applicantResumeName: "",
      resumeData: null,
      resumeParsedText: "",
      resumeSkills: "",
      resumeTotalExperience: "",
      resumeEducation: "",
      resumeSummary: "",
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
      return setError("Applicant Mobile Number is required");
    if (!values.applicantResumeUrl.trim())
      return setError("Applicant Resume is required");

    await onSubmit(toApiPayload(values));
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Section 1 — Candidate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <span className="inline-flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">
                1
              </span>
              Candidate
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Applicant details, resume, screening
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Job Application ID">
            <Input
              value="# will be generated on submit"
              disabled
              className="text-muted-foreground italic"
            />
          </Field>
          <Field
            label="Job Opening ID"
            hint={
              jobOpenings.length === 0
                ? "No openings yet — fields below stay manual."
                : "Pick an opening to auto-fill the role fields."
            }
          >
            <Select
              value={values.jobOpeningId || NONE}
              onValueChange={onPickOpening}
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
                {jobOpenings.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.profileName}
                    {o.jobCode ? ` · ${o.jobCode}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="New Staffing Plan ID"
            hint="Linked via the selected opening."
          >
            <Input
              value={values.staffingPlanId}
              onChange={(e) => set("staffingPlanId", e.target.value)}
              placeholder="—"
            />
          </Field>
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
              placeholder="Job title"
            />
          </Field>
          <Field label="Employment Type">
            <Select
              value={values.employmentType || NONE}
              onValueChange={(v) =>
                set("employmentType", v === NONE ? "" : (v as EmploymentType))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  <span className="text-muted-foreground">—</span>
                </SelectItem>
                {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Applicant Email ID *">
            <Input
              type="email"
              value={values.applicantEmail}
              onChange={(e) => set("applicantEmail", e.target.value)}
              placeholder="name@example.com"
            />
          </Field>
          <Field label="Applicant Name *">
            <Input
              value={values.applicantName}
              onChange={(e) => set("applicantName", e.target.value)}
              placeholder="Full name"
            />
          </Field>

          <Field label="Applicant Source">
            <Select
              value={values.applicantSource || NONE}
              onValueChange={(v) =>
                set(
                  "applicantSource",
                  v === NONE ? "" : (v as ApplicantSource),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  <span className="text-muted-foreground">—</span>
                </SelectItem>
                {SOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Applicant Mobile Number *">
            <PhoneField
              value={values.applicantMobile}
              onChange={(v) => set("applicantMobile", v)}
              placeholder="98xxxxxxxx"
            />
          </Field>

          <Field label="Applicant Resume *" className="sm:col-span-1">
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

              {scanning && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Scanning resume…
                </div>
              )}

              {!scanning && scanWarning && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                  {scanWarning}
                </div>
              )}

              {!scanning &&
                values.applicantResumeUrl &&
                (values.resumeSkills ||
                  values.resumeTotalExperience ||
                  values.resumeSummary) && (
                  <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Scanned from resume
                    </div>
                    {values.resumeSummary && (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {values.resumeSummary}
                      </p>
                    )}
                    {values.resumeTotalExperience && (
                      <div className="text-[11px]">
                        <span className="text-muted-foreground">
                          Experience:{" "}
                        </span>
                        {values.resumeTotalExperience}
                      </div>
                    )}
                    {values.resumeEducation && (
                      <div className="text-[11px]">
                        <span className="text-muted-foreground">
                          Education:{" "}
                        </span>
                        {values.resumeEducation}
                      </div>
                    )}
                    {values.resumeSkills && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {values.resumeSkills
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .slice(0, 12)
                          .map((skill) => (
                            <span
                              key={skill}
                              className="rounded bg-background border px-1.5 py-0.5 text-[10px]"
                            >
                              {skill}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}
            </div>
          </Field>
          <Field label="Salary Expectation">
            <Input
              value={values.salaryExpectation}
              onChange={(e) => set("salaryExpectation", e.target.value)}
              placeholder="e.g. 12 LPA"
            />
          </Field>

          <Field label="Cover Letter" className="sm:col-span-2">
            <Textarea
              value={values.coverLetter}
              onChange={(e) => set("coverLetter", e.target.value)}
              rows={4}
            />
          </Field>
          <Field
            label="Job Description"
            hint="Copied from opening — editable."
            className="sm:col-span-2"
          >
            <Textarea
              value={values.jobDescription}
              onChange={(e) => set("jobDescription", e.target.value)}
              rows={4}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Section 2 — Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <span className="inline-flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">
                2
              </span>
              Status
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Rating and process status
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Applicant Rating" hint="Internal rating 1–5">
            <RatingInput
              value={values.applicantRating}
              onChange={(v) => set("applicantRating", v)}
            />
          </Field>
          <Field label="Status *">
            <Select
              value={values.status}
              onValueChange={(v) => set("status", v as JobApplicationStatus)}
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

function RatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  // 0 = not rated; clicking the same star clears it back to 0.
  return (
    <div className="flex items-center gap-1.5 h-10">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(value === n ? 0 : n)}
              className="p-0.5 group"
              aria-label={`Rate ${n} of 5`}
            >
              <Star
                className={
                  "h-5 w-5 transition-colors " +
                  (filled
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40 group-hover:text-amber-400")
                }
              />
            </button>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground ml-1">
        {value > 0 ? `${value} / 5` : "Not rated"}
      </span>
    </div>
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
