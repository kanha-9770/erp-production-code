/**
 * Agent self-service team management handlers.
 *
 * Allows agents to:
 *  - View their own downline (direct recruits + deeper levels)
 *  - Generate invite links their recruits use to self-onboard
 *  - See team performance (area sold, designation, guarantee)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import crypto from "crypto";

async function requireAuth(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user || !user.organizationId) return null;
  return { userId: user.id, organizationId: user.organizationId as string, email: user.email };
}

// ─────────────────────────────────────────────────────────────────────────────
// BFS downline walk (re-used by multiple handlers)
// ─────────────────────────────────────────────────────────────────────────────

async function getDownlineIds(
  agentId: string,
  maxDepth: number = 10,
): Promise<string[]> {
  const ids: string[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: agentId, depth: 0 }];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);

    const children = await prisma.agentProfile.findMany({
      where: { parentId: id },
      select: { id: true },
    });

    for (const child of children) {
      ids.push(child.id);
      if (depth + 1 < maxDepth) {
        queue.push({ id: child.id, depth: depth + 1 });
      }
    }
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// Team handlers
// ─────────────────────────────────────────────────────────────────────────────

export const MyTeamHandlers = {
  // GET /api/real-estate/my-team
  // Returns the current agent's profile + direct recruits + summary
  async getMyTeam(req: NextRequest) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const agent = await prisma.agentProfile.findUnique({
      where: { userId: session.userId },
      include: {
        rank: { select: { name: true, code: true, level: true } },
        reraProfile: {
          select: {
            reraNumber: true,
            reraState: true,
            reraVerifiedAt: true,
            reraExpiresAt: true,
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json({ error: "You do not have an agent profile in this organization." }, { status: 404 });
    }

    // Direct children (level 1 downline)
    const directDownline = await prisma.agentProfile.findMany({
      where: { parentId: agent.id },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        rank: { select: { name: true, code: true } },
        reraProfile: { select: { reraVerifiedAt: true } },
      },
      orderBy: { joinedAt: "desc" },
    });

    // Full downline count for stats
    const allDownlineIds = await getDownlineIds(agent.id, 10);

    // Active plan info
    const settings = await (prisma as any).rebmSettings.findUnique({
      where: { organizationId: session.organizationId },
    });

    let designation = null;
    let cumulativeArea = 0;

    if (settings?.activePlanId && settings.planEngine === "SLAB") {
      const lastEntry = await (prisma as any).agentAreaLedger.findFirst({
        where: {
          organizationId: session.organizationId,
          agentId: agent.id,
          planId: settings.activePlanId,
          isReversed: false,
        },
        orderBy: { createdAt: "desc" },
        select: { cumulativeArea: true },
      });
      cumulativeArea = lastEntry ? Number(lastEntry.cumulativeArea) : 0;

      // Find designation
      const plan = await (prisma as any).compPlan.findUnique({
        where: { id: settings.activePlanId },
        include: { designations: { orderBy: { sortOrder: "desc" } } },
      });
      if (plan) {
        for (const des of plan.designations) {
          if (cumulativeArea >= Number(des.minCumulativeArea)) {
            designation = { code: des.designationCode, name: des.designationName };
            break;
          }
        }
      }
    }

    // Pending invite tokens
    const pendingInvites = await (prisma as any).inviteToken.findMany({
      where: {
        organizationId: session.organizationId,
        sponsorAgentId: agent.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      data: {
        agent: {
          id: agent.id,
          userId: agent.userId,
          sponsorCode: agent.sponsorCode,
          status: agent.status,
          rank: agent.rank,
          reraProfile: agent.reraProfile,
          joinedAt: agent.joinedAt,
          designation,
          cumulativeArea,
        },
        directDownline: directDownline.map((d) => ({
          id: d.id,
          userId: d.userId,
          user: d.user,
          status: d.status,
          rank: d.rank,
          reraVerified: !!d.reraProfile?.reraVerifiedAt,
          joinedAt: d.joinedAt,
        })),
        stats: {
          totalDownline: allDownlineIds.length,
          directCount: directDownline.length,
          activeCount: directDownline.filter((d) => d.status === "ACTIVE").length,
          pendingCount: directDownline.filter((d) => d.status === "PENDING_KYC").length,
        },
        pendingInvites,
      },
    });
  },

  // GET /api/real-estate/my-team/downline?depth=3
  // Full downline tree up to N levels
  async getDownline(req: NextRequest) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const agent = await prisma.agentProfile.findUnique({
      where: { userId: session.userId },
      select: { id: true, organizationId: true },
    });
    if (!agent || agent.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const maxDepth = Math.min(parseInt(searchParams.get("depth") ?? "3", 10), 10);

    // Recursive BFS returning nodes with depth info
    const nodes: Array<{
      id: string;
      userId: string;
      depth: number;
      parentId: string | null;
      user: { name: string | null; email: string };
      status: string;
      rank: { name: string; code: string } | null;
      reraVerified: boolean;
      joinedAt: Date;
      cumulativeArea: number;
    }> = [];

    const queue: Array<{ id: string; depth: number }> = [{ id: agent.id, depth: 0 }];
    const seen = new Set<string>();

    const settings = await (prisma as any).rebmSettings.findUnique({
      where: { organizationId: session.organizationId },
    });

    while (queue.length > 0) {
      const { id: currentId, depth } = queue.shift()!;
      if (seen.has(currentId) || depth > maxDepth) continue;
      seen.add(currentId);

      const children = await prisma.agentProfile.findMany({
        where: { parentId: currentId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          rank: { select: { name: true, code: true } },
          reraProfile: { select: { reraVerifiedAt: true } },
        },
      });

      for (const child of children) {
        let cumulativeArea = 0;
        if (settings?.activePlanId && settings.planEngine === "SLAB") {
          const lastEntry = await (prisma as any).agentAreaLedger.findFirst({
            where: {
              organizationId: session.organizationId,
              agentId: child.id,
              planId: settings.activePlanId,
              isReversed: false,
            },
            orderBy: { createdAt: "desc" },
            select: { cumulativeArea: true },
          });
          cumulativeArea = lastEntry ? Number(lastEntry.cumulativeArea) : 0;
        }

        nodes.push({
          id: child.id,
          userId: child.userId,
          depth: depth + 1,
          parentId: currentId,
          user: child.user,
          status: child.status,
          rank: child.rank ?? null,
          reraVerified: !!child.reraProfile?.reraVerifiedAt,
          joinedAt: child.joinedAt,
          cumulativeArea,
        });

        if (depth + 1 < maxDepth) {
          queue.push({ id: child.id, depth: depth + 1 });
        }
      }
    }

    return NextResponse.json({ data: nodes });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Invite token handlers
// ─────────────────────────────────────────────────────────────────────────────

export const InviteHandlers = {
  // POST /api/real-estate/my-team/invite — create invite link
  async create(req: NextRequest) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const agent = await prisma.agentProfile.findUnique({
      where: { userId: session.userId },
      select: { id: true, organizationId: true, status: true },
    });
    if (!agent || agent.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
    }
    if (agent.status !== "ACTIVE") {
      return NextResponse.json({ error: "Only ACTIVE agents can create invite links." }, { status: 403 });
    }

    const body = await req.json();
    const expiryDays = Math.min(body.expiryDays ?? 30, 90);
    const expiresAt = new Date(Date.now() + expiryDays * 86400 * 1000);

    const token = crypto.randomBytes(24).toString("base64url");

    const invite = await (prisma as any).inviteToken.create({
      data: {
        organizationId: session.organizationId,
        token,
        sponsorAgentId: agent.id,
        parentAgentId: body.parentAgentId ?? agent.id,
        expiresAt,
        prefillName: body.prefillName ?? null,
        prefillEmail: body.prefillEmail ?? null,
        prefillPhone: body.prefillPhone ?? null,
      },
    });

    return NextResponse.json({ data: invite }, { status: 201 });
  },

  // DELETE /api/real-estate/my-team/invite/[id] — cancel invite
  async cancel(req: NextRequest, inviteId: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const agent = await prisma.agentProfile.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    });

    const invite = await (prisma as any).inviteToken.findUnique({
      where: { id: inviteId },
    });
    if (!invite || invite.sponsorAgentId !== agent?.id) {
      return NextResponse.json({ error: "Not found or not yours" }, { status: 404 });
    }
    if (invite.status !== "PENDING") {
      return NextResponse.json({ error: "Invite already used, expired, or cancelled." }, { status: 400 });
    }

    await (prisma as any).inviteToken.update({
      where: { id: inviteId },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ data: { cancelled: true } });
  },

  // GET /api/real-estate/join/[token] — public: look up invite details
  async lookup(req: NextRequest, token: string) {
    const invite = await (prisma as any).inviteToken.findUnique({
      where: { token },
      include: {
        // sponsor info to show on join page
        sponsorAgent: {
          include: {
            user: { select: { name: true, email: true, image: true } },
            rank: { select: { name: true } },
          },
        },
      },
    });

    if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
    if (invite.status !== "PENDING" || invite.expiresAt < new Date()) {
      await (prisma as any).inviteToken.update({
        where: { token },
        data: { status: "EXPIRED" },
      }).catch(() => {});
      return NextResponse.json({ error: "This invite link has expired or already been used." }, { status: 410 });
    }

    return NextResponse.json({
      data: {
        token: invite.token,
        expiresAt: invite.expiresAt,
        prefillName: invite.prefillName,
        prefillEmail: invite.prefillEmail,
        prefillPhone: invite.prefillPhone,
        sponsor: {
          name: invite.sponsorAgent?.user?.name,
          email: invite.sponsorAgent?.user?.email,
          image: invite.sponsorAgent?.user?.image,
          rank: invite.sponsorAgent?.rank?.name,
        },
      },
    });
  },

  // POST /api/real-estate/join/[token]/redeem — create user + agent profile
  async redeem(req: NextRequest, token: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "You must be logged in to join." }, { status: 401 });

    const invite = await (prisma as any).inviteToken.findUnique({
      where: { token },
    });
    if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid or expired invite." }, { status: 410 });
    }

    // Check user not already an agent in this org
    const existing = await prisma.agentProfile.findFirst({
      where: { userId: session.userId, organizationId: invite.organizationId },
    });
    if (existing) {
      return NextResponse.json({ error: "You already have an agent profile in this organization." }, { status: 409 });
    }

    const result = await (prisma as any).$transaction(async (tx: any) => {
      // Generate sponsor code
      const sponsorCode = `${session.userId.slice(-6).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;

      const agent = await tx.agentProfile.create({
        data: {
          organizationId: invite.organizationId,
          userId: session.userId,
          sponsorId: invite.sponsorAgentId,
          parentId: invite.parentAgentId ?? invite.sponsorAgentId,
          sponsorCode,
          status: "PENDING_KYC",
          complianceStatus: "PENDING_KYC",
          specializations: [],
          serviceAreas: [],
        },
      });

      await tx.inviteToken.update({
        where: { token },
        data: {
          status: "USED",
          redeemedByUserId: session.userId,
          redeemedByAgentId: agent.id,
          redeemedAt: new Date(),
        },
      });

      return agent;
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
};
