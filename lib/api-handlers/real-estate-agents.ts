/**
 * Real Estate Brokerage — Agent + Rank handlers (Phase 1).
 * AgentProfile CRUD, MLM-tree traversal, Rank CRUD, manual promotion.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";
import { getAgentSlabHistory } from "@/lib/real-estate/slab-engine";

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

// ─────────────────────────────────────────────────────────────────────────────
// Viewer-scope (data isolation for MLM agents)
// ─────────────────────────────────────────────────────────────────────────────
//
// Regular onboarded agents must only see their OWN downline — never their
// upline, sponsor, siblings, or unrelated agents in the org. The "Managing
// Director" / admin / org-owner tier sees everything.
//
// `resolveAgentViewerScope` returns either:
//   - { isPrivileged: true,  allowedAgentIds: null }            — see all
//   - { isPrivileged: false, allowedAgentIds: Set<string> }     — see only
//        the caller's own agentProfile id and every descendant of it.
//
// Handlers can do `where.id = { in: [...allowedAgentIds] }` (list/tree)
// or check `allowedAgentIds.has(targetId)` (single get) to enforce the rule
// without duplicating the BFS.
//
// We treat the following role names as "view-all-team" privileged, in
// addition to the platform's isUserAdmin check:
//   - anything containing "admin" (handled by isUserAdmin)
//   - "managing director" / "director" — explicit business-tier override
//   - "principal broker" — the FR-1 root-of-tree role
const PRIVILEGED_ROLE_PATTERN = /^(managing director|director|principal broker)$/i;

async function isAgentTeamPrivileged(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  if (await isUserAdmin(userId, organizationId)) return true;
  const roles = await prisma.$queryRaw<{ name: string }[]>`
    SELECT r.name AS name
    FROM user_unit_assignments uua
    JOIN roles r ON r.id = uua.role_id
    WHERE uua.user_id = ${userId}
  `;
  return roles.some((r) => PRIVILEGED_ROLE_PATTERN.test((r.name ?? "").trim()));
}

/** BFS descendants — produces the inclusive set {self} ∪ {descendants}. */
async function collectSelfAndDescendants(rootAgentId: string): Promise<Set<string>> {
  const ids = new Set<string>([rootAgentId]);
  const queue: string[] = [rootAgentId];
  while (queue.length) {
    // Batch one level at a time so we don't hammer the DB with N+1 lookups
    // for a wide tree.
    const layer = queue.splice(0, queue.length);
    const children = await prisma.agentProfile.findMany({
      where: { parentId: { in: layer } },
      select: { id: true },
    });
    for (const c of children) {
      if (!ids.has(c.id)) {
        ids.add(c.id);
        queue.push(c.id);
      }
    }
  }
  return ids;
}

type AgentViewerScope =
  | { isPrivileged: true; viewerAgentId: string | null; allowedAgentIds: null }
  | { isPrivileged: false; viewerAgentId: string; allowedAgentIds: Set<string> };

