/**
 * POST /api/forms/ensure-job-opening-form
 *
 * Find-or-create the Job Opening form-builder form for the caller's org.
 * Admin only.
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
    title: "Job Opening",
    columns: 2,
    fields: [
      { coreKey: "staffingPlanId", label: "Staffing Plan", type: "select", placeholder: "Select…" },
      { coreKey: "profileName", label: "Profile Name", type: "text", required: true, placeholder: "e.g. Senior Developer" },
      { coreKey: "department", label: "Department", type: "text", required: true, placeholder: "e.g. Engineering" },
      { coreKey: "designation", label: "Designation", type: "text", required: true, placeholder: "Job title" },
      {
        coreKey: "employmentType",
        label: "Employment Type",
        type: "select",
        required: true,
        options: [
          { label: "Full-time", value: "FULL_TIME" },
          { label: "Part-time", value: "PART_TIME" },
          { label: "Contract", value: "CONTRACT" },
          { label: "Intern", value: "INTERN" },
          { label: "Temporary", value: "TEMPORARY" },
          { label: "Consultant", value: "CONSULTANT" },
        ],
      },
      { coreKey: "vacancies", label: "No. of Vacancies", type: "number", required: true, placeholder: "1" },
      {
        coreKey: "status",
        label: "Status",
        type: "select",
        required: true,
        options: [
          { label: "Draft", value: "DRAFT" },
          { label: "Open", value: "OPEN" },
          { label: "On hold", value: "ON_HOLD" },
          { label: "Closed", value: "CLOSED" },
          { label: "Cancelled", value: "CANCELLED" },
        ],
      },
      { coreKey: "publishOnWebsite", label: "Make visible on public career page", type: "checkbox" },
      { coreKey: "salaryApprox", label: "Salary Approx", type: "text", placeholder: "e.g. 10–15 LPA" },
      { coreKey: "jobDescription", label: "Job Description", type: "textarea", required: true, placeholder: "Responsibilities and requirements" },
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
      kind: "jobOpening",
      formName: "Job Opening",
      formDescription: "Open roles published internally or on the careers page. Add custom fields here to extend the opening across the app.",
      moduleName: "Recruitment",
      moduleIcon: "briefcase",
      sections: SECTIONS,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[POST /api/forms/ensure-job-opening-form]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to ensure form" },
      { status: 500 },
    );
  }
}
