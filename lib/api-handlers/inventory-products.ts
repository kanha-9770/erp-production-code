/**
 * Inventory — product CRUD + page-layout persistence.
 *
 * Org-scoped. Slug is unique within an organization. The `pageLayout` field
 * is opaque JSON — the builder UI defines the schema, the storefront route
 * reads it. We don't validate block contents here; the renderer is the
 * authority on which block types it knows how to draw.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";
import { moveToTrash } from "@/lib/trash";

async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json({ error: "User is not associated with any organization" }, { status: 403 });
  return user as { id: string; email: string; organizationId: string };
}

async function handle(fn: () => Promise<NextResponse>, label: string): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[InventoryHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json({ error: "A product with this slug or SKU already exists" }, { status: 409 });
    if (e?.code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

function serialize<T extends Record<string, any>>(p: T): any {
  if (!p) return p;
  return {
    ...p,
    price: p.price != null ? Number(p.price) : 0,
    compareAtPrice: p.compareAtPrice != null ? Number(p.compareAtPrice) : null,
    taxRate: p.taxRate != null ? Number(p.taxRate) : null,
    weight: p.weight != null ? Number(p.weight) : null,
  };
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}

const STATUSES = new Set(["DRAFT", "ACTIVE", "ARCHIVED"]);

export const InventoryHandlers = {
  // GET /api/inventory/products
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const url = new URL(request.url);

      const status = url.searchParams.get("status") ?? undefined;
      const category = url.searchParams.get("category") ?? undefined;
      const brand = url.searchParams.get("brand") ?? undefined;
      const search = url.searchParams.get("search") ?? undefined;
      const minPrice = url.searchParams.get("minPrice");
      const maxPrice = url.searchParams.get("maxPrice");
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
      const offset = Number(url.searchParams.get("offset") ?? 0);

      const where: any = {
        organizationId: auth.organizationId,
        ...(status && STATUSES.has(status) ? { status } : {}),
        ...(category ? { category } : {}),
        ...(brand ? { brand } : {}),
        ...(minPrice || maxPrice
          ? {
              price: {
                ...(minPrice ? { gte: new Prisma.Decimal(minPrice) } : {}),
                ...(maxPrice ? { lte: new Prisma.Decimal(maxPrice) } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
                { brand: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        (prisma as any).inventoryProduct.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: limit,
          skip: offset,
        }),
        (prisma as any).inventoryProduct.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        data: items.map(serialize),
        meta: { total, limit, offset },
      });
    }, "list");
  },

  // POST /api/inventory/products
  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
      if (body.price == null || Number(body.price) < 0)
        return NextResponse.json({ error: "price must be >= 0" }, { status: 400 });

      // Generate a unique slug within the org if not provided.
      let slug = body.slug ? slugify(body.slug) : slugify(body.name);
      const exists = await (prisma as any).inventoryProduct.findFirst({
        where: { organizationId: auth.organizationId, slug },
        select: { id: true },
      });
      if (exists) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

      const product = await (prisma as any).inventoryProduct.create({
        data: {
          organizationId: auth.organizationId,
          name: body.name,
          slug,
          sku: body.sku || null,
          shortDescription: body.shortDescription || null,
          description: body.description || null,
          status: body.status && STATUSES.has(body.status) ? body.status : "DRAFT",
          price: new Prisma.Decimal(body.price),
          compareAtPrice: body.compareAtPrice != null ? new Prisma.Decimal(body.compareAtPrice) : null,
          currency: body.currency || "INR",
          taxRate: body.taxRate != null ? new Prisma.Decimal(body.taxRate) : null,
          stockQty: Number.isFinite(body.stockQty) ? body.stockQty : 0,
          trackStock: body.trackStock ?? true,
          lowStockThreshold: body.lowStockThreshold ?? null,
          brand: body.brand || null,
          category: body.category || null,
          tags: Array.isArray(body.tags) ? body.tags : [],
          primaryImageUrl: body.primaryImageUrl || null,
          images: Array.isArray(body.images) ? body.images : [],
          variants: Array.isArray(body.variants) ? body.variants : [],
          specs: Array.isArray(body.specs) ? body.specs : [],
          metaTitle: body.metaTitle || null,
          metaDescription: body.metaDescription || null,
          metaKeywords: body.metaKeywords || null,
          weight: body.weight != null ? new Prisma.Decimal(body.weight) : null,
          weightUnit: body.weightUnit || null,
          dimensions: body.dimensions ?? null,
          pageLayout: body.pageLayout ?? null,
          createdById: auth.id,
        },
      });

      return NextResponse.json({ success: true, data: serialize(product) }, { status: 201 });
    }, "create");
  },

  // GET /api/inventory/products/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const product = await (prisma as any).inventoryProduct.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: serialize(product) });
    }, "get");
  },

  // GET /api/inventory/products/by-slug/[slug] — used by the public storefront route
  async getBySlug(request: NextRequest, slug: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const product = await (prisma as any).inventoryProduct.findFirst({
        where: { slug, organizationId: auth.organizationId },
      });
      if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: serialize(product) });
    }, "getBySlug");
  },

  // PUT /api/inventory/products/[id]
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();

      const existing = await (prisma as any).inventoryProduct.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true, slug: true },
      });
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Slug change: re-validate uniqueness within org.
      let nextSlug = existing.slug;
      if (body.slug && slugify(body.slug) !== existing.slug) {
        nextSlug = slugify(body.slug);
        const conflict = await (prisma as any).inventoryProduct.findFirst({
          where: { organizationId: auth.organizationId, slug: nextSlug, NOT: { id } },
          select: { id: true },
        });
        if (conflict)
          return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
      }

      const data: any = {};
      const set = (k: string, v: any) => {
        if (v !== undefined) data[k] = v;
      };
      set("name", body.name);
      set("slug", nextSlug);
      set("sku", body.sku ?? null);
      set("shortDescription", body.shortDescription ?? null);
      set("description", body.description ?? null);
      if (body.status && STATUSES.has(body.status)) data.status = body.status;
      if (body.price != null) data.price = new Prisma.Decimal(body.price);
      if (body.compareAtPrice !== undefined)
        data.compareAtPrice = body.compareAtPrice != null ? new Prisma.Decimal(body.compareAtPrice) : null;
      if (body.currency) data.currency = body.currency;
      if (body.taxRate !== undefined)
        data.taxRate = body.taxRate != null ? new Prisma.Decimal(body.taxRate) : null;
      if (body.stockQty !== undefined) data.stockQty = Number(body.stockQty) || 0;
      if (body.trackStock !== undefined) data.trackStock = !!body.trackStock;
      if (body.lowStockThreshold !== undefined) data.lowStockThreshold = body.lowStockThreshold ?? null;
      set("brand", body.brand ?? null);
      set("category", body.category ?? null);
      if (body.tags !== undefined) data.tags = Array.isArray(body.tags) ? body.tags : [];
      set("primaryImageUrl", body.primaryImageUrl ?? null);
      if (body.images !== undefined) data.images = Array.isArray(body.images) ? body.images : [];
      if (body.variants !== undefined) data.variants = Array.isArray(body.variants) ? body.variants : [];
      if (body.specs !== undefined) data.specs = Array.isArray(body.specs) ? body.specs : [];
      set("metaTitle", body.metaTitle ?? null);
      set("metaDescription", body.metaDescription ?? null);
      set("metaKeywords", body.metaKeywords ?? null);
      if (body.weight !== undefined)
        data.weight = body.weight != null ? new Prisma.Decimal(body.weight) : null;
      set("weightUnit", body.weightUnit ?? null);
      if (body.dimensions !== undefined) data.dimensions = body.dimensions ?? null;
      if (body.pageLayout !== undefined) data.pageLayout = body.pageLayout ?? null;

      const product = await (prisma as any).inventoryProduct.update({ where: { id }, data });
      return NextResponse.json({ success: true, data: serialize(product) });
    }, "update");
  },

  // PATCH /api/inventory/products/[id]/layout — fast path for builder autosave.
  async saveLayout(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const body = await request.json();
      const existing = await (prisma as any).inventoryProduct.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const product = await (prisma as any).inventoryProduct.update({
        where: { id },
        data: { pageLayout: body.pageLayout ?? null },
      });
      return NextResponse.json({ success: true, data: serialize(product) });
    }, "saveLayout");
  },

  // DELETE /api/inventory/products/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const auth = await requireAuth(request);
      const existing = await (prisma as any).inventoryProduct.findFirst({
        where: { id, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await moveToTrash("InventoryProduct", id, {
        userId: auth.id,
        userName: auth.email,
        organizationId: auth.organizationId,
      });
      return NextResponse.json({ success: true, deleted: true });
    }, "remove");
  },
};
