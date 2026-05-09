/**
 * Real Estate Brokerage — Agent + Rank handlers (Phase 1).
 * AgentProfile CRUD, MLM-tree traversal, Rank CRUD, manual promotion.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";

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
    console.error(`[AgentHandlers] ${label}:`, e?.message);
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

function serializeRank<T extends Record<string, any>>(r: T): any {
  if (!r) return r;
  return {
    ...r,
    minTeamRevenue: r.minTeamRevenue != null ? Number(r.minTeamRevenue) : null,
    rankUpBonus: r.rankUpBonus != null ? Number(r.rankUpBonus) : null,
    teamBonusPercent:
      r.teamBonusPercent != null ? Number(r.teamBonusPercent) : null,
  };
}

// Generate a sponsor code like "AG7K-2X3M" — short, shareable, and avoids
// confusing characters (no 0/O/1/I).
function generateSponsorCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${pick(4)}-${pick(4)}`;
}

// BR-10 — prevent moving an agent under one of their own descendants.
async function isDescendantOf(
  candidateId: string,
  ancestorId: string,
): Promise<boolean> {
  // Walk up from candidate's parent until we hit either ancestor or null.
  let current: string | null = candidateId;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) return false; // cycle safety
    seen.add(current);
    if (current === ancestorId) return true;
    const node: { parentId: string | null } | null =
      await prisma.agentProfile.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
    current = node?.parentId ?? null;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const AgentHandlers = {
  // GET /api/real-estate/agents
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const compliance = url.searchParams.get("compliance") ?? undefined;
      const rankId = url.searchParams.get("rankId") ?? undefined;
      const search = url.searchParams.get("search") ?? undefined;
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
      const offset = Number(url.searchParams.get("offset") ?? 0);

      const where: Prisma.AgentProfileWhereInput = {
        organizationId: auth.organizationId,
        ...(status ? { status: status as any } : {}),
        ...(compliance ? { complianceStatus: compliance as any } : {}),
        ...(rankId ? { rankId } : {}),
        ...(search
          ? {
              OR: [
                { user: { email: { contains: search, mode: "insensitive" } } },
                { user: { first_name: { contains: search, mode: "insensitive" } } },
                { user: { last_name: { contains: search, mode: "insensitive" } } },
                { sponsorCode: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.agentProfile.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                first_name: true,
                last_name: true,
                avatar: true,
                phone: true,
              },
            },
            rank: { select: { id: true, name: true, code: true, level: true } },
            sponsor: {
              select: { id: true, user: { select: { first_name: true, last_name: true } } },
            },
            _count: { select: { recruits: true, children: true } },
          },
        }),
        prisma.agentProfile.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: items,
        meta: { total, limit, offset },
      });
    }, "list");
  },

  // POST /api/real-estate/agents — create or attach an agent profile to a user.
  // If the user already exists, we just attach a profile. We don't create
  // ERP users here — that's the existing user-management flow.
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();

      if (!body.userId)
        return NextResponse.json({ error: "userId is required" }, { status: 400 });

      const user = await prisma.user.findFirst({
        where: { id: body.userId, organizationId: auth.organizationId },
        select: { id: true, agentProfile: { select: { id: true } } },
      });
      if (!user)
        return NextResponse.json(
          { error: "User not found in this organization" },
          { status: 404 },
        );
      if (user.agentProfile)
        return NextResponse.json(
          { error: "User already has an agent profile" },
          { status: 409 },
        );

      // Resolve sponsor by id or code.
      let sponsorId: string | null = body.sponsorId ?? null;
      if (!sponsorId && body.sponsorCode) {
        const sponsor = await prisma.agentProfile.findFirst({
          where: { organizationId: auth.organizationId, sponsorCode: body.sponsorCode },
          select: { id: true },
        });
        sponsorId = sponsor?.id ?? null;
      }

      // BR-11 — only Principal Brokers (admin-created) may live at the root.
      // We allow it but flag for the caller to handle.

      // Find a unique sponsor code for the new agent. Loop is bounded; the
      // search space is huge so 5 attempts is overkill but cheap.
      let sponsorCode = body.generateSponsorCode === false ? null : generateSponsorCode();
      if (sponsorCode) {
        for (let i = 0; i < 5; i++) {
          const exists = await prisma.agentProfile.findUnique({
            where: { sponsorCode },
            select: { id: true },
          });
          if (!exists) break;
          sponsorCode = generateSponsorCode();
        }
      }

      const agent = await prisma.agentProfile.create({
        data: {
          organizationId: auth.organizationId,
          userId: body.userId,
          employeeId: body.employeeId || null,
          sponsorId,
          parentId: body.parentId ?? sponsorId, // default parent = sponsor
          sponsorCode,
          rankId: body.rankId || null,
          rankAssignedAt: body.rankId ? new Date() : null,
          status: body.status || "PENDING_KYC",
          complianceStatus: "PENDING_KYC",
          licenseNumber: body.licenseNumber || null,
          licenseAuthority: body.licenseAuthority || null,
          licenseIssuedAt: body.licenseIssuedAt ? new Date(body.licenseIssuedAt) : null,
          licenseExpiresAt: body.licenseExpiresAt
            ? new Date(body.licenseExpiresAt)
            : null,
          specializations: Array.isArray(body.specializations)
            ? body.specializations
            : [],
          serviceAreas: Array.isArray(body.serviceAreas) ? body.serviceAreas : [],
          bio: body.bio || null,
        },
        include: {
          user: { select: { id: true, email: true, first_name: true, last_name: true } },
          rank: true,
        },
      });

      return NextResponse.json({ success: true, data: agent }, { status: 201 });
    }, "create");
  },

  // GET /api/real-estate/agents/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const agent = await prisma.agentProfile.findFirst({
        where: { id, organizationId: auth.organizationId },
        include: {
          user: {
            select: {
              id: true, email: true, first_name: true, last_name: true,
              avatar: true, phone: true, mobile: true, location: true,
            },
          },
          rank: true,
          sponsor: {
            include: {
              user: { select: { first_name: true, last_name: true, email: true } },
            },
          },
          parent: {
            include: {
              user: { select: { first_name: true, last_name: true, email: true } },
            },
          },
          recruits: {
            select: {
              id: true,
              status: true,
              user: { select: { first_name: true, last_name: true, email: true } },
            },
          },
          children: {
            select: {
              id: true,
              status: true,
              user: { select: { first_name: true, last_name: true, email: true } },
            },
          },
          promotions: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });
      if (!agent)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      return NextResponse.json({ success: true, data: agent });
    }, "get");
  },

  // PUT /api/real-estate/agents/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.agentProfile.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const data: Prisma.AgentProfileUpdateInput = {};

      const setIf = (key: string, value: any) => {
        if (value !== undefined) (data as any)[key] = value;
      };

      setIf("status", body.status);
      setIf("complianceStatus", body.complianceStatus);
      setIf("licenseNumber", body.licenseNumber);
      setIf("licenseAuthority", body.licenseAuthority);
      setIf("specializations", body.specializations);
      setIf("serviceAreas", body.serviceAreas);
      setIf("bio", body.bio);
      setIf("suspensionReason", body.suspensionReason);
      setIf("employeeId", body.employeeId);

      if (body.licenseIssuedAt !== undefined)
        data.licenseIssuedAt = body.licenseIssuedAt
          ? new Date(body.licenseIssuedAt)
          : null;
      if (body.licenseExpiresAt !== undefined)
        data.licenseExpiresAt = body.licenseExpiresAt
          ? new Date(body.licenseExpiresAt)
          : null;

      // Status side-effects for FR-2.11
      if (body.status === "SUSPENDED" && existing.status !== "SUSPENDED")
        data.suspendedAt = new Date();
      if (body.status === "TERMINATED" && existing.status !== "TERMINATED")
        data.terminatedAt = new Date();
      if (body.status === "ACTIVE") {
        data.suspendedAt = null;
        data.terminatedAt = null;
      }

      // Re-parenting (FR-2.10) — admin only; we trust the route to gate this.
      // BR-10 cycle prevention always runs.
      if (body.parentId !== undefined && body.parentId !== existing.parentId) {
        if (body.parentId) {
          if (body.parentId === id)
            return NextResponse.json(
              { error: "An agent cannot be their own parent" },
              { status: 400 },
            );
          const wouldCycle = await isDescendantOf(body.parentId, id);
          if (wouldCycle)
            return NextResponse.json(
              { error: "Re-parent would create a cycle" },
              { status: 400 },
            );
          data.parent = { connect: { id: body.parentId } };
        } else {
          data.parent = { disconnect: true };
        }
      }

      // Rank changes → log promotion when going up.
      const newRankId = body.rankId !== undefined ? body.rankId : undefined;
      if (newRankId !== undefined && newRankId !== existing.rankId) {
        if (newRankId) {
          data.rank = { connect: { id: newRankId } };
        } else {
          data.rank = { disconnect: true };
        }
        data.rankAssignedAt = new Date();
      }

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.agentProfile.update({
          where: { id },
          data,
          include: { rank: true, user: { select: { email: true } } },
        });
        if (newRankId !== undefined && newRankId !== existing.rankId && newRankId) {
          await tx.rankPromotionLog.create({
            data: {
              agentId: id,
              fromRankId: existing.rankId,
              toRankId: newRankId,
              triggeredBy: "MANUAL",
              approvedById: auth.id,
              reason: body.promotionReason || null,
            },
          });
        }
        return u;
      });

      return NextResponse.json({ success: true, data: updated });
    }, "update");
  },

  // DELETE /api/real-estate/agents/[id] — terminate (never hard-delete; the
  // tree references this row).
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const agent = await prisma.agentProfile.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!agent)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const updated = await prisma.agentProfile.update({
        where: { id },
        data: { status: "TERMINATED", terminatedAt: new Date() },
      });
      return NextResponse.json({ success: true, data: updated });
    }, "remove");
  },

  // GET /api/real-estate/agents/tree — full org tree, flat list with parentId.
  // Renderer in the UI builds the tree. Bounded to `limit` rows; this scales
  // for orgs up to ~5K agents per FR-2.x notes.
  async tree(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const rootId = url.searchParams.get("rootId") ?? null;

      const nodes = await prisma.agentProfile.findMany({
        where: { organizationId: auth.organizationId },
        select: {
          id: true,
          parentId: true,
          sponsorId: true,
          sponsorCode: true,
          status: true,
          complianceStatus: true,
          rankId: true,
          rank: { select: { name: true, code: true, level: true } },
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
        orderBy: { createdAt: "asc" },
      });

      let filtered = nodes;
      if (rootId) {
        // Filter to only the subtree under rootId.
        const childMap = new Map<string | null, typeof nodes>();
        for (const n of nodes) {
          const list = childMap.get(n.parentId) ?? [];
          list.push(n);
          childMap.set(n.parentId, list);
        }
        const out: typeof nodes = [];
        const queue: string[] = [rootId];
        while (queue.length) {
          const cur = queue.shift()!;
          const node = nodes.find((n) => n.id === cur);
          if (node) out.push(node);
          for (const c of childMap.get(cur) ?? []) queue.push(c.id);
        }
        filtered = out;
      }

      return NextResponse.json({ success: true, data: filtered });
    }, "tree");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RANK HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const RankHandlers = {
  // GET /api/real-estate/ranks
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const ranks = await prisma.rank.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
        include: { _count: { select: { agents: true } } },
      });
      return NextResponse.json({
        success: true,
        data: ranks.map(serializeRank),
      });
    }, "list");
  },

  // POST /api/real-estate/ranks
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      if (!body.name || !body.code)
        return NextResponse.json(
          { error: "name and code are required" },
          { status: 400 },
        );

      const rank = await prisma.rank.create({
        data: {
          organizationId: auth.organizationId,
          name: body.name,
          code: body.code,
          description: body.description || null,
          level: body.level ?? 0,
          minPersonalSales: body.minPersonalSales ?? null,
          minTeamSize: body.minTeamSize ?? null,
          minTeamRevenue:
            body.minTeamRevenue != null
              ? new Prisma.Decimal(body.minTeamRevenue)
              : null,
          evaluationWindowDays: body.evaluationWindowDays ?? null,
          overridePercents: Array.isArray(body.overridePercents)
            ? body.overridePercents
            : [],
          rankUpBonus:
            body.rankUpBonus != null ? new Prisma.Decimal(body.rankUpBonus) : null,
          teamBonusPercent:
            body.teamBonusPercent != null
              ? new Prisma.Decimal(body.teamBonusPercent)
              : null,
          isActive: body.isActive ?? true,
          sortOrder: body.sortOrder ?? 0,
        },
      });

      return NextResponse.json(
        { success: true, data: serializeRank(rank) },
        { status: 201 },
      );
    }, "create");
  },

  // PUT /api/real-estate/ranks/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.rank.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const data: Prisma.RankUpdateInput = {};

      const setIf = (key: string, value: any) => {
        if (value !== undefined) (data as any)[key] = value;
      };

      setIf("name", body.name);
      setIf("code", body.code);
      setIf("description", body.description);
      setIf("level", body.level);
      setIf("minPersonalSales", body.minPersonalSales);
      setIf("minTeamSize", body.minTeamSize);
      setIf("evaluationWindowDays", body.evaluationWindowDays);
      setIf("overridePercents", body.overridePercents);
      setIf("isActive", body.isActive);
      setIf("sortOrder", body.sortOrder);

      if (body.minTeamRevenue !== undefined)
        data.minTeamRevenue =
          body.minTeamRevenue == null
            ? null
            : new Prisma.Decimal(body.minTeamRevenue);
      if (body.rankUpBonus !== undefined)
        data.rankUpBonus =
          body.rankUpBonus == null ? null : new Prisma.Decimal(body.rankUpBonus);
      if (body.teamBonusPercent !== undefined)
        data.teamBonusPercent =
          body.teamBonusPercent == null
            ? null
            : new Prisma.Decimal(body.teamBonusPercent);

      const updated = await prisma.rank.update({ where: { id }, data });
      return NextResponse.json({ success: true, data: serializeRank(updated) });
    }, "update");
  },

  // DELETE /api/real-estate/ranks/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const rank = await prisma.rank.findFirst({
        where: { id, organizationId: auth.organizationId },
        include: { _count: { select: { agents: true } } },
      });
      if (!rank)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (rank._count.agents > 0)
        return NextResponse.json(
          { error: "Cannot delete: agents are assigned to this rank" },
          { status: 409 },
        );

      await prisma.rank.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
