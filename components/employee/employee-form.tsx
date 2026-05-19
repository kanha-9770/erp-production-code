"use client";

/**
 * Shared Employee form, used by /employee-master/new and (future) edit page.
 * Pure client component — the page wires the create-or-update mutation and
 * handles navigation.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
  Plus,
  Trash2,
} from "lucide-react";
import type { EmployeeDetail } from "@/lib/api/employees";
import { useGetEmployeeListQuery } from "@/lib/api/employees";
import { useToast } from "@/hooks/use-toast";
import { computeDescriptorFromBlobWithTimeout } from "@/lib/face/descriptor";
import { FaceCaptureDialog } from "@/components/attendance/face-capture-dialog";

/**
 * Resolve the org's Employee form id, seeding one if it doesn't exist yet.
 * The /api/forms/ensure-employee-form endpoint is idempotent — calling it
 * twice still returns the same form. We hit it lazily (on Customize click)
 * rather than on mount so a user who never customizes incurs zero cost.
 */
// ── Auto-fill helpers ──────────────────────────────────────────────────────
// Both are pure functions kept at module scope so the form's useEffects can
// depend on them without re-creating per render.

/** Parse `HH:mm` → minutes-since-midnight. Returns null for any malformed
 *  input so the caller can decide whether to skip the derivation. */
function parseHHmmStrict(s: string): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Hours between two HH:mm timestamps; overnight wrap is treated as +24h so
 *  a 22:00 → 06:00 shift correctly reads as 8h. Rounded to 2 decimals. */
export function diffWorkingHours(
  inTime: string,
  outTime: string,
): number | null {
  const inMin = parseHHmmStrict(inTime);
  const outMin = parseHHmmStrict(outTime);
  if (inMin == null || outMin == null) return null;
  let diff = outMin - inMin;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

/** Increment-month policy: joins on day 1–9 → same month, day 10+ → next
 *  month (Dec wraps to Jan). Returns the 1-based month number or null when
 *  the date is malformed / missing. */
export function incrementMonthFromJoining(yyyymmdd: string): number | null {
  if (!yyyymmdd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) return null;
  const monthOneBased = Number(m[2]);
  const day = Number(m[3]);
  if (monthOneBased < 1 || monthOneBased > 12 || day < 1 || day > 31) {
    return null;
  }
  if (day <= 9) return monthOneBased;
  return monthOneBased === 12 ? 1 : monthOneBased + 1;
}

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
  // ── 1. Personal information ──────────────────────────────────────────
  salutation: string;
  firstName: string;
  lastName: string;
  // employeeName stays in values because some downstream code still reads
  // it — we compose it from firstName + lastName on submit.
  employeeName: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  dob: string;
  placeOfBirth: string;
  bloodGroup: string;
  maritalStatus: string;
  nationality: string;
  // URL of the persisted profile photo (Employee.employeeImage). The
  // form uses `photoPreview` for the in-browser preview of a freshly
  // picked file; this string carries an already-uploaded URL across
  // saves so re-opening the form shows the existing avatar.
  employeeImage: string;
  // Legacy fields the form no longer surfaces but keeps in state so an
  // older saved employee round-trips without dropping data.
  nativePlace: string;
  country: string;

  // ── 2. Contact information ───────────────────────────────────────────
  emailAddress1: string; // Personal email
  emailAddress2: string; // Company email
  personalContact: string; // Cell number
  alternateNo1: string;
  alternateNo2: string;
  currentAddressLine1: string;
  currentAddressLine2: string;
  currentCity: string;
  currentState: string;
  currentPostalCode: string;
  currentCountry: string;
  currentAccommodationType: string;
  permanentSameAsCurrent: boolean;
  permanentAddressLine1: string;
  permanentAddressLine2: string;
  permanentCity: string;
  permanentState: string;
  permanentPostalCode: string;
  permanentCountry: string;
  permanentAccommodationType: string;
  emergencyContactName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  // Full multi-contact list. The first row mirrors the three primary
  // fields above on save (kept in sync for backward compatibility with
  // any legacy reader that still reads the singular columns).
  emergencyContacts: Array<{ name: string; phone: string; relation: string }>;
  // Legacy single-field addresses, preserved on edit so older data isn't
  // dropped. New saves can leave these blank.
  permanentAddress: string;
  currentAddress: string;

  // ── 3. Employment details ───────────────────────────────────────────
  employmentType: string;
  department: string;
  designation: string;
  companyName: string;
  branch: string;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";
  dateOfJoining: string;
  shiftType: string;
  inTime: string;
  outTime: string;
  totalWorkingHours: string;
  /** FK id of the EngagementTeam this employee belongs to. The legacy
   *  `employeeEngagementTeamName` is derived from the team's name on save
   *  so old readers keep working. Empty string = unassigned. */
  engagementTeamId: string;
  employeeEngagementTeamName: string;
  yearsOfAgreement: string;

  // ── 4. Document uploads ─────────────────────────────────────────────
  passportUpload: string;
  aadharCardUpload: string;
  aadharCardNo: string;
  panCardUpload: string;

  // ── 5. Salary & compensation ───────────────────────────────────────
  salaryMode: string;
  baseSalary: string;
  totalSalary: string;
  perHourSalary: string;
  isOvertimeApplicable: boolean;
  overTime: string;
  bonusAmount: string;
  bonusAfterYears: string;
  incrementMonth: string;

  // ── 6. Bank details ────────────────────────────────────────────────
  bankName: string;
  bankAccountNo: string;
  ifscCode: string;
  swiftCode: string;

  // ── 7. Exit / Resignation ──────────────────────────────────────────
  resignationLetterDate: string;
  dateOfLeaving: string;
  reasonOfLeaving: string;
  noticeServed: boolean;

}

const EMPTY: EmployeeFormValues = {
  // Section 1
  salutation: "",
  firstName: "",
  lastName: "",
  employeeName: "",
  gender: "OTHER",
  dob: "",
  placeOfBirth: "",
  bloodGroup: "",
  maritalStatus: "",
  nationality: "Indian",
  employeeImage: "",
  nativePlace: "",
  country: "India",

  // Section 2
  emailAddress1: "",
  emailAddress2: "",
  personalContact: "",
  alternateNo1: "",
  alternateNo2: "",
  currentAddressLine1: "",
  currentAddressLine2: "",
  currentCity: "",
  currentState: "",
  currentPostalCode: "",
  currentCountry: "India",
  currentAccommodationType: "",
  permanentSameAsCurrent: false,
  permanentAddressLine1: "",
  permanentAddressLine2: "",
  permanentCity: "",
  permanentState: "",
  permanentPostalCode: "",
  permanentCountry: "India",
  permanentAccommodationType: "",
  emergencyContactName: "",
  emergencyPhone: "",
  emergencyRelation: "",
  emergencyContacts: [{ name: "", phone: "", relation: "" }],
  permanentAddress: "",
  currentAddress: "",

  // Section 3
  employmentType: "",
  department: "",
  designation: "",
  companyName: "",
  branch: "",
  status: "ACTIVE",
  dateOfJoining: "",
  shiftType: "",
  inTime: "",
  outTime: "",
  totalWorkingHours: "8",
  engagementTeamId: "",
  employeeEngagementTeamName: "",
  yearsOfAgreement: "",

  // Section 4
  passportUpload: "",
  aadharCardUpload: "",
  aadharCardNo: "",
  panCardUpload: "",

  // Section 5
  salaryMode: "Bank Transfer",
  baseSalary: "",
  totalSalary: "",
  perHourSalary: "",
  isOvertimeApplicable: false,
  overTime: "",
  bonusAmount: "",
  bonusAfterYears: "",
  incrementMonth: "",

  // Section 6
  bankName: "",
  bankAccountNo: "",
  ifscCode: "",
  swiftCode: "",

  // Section 7
  resignationLetterDate: "",
  dateOfLeaving: "",
  reasonOfLeaving: "",
  noticeServed: false,
};

