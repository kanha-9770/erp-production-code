/**
 * Job Application API Handlers
 *
 * Candidates apply against a JobOpening. Most role-related fields are
 * snapshotted from the opening at create time so the application remains
 * accurate even if the parent opening is later edited or closed.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { fireWorkflow } from "@/lib/workflow/static-triggers";

const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
  "TEMPORARY",
  "CONSULTANT",
] as const;

const STATUSES = [
  "NEW",
  "SCREENING",
  "INTERVIEWING",
  "SHORTLISTED",
  "OFFERED",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
  "ON_HOLD",
] as const;

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

async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with any organization" },
      { status: 403 },
    );
  return user;
}

async function handle(
  fn: () => Promise<NextResponse>,
  label: string,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[JobApplicationHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json(
        { error: "Application code already exists" },
        { status: 409 },
      );
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

function sanitize(body: Record<string, any>, opts: { partial?: boolean } = {}) {
  const data: Record<string, any> = {};
  const partial = opts.partial ?? false;

  const strRequired = (key: string, target = key) => {
    if (!(key in body)) {
      if (!partial)
        throw NextResponse.json(
          { error: `${key} is required` },
          { status: 400 },
        );
      return;
    }
    const v = body[key];
    if (v === null || v === undefined || String(v).trim() === "")
      throw NextResponse.json({ error: `${key} is required` }, { status: 400 });
    data[target] = String(v).trim();
  };

  const strOptional = (key: string, target = key) => {
    if (!(key in body)) return;
    const v = body[key];
    if (v === null || v === undefined || String(v).trim() === "") {
      data[target] = null;
      return;
    }
    data[target] = String(v).trim();
  };

  strRequired("applicantName");
  strRequired("applicantEmail");
  strRequired("applicantMobile");

  strOptional("applicationCode");
  strOptional("department");
  strOptional("designation");
  strOptional("applicantResumeUrl");
  strOptional("applicantResumeName");

  // Scanned resume data. Flat text columns go through strOptional; the full
  // structured parse is stored as JSON. We stamp resumeParsedAt whenever any
  // parsed data is supplied so the UI can tell scanned rows apart.
  strOptional("resumeParsedText");
  strOptional("resumeSkills");
  strOptional("resumeTotalExperience");
  strOptional("resumeEducation");
  strOptional("resumeSummary");
  if ("resumeData" in body) {
    const v = body.resumeData;
    if (v === null || v === undefined || v === "") {
      data.resumeData = null;
    } else if (typeof v === "object") {
      data.resumeData = v;
      data.resumeParsedAt = new Date();
    }
  }

  strOptional("coverLetter");
  strOptional("salaryExpectation");
  strOptional("jobDescription");

  if ("applicantEmail" in body && data.applicantEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.applicantEmail))
      throw NextResponse.json(
        { error: "Applicant email is not a valid address" },
        { status: 400 },
      );
  }

  if ("jobOpeningId" in body) {
    const v = body.jobOpeningId;
    data.jobOpeningId =
      v === null || v === undefined || v === "" ? null : String(v);
  }
  if ("staffingPlanId" in body) {
    const v = body.staffingPlanId;
    data.staffingPlanId =
      v === null || v === undefined || v === "" ? null : String(v);
  }

  if ("employmentType" in body) {
    const v = body.employmentType
      ? String(body.employmentType).toUpperCase()
      : null;
    if (v && !EMPLOYMENT_TYPES.includes(v as any))
      throw NextResponse.json(
        { error: "Invalid employment type" },
        { status: 400 },
      );
    data.employmentType = v;
  }

  if ("applicantSource" in body) {
    const v = body.applicantSource
      ? String(body.applicantSource).toUpperCase()
      : null;
    if (v && !SOURCES.includes(v as any))
      throw NextResponse.json(
        { error: "Invalid applicant source" },
        { status: 400 },
      );
    data.applicantSource = v;
  }

  if ("status" in body) {
    const v = String(body.status || "").toUpperCase();
    data.status = STATUSES.includes(v as any) ? v : "NEW";
  } else if (!partial) {
    data.status = "NEW";
  }

  if ("applicantRating" in body) {
    const v = body.applicantRating;
    if (v === null || v === undefined || v === "") {
      data.applicantRating = null;
    } else {
      const n = typeof v === "string" ? parseInt(v, 10) : Math.trunc(Number(v));
      if (!Number.isFinite(n) || n < 1 || n > 5) {
        throw NextResponse.json(
          { error: "Applicant rating must be between 1 and 5" },
          { status: 400 },
        );
      }
      data.applicantRating = n;
    }
  }

  return data;
}

export const JobApplicationHandlers = {
  // GET /api/job-applications
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const applications = await (prisma as any).jobApplication.findMany({
        where: { organizationId: authUser.organizationId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
          jobOpening: {
            select: { id: true, profileName: true, jobCode: true, status: true },
          },
          staffingPlan: {
            select: { id: true, profileName: true, planCode: true },
          },
        },
      });
      return NextResponse.json({ success: true, applications });
    }, "list");
  },

  // POST /api/job-applications
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();
      const data = sanitize(body);

      // If a job opening was supplied, verify it belongs to the same org.
      if (data.jobOpeningId) {
        const opening = await (prisma as any).jobOpening.findFirst({
          where: {
            id: data.jobOpeningId,
            organizationId: authUser.organizationId,
          },
          select: { id: true, staffingPlanId: true },
        });
        if (!opening) {
          return NextResponse.json(
            { error: "Selected job opening not found in this organization" },
            { status: 400 },
          );
        }
        // Keep staffing plan in sync with the opening unless the client
        // explicitly overrode it.
        if (!("staffingPlanId" in body)) {
          data.staffingPlanId = opening.staffingPlanId ?? null;
        }
      }
      if (data.staffingPlanId) {
        const plan = await (prisma as any).staffingPlan.findFirst({
          where: {
            id: data.staffingPlanId,
            organizationId: authUser.organizationId,
          },
          select: { id: true },
        });
        if (!plan) {
          return NextResponse.json(
            { error: "Selected staffing plan not found in this organization" },
            { status: 400 },
          );
        }
      }

      const application = await (prisma as any).jobApplication.create({
        data: {
          ...data,
          organizationId: authUser.organizationId,
          createdById: authUser.id,
        },
      });
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Job Application",
          action: "Create",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: application.id,
          recordData: application as any,
        });
      }
      return NextResponse.json({ success: true, application }, { status: 201 });
    }, "create");
  },

  // GET /api/job-applications/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const application = await (prisma as any).jobApplication.findFirst({
        where: { id, organizationId: authUser.organizationId },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
          jobOpening: {
            select: { id: true, profileName: true, jobCode: true, status: true },
          },
          staffingPlan: {
            select: { id: true, profileName: true, planCode: true },
          },
        },
      });
      if (!application)
        return NextResponse.json(
          { error: "Job application not found" },
          { status: 404 },
        );
      return NextResponse.json({ success: true, application });
    }, "get");
  },

  // PUT /api/job-applications/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();

      const existing = await (prisma as any).jobApplication.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Job application not found" },
          { status: 404 },
        );

      const data = sanitize(body, { partial: true });

      if (data.jobOpeningId) {
        const opening = await (prisma as any).jobOpening.findFirst({
          where: {
            id: data.jobOpeningId,
            organizationId: authUser.organizationId,
          },
          select: { id: true },
        });
        if (!opening) {
          return NextResponse.json(
            { error: "Selected job opening not found in this organization" },
            { status: 400 },
          );
        }
      }
      if (data.staffingPlanId) {
        const plan = await (prisma as any).staffingPlan.findFirst({
          where: {
            id: data.staffingPlanId,
            organizationId: authUser.organizationId,
          },
          select: { id: true },
        });
        if (!plan) {
          return NextResponse.json(
            { error: "Selected staffing plan not found in this organization" },
            { status: 400 },
          );
        }
      }

      const application = await (prisma as any).jobApplication.update({
        where: { id },
        data,
      });
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Job Application",
          action: "Edit",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: application.id,
          recordData: application as any,
        });
      }
      return NextResponse.json({ success: true, application });
    }, "update");
  },

  // DELETE /api/job-applications/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).jobApplication.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Job application not found" },
          { status: 404 },
        );
      await (prisma as any).jobApplication.delete({ where: { id } });
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Job Application",
          action: "Delete",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: id,
          recordData: { id },
        });
      }
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
