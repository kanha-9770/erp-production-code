"use client";

/**
 * Shared Employee form, used by /employee-master/new and (future) edit page.
 * Pure client component — the page wires the create-or-update mutation and
 * handles navigation.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Loader2,
  Settings2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Camera,
} from "lucide-react";
import type { EmployeeDetail } from "@/lib/api/employees";
import { useToast } from "@/hooks/use-toast";
import { computeDescriptorFromBlobWithTimeout } from "@/lib/face/descriptor";
import { FaceCaptureDialog } from "@/components/attendance/face-capture-dialog";

/**
 * Resolve the org's Employee form id, seeding one if it doesn't exist yet.
 * The /api/forms/ensure-employee-form endpoint is idempotent — calling it
 * twice still returns the same form. We hit it lazily (on Customize click)
 * rather than on mount so a user who never customizes incurs zero cost.
 */
async function ensureEmployeeBuilderHref(): Promise<{ href: string; created: boolean }> {
  const res = await fetch("/api/forms/ensure-employee-form", {
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

export interface EmployeeFormValues {
  employeeName: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";
  department: string;
  designation: string;
  companyName: string;
  /** FK id of the EngagementTeam this employee belongs to. The legacy
   *  `employeeEngagementTeamName` is derived from the team's name on save
   *  so old readers keep working. Empty string = unassigned. */
  engagementTeamId: string;
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
  engagementTeamId: "",
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
    engagementTeamId: (e as any).engagementTeamId ?? "",
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
    engagementTeamId: values.engagementTeamId || null,
    // Legacy display field — kept in sync with the picked team's name so old
    // readers that only know about the string field don't break.
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

// Side-channel data the form produces when the user attaches a face photo.
// The parent receives this alongside the JSON payload so it can run the
// face-enrollment call once the employee (and therefore the User row)
// exists. Kept separate from the JSON payload because File objects don't
// belong in JSON bodies.
export interface EmployeeFormExtras {
  facePhoto?: File;
  faceDescriptor?: Float32Array; // 128 floats — only set when a face was detected client-side
}

export interface EmployeeFormProps {
  initial?: EmployeeDetail | null;
  onSubmit: (
    payload: Record<string, any>,
    extras?: EmployeeFormExtras,
  ) => Promise<void> | void;
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
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<EmployeeFormValues>(() =>
    initial ? fromEmployee(initial) : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [openingBuilder, setOpeningBuilder] = useState(false);

  // Engagement teams — populated once so the team picker dropdown can render
  // a curated list (managed at Settings → Employee Engagement) instead of a
  // free-text input. Inactive teams are filtered out for new picks but kept
  // visible when this employee was already assigned to one (so HR sees the
  // old assignment instead of a blank).
  const [teams, setTeams] = useState<
    Array<{ id: string; name: string; color: string | null; isActive: boolean }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/engagement-teams', {
          cache: 'no-store',
          credentials: 'include',
        });
        const json = await res.json();
        if (!cancelled && res.ok && json?.success) {
          setTeams(json.teams ?? []);
        }
      } catch {
        // Soft-fail: form stays usable without teams; field just shows
        // "No teams configured yet" in the dropdown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Face enrollment: the user (HR) can attach a photo here so the new
  // employee is auto-enrolled into face recognition. Descriptor is
  // computed in the browser as soon as a photo is picked, giving
  // immediate "face detected / not detected" feedback before submit.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoDescriptor, setPhotoDescriptor] = useState<Float32Array | null>(
    null,
  );
  const [photoStatus, setPhotoStatus] = useState<
    "idle" | "analyzing" | "ok" | "no_face" | "multiple_faces" | "error"
  >("idle");
  const [photoFaceCount, setPhotoFaceCount] = useState<number>(0);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke any object URL when the preview changes or the form unmounts
  // so we don't leak memory across re-picks.
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const onPhotoPicked = async (file: File | null) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoDescriptor(null);
      setPhotoFaceCount(0);
      setPhotoStatus("idle");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please choose an image (JPG, PNG, or WebP).",
        variant: "destructive",
      });
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoDescriptor(null);
    setPhotoFaceCount(0);
    setPhotoStatus("analyzing");
    try {
      // Bounded so a slow/frozen tfjs init can't lock the form for minutes.
      // Falls back to "no_face" on timeout — HR can save the photo as a
      // plain avatar and re-enroll later.
      const result = await computeDescriptorFromBlobWithTimeout(file);
      setPhotoFaceCount(result.faceCount);
      if (result.faceCount === 0) {
        setPhotoStatus("no_face");
      } else if (result.faceCount > 1) {
        // Anti-proxy: never enroll a group photo. If the baseline has
        // two faces, the matcher gets confused and either person could
        // pass verification.
        setPhotoStatus("multiple_faces");
        setPhotoDescriptor(null);
      } else if (result.descriptor) {
        setPhotoDescriptor(result.descriptor);
        setPhotoStatus("ok");
      } else {
        setPhotoStatus("no_face");
      }
    } catch (e) {
      console.error("[employee-form] face detection failed:", e);
      setPhotoStatus("error");
    }
  };

  const clearPhoto = () => {
    if (photoInputRef.current) photoInputRef.current.value = "";
    onPhotoPicked(null);
    setPhotoConsent(false);
  };

  const handleCameraCapture = (
    blob: Blob,
    descriptor: Float32Array | null,
    faceCount: number,
  ) => {
    const file = new File([blob], `capture_${Date.now()}.jpg`, { type: "image/jpeg" });
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoDescriptor(descriptor);
    setPhotoFaceCount(faceCount);
    
    if (faceCount === 0) {
      setPhotoStatus("no_face");
    } else if (faceCount > 1) {
      setPhotoStatus("multiple_faces");
      setPhotoDescriptor(null);
    } else if (descriptor) {
      setPhotoStatus("ok");
    } else {
      setPhotoStatus("no_face");
    }
    setCameraOpen(false);
  };

  useEffect(() => {
    if (initial) setValues(fromEmployee(initial));
  }, [initial]);

  const openCustomizeBuilder = async () => {
    setOpeningBuilder(true);
    try {
      const { href, created } = await ensureEmployeeBuilderHref();
      if (created) {
        toast({
          title: "Employee form created",
          description: "Add or rearrange fields here — they'll appear in the employee form automatically.",
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

    // Only forward the face photo if (a) a usable descriptor was extracted
    // and (b) the consent box is ticked. Without consent we still keep the
    // photo as a regular avatar candidate but skip biometric enrollment.
    const extras: EmployeeFormExtras = {};
    if (photoFile) extras.facePhoto = photoFile;
    if (photoDescriptor && photoConsent) extras.faceDescriptor = photoDescriptor;

    await onSubmit(toApiPayload(values), extras);
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

      {/* Profile photo + face enrollment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile photo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Optional. Used as the employee's avatar everywhere. If a face is
            detected and the consent box is ticked, the photo is also used to
            enroll this employee into face-recognition attendance verification.
          </p>
          <div className="flex items-start gap-4">
            <div className="flex h-28 w-28 flex-none items-center justify-center overflow-hidden rounded-md border bg-gray-50">
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt="Selected employee photo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Upload className="h-6 w-6 text-gray-400" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onPhotoPicked(e.target.files?.[0] ?? null)}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  {photoFile ? "Replace photo" : "Choose photo"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCameraOpen(true)}
                >
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                  Take photo
                </Button>
                {photoFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearPhoto}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
              </div>
              {photoStatus === "analyzing" && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analyzing face…
                </div>
              )}
              {photoStatus === "ok" && (
                <div className="flex items-center gap-1.5 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Face detected — eligible for enrollment
                </div>
              )}
              {photoStatus === "no_face" && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  No face detected. Photo will be saved as avatar only; the
                  employee can self-enroll later from the attendance widget.
                </div>
              )}
              {photoStatus === "multiple_faces" && (
                <div className="flex items-center gap-1.5 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {photoFaceCount} faces detected. Choose a solo photo —
                  group photos can't be used for verification.
                </div>
              )}
              {photoStatus === "error" && (
                <div className="flex items-center gap-1.5 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Couldn't analyze photo. Try a different image.
                </div>
              )}
            </div>
          </div>

          {photoStatus === "ok" && (
            <label className="flex items-start gap-2 rounded-md border bg-amber-50/40 p-3 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={photoConsent}
                onChange={(e) => setPhotoConsent(e.target.checked)}
              />
              <span>
                I confirm this employee consents to face-recognition for
                attendance verification. A 128-number face fingerprint will be
                stored (the original photo is kept as the avatar). Consent
                timestamp is recorded for audit.
              </span>
            </label>
          )}
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
            <Select
              value={values.engagementTeamId || "__none__"}
              onValueChange={(v) => {
                if (v === "__none__") {
                  set("engagementTeamId", "");
                  set("employeeEngagementTeamName", "");
                  return;
                }
                const picked = teams.find((t) => t.id === v);
                set("engagementTeamId", v);
                // Mirror the picked team's name into the legacy string field
                // so old readers (Employee Master grid, reports) still work.
                set("employeeEngagementTeamName", picked?.name ?? "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="No team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— No team —</SelectItem>
                {teams.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-muted-foreground">
                    No teams configured. Create one in Settings →
                    Employee Engagement.
                  </div>
                ) : (
                  teams
                    // Keep the currently-assigned team visible even if it's
                    // been deactivated — otherwise the dropdown silently
                    // drops the existing choice.
                    .filter(
                      (t) => t.isActive || t.id === values.engagementTeamId,
                    )
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: t.color ?? "#94a3b8",
                            }}
                          />
                          {t.name}
                          {!t.isActive && (
                            <span className="text-[10px] text-muted-foreground">
                              (inactive)
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
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

      <FaceCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        mode="OPTIONAL"
        actionLabel="profile photo"
        onCapture={handleCameraCapture}
        extractDescriptor={true}
        requireFaceDetected={false}
      />
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
