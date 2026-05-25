/**
 * POST /api/forms/ensure-job-offer-form
 *
 * Find-or-create the Job Offer form-builder form for the caller's org.
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
    title: "Job Offer",
    columns: 2,
    fields: [
      { coreKey: "jobApplicationId", label: "Job Application ID", type: "select", required: true, placeholder: "Select…" },
      { coreKey: "offerDate", label: "Offer Date", type: "date", required: true },
      {
        coreKey: "status",
        label: "Status",
        type: "select",
        required: true,
        options: [
          { label: "Draft", value: "DRAFT" },
          { label: "Sent", value: "SENT" },
          { label: "Accepted", value: "ACCEPTED" },
          { label: "Rejected", value: "REJECTED" },
          { label: "Withdrawn", value: "WITHDRAWN" },
          { label: "Expired", value: "EXPIRED" },
        ],
      },
      { coreKey: "jobOfferTerm", label: "Job Offer Term", type: "text", placeholder: "Offer term summary" },
      { coreKey: "valueDescription", label: "Value / Description", type: "textarea", placeholder: "Compensation and description" },
      { coreKey: "termsAndConditions", label: "Terms & Conditions Template", type: "textarea" },
      { coreKey: "applicantName", label: "Applicant Name", type: "text", required: true, placeholder: "Full name as it should appear on the offer" },
      { coreKey: "applicantEmail", label: "Applicant Email", type: "email", placeholder: "name@example.com" },
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
      kind: "jobOffer",
      formName: "Job Offer",
      formDescription: "Offers issued to candidates after selection. Add custom fields here to extend the offer across the app.",
      moduleName: "Recruitment",
      moduleIcon: "briefcase",
      sections: SECTIONS,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[POST /api/forms/ensure-job-offer-form]", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Failed to ensure form" },
      { status: 500 },
    );
  }
}
