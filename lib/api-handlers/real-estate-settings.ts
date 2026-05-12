/**
 * REBM module-level settings + RERA management handlers.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

async function requireAuth(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user || !user.organizationId) return null;
  return { userId: user.id, organizationId: user.organizationId as string, email: user.email };
}

// ── Settings CRUD ─────────────────────────────────────────────────────────────

export const SettingsHandlers = {
  async get(req: NextRequest) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let settings = await (prisma as any).rebmSettings.findUnique({
      where: { organizationId: session.organizationId },
    });

    if (!settings) {
      settings = await (prisma as any).rebmSettings.create({
        data: { organizationId: session.organizationId },
      });
    }

    return NextResponse.json({ data: settings });
  },

  async update(req: NextRequest) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const allowed = [
      "isReraRequired",
      "planEngine",
      "activePlanId",
      "areaUnit",
      "holdPeriodDays",
      "companyResidualPercent",
    ];
    const data: Record<string, unknown> = { updatedById: session.userId };
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }

    const settings = await (prisma as any).rebmSettings.upsert({
      where: { organizationId: session.organizationId },
      create: { organizationId: session.organizationId, ...data },
      update: data,
    });

    return NextResponse.json({ data: settings });
  },
};

// ── RERA handlers ─────────────────────────────────────────────────────────────

export const ReraHandlers = {
  // Get RERA profile for an agent (admin or self)
  async get(req: NextRequest, agentId: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const agent = await prisma.agentProfile.findUnique({
      where: { id: agentId },
      include: { reraProfile: true },
    });
    if (!agent || agent.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: agent.reraProfile ?? null });
  },

  // Upsert RERA info (agent fills their own; admin can also fill)
  async upsert(req: NextRequest, agentId: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const agent = await prisma.agentProfile.findUnique({ where: { id: agentId } });
    if (!agent || agent.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const data = {
      reraNumber: body.reraNumber ?? undefined,
      reraState: body.reraState ?? undefined,
      reraExpiresAt: body.reraExpiresAt ? new Date(body.reraExpiresAt) : undefined,
      reraDocUrl: body.reraDocUrl ?? undefined,
      // Clear verification when number changes
      ...(body.reraNumber
        ? { reraVerifiedAt: null, reraVerifiedBy: null }
        : {}),
    };

    const profile = await (prisma as any).agentReraProfile.upsert({
      where: { agentId },
      create: { agentId, ...data },
      update: data,
    });

    return NextResponse.json({ data: profile });
  },

  // Admin verifies RERA
  async verify(req: NextRequest, agentId: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const agent = await prisma.agentProfile.findUnique({
      where: { id: agentId },
      include: { reraProfile: true },
    });
    if (!agent || agent.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!agent.reraProfile?.reraNumber) {
      return NextResponse.json({ error: "Agent has no RERA number to verify" }, { status: 400 });
    }

    const profile = await (prisma as any).agentReraProfile.update({
      where: { agentId },
      data: {
        reraVerifiedAt: new Date(),
        reraVerifiedBy: session.userId,
      },
    });

    return NextResponse.json({ data: profile });
  },

  // Admin rejects / clears RERA verification
  async reject(req: NextRequest, agentId: string) {
    const session = await requireAuth(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const profile = await (prisma as any).agentReraProfile.update({
      where: { agentId },
      data: {
        reraVerifiedAt: null,
        reraVerifiedBy: null,
        reraNumber: null,
        reraDocUrl: null,
      },
    });

    return NextResponse.json({ data: profile });
  },
};
