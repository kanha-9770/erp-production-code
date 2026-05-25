/**
 * POST /api/forms/ensure-staffing-plan-form
 *
 * Find-or-create the Staffing Plan form-builder form for the caller's org.
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
    title: "Staffing Plan",
    columns: 2,
    fields: [
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
      { coreKey: "vacancies", label: "No. of Vacancies", type: "number", required: true },
      { coreKey: "estimatedCostPerPerson", label: "Estimated Cost Per Person", type: "number", placeholder: "Annual" },
      {
        coreKey: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "Draft", value: "DRAFT" },
          { label: "Open", value: "OPEN" },
          { label: "On hold", value: "ON_HOLD" },
          { label: "Filled", value: "FILLED" },
          { label: "Cancelled", value: "CANCELLED" },
        ],
      },
      { coreKey: "notes", label: "Notes", type: "textarea", placeholder: "Hiring rationale, headcount source, approver name…" },
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
      kind: "staffingPlan",
      formName: "Staffing Plan",
      formDescription: "Headcount planning entries that drive Job Openings. Add custom fields here to extend the plan across the app.",
      moduleName: "Recruitment",
      moduleIcon: "briefcase",
      sections: SECTIONS,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[POST /api/forms/ensure-staffing-plan-form]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to ensure form" },
      { status: 500 },
    );
  }
}
