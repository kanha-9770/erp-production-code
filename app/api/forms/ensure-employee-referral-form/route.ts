/**
 * POST /api/forms/ensure-employee-referral-form
 *
 * Find-or-create the Employee Referral form-builder form for the caller's
 * org. Admin only.
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
    title: "Referral",
    columns: 2,
    fields: [
      { coreKey: "referralCode", label: "Referral ID", type: "text", placeholder: "e.g. ER-0001" },
      { coreKey: "applicantName", label: "Applicant Name", type: "text", required: true, placeholder: "Full name" },
      { coreKey: "applicantEmail", label: "Applicant Email", type: "email", required: true },
      { coreKey: "applicantMobile", label: "Applicant Mobile", type: "phone", required: true },
      { coreKey: "referralDate", label: "Referral Date", type: "date", required: true },
      { coreKey: "designation", label: "Designation", type: "text", placeholder: "Applied position" },
      { coreKey: "referringEmployeeId", label: "Referring Employee", type: "select", required: true, placeholder: "Referring employee" },
      { coreKey: "referrerFirstName", label: "Referrer First Name", type: "text", required: true, placeholder: "Referrer first name" },
      { coreKey: "referrerDepartment", label: "Referrer Department", type: "text", placeholder: "Referrer department" },
      { coreKey: "remark", label: "Remark", type: "textarea", placeholder: "Referrer remark" },
      {
        coreKey: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "New", value: "NEW" },
          { label: "Reviewed", value: "REVIEWED" },
          { label: "Interviewing", value: "INTERVIEWING" },
          { label: "Hired", value: "HIRED" },
          { label: "Rejected", value: "REJECTED" },
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
      kind: "employeeReferral",
      formName: "Employee Referral",
      formDescription: "Candidate referrals from existing employees. Add custom fields here to extend the referral capture across the app.",
      moduleName: "Recruitment",
      moduleIcon: "briefcase",
      sections: SECTIONS,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[POST /api/forms/ensure-employee-referral-form]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to ensure form" },
      { status: 500 },
    );
  }
}
