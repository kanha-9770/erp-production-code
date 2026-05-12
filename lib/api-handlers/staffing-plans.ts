/**
 * Staffing Plan API Handlers
 *
 * Workforce planning records: HR captures intent to hire (profile, vacancies,
 * cost) ahead of recruitment so totals can be tracked centrally.
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
  "FILLED",
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
    console.error(`[StaffingPlanHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json(
        { error: "Plan code already exists" },
        { status: 409 },
      );
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIntOrZero(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? parseInt(v, 10) : Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
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
  strOptional("planCode");
  strOptional("notes");

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
    data.status = STATUSES.includes(v as any) ? v : "DRAFT";
  }

  if ("vacancies" in body) {
    data.vacancies = toIntOrZero(body.vacancies);
  } else if (!partial) {
    data.vacancies = 1;
  }

  if ("estimatedCostPerPerson" in body) {
    data.estimatedCostPerPerson = toNumOrNull(body.estimatedCostPerPerson);
  }

  // Always recompute totalEstimatedCost server-side from the canonical inputs
  // — the client may compute and display it, but the source of truth lives
  // here so the stored value never drifts out of sync.
  const vac = data.vacancies ?? null;
  const cpp = data.estimatedCostPerPerson;
  if (vac != null && cpp != null && cpp !== "") {
    data.totalEstimatedCost = Number(vac) * Number(cpp);
  } else if (!partial) {
    data.totalEstimatedCost = null;
  } else if ("vacancies" in body || "estimatedCostPerPerson" in body) {
    // partial update touched at least one input — recompute if both present
    if (
      data.vacancies != null &&
      data.estimatedCostPerPerson != null
    ) {
      data.totalEstimatedCost =
        Number(data.vacancies) * Number(data.estimatedCostPerPerson);
    }
  }

  return data;
}

export const StaffingPlanHandlers = {
  // GET /api/staffing-plans
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const plans = await (prisma as any).staffingPlan.findMany({
        where: { organizationId: authUser.organizationId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
        },
      });
      return NextResponse.json({ success: true, plans });
    }, "list");
  },

  // POST /api/staffing-plans
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();
      const data = sanitize(body);
      const plan = await (prisma as any).staffingPlan.create({
        data: {
          ...data,
          organizationId: authUser.organizationId,
          createdById: authUser.id,
        },
      });
      return NextResponse.json({ success: true, plan }, { status: 201 });
    }, "create");
  },

  // GET /api/staffing-plans/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const plan = await (prisma as any).staffingPlan.findFirst({
        where: { id, organizationId: authUser.organizationId },
        include: {
          createdBy: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
        },
      });
      if (!plan)
        return NextResponse.json(
          { error: "Staffing plan not found" },
          { status: 404 },
        );
      return NextResponse.json({ success: true, plan });
    }, "get");
  },

  // PUT /api/staffing-plans/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();

      const existing = await (prisma as any).staffingPlan.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true, vacancies: true, estimatedCostPerPerson: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Staffing plan not found" },
          { status: 404 },
        );

      const data = sanitize(body, { partial: true });

      // Partial updates: if only one of (vacancies, costPerPerson) was sent,
      // compute the total from the merged values so we don't store a stale
      // total derived from one new and one old input.
      if (
        ("vacancies" in body || "estimatedCostPerPerson" in body) &&
        data.totalEstimatedCost === undefined
      ) {
        const vac =
          "vacancies" in body ? data.vacancies : existing.vacancies;
        const cpp =
          "estimatedCostPerPerson" in body
            ? data.estimatedCostPerPerson
            : existing.estimatedCostPerPerson
            ? Number(existing.estimatedCostPerPerson)
            : null;
        if (vac != null && cpp != null) {
          data.totalEstimatedCost = Number(vac) * Number(cpp);
        }
      }

      const plan = await (prisma as any).staffingPlan.update({
        where: { id },
        data,
      });
      return NextResponse.json({ success: true, plan });
    }, "update");
  },

  // DELETE /api/staffing-plans/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).staffingPlan.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json(
          { error: "Staffing plan not found" },
          { status: 404 },
        );
      await (prisma as any).staffingPlan.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
