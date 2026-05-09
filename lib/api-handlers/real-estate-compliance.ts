/**
 * REBM Phase 3 — Compliance + Reports + Rank promotion handlers.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";
import { ComplianceService, REQUIRED_DOC_TYPES } from "@/lib/real-estate/compliance-service";
import { evaluatePromotions } from "@/lib/real-estate/rank-promotion-service";
import {
  salesRegister,
  commissionRegister,
  payoutRegister,
  leadConversionReport,
  topAgentsLeaderboard,
  propertyAgingReport,
  complianceStatusReport,
  taxStatement,
} from "@/lib/real-estate/reports-service";

async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with any organization" },
      { status: 403 },
    );
  return user as { id: string; email: string; organizationId: string };
}

async function handle(fn: () => Promise<NextResponse>, label: string) {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[Phase3Handlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json({ error: "Duplicate value" }, { status: 409 });
    if (e?.code === "P2025")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

async function ensureAdmin(authId: string, orgId: string) {
  const ok = await isUserAdmin(authId, orgId);
  if (!ok)
    throw NextResponse.json({ error: "Admin access required" }, { status: 403 });
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const ComplianceHandlers = {
  // GET /api/real-estate/compliance/required-types — small helper for the UI
  async requiredTypes(_request: NextRequest): Promise<NextResponse> {
    return NextResponse.json({
      success: true,
      data: REQUIRED_DOC_TYPES as readonly string[],
    });
  },

  // GET /api/real-estate/compliance/my-documents
  async listMine(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const agent = await prisma.agentProfile.findUnique({
        where: { userId: auth.id },
        select: {
          id: true,
          status: true,
          complianceStatus: true,
          licenseNumber: true,
          licenseAuthority: true,
          licenseIssuedAt: true,
          licenseExpiresAt: true,
        },
      });
      if (!agent)
        return NextResponse.json(
          { error: "No agent profile for this user" },
          { status: 404 },
        );

      const docs = await prisma.complianceDocument.findMany({
        where: { agentProfileId: agent.id },
        orderBy: [{ type: "asc" }, { createdAt: "desc" }],
      });

      return NextResponse.json({
        success: true,
        data: {
          agent,
          documents: docs,
          requiredTypes: REQUIRED_DOC_TYPES,
        },
      });
    }, "listMine");
  },

  // GET /api/real-estate/compliance/agents/[id]/documents — admin / own
  async listForAgent(request: NextRequest, agentProfileId: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const agent = await prisma.agentProfile.findFirst({
        where: { id: agentProfileId, organizationId: auth.organizationId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true,
              avatar: true,
            },
          },
          complianceDocuments: { orderBy: [{ type: "asc" }, { createdAt: "desc" }] },
        },
      });
      if (!agent)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Self or admin can view.
      if (agent.userId !== auth.id) {
        const ok = await isUserAdmin(auth.id, auth.organizationId);
        if (!ok)
          return NextResponse.json(
            { error: "Not authorized to view this agent's documents" },
            { status: 403 },
          );
      }

      return NextResponse.json({ success: true, data: agent });
    }, "listForAgent");
  },

  // POST /api/real-estate/compliance/my-documents — agent uploads a doc
  async uploadMine(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      if (!body.type || !body.name || !body.url)
        return NextResponse.json(
          { error: "type, name, url required" },
          { status: 400 },
        );

      const agent = await prisma.agentProfile.findUnique({
        where: { userId: auth.id },
        select: { id: true },
      });
      if (!agent)
        return NextResponse.json(
          { error: "No agent profile for this user" },
          { status: 404 },
        );

      const doc = await prisma.$transaction(async (tx) => {
        const created = await tx.complianceDocument.create({
          data: {
            organizationId: auth.organizationId,
            agentProfileId: agent.id,
            type: body.type,
            name: body.name,
            url: body.url,
            documentNumber: body.documentNumber || null,
            issuedBy: body.issuedBy || null,
            issuedAt: body.issuedAt ? new Date(body.issuedAt) : null,
            expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
            status: "PENDING",
            uploadedById: auth.id,
          },
        });
        await ComplianceService.recomputeForAgent(tx, agent.id);
        return created;
      });

      return NextResponse.json({ success: true, data: doc }, { status: 201 });
    }, "uploadMine");
  },

  // DELETE /api/real-estate/compliance/documents/[id] — agent or admin
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const doc = await prisma.complianceDocument.findFirst({
        where: { id, organizationId: auth.organizationId },
        include: { agentProfile: { select: { id: true, userId: true } } },
      });
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

      if (doc.agentProfile.userId !== auth.id) {
        const ok = await isUserAdmin(auth.id, auth.organizationId);
        if (!ok)
          return NextResponse.json(
            { error: "Not authorized" },
            { status: 403 },
          );
      }
      // Verified docs can't be deleted by the agent — only by an admin.
      if (doc.status === "VERIFIED" && doc.agentProfile.userId === auth.id) {
        return NextResponse.json(
          { error: "Verified documents can only be removed by an admin" },
          { status: 409 },
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.complianceDocument.delete({ where: { id } });
        await ComplianceService.recomputeForAgent(tx, doc.agentProfile.id);
      });
      return NextResponse.json({ success: true });
    }, "remove");
  },

  // GET /api/real-estate/compliance/queue — admin verification queue
  async queue(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      await ensureAdmin(auth.id, auth.organizationId);

      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? "PENDING";

      const docs = await prisma.complianceDocument.findMany({
        where: {
          organizationId: auth.organizationId,
          ...(status === "ALL" ? {} : { status: status as any }),
        },
        orderBy: { createdAt: "asc" },
        include: {
          agentProfile: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  first_name: true,
                  last_name: true,
                  avatar: true,
                },
              },
            },
          },
        },
      });
      return NextResponse.json({ success: true, data: docs });
    }, "queue");
  },

  // POST /api/real-estate/compliance/documents/[id]/verify
  async verify(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      await ensureAdmin(auth.id, auth.organizationId);

      const doc = await prisma.complianceDocument.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true, agentProfileId: true },
      });
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.complianceDocument.update({
          where: { id },
          data: {
            status: "VERIFIED",
            verifiedById: auth.id,
            verifiedAt: new Date(),
            rejectionReason: null,
          },
        });
        await ComplianceService.recomputeForAgent(tx, doc.agentProfileId);
        return u;
      });

      return NextResponse.json({ success: true, data: updated });
    }, "verify");
  },

  // POST /api/real-estate/compliance/documents/[id]/reject
  async reject(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      await ensureAdmin(auth.id, auth.organizationId);
      const body = await request.json().catch(() => ({}));
      const reason = (body.reason ?? "").trim();
      if (!reason)
        return NextResponse.json(
          { error: "Rejection reason is required" },
          { status: 400 },
        );

      const doc = await prisma.complianceDocument.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true, agentProfileId: true },
      });
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.complianceDocument.update({
          where: { id },
          data: {
            status: "REJECTED",
            verifiedById: auth.id,
            verifiedAt: new Date(),
            rejectionReason: reason,
          },
        });
        await ComplianceService.recomputeForAgent(tx, doc.agentProfileId);
        return u;
      });
      return NextResponse.json({ success: true, data: updated });
    }, "reject");
  },

  // POST /api/real-estate/compliance/recompute-all — admin sweep
  async recomputeAll(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      await ensureAdmin(auth.id, auth.organizationId);
      const out = await prisma.$transaction(async (tx) => {
        return ComplianceService.recomputeAllStale(tx, auth.organizationId);
      });
      return NextResponse.json({ success: true, ...out });
    }, "recomputeAll");
  },

  // GET /api/real-estate/compliance/expiring — agents w/ docs expiring soon
  async expiring(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      await ensureAdmin(auth.id, auth.organizationId);
      const url = new URL(request.url);
      const days = Math.min(
        Math.max(parseInt(url.searchParams.get("days") ?? "30", 10), 1),
        365,
      );
      const docs = await ComplianceService.listExpiringSoon(
        prisma,
        auth.organizationId,
        days,
      );
      return NextResponse.json({ success: true, data: docs });
    }, "expiring");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const ReportHandlers = {
  // GET /api/real-estate/reports/sales-register
  async salesRegister(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const data = await salesRegister(prisma, auth.organizationId, {
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
      });
      return NextResponse.json({ success: true, ...data });
    }, "salesRegister");
  },

  // GET /api/real-estate/reports/commission-register
  async commissionRegister(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const data = await commissionRegister(
        prisma,
        auth.organizationId,
        {
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
        },
        {
          agentId: url.searchParams.get("agentId") ?? undefined,
          status: url.searchParams.get("status") ?? undefined,
        },
      );
      return NextResponse.json({ success: true, ...data });
    }, "commissionRegister");
  },

  // GET /api/real-estate/reports/payout-register
  async payoutRegister(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      await ensureAdmin(auth.id, auth.organizationId);
      const url = new URL(request.url);
      const data = await payoutRegister(
        prisma,
        auth.organizationId,
        {
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
        },
        {
          status: url.searchParams.get("status") ?? undefined,
        },
      );
      return NextResponse.json({ success: true, ...data });
    }, "payoutRegister");
  },

  // GET /api/real-estate/reports/lead-conversion
  async leadConversion(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const data = await leadConversionReport(prisma, auth.organizationId, {
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
      });
      return NextResponse.json({ success: true, ...data });
    }, "leadConversion");
  },

  // GET /api/real-estate/reports/leaderboard
  async leaderboard(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const data = await topAgentsLeaderboard(
        prisma,
        auth.organizationId,
        {
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
        },
        Math.min(parseInt(url.searchParams.get("topN") ?? "25", 10), 100),
      );
      return NextResponse.json({ success: true, ...data });
    }, "leaderboard");
  },

  // GET /api/real-estate/reports/property-aging
  async propertyAging(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const data = await propertyAgingReport(prisma, auth.organizationId);
      return NextResponse.json({ success: true, ...data });
    }, "propertyAging");
  },

  // GET /api/real-estate/reports/compliance-status
  async complianceStatus(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      await ensureAdmin(auth.id, auth.organizationId);
      const data = await complianceStatusReport(prisma, auth.organizationId);
      return NextResponse.json({ success: true, ...data });
    }, "complianceStatus");
  },

  // GET /api/real-estate/reports/tax-statement
  async taxStatement(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId") ?? auth.id;

      // Self or admin only.
      if (userId !== auth.id) {
        await ensureAdmin(auth.id, auth.organizationId);
      }
      const fy = parseInt(
        url.searchParams.get("fy") ?? String(new Date().getFullYear()),
        10,
      );
      const data = await taxStatement(prisma, auth.organizationId, {
        userId,
        financialYear: fy,
      });
      return NextResponse.json({ success: true, ...data });
    }, "taxStatement");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RANK PROMOTION HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const RankPromotionHandlers = {
  // POST /api/real-estate/ranks/evaluate (mode=PREVIEW|AUTO)
  async evaluate(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      await ensureAdmin(auth.id, auth.organizationId);
      const body = await request.json().catch(() => ({}));
      const mode = body.mode === "AUTO" ? "AUTO" : "PREVIEW";

      const out = await prisma.$transaction(async (tx) => {
        return evaluatePromotions(tx, auth.organizationId, mode, auth.id);
      });

      return NextResponse.json({ success: true, mode, data: out });
    }, "evaluate");
  },
};
