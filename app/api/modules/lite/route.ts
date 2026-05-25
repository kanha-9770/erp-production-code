import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/modules/lite
 *
 * Lightweight modules feed for the sidebar's first paint. Returns a flat
 * list with just the fields the sidebar actually renders — no nested
 * children, no forms list, no per-form record counts (which would scan
 * 15 FormRecord partition tables). The sidebar reconstructs the tree
 * client-side from `parentId`.
 *
 * `hasForms` is a boolean flag the sidebar uses to decide whether
 * clicking the row should navigate to the records page (true) or just
 * toggle expansion of sub-modules (false). The full forms list itself
 * is fetched by the admin module-management UI through the existing
 * `/api/modules` route — that route stays unchanged.
 *
 * Query params:
 *   - organizationId: required, must match the caller's org
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId is required" },
        { status: 400 },
      );
    }
    if (organizationId !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const modules = await prisma.formModule.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        name: true,
        parentId: true,
        icon: true,
        color: true,
        moduleType: true,
        sortOrder: true,
        // _count gives us "has any forms" without pulling the forms list.
        _count: { select: { forms: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    const data = modules.map((m) => ({
      id: m.id,
      name: m.name,
      parentId: m.parentId,
      icon: m.icon,
      color: m.color,
      moduleType: m.moduleType ?? "standard",
      sortOrder: m.sortOrder ?? 0,
      hasForms: (m._count?.forms ?? 0) > 0,
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: { moduleCount: data.length },
    });
  } catch (error) {
    console.error("[modules/lite] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load modules" },
      { status: 500 },
    );
  }
}
