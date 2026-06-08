"use client";

/**
 * PublicApplicationForm — the standalone, no-login job application page behind a
 * shareable link (/apply/[jobId]). Drop the link on a careers page, LinkedIn,
 * or any job portal; opening it shows the job and all application fields, and
 * submitting creates a JobApplication (status NEW) via the public API.
 *
 * Self-contained chrome (its own full-page background + card) since it renders
 * outside the authenticated app shell.
 */

import { useEffect, useRef, useState } from "react";
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
import {
  Loader2,
  Upload,
  FileText,
  CheckCircle2,
  Building2,
  MapPin,
  Briefcase,
  Wallet,
  X,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PublicJob {
  id: string;
  title: string;
  department: string;
  designation: string;
  employmentType: string;
  salaryApprox: string | null;
  jobDescription: string;
  vacancies: number;
  organizationName: string | null;
  logoUrl: string | null;
}

const SOURCES: { value: string; label: string }[] = [
  { value: "COMPANY_WEBSITE", label: "Company website" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "JOB_PORTAL", label: "Job portal" },
  { value: "REFERRAL", label: "Referral" },
  { value: "AGENCY", label: "Agency" },
  { value: "CAMPUS", label: "Campus" },
  { value: "OTHER", label: "Other" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function prettyEmployment(t: string): string {
  return t
    ? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";
}

export function PublicApplicationForm({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [source, setSource] = useState("COMPANY_WEBSITE");
  const [coverLetter, setCoverLetter] = useState("");
  const [salary, setSalary] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/job-openings/${jobId}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; job?: PublicJob; error?: string }
          | null;
        if (cancelled) return;
        if (res.ok && json?.success && json.job) {
          setJob(json.job);
        } else {
          setLoadError(json?.error ?? "This job is not available.");
        }
      } catch {
        if (!cancelled) setLoadError("Something went wrong. Please try again later.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const onPickFile = async (file: File) => {
    setUploadError(null);
    // Guard size (10MB) and basic types.
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File is too large (max 10MB).");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "file");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; imageUrl?: string; error?: string }
        | null;
      if (res.ok && json?.success && json.imageUrl) {
        setResumeUrl(json.imageUrl);
        setResumeName(file.name);
      } else {
        setUploadError(json?.error ?? "Upload failed. Please try again.");
      }
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Your name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email";
    if (!mobile.trim()) e.mobile = "Phone number is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/job-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobOpeningId: jobId,
          applicantName: name.trim(),
          applicantEmail: email.trim(),
          applicantMobile: mobile.trim(),
          applicantSource: source,
          applicantResumeUrl: resumeUrl || undefined,
          applicantResumeName: resumeName || undefined,
          coverLetter: coverLetter.trim() || undefined,
          salaryExpectation: salary.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;
      if (res.ok && json?.success) {
        setDone(true);
      } else {
        setSubmitError(json?.error ?? "Could not submit. Please try again.");
      }
    } catch {
      setSubmitError("Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render states ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        {loading ? (
          <CenterCard>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Loading job…</p>
          </CenterCard>
        ) : loadError || !job ? (
          <CenterCard>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">Job unavailable</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loadError ?? "This job is not currently accepting applications."}
            </p>
          </CenterCard>
        ) : done ? (
          <CenterCard>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="mt-4 text-xl font-bold">Application submitted!</h1>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Thanks, {name.split(" ")[0] || "there"}. We&apos;ve received your
              application for <span className="font-medium">{job.title}</span>
              {job.organizationName ? ` at ${job.organizationName}` : ""}. Our
              team will review it and reach out with next steps.
            </p>
          </CenterCard>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-xl">
            {/* Job header */}
            <div className="border-b bg-gradient-to-br from-primary/[0.08] to-transparent px-5 sm:px-8 py-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background">
                  {job.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={job.logoUrl}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  {job.organizationName && (
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {job.organizationName}
                    </p>
                  )}
                  <h1 className="text-xl sm:text-2xl font-bold leading-tight text-foreground">
                    {job.title}
                  </h1>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                    {job.designation && (
                      <span className="inline-flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5" />
                        {job.designation}
                      </span>
                    )}
                    {job.department && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.department}
                      </span>
                    )}
                    {job.employmentType && (
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        {prettyEmployment(job.employmentType)}
                      </span>
                    )}
                    {job.salaryApprox && (
                      <span className="inline-flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5" />
                        {job.salaryApprox}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {job.jobDescription && (
                <div className="mt-4 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background/60 p-3 text-sm text-foreground/80">
                  {job.jobDescription}
                </div>
              )}
            </div>

            {/* Application form */}
            <div className="px-5 sm:px-8 py-6 space-y-5">
              <h2 className="text-base font-semibold">Apply for this role</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full name" required error={errors.name}>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    aria-invalid={!!errors.name || undefined}
                  />
                </Field>
                <Field label="Email" required error={errors.email}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    aria-invalid={!!errors.email || undefined}
                  />
                </Field>
                <Field label="Phone" required error={errors.mobile}>
                  <PhoneField
                    value={mobile}
                    onChange={setMobile}
                    placeholder="90000 00000"
                    hasError={!!errors.mobile}
                  />
                </Field>
                <Field label="How did you hear about us?">
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Salary expectation">
                  <Input
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder="e.g. ₹12 LPA"
                  />
                </Field>
              </div>

              {/* Resume upload */}
              <Field label="Resume / CV">
                {resumeUrl ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{resumeName || "Resume uploaded"}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setResumeUrl("");
                        setResumeName("");
                      }}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className={cn(
                      "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-6 py-6 text-center transition-colors hover:bg-muted/40 disabled:opacity-60",
                    )}
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Upload className="h-5 w-5 text-primary" />
                    )}
                    <span className="text-sm font-medium">
                      {uploading ? "Uploading…" : "Upload your resume"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF or Word, up to 10MB
                    </span>
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPickFile(f);
                  }}
                />
                {uploadError && (
                  <p className="mt-1 text-xs text-destructive">{uploadError}</p>
                )}
              </Field>

              <Field label="Cover letter">
                <Textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Tell us why you're a great fit (optional)"
                  rows={4}
                />
              </Field>

              {submitError && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {submitError}
                </div>
              )}

              <Button
                onClick={submit}
                disabled={submitting || uploading}
                className="w-full h-11 text-base"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit application"
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                By submitting, you agree to be contacted about this role.
              </p>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by your ERP — Recruitment
        </p>
      </div>
    </div>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border bg-card px-6 py-16 text-center shadow-xl">
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
