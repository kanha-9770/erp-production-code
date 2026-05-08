/**
 * Real Estate Brokerage — Lead, LeadActivity, PropertyViewing, Buyer handlers.
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
    console.error(`[LeadHandlers] ${label}:`, e?.message);
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

function serializeLead<T extends Record<string, any>>(l: T): any {
  if (!l) return l;
  return {
    ...l,
    budgetMin: l.budgetMin != null ? Number(l.budgetMin) : null,
    budgetMax: l.budgetMax != null ? Number(l.budgetMax) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAD HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const LeadHandlers = {
  // GET /api/real-estate/leads
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const score = url.searchParams.get("score") ?? undefined;
      const source = url.searchParams.get("source") ?? undefined;
      const assignedAgentId = url.searchParams.get("assignedAgentId") ?? undefined;
      const search = url.searchParams.get("search") ?? undefined;
      const followupBefore = url.searchParams.get("followupBefore") ?? undefined;
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
      const offset = Number(url.searchParams.get("offset") ?? 0);

      const where: Prisma.LeadWhereInput = {
        organizationId: auth.organizationId,
        ...(status ? { status: status as any } : {}),
        ...(score ? { score: score as any } : {}),
        ...(source ? { source: source as any } : {}),
        ...(assignedAgentId ? { assignedAgentId } : {}),
        ...(followupBefore
          ? { nextFollowUpAt: { lte: new Date(followupBefore) } }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { activities: true, viewings: true } },
          },
        }),
        prisma.lead.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: items.map(serializeLead),
        meta: { total, limit, offset },
      });
    }, "list");
  },

  // POST /api/real-estate/leads
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      if (!body.name)
        return NextResponse.json({ error: "name is required" }, { status: 400 });

      const lead = await prisma.lead.create({
        data: {
          organizationId: auth.organizationId,
          name: body.name,
          email: body.email || null,
          phone: body.phone || null,
          altPhone: body.altPhone || null,
          budgetMin:
            body.budgetMin != null ? new Prisma.Decimal(body.budgetMin) : null,
          budgetMax:
            body.budgetMax != null ? new Prisma.Decimal(body.budgetMax) : null,
          preferredCities: Array.isArray(body.preferredCities)
            ? body.preferredCities
            : [],
          propertyTypes: Array.isArray(body.propertyTypes)
            ? body.propertyTypes
            : [],
          bedroomsMin: body.bedroomsMin ?? null,
          status: body.status || "NEW",
          score: body.score || "WARM",
          source: body.source || "OTHER",
          sourceDetails: body.sourceDetails || null,
          assignedAgentId: body.assignedAgentId || null,
          assignedAt: body.assignedAgentId ? new Date() : null,
          nextFollowUpAt: body.nextFollowUpAt
            ? new Date(body.nextFollowUpAt)
            : null,
          notes: body.notes || null,
          createdById: auth.id,
        },
      });

      // Seed an activity entry so the timeline starts right at lead creation.
      if (lead.assignedAgentId) {
        await prisma.leadActivity.create({
          data: {
            leadId: lead.id,
            type: "ASSIGNMENT",
            agentId: lead.assignedAgentId,
            subject: "Lead assigned",
            data: { fromAgentId: null, toAgentId: lead.assignedAgentId },
          },
        });
      }

      return NextResponse.json(
        { success: true, data: serializeLead(lead) },
        { status: 201 },
      );
    }, "create");
  },

  // GET /api/real-estate/leads/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const lead = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
        include: {
          activities: { orderBy: { occurredAt: "desc" } },
          viewings: {
            orderBy: { scheduledAt: "desc" },
            include: {
              property: {
                select: { id: true, title: true, code: true, primaryImageUrl: true, city: true },
              },
            },
          },
          buyer: true,
        },
      });
      if (!lead)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      return NextResponse.json({ success: true, data: serializeLead(lead) });
    }, "get");
  },

  // PUT /api/real-estate/leads/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const data: Prisma.LeadUpdateInput = {};
      const setIf = (k: string, v: any) => {
        if (v !== undefined) (data as any)[k] = v;
      };

      setIf("name", body.name);
      setIf("email", body.email);
      setIf("phone", body.phone);
      setIf("altPhone", body.altPhone);
      setIf("preferredCities", body.preferredCities);
      setIf("propertyTypes", body.propertyTypes);
      setIf("bedroomsMin", body.bedroomsMin);
      setIf("score", body.score);
      setIf("source", body.source);
      setIf("sourceDetails", body.sourceDetails);
      setIf("notes", body.notes);
      setIf("lostReason", body.lostReason);

      if (body.budgetMin !== undefined)
        data.budgetMin =
          body.budgetMin == null ? null : new Prisma.Decimal(body.budgetMin);
      if (body.budgetMax !== undefined)
        data.budgetMax =
          body.budgetMax == null ? null : new Prisma.Decimal(body.budgetMax);
      if (body.nextFollowUpAt !== undefined)
        data.nextFollowUpAt = body.nextFollowUpAt
          ? new Date(body.nextFollowUpAt)
          : null;

      // Status side-effects.
      if (body.status !== undefined && body.status !== existing.status) {
        // BR-13 — converting requires a transaction reference (Phase 2). For
        // Phase 1 we accept CONVERTED via the explicit /convert endpoint only;
        // the generic update reroutes mistaken use back to NEGOTIATING.
        if (body.status === "CONVERTED") {
          return NextResponse.json(
            { error: "Use POST /convert to mark a lead as Converted." },
            { status: 400 },
          );
        }
        data.status = body.status;
      }

      // Re-assignment activity.
      if (body.assignedAgentId !== undefined && body.assignedAgentId !== existing.assignedAgentId) {
        data.assignedAgentId = body.assignedAgentId || null;
        data.assignedAt = body.assignedAgentId ? new Date() : null;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.lead.update({ where: { id }, data });

        if (data.status && data.status !== existing.status) {
          await tx.leadActivity.create({
            data: {
              leadId: id,
              type: "STATUS_CHANGE",
              agentId: existing.assignedAgentId ?? auth.id,
              subject: `${existing.status} → ${data.status}`,
              data: { fromStatus: existing.status, toStatus: data.status },
            },
          });
        }

        if (
          data.assignedAgentId !== undefined &&
          data.assignedAgentId !== existing.assignedAgentId
        ) {
          await tx.leadActivity.create({
            data: {
              leadId: id,
              type: "ASSIGNMENT",
              agentId: (data.assignedAgentId as string) ?? auth.id,
              subject: "Lead reassigned",
              data: {
                fromAgentId: existing.assignedAgentId,
                toAgentId: data.assignedAgentId,
              },
            },
          });
        }

        return u;
      });

      return NextResponse.json({ success: true, data: serializeLead(updated) });
    }, "update");
  },

  // DELETE /api/real-estate/leads/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const lead = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!lead)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      await prisma.lead.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }, "remove");
  },

  // POST /api/real-estate/leads/[id]/convert — BR-13 entry point. Phase 1 just
  // stamps the conversion + creates a Buyer; Phase 2 will require a
  // Transaction reference too.
  async convert(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json().catch(() => ({}));
      const existing = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (existing.status === "CONVERTED")
        return NextResponse.json({ error: "Already converted" }, { status: 409 });

      const updated = await prisma.$transaction(async (tx) => {
        let buyerId = existing.buyerId;
        if (!buyerId) {
          const buyer = await tx.buyer.create({
            data: {
              organizationId: auth.organizationId,
              name: body.buyer?.name || existing.name,
              email: body.buyer?.email ?? existing.email,
              phone: body.buyer?.phone ?? existing.phone,
              panOrTaxId: body.buyer?.panOrTaxId || null,
              addressLine1: body.buyer?.addressLine1 || null,
              city: body.buyer?.city || null,
              country: body.buyer?.country || null,
              createdById: auth.id,
            },
          });
          buyerId = buyer.id;
        }

        const lead = await tx.lead.update({
          where: { id },
          data: {
            status: "CONVERTED",
            convertedAt: new Date(),
            buyerId,
          },
          include: { buyer: true },
        });

        await tx.leadActivity.create({
          data: {
            leadId: id,
            type: "STATUS_CHANGE",
            agentId: existing.assignedAgentId ?? auth.id,
            subject: `Converted (${existing.status} → CONVERTED)`,
            data: { fromStatus: existing.status, toStatus: "CONVERTED", buyerId },
          },
        });

        return lead;
      });

      return NextResponse.json({ success: true, data: serializeLead(updated) });
    }, "convert");
  },

  // ─── ACTIVITIES ────────────────────────────────────────────────────────────

  // GET /api/real-estate/leads/[id]/activities
  async listActivities(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const lead = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!lead)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const activities = await prisma.leadActivity.findMany({
        where: { leadId: id },
        orderBy: { occurredAt: "desc" },
      });
      return NextResponse.json({ success: true, data: activities });
    }, "listActivities");
  },

  // POST /api/real-estate/leads/[id]/activities
  async addActivity(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const lead = await prisma.lead.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true, assignedAgentId: true },
      });
      if (!lead)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      if (!body.type)
        return NextResponse.json({ error: "type is required" }, { status: 400 });

      const activity = await prisma.$transaction(async (tx) => {
        const a = await tx.leadActivity.create({
          data: {
            leadId: id,
            type: body.type,
            agentId: body.agentId || lead.assignedAgentId || auth.id,
            occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
            subject: body.subject || null,
            content: body.content || null,
            outcome: body.outcome || null,
            data: body.data ?? undefined,
          },
        });
        // Touch lastContactedAt for any contact-style activity so the lead
        // list can sort/filter by recency.
        if (["CALL", "EMAIL", "MEETING", "VIEWING"].includes(body.type)) {
          await tx.lead.update({
            where: { id },
            data: { lastContactedAt: new Date() },
          });
        }
        return a;
      });

      return NextResponse.json(
        { success: true, data: activity },
        { status: 201 },
      );
    }, "addActivity");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// VIEWING HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const ViewingHandlers = {
  // GET /api/real-estate/viewings
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const agentId = url.searchParams.get("agentId") ?? undefined;
      const propertyId = url.searchParams.get("propertyId") ?? undefined;
      const leadId = url.searchParams.get("leadId") ?? undefined;
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

      const where: Prisma.PropertyViewingWhereInput = {
        organizationId: auth.organizationId,
        ...(status ? { status: status as any } : {}),
        ...(agentId ? { agentId } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(leadId ? { leadId } : {}),
        ...(from || to
          ? {
              scheduledAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      };

      const items = await prisma.propertyViewing.findMany({
        where,
        take: limit,
        orderBy: { scheduledAt: "asc" },
        include: {
          property: {
            select: { id: true, title: true, code: true, city: true, primaryImageUrl: true },
          },
          lead: { select: { id: true, name: true, phone: true, email: true } },
        },
      });

      return NextResponse.json({ success: true, data: items });
    }, "list");
  },

  // POST /api/real-estate/viewings
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      if (!body.leadId || !body.propertyId || !body.scheduledAt)
        return NextResponse.json(
          { error: "leadId, propertyId, scheduledAt are required" },
          { status: 400 },
        );

      const [lead, property] = await Promise.all([
        prisma.lead.findFirst({
          where: { id: body.leadId, organizationId: auth.organizationId },
          select: { id: true, status: true, assignedAgentId: true },
        }),
        prisma.property.findFirst({
          where: { id: body.propertyId, organizationId: auth.organizationId },
          select: { id: true, listingAgentId: true },
        }),
      ]);
      if (!lead || !property)
        return NextResponse.json(
          { error: "Invalid lead or property" },
          { status: 404 },
        );

      // Only advance the pipeline forward: don't downgrade a lead that's
      // already in NEGOTIATING / CONVERTED back to VIEWING_SCHEDULED.
      const earlyStages = new Set(["NEW", "CONTACTED", "QUALIFIED"]);
      const shouldAdvanceStatus = earlyStages.has(lead.status);

      const viewing = await prisma.$transaction(async (tx) => {
        const v = await tx.propertyViewing.create({
          data: {
            organizationId: auth.organizationId,
            leadId: body.leadId,
            propertyId: body.propertyId,
            agentId:
              body.agentId ||
              lead.assignedAgentId ||
              property.listingAgentId ||
              auth.id,
            scheduledAt: new Date(body.scheduledAt),
            durationMin: body.durationMin ?? 30,
            status: "SCHEDULED",
          },
        });
        await tx.leadActivity.create({
          data: {
            leadId: body.leadId,
            type: "VIEWING",
            agentId: v.agentId,
            subject: "Viewing scheduled",
            data: { propertyId: body.propertyId, viewingId: v.id },
          },
        });
        if (shouldAdvanceStatus) {
          await tx.lead.update({
            where: { id: body.leadId },
            data: { status: "VIEWING_SCHEDULED" },
          });
        }
        return v;
      });

      return NextResponse.json(
        { success: true, data: viewing },
        { status: 201 },
      );
    }, "create");
  },

  // PUT /api/real-estate/viewings/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.propertyViewing.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const data: Prisma.PropertyViewingUpdateInput = {};
      const setIf = (k: string, v: any) => {
        if (v !== undefined) (data as any)[k] = v;
      };

      setIf("status", body.status);
      setIf("durationMin", body.durationMin);
      setIf("feedback", body.feedback);
      setIf("outcomeRating", body.outcomeRating);
      if (body.scheduledAt !== undefined)
        data.scheduledAt = new Date(body.scheduledAt);

      const updated = await prisma.propertyViewing.update({
        where: { id },
        data,
      });
      return NextResponse.json({ success: true, data: updated });
    }, "update");
  },

  // DELETE /api/real-estate/viewings/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.propertyViewing.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      await prisma.propertyViewing.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
