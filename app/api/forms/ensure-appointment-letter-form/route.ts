/**
 * POST /api/forms/ensure-appointment-letter-form
 *
 * Find-or-create the Appointment Letter form-builder form for the caller's
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
    title: "Appointment Letter",
    columns: 2,
    fields: [
      { coreKey: "jobOfferId", label: "Linked Job Offer", type: "select", placeholder: "Select…" },
      { coreKey: "jobApplicationId", label: "Job Application", type: "select", placeholder: "Select…" },
      { coreKey: "company", label: "Company", type: "text", placeholder: "Issuing company name" },
      { coreKey: "appointmentDate", label: "Appointment Date", type: "date", required: true },
      { coreKey: "templateName", label: "Appointment Letter Template", type: "text", placeholder: "Select an option" },
      { coreKey: "title", label: "Title", type: "text", placeholder: "Letter title" },
      { coreKey: "introduction", label: "Introduction", type: "textarea", placeholder: "Opening paragraph" },
      { coreKey: "description", label: "Description", type: "textarea", placeholder: "Body of appointment letter" },
      { coreKey: "closingNotes", label: "Closing Notes", type: "textarea", placeholder: "Closing paragraph" },
      { coreKey: "signed", label: "Signed", type: "checkbox" },
      { coreKey: "signedDate", label: "Signed Date", type: "date", placeholder: "Date the candidate signed the letter" },
      { coreKey: "applicantName", label: "Applicant Name", type: "text", required: true, placeholder: "Full name as it should appear on the letter" },
      { coreKey: "applicantEmail", label: "Applicant Email", type: "email", placeholder: "name@example.com" },
      {
        coreKey: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "Draft", value: "DRAFT" },
          { label: "Issued", value: "ISSUED" },
          { label: "Signed", value: "SIGNED" },
          { label: "Revoked", value: "REVOKED" },
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
      kind: "appointmentLetter",
      formName: "Appointment Letter",
      formDescription: "Appointment letters issued after offer signing. Add custom fields here to extend the letter across the app.",
      moduleName: "Recruitment",
      moduleIcon: "briefcase",
      sections: SECTIONS,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[POST /api/forms/ensure-appointment-letter-form]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to ensure form" },
      { status: 500 },
    );
  }
}
