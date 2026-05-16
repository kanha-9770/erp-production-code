/**
 * REBM Phase 2 — Transaction handlers + Commission Rule handlers.
 *
 * Closing a transaction triggers the commission engine (lib/real-estate/
 * commission-engine.ts). Cancelling triggers the reverse path. Both run
 * inside a single Prisma $transaction so partial writes can't leak.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";
import {
  calculateCommission,
  closeTransaction,
  reverseTransaction,
} from "@/lib/real-estate/commission-engine";

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
    console.error(`[TxnHandlers] ${label}:`, e?.message);
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

function serializeTransaction<T extends Record<string, any>>(t: T): any {
  if (!t) return t;
  return {
    ...t,
    salePrice: t.salePrice != null ? Number(t.salePrice) : null,
    baseCommission: t.baseCommission != null ? Number(t.baseCommission) : null,
  };
}

function serializeSplit<T extends Record<string, any>>(s: T): any {
  if (!s) return s;
  return {
    ...s,
    percent: s.percent != null ? Number(s.percent) : 0,
    amount: s.amount != null ? Number(s.amount) : 0,
  };
}

function serializeRule<T extends Record<string, any>>(r: T): any {
  if (!r) return r;
  return {
    ...r,
    listingAgentPercent: Number(r.listingAgentPercent),
    sellingAgentPercent: Number(r.sellingAgentPercent),
    brokeragePercent: Number(r.brokeragePercent),
    defaultBasePercent:
      r.defaultBasePercent != null ? Number(r.defaultBasePercent) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const TransactionHandlers = {
  // GET /api/real-estate/transactions
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") ?? undefined;
      const propertyId = url.searchParams.get("propertyId") ?? undefined;
      const agentId = url.searchParams.get("agentId") ?? undefined;
      const search = url.searchParams.get("search") ?? undefined;
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      const offset = Number(url.searchParams.get("offset") ?? 0);

      const where: Prisma.TransactionWhereInput = {
        organizationId: auth.organizationId,
        ...(status ? { status: status as any } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(agentId
          ? { OR: [{ listingAgentId: agentId }, { sellingAgentId: agentId }] }
          : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: "insensitive" } },
                { property: { title: { contains: search, mode: "insensitive" } } },
                { buyer: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
          include: {
            property: { select: { id: true, title: true, code: true, city: true, primaryImageUrl: true, currency: true } },
            buyer: { select: { id: true, name: true, email: true, phone: true } },
            _count: { select: { commissionSplits: true, documents: true } },
          },
        }),
        prisma.transaction.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: items.map(serializeTransaction),
        meta: { total, limit, offset },
      });
    }, "list");
  },

  // POST /api/real-estate/transactions
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      if (!body.propertyId || !body.listingAgentId || body.salePrice == null)
        return NextResponse.json(
          { error: "propertyId, listingAgentId, salePrice are required" },
          { status: 400 },
        );

      const property = await prisma.property.findFirst({
        where: { id: body.propertyId, organizationId: auth.organizationId },
        select: { id: true, status: true, listingPrice: true, minClosingPercent: true },
      });
      if (!property)
        return NextResponse.json({ error: "Property not found" }, { status: 404 });

      // BR-12 — closing price floor.
      const sale = new Prisma.Decimal(body.salePrice);
      const list = new Prisma.Decimal(property.listingPrice);
      if (property.minClosingPercent != null) {
        const floor = list
          .times(new Prisma.Decimal(property.minClosingPercent))
          .dividedBy(100);
        if (sale.lessThan(floor))
          return NextResponse.json(
            {
              error: `Sale price ${sale.toFixed(2)} is below the configured minimum (${floor.toFixed(2)}).`,
            },
            { status: 400 },
          );
      }

      const txn = await prisma.$transaction(async (tx) => {
        const created = await tx.transaction.create({
          data: {
            organizationId: auth.organizationId,
            code: body.code || null,
            propertyId: body.propertyId,
            buyerId: body.buyerId || null,
            listingAgentId: body.listingAgentId,
            sellingAgentId: body.sellingAgentId || null,
            salePrice: sale,
            currency: body.currency || "INR",
            paymentTerms: body.paymentTerms || null,
            status: "PENDING",
            createdById: auth.id,
          },
        });
        // Move the property to UNDER_CONTRACT (FR-4.1) if it isn't already.
        if (property.status !== "UNDER_CONTRACT") {
          await tx.property.update({
            where: { id: body.propertyId },
            data: { status: "UNDER_CONTRACT" },
          });
        }
        return created;
      });

      return NextResponse.json(
        { success: true, data: serializeTransaction(txn) },
        { status: 201 },
      );
    }, "create");
  },

  // GET /api/real-estate/transactions/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const txn = await prisma.transaction.findFirst({
        where: { id, organizationId: auth.organizationId },
        include: {
          property: true,
          buyer: true,
          documents: { orderBy: { createdAt: "desc" } },
          commissionSplits: { orderBy: [{ role: "asc" }, { level: "asc" }] },
          commissionAudits: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      });
      if (!txn)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      return NextResponse.json({
        success: true,
        data: {
          ...serializeTransaction(txn),
          property: txn.property
            ? {
                ...txn.property,
                listingPrice: Number(txn.property.listingPrice),
                area: txn.property.area != null ? Number(txn.property.area) : null,
                latitude: txn.property.latitude != null ? Number(txn.property.latitude) : null,
                longitude: txn.property.longitude != null ? Number(txn.property.longitude) : null,
                commissionPercentage:
                  txn.property.commissionPercentage != null
                    ? Number(txn.property.commissionPercentage)
                    : null,
                commissionFlatFee:
                  txn.property.commissionFlatFee != null
                    ? Number(txn.property.commissionFlatFee)
                    : null,
                minClosingPercent:
                  txn.property.minClosingPercent != null
                    ? Number(txn.property.minClosingPercent)
                    : null,
              }
            : null,
          commissionSplits: txn.commissionSplits.map(serializeSplit),
        },
      });
    }, "get");
  },

  // PUT /api/real-estate/transactions/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.transaction.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      // CLOSED transactions are immutable except via /close /cancel endpoints.
      if (existing.status === "CLOSED" || existing.status === "CANCELLED")
        return NextResponse.json(
          { error: `Cannot edit a ${existing.status} transaction` },
          { status: 409 },
        );

      const body = await request.json();
      const data: Prisma.TransactionUpdateInput = {};
      if (body.code !== undefined) data.code = body.code || null;
      if (body.buyerId !== undefined) data.buyer = body.buyerId
        ? { connect: { id: body.buyerId } }
        : { disconnect: true };
      if (body.listingAgentId !== undefined) data.listingAgentId = body.listingAgentId;
      if (body.sellingAgentId !== undefined) data.sellingAgentId = body.sellingAgentId || null;
      if (body.salePrice !== undefined)
        data.salePrice = new Prisma.Decimal(body.salePrice);
      if (body.currency !== undefined) data.currency = body.currency;
      if (body.paymentTerms !== undefined) data.paymentTerms = body.paymentTerms || null;

      const updated = await prisma.transaction.update({ where: { id }, data });
      return NextResponse.json({ success: true, data: serializeTransaction(updated) });
    }, "update");
  },

  // POST /api/real-estate/transactions/[id]/close
  async close(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const txn = await prisma.transaction.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!txn)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Close does a lot inside one atomic boundary: calc splits, write
      // CommissionSplit + WalletLedger rows for every upline level, append the
      // area ledger, check + grant designation milestones, write the audit
      // row. On a 10-deep upline that's ~30 round-trips — well past Prisma's
      // 5-second default. Bump both maxWait and timeout to keep close atomic
      // without false-failing on slow Postgres.
      const result = await prisma.$transaction(
        async (tx) => closeTransaction(tx, id, auth.id),
        { maxWait: 10_000, timeout: 60_000 },
      );

      
      return NextResponse.json({
        success: true,
        data: {
          baseCommission: Number(result.baseCommission),
          ruleId: result.ruleId,
          ruleVersion: result.ruleVersion,
          splits: result.splits.map((s) => ({
            role: s.role,
            level: s.level,
            beneficiaryUserId: s.beneficiaryUserId,
            percent: Number(s.percent),
            amount: Number(s.amount),
          })),
        },
      });
    }, "close");
  },

  // POST /api/real-estate/transactions/[id]/cancel
  async cancel(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json().catch(() => ({}));
      const reason = (body.reason ?? "").trim();
      if (!reason)
        return NextResponse.json(
          { error: "Cancellation reason is required" },
          { status: 400 },
        );

      const txn = await prisma.transaction.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true, status: true },
      });
      if (!txn)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      if (txn.status === "PENDING") {
        // Pre-close cancellation — no ledger movement, just flag the row and
        // return the property to AVAILABLE.
        await prisma.$transaction(async (tx) => {
          await tx.transaction.update({
            where: { id },
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              cancellationReason: reason,
            },
          });
          const t = await tx.transaction.findUnique({
            where: { id },
            select: { propertyId: true },
          });
          if (t)
            await tx.property.update({
              where: { id: t.propertyId },
              data: { status: "AVAILABLE" },
            });
        });
        return NextResponse.json({ success: true, reversed: false });
      }

      if (txn.status !== "CLOSED")
        return NextResponse.json(
          { error: `Cannot cancel a ${txn.status} transaction` },
          { status: 409 },
        );

      await prisma.$transaction(async (tx) => {
        await reverseTransaction(tx, id, auth.id, reason);
      });

      return NextResponse.json({ success: true, reversed: true });
    }, "cancel");
  },

  // POST /api/real-estate/transactions/[id]/preview-commission
  async previewCommission(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const txn = await prisma.transaction.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!txn)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const calc = await calculateCommission(prisma, id);
      return NextResponse.json({
        success: true,
        data: {
          baseCommission: Number(calc.baseCommission),
          ruleId: calc.ruleId,
          ruleVersion: calc.ruleVersion,
          splits: calc.splits.map((s) => ({
            role: s.role,
            level: s.level,
            beneficiaryUserId: s.beneficiaryUserId,
            percent: Number(s.percent),
            amount: Number(s.amount),
          })),
        },
      });
    }, "previewCommission");
  },

  // POST /api/real-estate/transactions/[id]/documents
  async addDocument(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const txn = await prisma.transaction.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!txn)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      if (!body.url || !body.name || !body.type)
        return NextResponse.json(
          { error: "url, name, type required" },
          { status: 400 },
        );

      const doc = await prisma.transactionDocument.create({
        data: {
          transactionId: id,
          type: body.type,
          name: body.name,
          url: body.url,
          uploadedById: auth.id,
        },
      });
      return NextResponse.json({ success: true, data: doc }, { status: 201 });
    }, "addDocument");
  },

  // DELETE /api/real-estate/transactions/[id]/documents?documentId=...
  async removeDocument(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const documentId = url.searchParams.get("documentId");
      if (!documentId)
        return NextResponse.json({ error: "documentId required" }, { status: 400 });

      const doc = await prisma.transactionDocument.findFirst({
        where: {
          id: documentId,
          transaction: { id, organizationId: auth.organizationId },
        },
      });
      if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

      await prisma.transactionDocument.delete({ where: { id: documentId } });
      return NextResponse.json({ success: true });
    }, "removeDocument");
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION RULE HANDLERS
// Versioning model: editing a rule creates a new row with version+1 and
// flips the previous row inactive. We never mutate a rule in place — that
// would invalidate FR-5.11 / BR-9.
// ─────────────────────────────────────────────────────────────────────────────

export const CommissionRuleHandlers = {
  // GET /api/real-estate/commission-rules
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const includeInactive = url.searchParams.get("includeInactive") === "true";

      const rules = await prisma.commissionRule.findMany({
        where: {
          organizationId: auth.organizationId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ propertyType: "asc" }, { version: "desc" }],
      });
      return NextResponse.json({
        success: true,
        data: rules.map(serializeRule),
      });
    }, "list");
  },

  // POST /api/real-estate/commission-rules
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      if (
        !body.name ||
        body.listingAgentPercent == null ||
        body.sellingAgentPercent == null ||
        body.brokeragePercent == null
      )
        return NextResponse.json(
          {
            error:
              "name, listingAgentPercent, sellingAgentPercent, brokeragePercent are required",
          },
          { status: 400 },
        );

      const sum =
        Number(body.listingAgentPercent) +
        Number(body.sellingAgentPercent) +
        Number(body.brokeragePercent);
      if (Math.abs(sum - 100) > 0.0001)
        return NextResponse.json(
          { error: `Splits must sum to 100% (got ${sum}).` },
          { status: 400 },
        );

      const rule = await prisma.$transaction(async (tx) => {
        // Deactivate any existing active rule with the same propertyType.
        await tx.commissionRule.updateMany({
          where: {
            organizationId: auth.organizationId,
            propertyType: (body.propertyType ?? null) as any,
            isActive: true,
          },
          data: { isActive: false },
        });

        return tx.commissionRule.create({
          data: {
            organizationId: auth.organizationId,
            name: body.name,
            description: body.description || null,
            propertyType: body.propertyType ?? null,
            version: 1,
            isActive: true,
            listingAgentPercent: new Prisma.Decimal(body.listingAgentPercent),
            sellingAgentPercent: new Prisma.Decimal(body.sellingAgentPercent),
            brokeragePercent: new Prisma.Decimal(body.brokeragePercent),
            overridePercents: Array.isArray(body.overridePercents)
              ? body.overridePercents
              : [],
            useRankOverrides: !!body.useRankOverrides,
            maxOverrideDepth: body.maxOverrideDepth ?? 3,
            defaultBasePercent:
              body.defaultBasePercent != null
                ? new Prisma.Decimal(body.defaultBasePercent)
                : null,
            holdPeriodDays: body.holdPeriodDays ?? 7,
            compressionRule: body.compressionRule ?? true,
            createdById: auth.id,
          },
        });
      });

      return NextResponse.json(
        { success: true, data: serializeRule(rule) },
        { status: 201 },
      );
    }, "create");
  },

  // PUT /api/real-estate/commission-rules/[id] — creates a new version
  // (version+1) and supersedes the row at `id`. FR-5.11.
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.commissionRule.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const merged = {
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        propertyType: body.propertyType ?? existing.propertyType,
        listingAgentPercent:
          body.listingAgentPercent != null
            ? new Prisma.Decimal(body.listingAgentPercent)
            : existing.listingAgentPercent,
        sellingAgentPercent:
          body.sellingAgentPercent != null
            ? new Prisma.Decimal(body.sellingAgentPercent)
            : existing.sellingAgentPercent,
        brokeragePercent:
          body.brokeragePercent != null
            ? new Prisma.Decimal(body.brokeragePercent)
            : existing.brokeragePercent,
        overridePercents:
          body.overridePercents !== undefined
            ? body.overridePercents
            : (existing.overridePercents as any),
        useRankOverrides:
          body.useRankOverrides !== undefined
            ? !!body.useRankOverrides
            : existing.useRankOverrides,
        maxOverrideDepth: body.maxOverrideDepth ?? existing.maxOverrideDepth,
        defaultBasePercent:
          body.defaultBasePercent !== undefined
            ? body.defaultBasePercent != null
              ? new Prisma.Decimal(body.defaultBasePercent)
              : null
            : existing.defaultBasePercent,
        holdPeriodDays: body.holdPeriodDays ?? existing.holdPeriodDays,
        compressionRule:
          body.compressionRule !== undefined
            ? !!body.compressionRule
            : existing.compressionRule,
      };

      const sum =
        Number(merged.listingAgentPercent) +
        Number(merged.sellingAgentPercent) +
        Number(merged.brokeragePercent);
      if (Math.abs(sum - 100) > 0.0001)
        return NextResponse.json(
          { error: `Splits must sum to 100% (got ${sum}).` },
          { status: 400 },
        );

      const next = await prisma.$transaction(async (tx) => {
        // Deactivate the current version.
        await tx.commissionRule.update({
          where: { id: existing.id },
          data: { isActive: false },
        });

        return tx.commissionRule.create({
          data: {
            organizationId: existing.organizationId,
            name: merged.name,
            description: merged.description,
            propertyType: merged.propertyType ?? null,
            version: existing.version + 1,
            isActive: true,
            listingAgentPercent: merged.listingAgentPercent,
            sellingAgentPercent: merged.sellingAgentPercent,
            brokeragePercent: merged.brokeragePercent,
            overridePercents: merged.overridePercents,
            useRankOverrides: merged.useRankOverrides,
            maxOverrideDepth: merged.maxOverrideDepth,
            defaultBasePercent: merged.defaultBasePercent,
            holdPeriodDays: merged.holdPeriodDays,
            compressionRule: merged.compressionRule,
            createdById: auth.id,
          },
        });
      });

      return NextResponse.json({ success: true, data: serializeRule(next) });
    }, "update");
  },

  // DELETE /api/real-estate/commission-rules/[id]
  // Marks the rule inactive. We never hard-delete: closed transactions still
  // reference it via Transaction.commissionRuleId.
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const rule = await prisma.commissionRule.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!rule)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      await prisma.commissionRule.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
