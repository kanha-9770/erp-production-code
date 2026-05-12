/**
 * Job Opening API Handlers
 *
 * Live recruitment postings, typically derived from a StaffingPlan. The plan
 * link is optional so HR can also create ad-hoc openings without a prior plan.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
  "TEMPORARY",
  "CONSULTANT",
] as const;

const STATUSES = [
  "DRAFT",
  "OPEN",
  "ON_HOLD",
  "CLOSED",
  "CANCELLED",
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
    console.error(`[JobOpeningHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json(
        { error: "Job code already exists" },
        { status: 409 },
      );
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

function toIntOrOne(v: unknown): number {
  if (v === null || v === undefined || v === "") return 1;
  const n = typeof v === "string" ? parseInt(v, 10) : Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 1;
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

  strRequired("profileName");
  strRequired("company");
  strRequired("department");
  strRequired("designation");
  strRequired("jobDescription");
  strOptional("jobCode");
  strOptional("salaryApprox");

  if ("staffingPlanId" in body) {
    const v = body.staffingPlanId;
    data.staffingPlanId =
      v === null || v === undefined || v === "" ? null : String(v);
  }

  if ("employmentType" in body) {
    const v = String(body.employmentType || "").toUpperCase();
    if (!EMPLOYMENT_TYPES.includes(v as any))
      throw NextResponse.json(
        { error: "Invalid employment type" },
        { status: 400 },
      );
    data.employmentType = v;
  } else if (!partial) {
    throw NextResponse.json(
      { error: "employmentType is required" },
      { status: 400 },
    );
  }

  if ("status" in body) {
    const v = String(body.status || "").toUpperCase();
    data.status = STATUSES.includes(v as any) ? v : "OPEN";
  }

  if ("vacancies" in body) {
    data.vacancies = toIntOrOne(body.vacancies);
  } else if (!partial) {
    data.vacancies = 1;
  }

  if ("publishOnWebsite" in body) {
    data.publishOnWebsite = !!body.publishOnWebsite;
  }

  return data;
}

export const JobOpeningHandlers = {
  // GET /api/job-openings
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const openings = await (prisma as any).jobOpening.findMany({
        where: { organizationId: authUser.organizationId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
          staffingPlan: {
            select: { id: true, profileName: true, planCode: true },
          },
        },
      });
      return NextResponse.json({ success: true, openings });
    }, "list");
  },

  // POST /api/job-openings
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();
      const data = sanitize(body);

      // If a staffing plan was supplied, verify it belongs to the same org.
      // The relation has onDelete: SetNull but cross-tenant ids must not be
      // accepted in the first place.
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

      const opening = await (prisma as any).jobOpening.create({
        data: {
          ...data,
          organizationId: authUser.organizationId,
          createdById: authUser.id,
        },
      });
      return NextResponse.json({ success: true, opening }, { status: 201 });
    }, "create");
  },

  // GET /api/job-openings/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const opening = await (prisma as any).jobOpening.findFirst({
        where: { id, organizationId: authUser.organizationId },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
          staffingPlan: {
            select: { id: true, profileName: true, planCode: true },
          },
        },
      });
      if (!opening)
        return NextResponse.json(
          { error: "Job opening not found" },
          { status: 404 },
        );
      return NextResponse.json({ success: true, opening });
    }, "get");
  },

  // PUT /api/job-openings/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();

      const existing = await (prisma as any).jobOpening.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Job opening not found" },
          { status: 404 },
        );

      const data = sanitize(body, { partial: true });

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

      const opening = await (prisma as any).jobOpening.update({
        where: { id },
        data,
      });
      return NextResponse.json({ success: true, opening });
    }, "update");
  },

  // DELETE /api/job-openings/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).jobOpening.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Job opening not found" },
          { status: 404 },
        );
      await (prisma as any).jobOpening.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