async function resolveAgentViewerScope(
  auth: { id: string; organizationId: string },
): Promise<AgentViewerScope> {
  const privileged = await isAgentTeamPrivileged(auth.id, auth.organizationId);
  const viewer = await prisma.agentProfile.findFirst({
    where: { userId: auth.id, organizationId: auth.organizationId },
    select: { id: true },
  });

  if (privileged) {
    return { isPrivileged: true, viewerAgentId: viewer?.id ?? null, allowedAgentIds: null };
  }

  // Unprivileged caller with NO agent profile: they have no team to see.
  // Returning an empty Set means list/tree endpoints come back empty (404
  // on /[id]). That's the safer default than leaking the whole org.
  if (!viewer) {
    return { isPrivileged: false, viewerAgentId: "", allowedAgentIds: new Set() };
  }

  const allowedAgentIds = await collectSelfAndDescendants(viewer.id);
  return { isPrivileged: false, viewerAgentId: viewer.id, allowedAgentIds };
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
      const scope = await resolveAgentViewerScope(auth);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const compliance = url.searchParams.get("compliance") ?? undefined;
      const rankId = url.searchParams.get("rankId") ?? undefined;
      const search = url.searchParams.get("search") ?? undefined;
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
      const offset = Number(url.searchParams.get("offset") ?? 0);

      // ── Visibility scoping ────────────────────────────────────────────
      // Non-privileged callers (regular onboarded agents) see ONLY their
      // own subtree — themselves + every descendant. Privileged callers
      // (admin / org owner / Managing Director / Principal Broker) see
      // every agent in the org.
      const visibilityFilter: Prisma.AgentProfileWhereInput | null =
        scope.isPrivileged
          ? null
          : scope.allowedAgentIds.size === 0
            ? { id: { in: [] } } // no agent profile → empty result
            : { id: { in: Array.from(scope.allowedAgentIds) } };

      const where: Prisma.AgentProfileWhereInput = {
        organizationId: auth.organizationId,
        ...(visibilityFilter ?? {}),
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

      // For non-privileged callers, strip the `sponsor` relation when it
      // points OUT of the caller's downline (i.e. the sponsor sits upline
      // of the caller). Without this, the list would leak the upline name
      // through the sponsor of e.g. the caller themselves — exactly what
      // we promised not to show.
      const data = scope.isPrivileged
        ? items
        : items.map((a) => {
            if (!a.sponsor) return a;
            return scope.allowedAgentIds.has(a.sponsor.id)
              ? a
              : { ...a, sponsor: null };
          });

      return NextResponse.json({
        success: true,
        data,
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
      const scope = await resolveAgentViewerScope(auth);

      // ── Visibility gate ────────────────────────────────────────────────
      // Non-privileged callers can only fetch an agent that's themselves
      // or one of their descendants. Return 404 (NOT 403) so the endpoint
      // doesn't acknowledge the existence of agents outside the scope.
      if (!scope.isPrivileged && !scope.allowedAgentIds.has(id)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

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

      // For non-privileged callers, strip every relation that could leak
      // upline info: parent and sponsor when they sit OUTSIDE the caller's
      // downline. (The viewer's own parent/sponsor is always outside the
      // viewer's subtree, so this naturally hides "who recruited me?" from
      // a new agent.) `recruits`/`children` are descendants of the target,
      // which is itself a descendant of the caller — safe to keep.
      if (!scope.isPrivileged) {
        const inScope = (rel: { id: string } | null | undefined) =>
          rel ? scope.allowedAgentIds.has(rel.id) : false;
        const sanitized: any = { ...agent };
        if (!inScope(agent.parent as any)) sanitized.parent = null;
        if (!inScope(agent.sponsor as any)) sanitized.sponsor = null;
        // Belt-and-braces: also redact the scalar IDs so a client that
        // ignores the relation can't reconstruct the upline by other means.
        if (sanitized.parent == null) sanitized.parentId = null;
        if (sanitized.sponsor == null) sanitized.sponsorId = null;
        return NextResponse.json({ success: true, data: sanitized });
      }

      return NextResponse.json({ success: true, data: agent });
    }, "get");
  },

  // GET /api/real-estate/agents/[id]/slab-history
  // Returns the agent's slab progress + every deal, slab upgrade event,
  // designation unlock, and override earning. Visibility follows the same
  // gate as `get`: privileged (admin/manager) can see anyone; an agent can
  // only see themselves or their downline (404 otherwise — don't leak
  // existence).
  async slabHistory(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const scope = await resolveAgentViewerScope(auth);

      if (!scope.isPrivileged && !scope.allowedAgentIds.has(id)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const agent = await prisma.agentProfile.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { userId: true },
      });
      if (!agent)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const history = await getAgentSlabHistory(
        prisma,
        auth.organizationId,
        agent.userId,
      );
      return NextResponse.json({ success: true, data: history });
    }, "slabHistory");
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
      const scope = await resolveAgentViewerScope(auth);
      const url = new URL(request.url);
      let rootId = url.searchParams.get("rootId") ?? null;

      // ── Force the viewer's subtree for non-privileged callers ─────────
      // If a regular agent supplies a rootId outside their downline,
      // silently coerce it to their own agent id rather than 403-ing.
      // The end UX: the tree always opens to "your team", and a
      // non-admin can never widen the view by tweaking the URL.
      if (!scope.isPrivileged) {
        if (!rootId || !scope.allowedAgentIds.has(rootId)) {
          rootId = scope.viewerAgentId;
        }
      }

      // ── Server-side where clause ──────────────────────────────────────
      // For non-privileged callers we narrow the rows fetched from the DB
      // to the caller's subtree. For privileged callers we still fetch
      // everything in the org so the client-side rootId filter (below)
      // can pivot freely.
      const baseWhere: Prisma.AgentProfileWhereInput = scope.isPrivileged
        ? { organizationId: auth.organizationId }
        : {
            organizationId: auth.organizationId,
            id: { in: Array.from(scope.allowedAgentIds) },
          };

      const nodes = await prisma.agentProfile.findMany({
        where: baseWhere,
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

      // For non-privileged callers, scrub upline-pointing fields on the
      // root of their subtree (the viewer themselves). Their actual
      // parent/sponsor sits OUTSIDE the allowed set, so the rendered tree
      // would otherwise show "child of ???" arrows pointing to nowhere
      // — and worse, expose the upline IDs to the client.
      const safeNodes = scope.isPrivileged
        ? nodes
        : nodes.map((n) => ({
            ...n,
            // The viewer's parent is upline; rewrite to null so the tree
            // renders as if the viewer were the root.
            parentId: scope.allowedAgentIds.has(n.parentId ?? "")
              ? n.parentId
              : null,
            sponsorId: scope.allowedAgentIds.has(n.sponsorId ?? "")
              ? n.sponsorId
              : null,
          }));

      let filtered = safeNodes;
      if (rootId) {
        // Filter to only the subtree under rootId.
        const childMap = new Map<string | null, typeof safeNodes>();
        for (const n of safeNodes) {
          const list = childMap.get(n.parentId) ?? [];
          list.push(n);
          childMap.set(n.parentId, list);
        }
        const out: typeof safeNodes = [];
        const queue: string[] = [rootId];
        while (queue.length) {
          const cur = queue.shift()!;
          const node = safeNodes.find((n) => n.id === cur);
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
