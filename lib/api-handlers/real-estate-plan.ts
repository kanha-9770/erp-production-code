/**
 * Compensation Plan (Plan Designer) CRUD handlers.
 *
 * Plans are versioned and immutable once ACTIVE. Activating a plan archives
 * any previous active plan for the org.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { simulatePlan, type SimulateInput } from "@/lib/real-estate/slab-engine";
import type { ResolvedPlan } from "@/lib/real-estate/slab-engine";

async function requireAuth(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user || !user.organizationId) return null;
  return { userId: user.id, organizationId: user.organizationId as string, email: user.email };
}

// Internal helper — re-export type so simulate endpoint can use it
type PlanWithRelations = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  version: number;
  status: string;
  areaUnit: string;
  companyResidualPercent: any;
  compressionEnabled: boolean;
  overrideMode: string;
  slabCounterScope: string;
  slabs: any[];
  overrideLevels: any[];
  designations: any[];
  guarantees: any[];
  createdAt: Date;
  updatedAt: Date;
};

async function loadPlanWithRelations(id: string, orgId: string): Promise<PlanWithRelations | null> {
  return (prisma as any).compPlan.findUnique({
    where: { id },
    include: {
      slabs: { orderBy: { sortOrder: "asc" } },
      overrideLevels: { orderBy: { level: "asc" } },
      designations: { orderBy: { sortOrder: "asc" } },
      guarantees: true,
    },
  }).then((p: any) => (p && p.organizationId === orgId ? p : null));
}

export const PlanHandlers = {
  // List all plans (any status)
  async list(req: NextRequest) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // DRAFT | ACTIVE | ARCHIVED | (all)

    const plans = await (prisma as any).compPlan.findMany({
      where: {
        organizationId: session.organizationId,
        ...(status ? { status } : {}),
      },
      include: {
        slabs: { orderBy: { sortOrder: "asc" } },
        overrideLevels: { orderBy: { level: "asc" } },
        designations: { orderBy: { sortOrder: "asc" } },
        guarantees: true,
      },
      orderBy: [{ status: "asc" }, { version: "desc" }],
    });

    return NextResponse.json({ data: plans });
  },

  // Get single plan
  async get(req: NextRequest, id: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plan = await loadPlanWithRelations(id, session.organizationId);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ data: plan });
  },

  // Create a new plan (DRAFT)
  async create(req: NextRequest) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const plan = await (prisma as any).compPlan.create({
      data: {
        organizationId: session.organizationId,
        name: body.name.trim(),
        description: body.description ?? null,
        areaUnit: body.areaUnit ?? "SQYD",
        companyResidualPercent: body.companyResidualPercent ?? 0,
        compressionEnabled: body.compressionEnabled ?? true,
        overrideMode: body.overrideMode ?? "DIFF_RATE",
        slabCounterScope: body.slabCounterScope ?? "LIFETIME",
        status: "DRAFT",
        version: 1,
        createdById: session.userId,
        // Nested creates for child rows
        slabs: body.slabs?.length
          ? {
              create: body.slabs.map((s: any, i: number) => ({
                sortOrder: i,
                minArea: s.minArea,
                maxArea: s.maxArea ?? null,
                ratePerUnit: s.ratePerUnit,
              })),
            }
          : undefined,
        overrideLevels: body.overrideLevels?.length
          ? {
              create: body.overrideLevels.map((l: any) => ({
                level: l.level,
                factor: l.factor,
              })),
            }
          : undefined,
        designations: body.designations?.length
          ? {
              create: body.designations.map((d: any, i: number) => ({
                sortOrder: i,
                minCumulativeArea: d.minCumulativeArea,
                designationCode: d.designationCode,
                designationName: d.designationName,
                rewardType: d.rewardType ?? "NONE",
                rewardDescription: d.rewardDescription ?? null,
                rewardCashAmount: d.rewardCashAmount ?? null,
              })),
            }
          : undefined,
        guarantees: body.guarantees?.length
          ? {
              create: body.guarantees.map((g: any) => ({
                designationCode: g.designationCode,
                monthlyAmount: g.monthlyAmount,
                currency: g.currency ?? "INR",
              })),
            }
          : undefined,
      },
      include: {
        slabs: { orderBy: { sortOrder: "asc" } },
        overrideLevels: { orderBy: { level: "asc" } },
        designations: { orderBy: { sortOrder: "asc" } },
        guarantees: true,
      },
    });

    return NextResponse.json({ data: plan }, { status: 201 });
  },

  // Update a DRAFT plan (replaces child arrays atomically)
  async update(req: NextRequest, id: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const existing = await loadPlanWithRelations(id, session.organizationId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "DRAFT") {
      return NextResponse.json({ error: "Only DRAFT plans can be edited. Activate creates a new version." }, { status: 400 });
    }

    const body = await req.json();

    await (prisma as any).$transaction(async (tx: any) => {
      // Replace child tables
      if (body.slabs !== undefined) {
        await tx.compPlanSlab.deleteMany({ where: { planId: id } });
        if (body.slabs.length > 0) {
          await tx.compPlanSlab.createMany({
            data: body.slabs.map((s: any, i: number) => ({
              planId: id,
              sortOrder: i,
              minArea: s.minArea,
              maxArea: s.maxArea ?? null,
              ratePerUnit: s.ratePerUnit,
            })),
          });
        }
      }
      if (body.overrideLevels !== undefined) {
        await tx.compPlanOverrideLevel.deleteMany({ where: { planId: id } });
        if (body.overrideLevels.length > 0) {
          await tx.compPlanOverrideLevel.createMany({
            data: body.overrideLevels.map((l: any) => ({
              planId: id,
              level: l.level,
              factor: l.factor,
            })),
          });
        }
      }
      if (body.designations !== undefined) {
        await tx.compPlanDesignation.deleteMany({ where: { planId: id } });
        if (body.designations.length > 0) {
          await tx.compPlanDesignation.createMany({
            data: body.designations.map((d: any, i: number) => ({
              planId: id,
              sortOrder: i,
              minCumulativeArea: d.minCumulativeArea,
              designationCode: d.designationCode,
              designationName: d.designationName,
              rewardType: d.rewardType ?? "NONE",
              rewardDescription: d.rewardDescription ?? null,
              rewardCashAmount: d.rewardCashAmount ?? null,
            })),
          });
        }
      }
      if (body.guarantees !== undefined) {
        await tx.compPlanGuarantee.deleteMany({ where: { planId: id } });
        if (body.guarantees.length > 0) {
          await tx.compPlanGuarantee.createMany({
            data: body.guarantees.map((g: any) => ({
              planId: id,
              designationCode: g.designationCode,
              monthlyAmount: g.monthlyAmount,
              currency: g.currency ?? "INR",
            })),
          });
        }
      }

      // Update plan header
      const updateData: Record<string, unknown> = {};
      for (const key of [
        "name", "description", "areaUnit", "companyResidualPercent",
        "compressionEnabled", "overrideMode", "slabCounterScope",
      ]) {
        if (key in body) updateData[key] = body[key];
      }
      if (Object.keys(updateData).length > 0) {
        await tx.compPlan.update({ where: { id }, data: updateData });
      }
    });

    const updated = await loadPlanWithRelations(id, session.organizationId);
    return NextResponse.json({ data: updated });
  },

  // Activate a plan — archives existing active plan, updates RebmSettings
  async activate(req: NextRequest, id: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plan = await loadPlanWithRelations(id, session.organizationId);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (plan.slabs.length === 0) {
      return NextResponse.json({ error: "Plan must have at least one slab before activating." }, { status: 400 });
    }

    await (prisma as any).$transaction(async (tx: any) => {
      // Archive any other active plan
      await tx.compPlan.updateMany({
        where: { organizationId: session.organizationId, status: "ACTIVE", id: { not: id } },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });

      // Activate this plan
      await tx.compPlan.update({
        where: { id },
        data: { status: "ACTIVE", activatedAt: new Date(), activatedBy: session.userId },
      });

      // Update settings to point to this plan + switch engine
      await tx.rebmSettings.upsert({
        where: { organizationId: session.organizationId },
        create: {
          organizationId: session.organizationId,
          planEngine: "SLAB",
          activePlanId: id,
          updatedById: session.userId,
        },
        update: {
          planEngine: "SLAB",
          activePlanId: id,
          updatedById: session.userId,
        },
      });
    });

    const updated = await loadPlanWithRelations(id, session.organizationId);
    return NextResponse.json({ data: updated });
  },

  // Deactivate and revert to LEGACY engine
  async deactivate(req: NextRequest, id: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await (prisma as any).$transaction(async (tx: any) => {
      await tx.compPlan.update({
        where: { id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await tx.rebmSettings.upsert({
        where: { organizationId: session.organizationId },
        create: { organizationId: session.organizationId, planEngine: "LEGACY", activePlanId: null },
        update: { planEngine: "LEGACY", activePlanId: null },
      });
    });

    return NextResponse.json({ data: { id, status: "ARCHIVED" } });
  },

  // Delete a DRAFT plan
  async remove(req: NextRequest, id: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plan = await (prisma as any).compPlan.findUnique({
      where: { id },
      select: { organizationId: true, status: true },
    });
    if (!plan || plan.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (plan.status !== "DRAFT") {
      return NextResponse.json({ error: "Only DRAFT plans can be deleted." }, { status: 400 });
    }

    await (prisma as any).compPlan.delete({ where: { id } });
    return NextResponse.json({ data: { deleted: true } });
  },

  // Simulate — dry run the plan math for the designer's preview panel
  async simulate(req: NextRequest, id: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plan = await loadPlanWithRelations(id, session.organizationId);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body: SimulateInput & { uplineAreas?: number[] } = await req.json();

    const resolved: ResolvedPlan = {
      id: plan.id,
      version: plan.version,
      overrideMode: plan.overrideMode,
      compressionEnabled: plan.compressionEnabled,
      companyResidualPercent: new (require("@prisma/client").Prisma.Decimal)(plan.companyResidualPercent ?? 0),
      slabs: plan.slabs.map((s: any) => ({
        sortOrder: s.sortOrder,
        minArea: new (require("@prisma/client").Prisma.Decimal)(s.minArea),
        maxArea: s.maxArea != null ? new (require("@prisma/client").Prisma.Decimal)(s.maxArea) : null,
        ratePerUnit: new (require("@prisma/client").Prisma.Decimal)(s.ratePerUnit),
      })),
      overrideLevels: plan.overrideLevels.map((l: any) => ({
        level: l.level,
        factor: new (require("@prisma/client").Prisma.Decimal)(l.factor),
      })),
    };

    const result = simulatePlan(resolved, {
      dealArea: body.dealArea ?? 0,
      sellerCumulativeAreaBefore: body.sellerCumulativeAreaBefore ?? 0,
      uplineRates: body.uplineAreas,
    });

    return NextResponse.json({ data: result });
  },
};
