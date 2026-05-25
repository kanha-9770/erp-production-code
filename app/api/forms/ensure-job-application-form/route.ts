/**
 * POST /api/forms/ensure-job-application-form
 *
 * Find-or-create the Job Application form-builder form for the caller's org,
 * seeded with the same fields rendered by /components/job-application/
 * job-application-form.tsx. Used by the "Customize form" button to deep-link
 * into `/builder/<id>`. Admin only.
 */

export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import {
  ensureStaticForm,
  type StaticFormSectionSpec,
} from "@/lib/forms/ensure-static-form";

const SECTIONS: StaticFormSectionSpec[] = [
  {
    title: "Candidate",
    columns: 2,
    fields: [
      { coreKey: "jobOpeningId", label: "Job Opening ID", type: "select", placeholder: "Select…" },
      { coreKey: "staffingPlanId", label: "Staffing Plan ID", type: "text", placeholder: "—" },
      { coreKey: "department", label: "Department", type: "text", placeholder: "e.g. Engineering" },
      { coreKey: "designation", label: "Designation", type: "text", placeholder: "Job title" },
      {
        coreKey: "employmentType",
        label: "Employment Type",
        type: "select",
        options: [
          { label: "Full-time", value: "FULL_TIME" },
          { label: "Part-time", value: "PART_TIME" },
          { label: "Contract", value: "CONTRACT" },
          { label: "Intern", value: "INTERN" },
          { label: "Temporary", value: "TEMPORARY" },
          { label: "Consultant", value: "CONSULTANT" },
        ],
      },
      { coreKey: "applicantName", label: "Applicant Name", type: "text", required: true, placeholder: "Full name" },
      { coreKey: "applicantEmail", label: "Applicant Email", type: "email", required: true, placeholder: "name@example.com" },
      { coreKey: "applicantMobile", label: "Applicant Mobile Number", type: "phone", required: true, placeholder: "+91 98xxxxxxxx" },
      {
        coreKey: "applicantSource",
        label: "Applicant Source",
        type: "select",
        options: [
          { label: "Employee referral", value: "REFERRAL" },
          { label: "Job portal", value: "JOB_PORTAL" },
          { label: "Company website", value: "COMPANY_WEBSITE" },
          { label: "LinkedIn", value: "LINKEDIN" },
          { label: "Recruitment agency", value: "AGENCY" },
          { label: "Walk-in", value: "WALK_IN" },
          { label: "Campus placement", value: "CAMPUS" },
          { label: "Other", value: "OTHER" },
        ],
      },
      { coreKey: "salaryExpectation", label: "Salary Expectation", type: "text", placeholder: "e.g. 12 LPA" },
      { coreKey: "coverLetter", label: "Cover Letter", type: "textarea" },
      { coreKey: "jobDescription", label: "Job Description", type: "textarea", placeholder: "Copied from opening — editable." },
    ],
  },
  {
    title: "Status",
    columns: 2,
    fields: [
      { coreKey: "applicantRating", label: "Applicant Rating", type: "number", placeholder: "Internal rating 1–5" },
      {
        coreKey: "status",
        label: "Status",
        type: "select",
        required: true,
        options: [
          { label: "New", value: "NEW" },
          { label: "Screening", value: "SCREENING" },
          { label: "Interviewing", value: "INTERVIEWING" },
          { label: "Shortlisted", value: "SHORTLISTED" },
          { label: "Offered", value: "OFFERED" },
          { label: "Hired", value: "HIRED" },
          { label: "On hold", value: "ON_HOLD" },
          { label: "Rejected", value: "REJECTED" },
          { label: "Withdrawn", value: "WITHDRAWN" },
        ],
      },
    ],
  },
];

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    if (!user.organizationId) return NextResponse.json({ success: false, error: "No organization" }, { status: 403 });
    if (!(await isUserAdmin(user.id, user.organizationId))) {
      return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 });
    }
    const result = await ensureStaticForm({
      user: { id: user.id, organizationId: user.organizationId },
      kind: "jobApplication",
      formName: "Job Application",
      formDescription: "Candidate applications against an open role. Add custom fields here to extend the application capture across the app.",
      moduleName: "Recruitment",
      moduleIcon: "briefcase",
      sections: SECTIONS,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[POST /api/forms/ensure-job-application-form]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to ensure form" },
      { status: 500 },
    );
  }
}