export function fromEmployee(e: EmployeeDetail): EmployeeFormValues {
  const numStr = (v: string | number | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  const dateStr = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
  return {
    // Section 1
    salutation: e.salutation ?? "",
    firstName: e.firstName ?? "",
    lastName: e.lastName ?? "",
    employeeName: e.employeeName ?? "",
    gender: (e.gender ?? "OTHER") as EmployeeFormValues["gender"],
    dob: dateStr(e.dob),
    placeOfBirth: e.placeOfBirth ?? "",
    bloodGroup: e.bloodGroup ?? "",
    maritalStatus: e.maritalStatus ?? "",
    nationality: e.nationality ?? "Indian",
    employeeImage: e.employeeImage ?? "",
    nativePlace: e.nativePlace ?? "",
    country: e.country ?? "",

    // Section 2
    emailAddress1: e.emailAddress1 ?? "",
    emailAddress2: e.emailAddress2 ?? "",
    personalContact: e.personalContact ?? "",
    alternateNo1: e.alternateNo1 ?? "",
    alternateNo2: e.alternateNo2 ?? "",
    currentAddressLine1: e.currentAddressLine1 ?? "",
    currentAddressLine2: e.currentAddressLine2 ?? "",
    currentCity: e.currentCity ?? "",
    currentState: e.currentState ?? "",
    currentPostalCode: e.currentPostalCode ?? "",
    currentCountry: e.currentCountry ?? "India",
    currentAccommodationType: e.currentAccommodationType ?? "",
    permanentSameAsCurrent: !!e.permanentSameAsCurrent,
    permanentAddressLine1: e.permanentAddressLine1 ?? "",
    permanentAddressLine2: e.permanentAddressLine2 ?? "",
    permanentCity: e.permanentCity ?? "",
    permanentState: e.permanentState ?? "",
    permanentPostalCode: e.permanentPostalCode ?? "",
    permanentCountry: e.permanentCountry ?? "India",
    permanentAccommodationType: e.permanentAccommodationType ?? "",
    emergencyContactName: e.emergencyContactName ?? "",
    emergencyPhone: e.emergencyPhone ?? "",
    emergencyRelation: e.emergencyRelation ?? "",
    // Prefer the JSON list when present; otherwise synthesize a single
    // entry from the legacy primary fields so older employees still show
    // their existing contact on edit. Always keep at least one row so the
    // form has something to render.
    emergencyContacts:
      Array.isArray(e.emergencyContacts) && e.emergencyContacts.length > 0
        ? e.emergencyContacts.map((c) => ({
            name: c.name ?? "",
            phone: c.phone ?? "",
            relation: c.relation ?? "",
          }))
        : e.emergencyContactName || e.emergencyPhone
          ? [
              {
                name: e.emergencyContactName ?? "",
                phone: e.emergencyPhone ?? "",
                relation: e.emergencyRelation ?? "",
              },
            ]
          : [{ name: "", phone: "", relation: "" }],
    permanentAddress: e.permanentAddress ?? "",
    currentAddress: e.currentAddress ?? "",

    // Section 3
    employmentType: e.employmentType ?? "",
    department: e.department ?? "",
    designation: e.designation ?? "",
    companyName: e.companyName ?? "",
    branch: e.branch ?? "",
    status: (e.status ?? "ACTIVE") as EmployeeFormValues["status"],
    dateOfJoining: dateStr(e.dateOfJoining),
    shiftType: e.shiftType ?? "",
    inTime: e.inTime ?? "",
    outTime: e.outTime ?? "",
    totalWorkingHours: numStr(e.totalWorkingHours),
    engagementTeamId: (e as any).engagementTeamId ?? "",
    employeeEngagementTeamName: e.employeeEngagementTeamName ?? "",
    yearsOfAgreement: e.yearsOfAgreement != null ? String(e.yearsOfAgreement) : "",

    // Section 4
    passportUpload: e.passportUpload ?? "",
    aadharCardUpload: e.aadharCardUpload ?? "",
    aadharCardNo: e.aadharCardNo ?? "",
    panCardUpload: e.panCardUpload ?? "",

    // Section 5
    salaryMode: e.salaryMode ?? "Bank Transfer",
    // Show the single CTC value in the form. Prefer baseSalary when present,
    // fall back to totalSalary for legacy rows that only had one column set.
    // The form now mirrors edits into both columns on save.
    baseSalary: numStr(e.baseSalary ?? e.totalSalary),
    totalSalary: numStr(e.totalSalary ?? e.baseSalary),
    perHourSalary: numStr(e.perHourSalary),
    isOvertimeApplicable: !!e.isOvertimeApplicable,
    overTime: numStr(e.overTime),
    bonusAmount: numStr(e.bonusAmount),
    bonusAfterYears: e.bonusAfterYears != null ? String(e.bonusAfterYears) : "",
    incrementMonth: e.incrementMonth != null ? String(e.incrementMonth) : "",

    // Section 6
    bankName: e.bankName ?? "",
    bankAccountNo: e.bankAccountNo ?? "",
    ifscCode: e.ifscCode ?? "",
    swiftCode: e.swiftCode ?? "",

    // Section 7
    resignationLetterDate: dateStr(e.resignationLetterDate),
    dateOfLeaving: dateStr(e.dateOfLeaving),
    reasonOfLeaving: e.reasonOfLeaving ?? "",
    noticeServed: !!e.noticeServed,
  };
}

export function toApiPayload(values: EmployeeFormValues): Record<string, any> {
  const trimOrNull = (s: string) => (s.trim() === "" ? null : s.trim());
  // Compose the canonical employeeName from firstName + lastName + salutation
  // so downstream readers (engine, payslip, sidebar) keep working unchanged.
  // If the user typed something in the old combined field, prefer that.
  const composedName = [values.firstName.trim(), values.lastName.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();
  const finalName = values.employeeName.trim() || composedName;

  // If "Same as Current Address" is on, mirror the current-address fields
  // into the permanent block at save time so the DB has consistent data
  // regardless of which fields the form rendered.
  const permanentSrc = values.permanentSameAsCurrent
    ? {
        line1: values.currentAddressLine1,
        line2: values.currentAddressLine2,
        city: values.currentCity,
        state: values.currentState,
        postalCode: values.currentPostalCode,
        country: values.currentCountry,
      }
    : {
        line1: values.permanentAddressLine1,
        line2: values.permanentAddressLine2,
        city: values.permanentCity,
        state: values.permanentState,
        postalCode: values.permanentPostalCode,
        country: values.permanentCountry,
      };

  return {
    // Section 1
    salutation: trimOrNull(values.salutation),
    firstName: trimOrNull(values.firstName),
    lastName: trimOrNull(values.lastName),
    employeeName: finalName,
    gender: values.gender,
    dob: values.dob || null,
    placeOfBirth: trimOrNull(values.placeOfBirth),
    bloodGroup: trimOrNull(values.bloodGroup),
    maritalStatus: trimOrNull(values.maritalStatus),
    nationality: trimOrNull(values.nationality),
    employeeImage: trimOrNull(values.employeeImage),
    nativePlace: trimOrNull(values.nativePlace),
    country: trimOrNull(values.country),

    // Section 2
    emailAddress1: trimOrNull(values.emailAddress1),
    emailAddress2: trimOrNull(values.emailAddress2),
    personalContact: trimOrNull(values.personalContact),
    alternateNo1: trimOrNull(values.alternateNo1),
    alternateNo2: trimOrNull(values.alternateNo2),
    currentAddressLine1: trimOrNull(values.currentAddressLine1),
    currentAddressLine2: trimOrNull(values.currentAddressLine2),
    currentCity: trimOrNull(values.currentCity),
    currentState: trimOrNull(values.currentState),
    currentPostalCode: trimOrNull(values.currentPostalCode),
    currentCountry: trimOrNull(values.currentCountry),
    currentAccommodationType: trimOrNull(values.currentAccommodationType),
    permanentSameAsCurrent: values.permanentSameAsCurrent,
    permanentAddressLine1: trimOrNull(permanentSrc.line1),
    permanentAddressLine2: trimOrNull(permanentSrc.line2),
    permanentCity: trimOrNull(permanentSrc.city),
    permanentState: trimOrNull(permanentSrc.state),
    permanentPostalCode: trimOrNull(permanentSrc.postalCode),
    permanentCountry: trimOrNull(permanentSrc.country),
    permanentAccommodationType: trimOrNull(values.permanentAccommodationType),
    // Strip blank trailing rows, then keep only entries with at least a
    // name or phone. The first surviving entry is mirrored back into the
    // legacy singular columns so older readers (reports, payslips) still
    // see a primary contact.
    emergencyContacts: (() => {
      const cleaned = values.emergencyContacts
        .map((c) => ({
          name: c.name.trim(),
          phone: c.phone.trim(),
          relation: c.relation.trim(),
        }))
        .filter((c) => c.name || c.phone);
      return cleaned.length > 0 ? cleaned : null;
    })(),
    emergencyContactName:
      trimOrNull(values.emergencyContacts[0]?.name ?? values.emergencyContactName),
    emergencyPhone:
      trimOrNull(values.emergencyContacts[0]?.phone ?? values.emergencyPhone),
    emergencyRelation:
      trimOrNull(values.emergencyContacts[0]?.relation ?? values.emergencyRelation),
    permanentAddress: trimOrNull(values.permanentAddress),
    currentAddress: trimOrNull(values.currentAddress),

    // Section 3
    employmentType: trimOrNull(values.employmentType),
    department: trimOrNull(values.department),
    designation: trimOrNull(values.designation),
    companyName: trimOrNull(values.companyName),
    branch: trimOrNull(values.branch),
    status: values.status,
    dateOfJoining: values.dateOfJoining || null,
    shiftType: trimOrNull(values.shiftType),
    inTime: trimOrNull(values.inTime),
    outTime: trimOrNull(values.outTime),
    totalWorkingHours: values.totalWorkingHours,
    // FK to EngagementTeam; legacy display field kept in sync so old readers
    // that look up by name still work.
    engagementTeamId: values.engagementTeamId || null,
    employeeEngagementTeamName: trimOrNull(values.employeeEngagementTeamName),
    yearsOfAgreement: values.yearsOfAgreement,

    // Section 4
    passportUpload: trimOrNull(values.passportUpload),
    aadharCardUpload: trimOrNull(values.aadharCardUpload),
    aadharCardNo: trimOrNull(values.aadharCardNo),
    panCardUpload: trimOrNull(values.panCardUpload),

    // Section 5
    salaryMode: trimOrNull(values.salaryMode),
    // The single "Salary Amount" input drives both columns: baseSalary is the
    // HR-facing label, totalSalary is what the payroll engine reads.
    baseSalary: values.baseSalary,
    totalSalary: values.totalSalary || values.baseSalary,
    // perHourSalary is computed from CTC ÷ (22 × hours/day) at save time so
    // it stays in lock-step with the visible read-only field. Bypasses the
    // form's `perHourSalary` slot which is no longer user-editable.
    perHourSalary: (() => {
      const ctc = Number(values.baseSalary);
      const hpd = Number(values.totalWorkingHours);
      const validHpd = Number.isFinite(hpd) && hpd > 0 ? hpd : 8;
      if (!Number.isFinite(ctc) || ctc <= 0) return null;
      return (ctc / (22 * validHpd)).toFixed(2);
    })(),
    isOvertimeApplicable: values.isOvertimeApplicable,
    overTime: values.overTime,
    bonusAmount: values.bonusAmount,
    bonusAfterYears: values.bonusAfterYears,
    incrementMonth: values.incrementMonth,

    // Section 6
    bankName: trimOrNull(values.bankName),
    bankAccountNo: trimOrNull(values.bankAccountNo),
    ifscCode: trimOrNull(values.ifscCode),
    swiftCode: trimOrNull(values.swiftCode),

    // Section 7
    resignationLetterDate: values.resignationLetterDate || null,
    dateOfLeaving: values.dateOfLeaving || null,
    reasonOfLeaving: trimOrNull(values.reasonOfLeaving),
    noticeServed: values.noticeServed,
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
  // Top-of-form banner message (for cross-field errors like "fix the
  // highlighted fields"). Field-level red borders + inline messages live
  // in the `errors` map below, keyed by EmployeeFormValues field name.
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
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

  // Per-hour salary derived from monthly CTC ÷ (22 working days × hours/day).
  // 22 matches the engine's `calculateDailyPayroll` standard divisor. Hours/
  // day comes from the "Total Working Hours" field; falls back to 8 if blank
  // or non-positive. Re-computes on every render so editing CTC or hours
  // updates the visible rate immediately.
  const derivedPerHourSalary = useMemo(() => {
    const ctc = Number(values.baseSalary);
    const hoursPerDay = Number(values.totalWorkingHours);
    const validHours = Number.isFinite(hoursPerDay) && hoursPerDay > 0 ? hoursPerDay : 8;
    if (!Number.isFinite(ctc) || ctc <= 0) return "";
    const rate = ctc / (22 * validHours);
    return rate.toFixed(2);
  }, [values.baseSalary, values.totalWorkingHours]);

  // Distinct department list, derived from every existing employee in the
  // org. New names typed in the free-text fallback get added to this list
  // automatically next time the form is opened — there's no separate
  // Department table to maintain.
  const { data: empList } = useGetEmployeeListQuery();
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    empList?.employees?.forEach((e) => {
      const d = (e.department ?? "").trim();
      if (d) set.add(d);
    });
    // Include whatever was already typed on this row so an edit-page open
    // doesn't show a missing value as blank.
    if (values.department?.trim()) set.add(values.department.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [empList?.employees, values.department]);

  // Face enrollment: the user (HR) can attach a photo here so the new
  // employee is auto-enrolled into face recognition. Descriptor is
  // computed in the browser as soon as a photo is picked, giving
  // immediate "face detected / not detected" feedback before submit.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  // photoPreview holds either a remote URL (already-saved employee image,
  // shown on edit) or a freshly created blob: URL when the user picks a new
  // file. Blob URLs need URL.revokeObjectURL on unmount; remote URLs don't,
  // so the cleanup paths gate on the `blob:` prefix.
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    initial?.employeeImage ? initial.employeeImage : null,
  );
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
  // so we don't leak memory across re-picks. Remote (https://) URLs from
  // the persisted employeeImage are not blob URLs and must not be revoked.
  useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith("blob:"))
        URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  // Sync the preview with the persisted URL whenever the parent passes a
  // fresh `initial` (e.g. after save + refetch on reopen, or when the
  // RTK cache lands the updated row). Skip the sync if the user has
  // picked a new local photo this session — we don't want to wipe their
  // in-progress pick.
  useEffect(() => {
    if (photoFile) return;
    const url = initial?.employeeImage || null;
    setPhotoPreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return url;
    });
  }, [initial?.employeeImage, photoFile]);

  const onPhotoPicked = async (file: File | null) => {
    if (photoPreview && photoPreview.startsWith("blob:"))
      URL.revokeObjectURL(photoPreview);
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
    if (photoPreview && photoPreview.startsWith("blob:"))
      URL.revokeObjectURL(photoPreview);

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
    // Reset the auto-derive refs so the new initial values are captured
    // on the next pass instead of getting overwritten by a stale source.
    lastShiftSourceRef.current = null;
    lastJoinSourceRef.current = null;
  }, [initial]);

  // ── Auto-derived fields ───────────────────────────────────────────────
  // Two HR rules wired as side effects (not on every render):
  //   1. Total Working Hours = outTime - inTime (handles overnight wrap).
  //   2. Increment Month = joinMonth if joined on day 1–9, else next month.
  //
  // Both use a ref-based "skip first run" guard so a previously-saved
  // override on an existing employee isn't clobbered the moment the form
  // mounts. Only ACTUAL changes to the source field trigger a recompute.
  const lastShiftSourceRef = useRef<{ inTime: string; outTime: string } | null>(null);
  const lastJoinSourceRef = useRef<string | null>(null);

  useEffect(() => {
    const inTime = values.inTime;
    const outTime = values.outTime;
    if (lastShiftSourceRef.current === null) {
      lastShiftSourceRef.current = { inTime, outTime };
      return;
    }
    if (
      lastShiftSourceRef.current.inTime === inTime &&
      lastShiftSourceRef.current.outTime === outTime
    ) {
      return;
    }
    lastShiftSourceRef.current = { inTime, outTime };
    if (!inTime || !outTime) return;
    const hours = diffWorkingHours(inTime, outTime);
    if (hours == null) return;
    set("totalWorkingHours", String(hours));
    // `set` is stable enough — it closes over setValues; we intentionally
    // exclude it from deps to avoid the lint dance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.inTime, values.outTime]);

  useEffect(() => {
    const join = values.dateOfJoining;
    if (lastJoinSourceRef.current === null) {
      lastJoinSourceRef.current = join;
      return;
    }
    if (lastJoinSourceRef.current === join) return;
    lastJoinSourceRef.current = join;
    const month = incrementMonthFromJoining(join);
    if (month == null) return;
    set("incrementMonth", String(month));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.dateOfJoining]);

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
    // Clear the field's red highlight + inline message as soon as the user
    // starts fixing it — matches the UX from the Asset form.
    if (errors[k as string]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[k as string];
        return next;
      });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Collect every missing/invalid field in one pass so the user sees
    // ALL the highlights, not just the first one. Keyed by field name so
    // each input below can read its own error.
    const next: Record<string, string> = {};
    if (!values.firstName.trim() && !values.employeeName.trim()) {
      next.firstName = "First name is required";
    }
    if (
      values.emailAddress1 &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.emailAddress1)
    ) {
      next.emailAddress1 = "Not a valid email address";
    }
    if (
      values.emailAddress2 &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.emailAddress2)
    ) {
      next.emailAddress2 = "Not a valid email address";
    }
    if (!splitPhone(values.personalContact).number) {
      next.personalContact = "Cell number is required";
    }
    const primaryContact = values.emergencyContacts[0];
    if (!primaryContact?.name?.trim()) {
      next.emergencyContact0Name = "Contact name is required";
    }
    if (!splitPhone(primaryContact?.phone ?? "").number) {
      next.emergencyContact0Phone = "Phone is required";
    }
    if (!values.companyName.trim()) {
      next.companyName = "Company is required";
    }
    if (!values.dateOfJoining) {
      next.dateOfJoining = "Date of joining is required";
    }
    if (values.totalSalary !== "" && Number(values.totalSalary) < 0) {
      next.baseSalary = "Must be a non-negative number";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      setError(`Please fix the highlighted fields (${Object.keys(next).length}).`);
      return;
    }

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
      {/* ─── Section 1: Personal Information ─────────────────────────── */}
      <SectionHeader index={1} title="Personal Information" subtitle="Identity, DOB, nationality" />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <Field label="Salutation">
            <Select
              value={values.salutation || undefined}
              onValueChange={(v) => set("salutation", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Mr.">Mr.</SelectItem>
                <SelectItem value="Mrs.">Mrs.</SelectItem>
                <SelectItem value="Ms.">Ms.</SelectItem>
                <SelectItem value="Dr.">Dr.</SelectItem>
                <SelectItem value="Prof.">Prof.</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="First Name *" error={errors.firstName}>
            <Input
              value={values.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              placeholder="First name"
              className={errors.firstName ? "border-destructive" : ""}
            />
          </Field>
          <Field label="Last Name *">
            <Input
              value={values.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              placeholder="Last name"
            />
          </Field>
          <Field label="Date of Birth *">
            <Input
              type="date"
              value={values.dob}
              onChange={(e) => set("dob", e.target.value)}
            />
          </Field>
          <Field label="Gender">
            <Select
              value={values.gender}
              onValueChange={(v) => set("gender", v as EmployeeFormValues["gender"])}
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
          <Field label="Place of Birth">
            <Input
              value={values.placeOfBirth}
              onChange={(e) => set("placeOfBirth", e.target.value)}
              placeholder="City, country"
            />
          </Field>
          <Field label="Blood Group">
            <Select
              value={values.bloodGroup || undefined}
              onValueChange={(v) => set("bloodGroup", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                  <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Marital Status">
            <Select
              value={values.maritalStatus || undefined}
              onValueChange={(v) => set("maritalStatus", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SINGLE">Single</SelectItem>
                <SelectItem value="MARRIED">Married</SelectItem>
                <SelectItem value="DIVORCED">Divorced</SelectItem>
                <SelectItem value="WIDOWED">Widowed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Nationality">
            <Input
              value={values.nationality}
              onChange={(e) => set("nationality", e.target.value)}
              placeholder="Indian"
            />
          </Field>

          {/* Employee Image — full-width inside Section 1 */}
          <div className="sm:col-span-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Employee Image
            </Label>
            <p className="text-[11px] text-muted-foreground mb-2">
              Profile photo. Optional — used as the avatar everywhere. If a face is detected and the consent box is ticked, also enrolled for face-recognition attendance.
            </p>
            <div className="flex items-start gap-4">
              <div className="flex h-28 w-28 flex-none items-center justify-center overflow-hidden rounded-md border bg-gray-50">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreview}
                    alt="Selected employee photo"
                    className="h-full w-full object-cover"
                    onError={(ev) => {
                      // Make a broken/404 image URL visible instead of
                      // silently showing an empty box. The persisted URL
                      // sometimes won't resolve (upload host down, file
                      // moved, CORS) — surface it so HR knows to reupload
                      // rather than wondering why the avatar disappeared.
                      const img = ev.currentTarget;
                      img.style.display = "none";
                      const fallback = img.nextElementSibling as HTMLElement | null;
                      if (fallback) fallback.style.display = "flex";
                    }}
                  />
                ) : (
                  <Upload className="h-6 w-6 text-gray-400" />
                )}
                {photoPreview && (
                  <div
                    className="hidden h-full w-full flex-col items-center justify-center gap-1 text-[10px] text-red-600 text-center px-1"
                    aria-hidden="true"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <span>Photo failed to load</span>
                  </div>
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
                    {photoFile || photoPreview ? "Replace photo" : "Choose images..."}
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
                  {(photoFile || photoPreview) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        clearPhoto();
                        // Mark the persisted URL for removal too — toApiPayload
                        // reads values.employeeImage, so blanking it sends
                        // null and the DB column gets cleared on save.
                        set("employeeImage", "");
                      }}
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
                    No face detected. Photo saved as avatar only.
                  </div>
                )}
                {photoStatus === "multiple_faces" && (
                  <div className="flex items-center gap-1.5 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {photoFaceCount} faces detected. Choose a solo photo.
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
              <label className="mt-3 flex items-start gap-2 rounded-md border bg-amber-50/40 p-3 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={photoConsent}
                  onChange={(e) => setPhotoConsent(e.target.checked)}
                />
                <span>
                  I confirm this employee consents to face-recognition for attendance verification. A 128-number face fingerprint will be stored (the original photo is kept as the avatar). Consent timestamp is recorded for audit.
                </span>
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Section 2: Contact Information ──────────────────────────── */}
      <SectionHeader index={2} title="Contact Information" subtitle="Email, phone, addresses, emergency" />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <Field label="Personal Email" error={errors.emailAddress1}>
            <Input
              type="email"
              value={values.emailAddress1}
              onChange={(e) => set("emailAddress1", e.target.value)}
              placeholder="personal@example.com"
              className={errors.emailAddress1 ? "border-destructive" : ""}
            />
          </Field>
          <Field label="Company Email" error={errors.emailAddress2}>
            <Input
              type="email"
              value={values.emailAddress2}
              onChange={(e) => set("emailAddress2", e.target.value)}
              placeholder="work@company.com"
              className={errors.emailAddress2 ? "border-destructive" : ""}
            />
          </Field>
          <Field label="Cell Number *" className="sm:col-span-2" error={errors.personalContact}>
            <PhoneInput
              value={values.personalContact}
              onChange={(v) => set("personalContact", v)}
              placeholder="Primary phone"
              hasError={!!errors.personalContact}
            />
          </Field>

          {/* Current Address */}
          <fieldset className="sm:col-span-2 rounded-md border p-3 space-y-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Current Address
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Address Line 1">
                <Input
                  value={values.currentAddressLine1}
                  onChange={(e) => set("currentAddressLine1", e.target.value)}
                  placeholder="Street address, house no."
                />
              </Field>
              <Field label="Address Line 2">
                <Input
                  value={values.currentAddressLine2}
                  onChange={(e) => set("currentAddressLine2", e.target.value)}
                  placeholder="Apartment, suite, floor"
                />
              </Field>
              <Field label="City / District">
                <Input
                  value={values.currentCity}
                  onChange={(e) => set("currentCity", e.target.value)}
                  placeholder="Enter City"
                />
              </Field>
              <Field label="State / Province">
                <Input
                  value={values.currentState}
                  onChange={(e) => set("currentState", e.target.value)}
                  placeholder="Enter State"
                />
              </Field>
              <Field label="Postal / Zip Code">
                <Input
                  value={values.currentPostalCode}
                  onChange={(e) => set("currentPostalCode", e.target.value)}
                  placeholder="Enter Postal Code"
                />
              </Field>
              <Field label="Country">
                <CountrySelect
                  value={values.currentCountry}
                  onChange={(v) => set("currentCountry", v)}
                />
              </Field>
              <Field label="Continent" hint="Auto-filled from country">
                <Input
                  value={continentFor(values.currentCountry)}
                  readOnly
                  disabled
                  placeholder="—"
                />
              </Field>
              <Field label="Current Accommodation Type" className="sm:col-span-2">
                <Select
                  value={values.currentAccommodationType || undefined}
                  onValueChange={(v) => set("currentAccommodationType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWNED">Owned</SelectItem>
                    <SelectItem value="RENTED">Rented</SelectItem>
                    <SelectItem value="COMPANY_PROVIDED">Company-provided</SelectItem>
                    <SelectItem value="FAMILY">Family</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </fieldset>

          {/* Permanent Address */}
          <fieldset className="sm:col-span-2 rounded-md border p-3 space-y-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Permanent Address
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={values.permanentSameAsCurrent}
                onCheckedChange={(c) => set("permanentSameAsCurrent", c)}
              />
              Same as Current Address
            </label>
            {!values.permanentSameAsCurrent && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Address Line 1">
                  <Input
                    value={values.permanentAddressLine1}
                    onChange={(e) => set("permanentAddressLine1", e.target.value)}
                    placeholder="Street address, house no."
                  />
                </Field>
                <Field label="Address Line 2">
                  <Input
                    value={values.permanentAddressLine2}
                    onChange={(e) => set("permanentAddressLine2", e.target.value)}
                    placeholder="Apartment, suite, floor"
                  />
                </Field>
                <Field label="City / District">
                  <Input
                    value={values.permanentCity}
                    onChange={(e) => set("permanentCity", e.target.value)}
                  />
                </Field>
                <Field label="State / Province">
                  <Input
                    value={values.permanentState}
                    onChange={(e) => set("permanentState", e.target.value)}
                  />
                </Field>
                <Field label="Postal / Zip Code">
                  <Input
                    value={values.permanentPostalCode}
                    onChange={(e) => set("permanentPostalCode", e.target.value)}
                  />
                </Field>
                <Field label="Country">
                  <CountrySelect
                    value={values.permanentCountry}
                    onChange={(v) => set("permanentCountry", v)}
                  />
                </Field>
                <Field label="Continent" hint="Auto-filled from country">
                  <Input
                    value={continentFor(values.permanentCountry)}
                    readOnly
                    disabled
                    placeholder="—"
                  />
                </Field>
              </div>
            )}
            <Field label="Permanent Accommodation Type">
              <Select
                value={values.permanentAccommodationType || undefined}
                onValueChange={(v) => set("permanentAccommodationType", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNED">Owned</SelectItem>
                  <SelectItem value="RENTED">Rented</SelectItem>
                  <SelectItem value="FAMILY">Family</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </fieldset>

          {/* Emergency Contacts — repeatable list. First row is required;
              the "+" button appends another contact, "×" removes a non-
              primary row. */}
          <fieldset className="sm:col-span-2 rounded-md border p-3 space-y-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              Emergency Contacts
            </legend>
            {values.emergencyContacts.map((contact, idx) => {
              const isPrimary = idx === 0;
              return (
                <div
                  key={idx}
                  className="grid gap-3 sm:grid-cols-12 items-end border-b last:border-b-0 pb-3 last:pb-0"
                >
                  <div className="sm:col-span-4 space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Contact Name{" "}
                      {isPrimary && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      value={contact.name}
                      onChange={(e) => {
                        const next = [...values.emergencyContacts];
                        next[idx] = { ...next[idx], name: e.target.value };
                        set("emergencyContacts", next);
                        if (isPrimary && errors.emergencyContact0Name) {
                          setErrors((er) => {
                            const n = { ...er };
                            delete n.emergencyContact0Name;
                            return n;
                          });
                        }
                      }}
                      placeholder="Full name"
                      className={isPrimary && errors.emergencyContact0Name ? "border-destructive" : ""}
                    />
                    {isPrimary && errors.emergencyContact0Name && (
                      <p className="text-[11px] text-destructive flex items-center gap-1">
                        <span aria-hidden>⚠</span>
                        {errors.emergencyContact0Name}
                      </p>
                    )}
                  </div>
                  <div className="sm:col-span-5 space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Phone{" "}
                      {isPrimary && <span className="text-destructive">*</span>}
                    </Label>
                    <PhoneInput
                      value={contact.phone}
                      hasError={isPrimary && !!errors.emergencyContact0Phone}
                      onChange={(v) => {
                        const next = [...values.emergencyContacts];
                        next[idx] = { ...next[idx], phone: v };
                        set("emergencyContacts", next);
                        if (isPrimary && errors.emergencyContact0Phone) {
                          setErrors((er) => {
                            const n = { ...er };
                            delete n.emergencyContact0Phone;
                            return n;
                          });
                        }
                      }}
                      placeholder="Phone"
                    />
                    {isPrimary && errors.emergencyContact0Phone && (
                      <p className="text-[11px] text-destructive flex items-center gap-1">
                        <span aria-hidden>⚠</span>
                        {errors.emergencyContact0Phone}
                      </p>
                    )}
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Relation
                    </Label>
                    <Input
                      value={contact.relation}
                      onChange={(e) => {
                        const next = [...values.emergencyContacts];
                        next[idx] = { ...next[idx], relation: e.target.value };
                        set("emergencyContacts", next);
                      }}
                      placeholder="e.g. Father"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    {!isPrimary && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const next = values.emergencyContacts.filter(
                            (_, i) => i !== idx,
                          );
                          set("emergencyContacts", next);
                        }}
                        title="Remove contact"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                set("emergencyContacts", [
                  ...values.emergencyContacts,
                  { name: "", phone: "", relation: "" },
                ]);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add another contact
            </Button>
          </fieldset>
        </CardContent>
      </Card>

      {/* ─── Section 3: Employment Details ───────────────────────────── */}
      <SectionHeader index={3} title="Employment Details" subtitle="Company, department, shift, joining" />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <Field label="Employment Type">
            <Select
              value={values.employmentType || undefined}
              onValueChange={(v) => set("employmentType", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_TIME">Full-time</SelectItem>
                <SelectItem value="PART_TIME">Part-time</SelectItem>
                <SelectItem value="CONTRACT">Contract</SelectItem>
                <SelectItem value="INTERN">Intern</SelectItem>
                <SelectItem value="PROBATION">Probation</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Employee ID" hint="Will be generated on submit">
            <Input value="" disabled placeholder="# Will be generated on submit" />
          </Field>
          <Field
            label="Department"
            hint={
              departmentOptions.length > 0
                ? "Pick from existing departments or type a new one"
                : "Type a new department name"
            }
          >
            <DepartmentCombobox
              value={values.department}
              options={departmentOptions}
              onChange={(v) => set("department", v)}
            />
          </Field>
          <Field label="Company *" error={errors.companyName}>
            <Input
              value={values.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="Company name"
              className={errors.companyName ? "border-destructive" : ""}
            />
          </Field>
          <Field label="Branch">
            <Input
              value={values.branch}
              onChange={(e) => set("branch", e.target.value)}
              placeholder="Branch / location"
            />
          </Field>
          <Field label="Date of Joining *" error={errors.dateOfJoining}>
            <Input
              type="date"
              value={values.dateOfJoining}
              onChange={(e) => set("dateOfJoining", e.target.value)}
              className={errors.dateOfJoining ? "border-destructive" : ""}
            />
          </Field>
          <Field label="Shift Type">
            <Select
              value={values.shiftType || undefined}
              onValueChange={(v) => set("shiftType", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GENERAL">General</SelectItem>
                <SelectItem value="MORNING">Morning</SelectItem>
                <SelectItem value="EVENING">Evening</SelectItem>
                <SelectItem value="NIGHT">Night</SelectItem>
                <SelectItem value="ROTATIONAL">Rotational</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="In Time" hint="Scheduled in time">
            <Input
              type="time"
              value={values.inTime}
              onChange={(e) => set("inTime", e.target.value)}
            />
          </Field>
          <Field label="Out Time" hint="Scheduled out time">
            <Input
              type="time"
              value={values.outTime}
              onChange={(e) => set("outTime", e.target.value)}
            />
          </Field>
          <Field label="Total Working Hours">
            <Input
              type="number"
              inputMode="decimal"
              value={values.totalWorkingHours}
              onChange={(e) => set("totalWorkingHours", e.target.value)}
              placeholder="8"
            />
          </Field>
          <Field label="Employee Engagement Team">
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
                // Keep the legacy display field in sync with the chosen team
                // so old readers (grid, reports) that look up by name still work.
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
                    .filter((t) => t.isActive || t.id === values.engagementTeamId)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: t.color ?? "#94a3b8" }}
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
          <Field label="Status *">
            <Select
              value={values.status}
              onValueChange={(v) => set("status", v as EmployeeFormValues["status"])}
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
          <Field label="Years of Agreement While Joining" className="sm:col-span-2">
            <Input
              type="number"
              value={values.yearsOfAgreement}
              onChange={(e) => set("yearsOfAgreement", e.target.value)}
              placeholder="Years"
            />
          </Field>
        </CardContent>
      </Card>

      {/* ─── Section 4: Document Uploads ─────────────────────────────── */}
      <SectionHeader index={4} title="Document Uploads" subtitle="Passport, Aadhar, PAN" />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <Field label="Passport Upload">
            <DocumentUpload
              value={values.passportUpload}
              onChange={(url) => set("passportUpload", url)}
              uploadType="passport"
              accept="application/pdf,image/*"
            />
          </Field>
          <Field label="Aadhar Card Upload">
            <DocumentUpload
              value={values.aadharCardUpload}
              onChange={(url) => set("aadharCardUpload", url)}
              uploadType="aadhar"
              accept="application/pdf,image/*"
            />
          </Field>
          <Field label="PAN Card Upload">
            <DocumentUpload
              value={values.panCardUpload}
              onChange={(url) => set("panCardUpload", url)}
              uploadType="pan"
              accept="application/pdf,image/*"
            />
          </Field>
          <Field label="Aadhaar Number">
            <Input
              value={values.aadharCardNo}
              onChange={(e) => set("aadharCardNo", e.target.value)}
              placeholder="XXXX XXXX XXXX"
            />
          </Field>
        </CardContent>
      </Card>

      {/* ─── Section 5: Salary & Compensation ────────────────────────── */}
      <SectionHeader
        index={5}
        title="Salary & Compensation"
        subtitle="Monthly CTC drives Pay Rules. Bonus Amount is paid above CTC."
      />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <Field label="Salary Mode">
            <Select
              value={values.salaryMode || undefined}
              onValueChange={(v) => set("salaryMode", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Salary Amount (Monthly CTC)"
            hint="Drives the payslip via the assigned Pay Rule Profile. Pay-rule bonuses (statutory / performance / festival / joining / retention) are absorbed into this CTC."
            error={errors.baseSalary}
          >
            <Input
              type="number"
              inputMode="decimal"
              value={values.baseSalary}
              onChange={(e) => {
                set("baseSalary", e.target.value);
                // Mirror into totalSalary too — the payroll engine reads
                // Employee.totalSalary as the structure base. Keeping one
                // input prevents the two columns drifting apart.
                set("totalSalary", e.target.value);
              }}
              placeholder="e.g. 50000"
              className={errors.baseSalary ? "border-destructive" : ""}
            />
          </Field>
          <Field
            label="Bonus Amount (above CTC)"
            hint="Paid every month on top of CTC — appears as a separate Bonus line on the payslip and is included in gross."
          >
            <Input
              type="number"
              inputMode="decimal"
              value={values.bonusAmount}
              onChange={(e) => set("bonusAmount", e.target.value)}
              placeholder="e.g. 2000"
            />
          </Field>
          <Field
            label="Per Hour Salary"
            hint="Auto-calculated: CTC ÷ (22 days × hours/day). Reference only — overtime uses the 'Overtime Rate' field below (if set) × the Pay Rule's multiplier, otherwise (CTC/working-days)/8 × multiplier."
          >
            <Input
              type="number"
              inputMode="decimal"
              value={derivedPerHourSalary}
              readOnly
              disabled
              placeholder="—"
            />
          </Field>
          <Field label="Is Overtime Applicable">
            <div className="flex items-center gap-3 pt-1">
              <Switch
                checked={values.isOvertimeApplicable}
                onCheckedChange={(c) => set("isOvertimeApplicable", c)}
              />
              <span className="text-sm text-muted-foreground">
                {values.isOvertimeApplicable ? "Yes — overtime applicable" : "No"}
              </span>
            </div>
          </Field>
          <Field label="Overtime Rate">
            <Input
              type="number"
              inputMode="decimal"
              value={values.overTime}
              onChange={(e) => set("overTime", e.target.value)}
              placeholder="Rate per overtime hour"
              disabled={!values.isOvertimeApplicable}
            />
          </Field>
          <Field label="Bonus After How Many Years">
            <Input
              type="number"
              value={values.bonusAfterYears}
              onChange={(e) => set("bonusAfterYears", e.target.value)}
              placeholder="Years"
            />
          </Field>
          <Field label="Increment Month" hint="Month annual increment is due" className="sm:col-span-2">
            <Select
              value={values.incrementMonth || undefined}
              onValueChange={(v) => set("incrementMonth", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {/* ─── Section 6: Bank Details ─────────────────────────────────── */}
      <SectionHeader index={6} title="Bank Details" subtitle="Salary bank account" />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <Field label="Bank Account No">
            <Input
              value={values.bankAccountNo}
              onChange={(e) => set("bankAccountNo", e.target.value)}
            />
          </Field>
          <Field label="IFSC Code" hint="For domestic transfers (India)">
            <Input
              value={values.ifscCode}
              onChange={(e) => set("ifscCode", e.target.value.toUpperCase())}
              placeholder="e.g. HDFC0001234"
            />
          </Field>
          <Field label="Bank Name">
            <Input
              value={values.bankName}
              onChange={(e) => set("bankName", e.target.value)}
            />
          </Field>
          <Field label="SWIFT / BIC Code" hint="For international wire transfers (8 or 11 chars)">
            <Input
              value={values.swiftCode}
              onChange={(e) => set("swiftCode", e.target.value.toUpperCase())}
              placeholder="e.g. HDFCINBBXXX"
              maxLength={11}
            />
          </Field>
        </CardContent>
      </Card>

      {/* ─── Section 7: Exit / Resignation ───────────────────────────── */}
      <SectionHeader index={7} title="Exit / Resignation" subtitle="Resignation and relieving details" />
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <Field label="Resignation Letter Date">
            <Input
              type="date"
              value={values.resignationLetterDate}
              onChange={(e) => set("resignationLetterDate", e.target.value)}
            />
          </Field>
          <Field label="Relieving Date">
            <Input
              type="date"
              value={values.dateOfLeaving}
              onChange={(e) => set("dateOfLeaving", e.target.value)}
            />
          </Field>
          <Field label="Reason of Leaving" className="sm:col-span-1">
            <Textarea
              value={values.reasonOfLeaving}
              onChange={(e) => set("reasonOfLeaving", e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="Notice period served">
            <div className="flex items-center gap-3 pt-1">
              <Switch
                checked={values.noticeServed}
                onCheckedChange={(c) => set("noticeServed", c)}
              />
              <span className="text-sm text-muted-foreground">
                {values.noticeServed ? "Notice Served" : "Not yet"}
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
  error,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  // When set, the field renders an inline red message and the asterisk
  // in `label` (if any) is colored red. The actual red border on the
  // input has to be applied where the input is rendered (we don't wrap
  // children) because the Input component takes its own className.
  error?: string;
}) {
  // Detect a trailing "*" and color it red — purely cosmetic so required
  // fields stand out even before submit.
  const hasAsterisk = label.endsWith("*");
  const cleanLabel = hasAsterisk ? label.replace(/\s*\*$/, "") : label;
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">
        {cleanLabel}
        {hasAsterisk && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive flex items-center gap-1">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      ) : (
        hint && <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// Employee-engagement team roster. Names normalized to Title Case and the
// "deseart" typo corrected to "Desert". Update this list when a new team
// is formed — the form auto-surfaces any legacy value not in this list
// as a "(legacy)" option so older employees keep their existing team.
const ENGAGEMENT_TEAMS: string[] = [
  "Finance Dreamers",
  "Lakshya",
  "Micro Makers",
  "Nessco Avengers",
  "Nessco Knight Riders",
  "Panthers",
  "Team Mahakal",
  "The Desert Kings",
];

// Country → continent lookup used by both the dropdown options and the
// auto-filled Continent display next to each country field. Sorted
// alphabetically so the dropdown lists countries in a predictable order.
// Coverage targets the regions HR commonly hires from; extend the list
// when you start sourcing from a country that isn't here.
const COUNTRIES: { name: string; continent: string }[] = [
  { name: "Afghanistan", continent: "Asia" },
  { name: "Algeria", continent: "Africa" },
  { name: "Argentina", continent: "South America" },
  { name: "Australia", continent: "Oceania" },
  { name: "Austria", continent: "Europe" },
  { name: "Bangladesh", continent: "Asia" },
  { name: "Belgium", continent: "Europe" },
  { name: "Bhutan", continent: "Asia" },
  { name: "Brazil", continent: "South America" },
  { name: "Cambodia", continent: "Asia" },
  { name: "Canada", continent: "North America" },
  { name: "Chile", continent: "South America" },
  { name: "China", continent: "Asia" },
  { name: "Colombia", continent: "South America" },
  { name: "Czech Republic", continent: "Europe" },
  { name: "Denmark", continent: "Europe" },
  { name: "Egypt", continent: "Africa" },
  { name: "Finland", continent: "Europe" },
  { name: "France", continent: "Europe" },
  { name: "Germany", continent: "Europe" },
  { name: "Greece", continent: "Europe" },
  { name: "Hong Kong", continent: "Asia" },
  { name: "Hungary", continent: "Europe" },
  { name: "Iceland", continent: "Europe" },
  { name: "India", continent: "Asia" },
  { name: "Indonesia", continent: "Asia" },
  { name: "Iran", continent: "Asia" },
  { name: "Iraq", continent: "Asia" },
  { name: "Ireland", continent: "Europe" },
  { name: "Israel", continent: "Asia" },
  { name: "Italy", continent: "Europe" },
  { name: "Japan", continent: "Asia" },
  { name: "Jordan", continent: "Asia" },
  { name: "Kenya", continent: "Africa" },
  { name: "Kuwait", continent: "Asia" },
  { name: "Malaysia", continent: "Asia" },
  { name: "Maldives", continent: "Asia" },
  { name: "Mexico", continent: "North America" },
  { name: "Morocco", continent: "Africa" },
  { name: "Myanmar", continent: "Asia" },
  { name: "Nepal", continent: "Asia" },
  { name: "Netherlands", continent: "Europe" },
  { name: "New Zealand", continent: "Oceania" },
  { name: "Nigeria", continent: "Africa" },
  { name: "Norway", continent: "Europe" },
  { name: "Oman", continent: "Asia" },
  { name: "Pakistan", continent: "Asia" },
  { name: "Peru", continent: "South America" },
  { name: "Philippines", continent: "Asia" },
  { name: "Poland", continent: "Europe" },
  { name: "Portugal", continent: "Europe" },
  { name: "Qatar", continent: "Asia" },
  { name: "Romania", continent: "Europe" },
  { name: "Russia", continent: "Europe" },
  { name: "Saudi Arabia", continent: "Asia" },
  { name: "Singapore", continent: "Asia" },
  { name: "South Africa", continent: "Africa" },
  { name: "South Korea", continent: "Asia" },
  { name: "Spain", continent: "Europe" },
  { name: "Sri Lanka", continent: "Asia" },
  { name: "Sweden", continent: "Europe" },
  { name: "Switzerland", continent: "Europe" },
  { name: "Taiwan", continent: "Asia" },
  { name: "Thailand", continent: "Asia" },
  { name: "Turkey", continent: "Asia" },
  { name: "Ukraine", continent: "Europe" },
  { name: "United Arab Emirates", continent: "Asia" },
  { name: "United Kingdom", continent: "Europe" },
  { name: "United States", continent: "North America" },
  { name: "Uzbekistan", continent: "Asia" },
  { name: "Vietnam", continent: "Asia" },
];

function continentFor(country: string): string {
  if (!country) return "";
  return COUNTRIES.find((c) => c.name === country)?.continent ?? "";
}

// Country dropdown. Uses the same Radix Select primitive as the other
// dropdowns for visual consistency. Free-text entries from older rows
// (e.g. "Bharat" for India) are surfaced as a custom option at the top
// so editing an existing employee never silently drops their value.
function CountrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const known = COUNTRIES.some((c) => c.name === value);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select country" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {value && !known && (
          <SelectItem value={value}>{value} (legacy)</SelectItem>
        )}
        {COUNTRIES.map((c) => (
          <SelectItem key={c.name} value={c.name}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Department picker: dropdown of names already in use across the org +
// inline "type custom" mode for when HR is creating a brand-new department.
// Switching to custom is one click; once a typed name is saved it'll show
// up in the dropdown for the next form open.
function DepartmentCombobox({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const valueInOptions = !!value && options.includes(value);
  const [mode, setMode] = useState<"select" | "custom">(
    options.length === 0 || (value && !valueInOptions) ? "custom" : "select",
  );
  if (mode === "select" && options.length > 0) {
    return (
      <div className="flex gap-2">
        <Select
          value={value || undefined}
          onValueChange={(v) => {
            if (v === "__new__") {
              setMode("custom");
              onChange("");
              return;
            }
            onChange(v);
          }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a department" />
          </SelectTrigger>
          <SelectContent>
            {options.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
            <SelectItem value="__new__">+ Add new department…</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Engineering"
        className="flex-1"
        autoFocus={mode === "custom"}
      />
      {options.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMode("select")}
        >
          Pick existing
        </Button>
      )}
    </div>
  );
}

// Common country dial codes for phone fields. India (+91) is the default
// since this is the main user base; widen the list if you start hiring
// across more regions. Storage format is the joined string
// "<code> <number>" so a single text column round-trips it.
const COUNTRY_DIAL_CODES: { code: string; flag: string; country: string }[] = [
  { code: "+91", flag: "🇮🇳", country: "India" },
  { code: "+1", flag: "🇺🇸", country: "USA / Canada" },
  { code: "+44", flag: "🇬🇧", country: "UK" },
  { code: "+971", flag: "🇦🇪", country: "UAE" },
  { code: "+61", flag: "🇦🇺", country: "Australia" },
  { code: "+65", flag: "🇸🇬", country: "Singapore" },
  { code: "+49", flag: "🇩🇪", country: "Germany" },
  { code: "+33", flag: "🇫🇷", country: "France" },
  { code: "+81", flag: "🇯🇵", country: "Japan" },
  { code: "+86", flag: "🇨🇳", country: "China" },
  { code: "+852", flag: "🇭🇰", country: "Hong Kong" },
  { code: "+92", flag: "🇵🇰", country: "Pakistan" },
  { code: "+880", flag: "🇧🇩", country: "Bangladesh" },
  { code: "+94", flag: "🇱🇰", country: "Sri Lanka" },
  { code: "+977", flag: "🇳🇵", country: "Nepal" },
];

const flagForDialCode = (code: string): string =>
  COUNTRY_DIAL_CODES.find((c) => c.code === code)?.flag ?? "🌐";

// Splits a stored phone string into (dial code, local number). Recognises
// any code from COUNTRY_DIAL_CODES that appears at the start. Falls back
// to "+91" for plain 10-digit Indian numbers stored by the old form.
function splitPhone(raw: string): { code: string; number: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { code: "+91", number: "" };
  // Match the longest dial code first so "+971" wins over "+9".
  const sorted = [...COUNTRY_DIAL_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (trimmed.startsWith(c.code)) {
      return { code: c.code, number: trimmed.slice(c.code.length).trim() };
    }
  }
  return { code: "+91", number: trimmed };
}

// Phone field with a country-code dropdown + number input. The combined
// value is stored as "<code> <number>" in the existing string column so
// no schema change is needed. Re-derives the split on every render from
// the canonical `value` prop — the parent state is the source of truth.
function PhoneInput({
  value,
  onChange,
  placeholder,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  // When true, the number input renders with a red border to flag a
  // validation issue. The parent's <Field error="…"> still owns the
  // inline message text.
  hasError?: boolean;
}) {
  const { code, number } = splitPhone(value);
  const emit = (nextCode: string, nextNumber: string) => {
    const cleaned = nextNumber.replace(/[^\d]/g, "");
    onChange(cleaned ? `${nextCode} ${cleaned}` : "");
  };
  return (
    <div className="flex gap-1.5">
      <Select value={code} onValueChange={(c) => emit(c, number)}>
        <SelectTrigger className="w-[88px] flex-none px-2 gap-1">
          <SelectValue>
            <span className="flex items-center gap-1 text-sm">
              <span className="leading-none">{flagForDialCode(code)}</span>
              <span>{code}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_DIAL_CODES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              <span className="flex items-center gap-2">
                <span>{c.flag}</span>
                <span className="font-medium tabular-nums">{c.code}</span>
                <span className="text-muted-foreground">{c.country}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        inputMode="tel"
        value={number}
        onChange={(e) => emit(code, e.target.value)}
        placeholder={placeholder}
        className={`flex-1 ${hasError ? "border-destructive" : ""}`}
      />
    </div>
  );
}

// File picker bound to `/api/upload`. Stores the returned public URL in
// the form value so the employee record persists a link, not a blob. PDFs
// and images both flow through the same endpoint (it's filename-based,
// not type-based). The component handles uploading, error, and the
// already-uploaded state with a clickable preview + Remove.
function DocumentUpload({
  value,
  onChange,
  uploadType,
  accept,
}: {
  value: string;
  onChange: (url: string) => void;
  uploadType: string;
  accept: string;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const onPick = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", uploadType);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.imageUrl) {
        throw new Error(json?.error ?? `Upload failed (${res.status})`);
      }
      onChange(json.imageUrl);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err?.message ?? "Unknown error",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Derive a short display name from the URL — the timestamp prefix the
  // server adds is hidden so HR sees "passport.pdf" not "passport_1700_…".
  const displayName = (() => {
    if (!value) return "";
    const last = value.split("/").pop() ?? value;
    return last.replace(/^[a-z]+_\d+_/i, "");
  })();

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      {value ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="flex-1 truncate text-primary underline-offset-2 hover:underline"
            title={displayName}
          >
            {displayName || "View file"}
          </a>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            disabled={uploading}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start font-normal text-muted-foreground"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-3.5 w-3.5" />
              Choose file (PDF or image)
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// Section banner that prefixes each of the 7 ordered sections. Mirrors the
// visual style from the form-builder screenshots — a circular index badge
// in primary tint, the section title, and a subtitle describing what lives
// inside.
function SectionHeader({
  index,
  title,
  subtitle,
}: {
  index: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 px-1 pt-2">
      <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {index}
      </span>
      <div>
        <p className="text-base font-semibold leading-tight">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
