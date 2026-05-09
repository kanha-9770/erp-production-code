/**
 * Real Estate Brokerage — Property handlers (Phase 1).
 * Property + image + document + price-history CRUD.
 *
 * Usage:
 *   import { PropertyHandlers as H } from "@/lib/api-handlers/real-estate-properties"
 *   export const GET = (req) => H.list(req)
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

async function handle(
  fn: () => Promise<NextResponse>,
  label: string,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[PropertyHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json(
        { error: "A property with this code already exists" },
        { status: 409 },
      );
    if (e?.code === "P2025")
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// Convert Decimal columns to plain numbers so the JSON wire format stays
// predictable for the React layer.
function serializeProperty<T extends Record<string, any>>(p: T): any {
  if (!p) return p;
  return {
    ...p,
    listingPrice: p.listingPrice != null ? Number(p.listingPrice) : null,
    area: p.area != null ? Number(p.area) : null,
    latitude: p.latitude != null ? Number(p.latitude) : null,
    longitude: p.longitude != null ? Number(p.longitude) : null,
    commissionPercentage:
      p.commissionPercentage != null ? Number(p.commissionPercentage) : null,
    commissionFlatFee:
      p.commissionFlatFee != null ? Number(p.commissionFlatFee) : null,
    minClosingPercent:
      p.minClosingPercent != null ? Number(p.minClosingPercent) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

export const PropertyHandlers = {
  // GET /api/real-estate/properties
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);

      const status = url.searchParams.get("status") ?? undefined;
      const type = url.searchParams.get("type") ?? undefined;
      const subType = url.searchParams.get("subType") ?? undefined;
      const city = url.searchParams.get("city") ?? undefined;
      const search = url.searchParams.get("search") ?? undefined;
      const minPrice = url.searchParams.get("minPrice");
      const maxPrice = url.searchParams.get("maxPrice");
      const listingAgentId = url.searchParams.get("listingAgentId") ?? undefined;
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      const offset = Number(url.searchParams.get("offset") ?? 0);

      const where: Prisma.PropertyWhereInput = {
        organizationId: auth.organizationId,
        ...(status ? { status: status as any } : {}),
        ...(type ? { type: type as any } : {}),
        ...(subType ? { subType: subType as any } : {}),
        ...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
        ...(listingAgentId ? { listingAgentId } : {}),
        ...(minPrice || maxPrice
          ? {
              listingPrice: {
                ...(minPrice ? { gte: new Prisma.Decimal(minPrice) } : {}),
                ...(maxPrice ? { lte: new Prisma.Decimal(maxPrice) } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
                { addressLine1: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.property.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
          include: {
            _count: { select: { images: true, documents: true, viewings: true } },
          },
        }),
        prisma.property.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: items.map(serializeProperty),
        meta: { total, limit, offset },
      });
    }, "list");
  },

  // POST /api/real-estate/properties
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();

      if (!body.title || !body.type || !body.addressLine1 || !body.city || !body.country)
        return NextResponse.json(
          { error: "title, type, addressLine1, city, country are required" },
          { status: 400 },
        );
      if (body.listingPrice == null || Number(body.listingPrice) < 0)
        return NextResponse.json(
          { error: "listingPrice must be >= 0" },
          { status: 400 },
        );

      const property = await prisma.property.create({
        data: {
          organizationId: auth.organizationId,
          title: body.title,
          code: body.code || null,
          description: body.description || null,
          type: body.type,
          subType: body.subType || null,
          status: body.status || "DRAFT",
          addressLine1: body.addressLine1,
          addressLine2: body.addressLine2 || null,
          city: body.city,
          state: body.state || null,
          country: body.country,
          postalCode: body.postalCode || null,
          latitude: body.latitude != null ? new Prisma.Decimal(body.latitude) : null,
          longitude: body.longitude != null ? new Prisma.Decimal(body.longitude) : null,
          listingPrice: new Prisma.Decimal(body.listingPrice),
          currency: body.currency || "INR",
          area: body.area != null ? new Prisma.Decimal(body.area) : null,
          areaUnit: body.areaUnit || null,
          bedrooms: body.bedrooms ?? null,
          bathrooms: body.bathrooms ?? null,
          parkingSpots: body.parkingSpots ?? null,
          yearBuilt: body.yearBuilt ?? null,
          features: Array.isArray(body.features) ? body.features : [],
          commissionTermType: body.commissionTermType || "PERCENTAGE",
          commissionPercentage:
            body.commissionPercentage != null
              ? new Prisma.Decimal(body.commissionPercentage)
              : null,
          commissionFlatFee:
            body.commissionFlatFee != null
              ? new Prisma.Decimal(body.commissionFlatFee)
              : null,
          expectedClosingAt: body.expectedClosingAt
            ? new Date(body.expectedClosingAt)
            : null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          listingAgentId: body.listingAgentId || auth.id,
          minClosingPercent:
            body.minClosingPercent != null
              ? new Prisma.Decimal(body.minClosingPercent)
              : null,
          createdById: auth.id,
        },
      });

      return NextResponse.json(
        { success: true, data: serializeProperty(property) },
        { status: 201 },
      );
    }, "create");
  },

  // GET /api/real-estate/properties/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const property = await prisma.property.findFirst({
        where: { id, organizationId: auth.organizationId },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          documents: { orderBy: { createdAt: "desc" } },
          priceHistory: { orderBy: { changedAt: "desc" }, take: 20 },
          viewings: {
            orderBy: { scheduledAt: "desc" },
            take: 10,
            include: { lead: { select: { id: true, name: true, phone: true } } },
          },
        },
      });
      if (!property)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      return NextResponse.json({
        success: true,
        data: {
          ...serializeProperty(property),
          priceHistory: property.priceHistory.map((h) => ({
            ...h,
            oldPrice: Number(h.oldPrice),
            newPrice: Number(h.newPrice),
          })),
        },
      });
    }, "get");
  },

  // PUT /api/real-estate/properties/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.property.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const data: Prisma.PropertyUpdateInput = {};

      const setIfPresent = <K extends keyof Prisma.PropertyUpdateInput>(
        key: K,
        value: any,
      ) => {
        if (value !== undefined) (data as any)[key] = value;
      };

      setIfPresent("title", body.title);
      setIfPresent("code", body.code);
      setIfPresent("description", body.description);
      setIfPresent("type", body.type);
      setIfPresent("subType", body.subType);
      setIfPresent("status", body.status);
      setIfPresent("addressLine1", body.addressLine1);
      setIfPresent("addressLine2", body.addressLine2);
      setIfPresent("city", body.city);
      setIfPresent("state", body.state);
      setIfPresent("country", body.country);
      setIfPresent("postalCode", body.postalCode);
      setIfPresent("currency", body.currency);
      setIfPresent("areaUnit", body.areaUnit);
      setIfPresent("bedrooms", body.bedrooms);
      setIfPresent("bathrooms", body.bathrooms);
      setIfPresent("parkingSpots", body.parkingSpots);
      setIfPresent("yearBuilt", body.yearBuilt);
      setIfPresent("features", body.features);
      setIfPresent("commissionTermType", body.commissionTermType);
      setIfPresent("listingAgentId", body.listingAgentId);

      if (body.latitude !== undefined)
        data.latitude = body.latitude == null ? null : new Prisma.Decimal(body.latitude);
      if (body.longitude !== undefined)
        data.longitude = body.longitude == null ? null : new Prisma.Decimal(body.longitude);
      if (body.area !== undefined)
        data.area = body.area == null ? null : new Prisma.Decimal(body.area);
      if (body.commissionPercentage !== undefined)
        data.commissionPercentage =
          body.commissionPercentage == null
            ? null
            : new Prisma.Decimal(body.commissionPercentage);
      if (body.commissionFlatFee !== undefined)
        data.commissionFlatFee =
          body.commissionFlatFee == null
            ? null
            : new Prisma.Decimal(body.commissionFlatFee);
      if (body.minClosingPercent !== undefined)
        data.minClosingPercent =
          body.minClosingPercent == null
            ? null
            : new Prisma.Decimal(body.minClosingPercent);
      if (body.expectedClosingAt !== undefined)
        data.expectedClosingAt = body.expectedClosingAt
          ? new Date(body.expectedClosingAt)
          : null;
      if (body.expiresAt !== undefined)
        data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

      // Track price changes per FR-1.8
      const priceChanged =
        body.listingPrice !== undefined &&
        Number(body.listingPrice) !== Number(existing.listingPrice);
      if (priceChanged) data.listingPrice = new Prisma.Decimal(body.listingPrice);

      const property = await prisma.$transaction(async (tx) => {
        const updated = await tx.property.update({ where: { id }, data });
        if (priceChanged) {
          await tx.propertyPriceHistory.create({
            data: {
              propertyId: id,
              oldPrice: existing.listingPrice,
              newPrice: new Prisma.Decimal(body.listingPrice),
              changedById: auth.id,
              reason: body.priceChangeReason || null,
            },
          });
        }
        return updated;
      });

      return NextResponse.json({ success: true, data: serializeProperty(property) });
    }, "update");
  },

  // DELETE /api/real-estate/properties/[id] — withdraws (per FR-1.11) instead
  // of hard-deleting. A property with viewings or transactions can never be
  // truly removed; we flip status to WITHDRAWN.
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await prisma.property.findFirst({
        where: { id, organizationId: auth.organizationId },
        include: { _count: { select: { viewings: true } } },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Pure draft with no activity → safe to delete outright.
      if (existing.status === "DRAFT" && existing._count.viewings === 0) {
        await prisma.property.delete({ where: { id } });
        return NextResponse.json({ success: true, deleted: true });
      }

      const property = await prisma.property.update({
        where: { id },
        data: { status: "WITHDRAWN" },
      });
      return NextResponse.json({ success: true, data: serializeProperty(property) });
    }, "remove");
  },

  // POST /api/real-estate/properties/[id]/images
  async addImage(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const property = await prisma.property.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true, primaryImageUrl: true },
      });
      if (!property)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      if (!body.url)
        return NextResponse.json({ error: "url required" }, { status: 400 });

      const isPrimary = !!body.isPrimary || !property.primaryImageUrl;

      const image = await prisma.$transaction(async (tx) => {
        if (isPrimary) {
          await tx.propertyImage.updateMany({
            where: { propertyId: id, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        const created = await tx.propertyImage.create({
          data: {
            propertyId: id,
            url: body.url,
            caption: body.caption || null,
            isPrimary,
            sortOrder: body.sortOrder ?? 0,
          },
        });
        if (isPrimary) {
          await tx.property.update({
            where: { id },
            data: { primaryImageUrl: body.url },
          });
        }
        return created;
      });

      return NextResponse.json({ success: true, data: image }, { status: 201 });
    }, "addImage");
  },

  // DELETE /api/real-estate/properties/[id]/images?imageId=...
  async removeImage(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const imageId = url.searchParams.get("imageId");
      if (!imageId)
        return NextResponse.json({ error: "imageId required" }, { status: 400 });

      const image = await prisma.propertyImage.findFirst({
        where: { id: imageId, property: { id, organizationId: auth.organizationId } },
      });
      if (!image)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      await prisma.$transaction(async (tx) => {
        await tx.propertyImage.delete({ where: { id: imageId } });
        if (image.isPrimary) {
          // Promote the next-most-recent image to primary, if any.
          const next = await tx.propertyImage.findFirst({
            where: { propertyId: id },
            orderBy: { sortOrder: "asc" },
          });
          await tx.property.update({
            where: { id },
            data: { primaryImageUrl: next?.url ?? null },
          });
          if (next) {
            await tx.propertyImage.update({
              where: { id: next.id },
              data: { isPrimary: true },
            });
          }
        }
      });

      return NextResponse.json({ success: true });
    }, "removeImage");
  },

  // POST /api/real-estate/properties/[id]/documents
  async addDocument(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const property = await prisma.property.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!property)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      if (!body.url || !body.name || !body.type)
        return NextResponse.json(
          { error: "url, name, type required" },
          { status: 400 },
        );

      const doc = await prisma.propertyDocument.create({
        data: {
          propertyId: id,
          type: body.type,
          name: body.name,
          url: body.url,
          uploadedById: auth.id,
        },
      });
      return NextResponse.json({ success: true, data: doc }, { status: 201 });
    }, "addDocument");
  },

  // DELETE /api/real-estate/properties/[id]/documents?documentId=...
  async removeDocument(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);
      const documentId = url.searchParams.get("documentId");
      if (!documentId)
        return NextResponse.json({ error: "documentId required" }, { status: 400 });

      const doc = await prisma.propertyDocument.findFirst({
        where: {
          id: documentId,
          property: { id, organizationId: auth.organizationId },
        },
      });
      if (!doc)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      await prisma.propertyDocument.delete({ where: { id: documentId } });
      return NextResponse.json({ success: true });
    }, "removeDocument");
  },
};
