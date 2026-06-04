/**
 * Public job-application submission — the endpoint the shareable /apply/[jobId]
 * form POSTs to. No authentication.
 *
 *   POST /api/public/job-applications
 *   body: { jobOpeningId, applicantName, applicantEmail, applicantMobile,
 *           applicantResumeUrl?, applicantResumeName?, coverLetter?,
 *           salaryExpectation?, applicantSource? }
 *
 * Security model: the organization is derived from the job opening itself, and
 * only openings that are OPEN + published accept applications. An external
 * caller therefore can never target an arbitrary org or a private opening.
 * Role/dept/employmentType are snapshotted from the opening so the application
 * is self-consistent even if the opening changes later.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fireWorkflow } from "@/lib/workflow/static-triggers";
import { onApplicationCreated } from "@/lib/hr/recruitment-automation";

export const dynamic = "force-dynamic";

const db = prisma as any;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCES = [
  "REFERRAL",
  "JOB_PORTAL",
  "COMPANY_WEBSITE",
  "LINKEDIN",
  "AGENCY",
  "WALK_IN",
  "CAMPUS",
  "OTHER",
] as const;

// Trim + bound a free-text value so a malicious client can't write huge blobs.
function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const jobOpeningId = str(body.jobOpeningId, 64);
  if (!jobOpeningId) {
    return NextResponse.json(
      { success: false, error: "Missing job reference." },
      { status: 400 },
    );
  }

  // Only OPEN + published openings accept public applications. This is also
  // what scopes the write to the right organization.
  const opening = await db.jobOpening.findFirst({
    where: { id: jobOpeningId, publishOnWebsite: true, status: "OPEN" },
    select: {
      id: true,
      organizationId: true,
      department: true,
      designation: true,
      employmentType: true,
      staffingPlanId: true,
      jobDescription: true,
    },
  });
  if (!opening) {
    return NextResponse.json(
      { success: false, error: "This job is no longer accepting applications." },
      { status: 404 },
    );
  }

  const applicantName = str(body.applicantName, 160);
  const applicantEmail = str(body.applicantEmail, 200);
  const applicantMobile = str(body.applicantMobile, 40);

  if (!applicantName || !applicantEmail || !applicantMobile) {
    return NextResponse.json(
      { success: false, error: "Name, email, and phone are required." },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(applicantEmail)) {
    return NextResponse.json(
      { success: false, error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const sourceRaw = str(body.applicantSource, 32).toUpperCase();
  const applicantSource = (SOURCES as readonly string[]).includes(sourceRaw)
    ? sourceRaw
    : "COMPANY_WEBSITE";

  let application;
  try {
    application = await db.jobApplication.create({
      data: {
        applicantName,
        applicantEmail,
        applicantMobile,
        applicantSource,
        applicantResumeUrl: str(body.applicantResumeUrl, 1000) || null,
        applicantResumeName: str(body.applicantResumeName, 300) || null,
        coverLetter: str(body.coverLetter, 5000) || null,
        salaryExpectation: str(body.salaryExpectation, 100) || null,
        jobOpeningId: opening.id,
        staffingPlanId: opening.staffingPlanId ?? null,
        department: opening.department ?? null,
        designation: opening.designation ?? null,
        employmentType: opening.employmentType ?? null,
        jobDescription: opening.jobDescription ?? null,
        status: "NEW",
        organizationId: opening.organizationId,
      },
    });
  } catch (err) {
    console.error("[public-apply] create failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not submit your application. Please try again." },
      { status: 500 },
    );
  }

  // Fire workflow rules + recruitment automation (notify recruiters,
  // acknowledge to the candidate). Best-effort — never fails the submission.
  if (opening.organizationId) {
    try {
      fireWorkflow({
        moduleName: "Job Application",
        action: "Create",
        organizationId: opening.organizationId,
        recordId: application.id,
        recordData: application as any,
      });
    } catch {
      /* non-fatal */
    }
    void onApplicationCreated(application, opening.organizationId).catch(() => {});
  }

  return NextResponse.json(
    { success: true, applicationId: application.id },
    { status: 201 },
  );
}
