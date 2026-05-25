/**
 * Job Offer API Handlers
 *
 * A JobOffer is the formal compensation/T&C package extended to an applicant.
 * It points at the JobApplication that earned it; if the application is
 * deleted the offer survives as a standalone snapshot (applicantName +
 * applicantEmail are duplicated for exactly that reason).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { fireWorkflow } from "@/lib/workflow/static-triggers";
import { moveToTrash } from "@/lib/trash";

const STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "EXPIRED",
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
    console.error(`[JobOfferHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json(
        { error: "Offer code already exists" },
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
  strOptional("offerCode");
  strOptional("applicantEmail");
  strOptional("jobOfferTerm");
  strOptional("valueDescription");
  strOptional("termsAndConditions");

  if (data.applicantEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.applicantEmail))
      throw NextResponse.json(
        { error: "Applicant email is not a valid address" },
        { status: 400 },
      );
  }

  if ("jobApplicationId" in body) {
    const v = body.jobApplicationId;
    data.jobApplicationId =
      v === null || v === undefined || v === "" ? null : String(v);
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

  if ("offerDate" in body) {
    const v = body.offerDate;
    if (!v) {
      if (!partial)
        throw NextResponse.json(
          { error: "offerDate is required" },
          { status: 400 },
        );
      data.offerDate = null;
    } else {
      const d = new Date(v);
      if (Number.isNaN(d.getTime()))
        throw NextResponse.json(
          { error: "offerDate is not a valid date" },
          { status: 400 },
        );
      data.offerDate = d;
    }
  } else if (!partial) {
    throw NextResponse.json(
      { error: "offerDate is required" },
      { status: 400 },
    );
  }

  if ("status" in body) {
    const v = String(body.status || "").toUpperCase();
    data.status = STATUSES.includes(v as any) ? v : "DRAFT";
  } else if (!partial) {
    data.status = "DRAFT";
  }

  // Pass-through for builder-added field values. Keyed by FormField.id.
  if ("customFields" in body) {
    const v = body.customFields;
    if (v === null || v === undefined) {
      data.customFields = null;
    } else if (typeof v === "object" && !Array.isArray(v)) {
      data.customFields = v;
    } else {
      throw NextResponse.json(
        { error: "customFields must be an object" },
        { status: 400 },
      );
    }
  }

  return data;
}

export const JobOfferHandlers = {
  // GET /api/job-offers
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const offers = await (prisma as any).jobOffer.findMany({
        where: { organizationId: authUser.organizationId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
          jobApplication: {
            select: {
              id: true,
              applicantName: true,
              applicantEmail: true,
              applicationCode: true,
              status: true,
            },
          },
          jobOpening: {
            select: { id: true, profileName: true, jobCode: true },
          },
          staffingPlan: {
            select: { id: true, profileName: true, planCode: true },
          },
        },
      });
      return NextResponse.json({ success: true, offers });
    }, "list");
  },

  // POST /api/job-offers
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();
      const data = sanitize(body);

      // If a Job Application is linked, propagate its opening + staffing plan
      // automatically unless the client overrode them. Validating org scoping
      // at the same time.
      if (data.jobApplicationId) {
        const app = await (prisma as any).jobApplication.findFirst({
          where: {
            id: data.jobApplicationId,
            organizationId: authUser.organizationId,
          },
          select: {
            id: true,
            jobOpeningId: true,
            staffingPlanId: true,
          },
        });
        if (!app) {
          return NextResponse.json(
            { error: "Selected job application not found in this organization" },
            { status: 400 },
          );
        }
        if (!("jobOpeningId" in body)) data.jobOpeningId = app.jobOpeningId ?? null;
        if (!("staffingPlanId" in body))
          data.staffingPlanId = app.staffingPlanId ?? null;
      }
      if (data.jobOpeningId) {
        const o = await (prisma as any).jobOpening.findFirst({
          where: {
            id: data.jobOpeningId,
            organizationId: authUser.organizationId,
          },
          select: { id: true },
        });
        if (!o) {
          return NextResponse.json(
            { error: "Selected job opening not found in this organization" },
            { status: 400 },
          );
        }
      }
      if (data.staffingPlanId) {
        const p = await (prisma as any).staffingPlan.findFirst({
          where: {
            id: data.staffingPlanId,
            organizationId: authUser.organizationId,
          },
          select: { id: true },
        });
        if (!p) {
          return NextResponse.json(
            { error: "Selected staffing plan not found in this organization" },
            { status: 400 },
          );
        }
      }

      const offer = await (prisma as any).jobOffer.create({
        data: {
          ...data,
          organizationId: authUser.organizationId,
          createdById: authUser.id,
        },
      });
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Job Offer",
          action: "Create",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: offer.id,
          recordData: offer as any,
        });
      }
      return NextResponse.json({ success: true, offer }, { status: 201 });
    }, "create");
  },

  // GET /api/job-offers/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const offer = await (prisma as any).jobOffer.findFirst({
        where: { id, organizationId: authUser.organizationId },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
          jobApplication: {
            select: {
              id: true,
              applicantName: true,
              applicantEmail: true,
              applicationCode: true,
              status: true,
            },
          },
          jobOpening: {
            select: { id: true, profileName: true, jobCode: true },
          },
          staffingPlan: {
            select: { id: true, profileName: true, planCode: true },
          },
        },
      });
      if (!offer)
        return NextResponse.json(
          { error: "Job offer not found" },
          { status: 404 },
        );
      return NextResponse.json({ success: true, offer });
    }, "get");
  },

  // PUT /api/job-offers/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();

      const existing = await (prisma as any).jobOffer.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Job offer not found" },
          { status: 404 },
        );

      const data = sanitize(body, { partial: true });

      for (const [key, scope] of [
        ["jobApplicationId", "jobApplication"],
        ["jobOpeningId", "jobOpening"],
        ["staffingPlanId", "staffingPlan"],
      ] as const) {
        if (data[key]) {
          const row = await (prisma as any)[scope].findFirst({
            where: {
              id: data[key],
              organizationId: authUser.organizationId,
            },
            select: { id: true },
          });
          if (!row) {
            return NextResponse.json(
              { error: `Selected ${scope} not found in this organization` },
              { status: 400 },
            );
          }
        }
      }

      const offer = await (prisma as any).jobOffer.update({
        where: { id },
        data,
      });
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Job Offer",
          action: "Edit",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: offer.id,
          recordData: offer as any,
        });
      }
      return NextResponse.json({ success: true, offer });
    }, "update");
  },

  // DELETE /api/job-offers/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).jobOffer.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Job offer not found" },
          { status: 404 },
        );
      await moveToTrash("JobOffer", id, {
        userId: authUser.id,
        userName: authUser.email,
        organizationId: authUser.organizationId,
      });
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Job Offer",
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
