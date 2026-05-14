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

// The Prisma `User` model stores names as `first_name` / `last_name` and
// avatar as `avatar` — there are no `name` or `image` columns. The
// front-end (sponsor card, downline table, join page) wants a flat
// `{ id, name, email, image }` shape, so we normalize here whenever we
// project a user row into the API response.
const USER_DISPLAY_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
  avatar: true,
} as const;

const USER_DISPLAY_SELECT_NO_ID = {
  first_name: true,
  last_name: true,
  email: true,
  avatar: true,
} as const;

function toUserDisplay(u: any): { id: string; name: string | null; email: string; image: string | null } | null {
  if (!u) return null;
  const name =
    [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || null;
  return {
    id: u.id,
    name,
    email: u.email,
    image: u.avatar ?? null,
  };
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
        user: { select: USER_DISPLAY_SELECT },
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
        directDownline: directDownline.map((d: any) => ({
          id: d.id,
          userId: d.userId,
          user: toUserDisplay(d.user),
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
          user: { select: USER_DISPLAY_SELECT },
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
          user: toUserDisplay((child as any).user) as any,
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

    // Friendly one-time code: 8 chars from an alphabet that excludes visually
    // ambiguous glyphs (0/O, 1/I/L, etc.) so it can be read out loud or
    // typed by a new user. The same value doubles as the URL token, so the
    // shareable link is `/real-estate/join/<code>`. Retry on the rare
    // collision against the unique index on token.
    const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const makeCode = () => {
      const buf = crypto.randomBytes(8);
      let out = "";
      for (let i = 0; i < 8; i++) out += ALPHABET[buf[i] % ALPHABET.length];
      return out;
    };

    let invite: any = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = makeCode();
      try {
        invite = await (prisma as any).inviteToken.create({
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
        break;
      } catch (err: any) {
        lastErr = err;
        if (err?.code !== "P2002") throw err; // not a unique-violation — bail
      }
    }
    if (!invite) {
      console.error("[createInvite] could not generate unique code after 5 attempts:", lastErr);
      return NextResponse.json(
        { error: "Could not generate invite code. Please try again." },
        { status: 500 },
      );
    }

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
    // NOTE: `InviteToken` in the schema only carries the scalar
    // `sponsorAgentId` — there is no Prisma `sponsorAgent` relation
    // defined on the model, so we cannot `include` it. Fetch the
    // sponsor agent + user in a second query keyed on that scalar.
    const invite = await (prisma as any).inviteToken.findUnique({
      where: { token },
    });

    if (!invite) return NextResponse.json({ error: "Invalid invite link" }, { status: 404 });
    if (invite.status !== "PENDING" || invite.expiresAt < new Date()) {
      await (prisma as any).inviteToken.update({
        where: { token },
        data: { status: "EXPIRED" },
      }).catch(() => {});
      return NextResponse.json({ error: "This invite link has expired or already been used." }, { status: 410 });
    }

    const sponsorAgent = await (prisma as any).agentProfile.findUnique({
      where: { id: invite.sponsorAgentId },
      include: {
        user: { select: USER_DISPLAY_SELECT_NO_ID },
        rank: { select: { name: true } },
      },
    });

    const sponsorUser = toUserDisplay(sponsorAgent?.user);

    return NextResponse.json({
      data: {
        token: invite.token,
        expiresAt: invite.expiresAt,
        prefillName: invite.prefillName,
        prefillEmail: invite.prefillEmail,
        prefillPhone: invite.prefillPhone,
        sponsor: {
          name: sponsorUser?.name ?? null,
          email: sponsorUser?.email ?? "",
          image: sponsorUser?.image ?? null,
          rank: sponsorAgent?.rank?.name ?? null,
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

// ─────────────────────────────────────────────────────────────────────────────
// Referral handlers — public lookup + post-signup onboard-as-agent
// ─────────────────────────────────────────────────────────────────────────────

type SponsorPreview = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  rank: string | null;
  organizationName: string | null;
};

type ResolvedReferral =
  | {
      kind: "invite";
      token: string;
      organizationId: string;
      sponsorAgentId: string;
      parentAgentId: string | null;
      expiresAt: Date;
      sponsor: SponsorPreview;
    }
  | {
      kind: "sponsor";
      sponsorCode: string;
      organizationId: string;
      sponsorAgentId: string;
      sponsor: SponsorPreview;
    };

async function resolveReferralCode(
  code: string,
): Promise<
  | { ok: true; resolved: ResolvedReferral }
  | { ok: false; status: number; error: string }
> {
  // Try as InviteToken first. `InviteToken.sponsorAgent` isn't a Prisma
  // relation (the model only has the `sponsorAgentId` scalar), so we
  // resolve the sponsor in a second query.
  const invite = await (prisma as any).inviteToken.findUnique({
    where: { token: code },
  });

  if (invite) {
    if (invite.status !== "PENDING" || invite.expiresAt < new Date()) {
      return { ok: false, status: 410, error: "Invite link expired or used" };
    }

    const sponsorAgent = await (prisma as any).agentProfile.findUnique({
      where: { id: invite.sponsorAgentId },
      include: {
        user: { select: USER_DISPLAY_SELECT },
        rank: { select: { name: true } },
      },
    });
    const sponsorUser = toUserDisplay(sponsorAgent?.user);

    let organizationName: string | null = null;
    try {
      const org = await (prisma as any).organization.findUnique({
        where: { id: invite.organizationId },
        select: { name: true },
      });
      organizationName = org?.name ?? null;
    } catch {
      organizationName = null;
    }

    return {
      ok: true,
      resolved: {
        kind: "invite",
        token: invite.token,
        organizationId: invite.organizationId,
        sponsorAgentId: invite.sponsorAgentId,
        parentAgentId: invite.parentAgentId ?? null,
        expiresAt: invite.expiresAt,
        sponsor: {
          id: sponsorUser?.id ?? invite.sponsorAgentId,
          name: sponsorUser?.name ?? null,
          email: sponsorUser?.email ?? "",
          image: sponsorUser?.image ?? null,
          rank: sponsorAgent?.rank?.name ?? null,
          organizationName,
        },
      },
    };
  }

  // Fall back to AgentProfile.sponsorCode.
  const sponsorAgent: any = await (prisma as any).agentProfile.findUnique({
    where: { sponsorCode: code },
    include: {
      user: { select: USER_DISPLAY_SELECT },
      rank: { select: { name: true } },
    },
  });

  if (sponsorAgent && sponsorAgent.status === "ACTIVE") {
    const sponsorUser = toUserDisplay(sponsorAgent.user);

    let organizationName: string | null = null;
    try {
      const org = await (prisma as any).organization.findUnique({
        where: { id: sponsorAgent.organizationId },
        select: { name: true },
      });
      organizationName = org?.name ?? null;
    } catch {
      organizationName = null;
    }

    return {
      ok: true,
      resolved: {
        kind: "sponsor",
        sponsorCode: code,
        organizationId: sponsorAgent.organizationId,
        sponsorAgentId: sponsorAgent.id,
        sponsor: {
          id: sponsorUser?.id ?? sponsorAgent.id,
          name: sponsorUser?.name ?? null,
          email: sponsorUser?.email ?? "",
          image: sponsorUser?.image ?? null,
          rank: sponsorAgent.rank?.name ?? null,
          organizationName,
        },
      },
    };
  }

  return { ok: false, status: 404, error: "Invalid referral code" };
}

export const ReferralHandlers = {
  // GET /api/real-estate/referral-lookup?code=...
  // Public. Resolves a referral code or invite token and returns a sponsor preview.
  async lookup(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = (searchParams.get("code") ?? "").trim();
    if (!code) {
      return NextResponse.json({ error: "Referral code required" }, { status: 400 });
    }

    const result = await resolveReferralCode(code);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const r = result.resolved;
    if (r.kind === "invite") {
      return NextResponse.json({
        data: {
          kind: "invite",
          token: r.token,
          organizationId: r.organizationId,
          sponsor: r.sponsor,
          expiresAt: r.expiresAt,
        },
      });
    }
    return NextResponse.json({
      data: {
        kind: "sponsor",
        sponsorCode: r.sponsorCode,
        organizationId: r.organizationId,
        sponsor: r.sponsor,
      },
    });
  },

  // POST /api/real-estate/onboard-as-agent
  // Requires the just-verified user. Body: { referralCode }.
  //
  // What this does, atomically:
  //   1. Resolves the referral code → sponsor + organization.
  //   2. Creates an AgentProfile under that sponsor.
  //   3. If the user has no organization yet (the registration-via-referral
  //      flow), links them to the sponsor's organization so subsequent
  //      real-estate handlers (which gate on user.organizationId) succeed.
  //   4. Marks the InviteToken as USED when applicable.
  //
  // Refuses to silently move a user who already belongs to a different
  // organization — that's a different feature (multi-org membership) and
  // should be explicit, not a side-effect of pasting a referral code.
  async onboardAsAgent(req: NextRequest) {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { referralCode?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const referralCode = (body.referralCode ?? "").trim();
    if (!referralCode) {
      return NextResponse.json({ error: "Referral code required" }, { status: 400 });
    }

    const result = await resolveReferralCode(referralCode);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const resolved = result.resolved;

    // Cross-org guard: a user already in org X cannot join org Y via a
    // referral. Block before doing any writes.
    if (user.organizationId && user.organizationId !== resolved.organizationId) {
      return NextResponse.json(
        {
          error:
            "You already belong to a different organization. Sign out and use a fresh account to join this team.",
        },
        { status: 409 },
      );
    }

    // Idempotency: existing agent profile for this user? Return it.
    // The schema has @unique on userId so a user can have at most one
    // AgentProfile org-wide.
    const existing = await prisma.agentProfile.findUnique({
      where: { userId: user.id },
    });
    if (existing) {
      // If their AgentProfile is already in the resolved org we treat this
      // as success-idempotent. If it's in a different org, that's a real
      // conflict (shouldn't happen given the cross-org guard above, but
      // belt-and-braces).
      if (existing.organizationId !== resolved.organizationId) {
        return NextResponse.json(
          { error: "You already have an agent profile in another organization." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { data: existing, alreadyExists: true },
        { status: 200 },
      );
    }

    try {
      const created = await (prisma as any).$transaction(async (tx: any) => {
        const sponsorCode = `${user.id.slice(-6).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;

        // Step 1 — link the user to the sponsor's organization if they
        // aren't already. Without this, all subsequent /api/real-estate/*
        // calls return 401 because requireAuth gates on user.organizationId.
        if (!user.organizationId) {
          await tx.user.update({
            where: { id: user.id },
            data: { organizationId: resolved.organizationId },
          });
        }

        // Step 2 — create the AgentProfile.
        const baseData = {
          organizationId: resolved.organizationId,
          userId: user.id,
          sponsorId: resolved.sponsorAgentId,
          sponsorCode,
          status: "PENDING_KYC",
          complianceStatus: "PENDING_KYC",
          specializations: [],
          serviceAreas: [],
        };

        let agent;
        if (resolved.kind === "invite") {
          agent = await tx.agentProfile.create({
            data: {
              ...baseData,
              parentId: resolved.parentAgentId ?? resolved.sponsorAgentId,
            },
          });

          // Step 3 — burn the invite token so it can't be redeemed twice.
          await tx.inviteToken.update({
            where: { token: resolved.token },
            data: {
              status: "USED",
              redeemedByUserId: user.id,
              redeemedByAgentId: agent.id,
              redeemedAt: new Date(),
            },
          });
        } else {
          // kind === "sponsor" — parent defaults to the sponsor agent.
          agent = await tx.agentProfile.create({
            data: {
              ...baseData,
              parentId: resolved.sponsorAgentId,
            },
          });
        }

        // Step 4 — Role & permissions.
        // We auto-provision a single, well-named "Real Estate Agent" role per
        // organization and put every onboarded agent under it. The role gets
        // explicit grants on the routes an agent actually needs (real-estate,
        // profile, auth). Admins can refine the role later via the existing
        // roles UI — we don't lock anything down here that the admin can't
        // adjust through normal channels.
        //
        // Wrapped in try/catch inside the transaction so the *core* onboard
        // (AgentProfile + org link) succeeds even if the permission scaffolding
        // hits a constraint edge case in an unusual schema state.
        try {
          // 4a. Find or create the role.
          let agentRole = await tx.role.findFirst({
            where: {
              organizationId: resolved.organizationId,
              name: "Real Estate Agent",
            },
            select: { id: true },
          });
          if (!agentRole) {
            agentRole = await tx.role.create({
              data: {
                name: "Real Estate Agent",
                description: "MLM agents onboarded via referral. Scoped to the real-estate module.",
                organizationId: resolved.organizationId,
                isAdmin: false,
                isActive: true,
                shareDataWithPeers: false,
                level: 0,
              },
              select: { id: true },
            });
          }

          // 4b. Find or create an OrganizationUnit to host the assignment.
          //     We prefer reusing an existing default unit so we don't litter
          //     the org tree with duplicates.
          let unit = await tx.organizationUnit.findFirst({
            where: {
              organizationId: resolved.organizationId,
              name: "Real Estate",
            },
            select: { id: true },
          });
          if (!unit) {
            // Try any existing unit before creating a new one.
            unit = await tx.organizationUnit.findFirst({
              where: { organizationId: resolved.organizationId },
              orderBy: { sortOrder: "asc" },
              select: { id: true },
            });
          }
          if (!unit) {
            unit = await tx.organizationUnit.create({
              data: {
                name: "Real Estate",
                description: "Default unit for real-estate MLM agents.",
                organizationId: resolved.organizationId,
                isActive: true,
                level: 0,
              },
              select: { id: true },
            });
          }

          // 4c. Ensure the RouteRoleAccess grants exist for this role on the
          //     routes an agent needs. We create org-scoped RoutePermission
          //     rows on demand (idempotent on the unique [pattern, orgId])
          //     and link the role to each via RouteRoleAccess.
          //
          //     IMPORTANT: we only ADD grants for the new role. We never
          //     touch RouteRoleAccess rows for other roles — so existing
          //     users in the org are completely unaffected.
          const agentRoutePatterns = [
            "/real-estate",
            "/real-estate/**",
            "/real-estate/join/**",
            "/real-estate/onboard",
            "/profile",
            "/profile/**",
          ];

          for (const pattern of agentRoutePatterns) {
            const routePerm = await tx.routePermission.upsert({
              where: {
                pattern_organizationId: {
                  pattern,
                  organizationId: resolved.organizationId,
                },
              },
              create: {
                pattern,
                organizationId: resolved.organizationId,
                description: "Auto-provisioned for Real Estate Agent role",
              },
              update: {},
              select: { id: true },
            });

            await tx.routeRoleAccess.upsert({
              where: {
                routePermissionId_roleId: {
                  routePermissionId: routePerm.id,
                  roleId: agentRole.id,
                },
              },
              create: {
                routePermissionId: routePerm.id,
                roleId: agentRole.id,
                granted: true,
              },
              update: { granted: true },
            });
          }

          // 4d. Assign the new user to the unit + role.
          //     Unique on (userId, unitId) — if a stale assignment somehow
          //     exists we update it to point at this role instead.
          await tx.userUnitAssignment.upsert({
            where: {
              userId_unitId: {
                userId: user.id,
                unitId: unit.id,
              },
            },
            create: {
              userId: user.id,
              unitId: unit.id,
              roleId: agentRole.id,
            },
            update: {
              roleId: agentRole.id,
            },
          });

          // 4e. Ensure the sidebar has somewhere to PUT the Real Estate
          //     static pages for this agent. The sidebar reads anchor
          //     mappings from `StaticPageAnchor` — if no admin has anchored
          //     the Real Estate group to a FormModule, the agent would land
          //     on /real-estate but the sidebar would show no Real-Estate
          //     items at all (everything else is hidden by the role's
          //     route grants).
          //
          //     Find-or-create a top-level "Real Estate" FormModule in the
          //     org, then upsert the group-level anchor at the sentinel path
          //     `group:Real Estate`. We never overwrite an existing
          //     admin-configured anchor — `update: {}` makes the upsert
          //     idempotent on the per-org unique `[organizationId, path]`.
          let rebmModule = await tx.formModule.findFirst({
            where: {
              organizationId: resolved.organizationId,
              name: "Real Estate",
            },
            select: { id: true },
          });
          if (!rebmModule) {
            rebmModule = await tx.formModule.create({
              data: {
                name: "Real Estate",
                description:
                  "Real-estate brokerage — properties, agents, transactions, and the MLM network.",
                organizationId: resolved.organizationId,
                icon: "building2",
                moduleType: "standard",
                level: 0,
                isActive: true,
              },
              select: { id: true },
            });
          }

          await tx.staticPageAnchor.upsert({
            where: {
              organizationId_path: {
                organizationId: resolved.organizationId,
                path: "group:Real Estate",
              },
            },
            create: {
              organizationId: resolved.organizationId,
              path: "group:Real Estate",
              moduleId: rebmModule.id,
              sortOrder: 0,
            },
            update: {},
          });
        } catch (permErr) {
          // Surface the failure in logs but don't kill the transaction —
          // the user still has a working AgentProfile + org link. An admin
          // can wire up the role manually from /settings/permission/roles.
          console.error(
            "[onboardAsAgent] role/route provisioning failed (non-fatal):",
            permErr,
          );
        }

        return agent;
      });

      // Tell the client to refresh its auth-meta cookie so the new org +
      // permissions take effect immediately on the next page render. The
      // client side is also responsible for forcing a hard reload after
      // showing the success card; this flag is a belt for that suspender.
      return NextResponse.json(
        { data: created, refreshAuthMeta: true },
        { status: 201 },
      );
    } catch (err: any) {
      // Surface Prisma constraint errors with a useful message instead of
      // a generic 500.
      const code = err?.code as string | undefined;
      if (code === "P2002") {
        return NextResponse.json(
          { error: "You already have an agent profile. Refresh and try again." },
          { status: 409 },
        );
      }
      console.error("[onboardAsAgent] transaction failed:", err);
      return NextResponse.json(
        { error: "Could not complete agent onboarding. Please try again." },
        { status: 500 },
      );
    }
  },
};
