import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

/**
 * PATCH /api/modules/[moduleId]/reorder
 *
 * Body:
 *   {
 *     newParentId: string | null,        // target parent ("null" for root)
 *     orderedSiblingIds: string[]        // FULL new order of siblings under newParentId,
 *                                        // INCLUDING the moved module's id
 *   }
 *
 * Atomically:
 *  - Re-parents the moved module to `newParentId` (if changed)
 *  - Re-indexes ALL siblings under `newParentId` so their `sortOrder` matches
 *    the index in `orderedSiblingIds`
 *
 * This is the single source of truth for "drag-to-reorder" in the admin sidebar.
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const params = await props.params;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }
    if (!user.organizationId) {
      return NextResponse.json(
        { success: false, error: "User has no organization" },
        { status: 403 }
      );
    }

    const { moduleId } = params;
    if (!moduleId) {
      return NextResponse.json(
        { success: false, error: "Module ID required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { newParentId, orderedSiblingIds } = body as {
      newParentId: string | null;
      orderedSiblingIds: string[];
    };

    if (!Array.isArray(orderedSiblingIds) || orderedSiblingIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "orderedSiblingIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!orderedSiblingIds.includes(moduleId)) {
      return NextResponse.json(
        {
          success: false,
          error: "orderedSiblingIds must include the moved module id",
        },
        { status: 400 }
      );
    }

    // Verify the module exists and belongs to the user's org
    const movedModule = await prisma.formModule.findUnique({
      where: { id: moduleId },
      select: { id: true, organizationId: true, parentId: true, level: true },
    });

    if (!movedModule) {
      return NextResponse.json(
        { success: false, error: "Module not found" },
        { status: 404 }
      );
    }
    if (movedModule.organizationId !== user.organizationId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Cycle prevention: cannot drop a module into itself or any of its descendants
    if (newParentId) {
      if (newParentId === moduleId) {
        return NextResponse.json(
          { success: false, error: "Cannot move a module into itself" },
          { status: 400 }
        );
      }

      const descendants = await prisma.$queryRaw<{ id: string }[]>`
        WITH RECURSIVE descendants AS (
          SELECT id, parent_id FROM form_modules WHERE parent_id = ${moduleId}
          UNION
          SELECT fm.id, fm.parent_id
          FROM form_modules fm
          INNER JOIN descendants d ON fm.parent_id = d.id
        )
        SELECT id FROM descendants
      `;
      if (descendants.some((d) => d.id === newParentId)) {
        return NextResponse.json(
          {
            success: false,
            error: "Cannot move a module into one of its own descendants",
          },
          { status: 400 }
        );
      }
    }

    // Verify ALL siblingIds are in the same org (avoid cross-tenant manipulation)
    const siblings = await prisma.formModule.findMany({
      where: { id: { in: orderedSiblingIds } },
      select: { id: true, organizationId: true },
    });
    if (siblings.length !== orderedSiblingIds.length) {
      return NextResponse.json(
        { success: false, error: "Some sibling ids do not exist" },
        { status: 400 }
      );
    }
    if (siblings.some((s) => s.organizationId !== user.organizationId)) {
      return NextResponse.json(
        { success: false, error: "Cross-tenant reorder denied" },
        { status: 403 }
      );
    }

    // Compute new level for the moved module (parent.level + 1, or 0 if root)
    let newLevel = 0;
    if (newParentId) {
      const parent = await prisma.formModule.findUnique({
        where: { id: newParentId },
        select: { level: true },
      });
      if (!parent) {
        return NextResponse.json(
          { success: false, error: "New parent not found" },
          { status: 404 }
        );
      }
      newLevel = (parent.level ?? 0) + 1;
    }

    // Atomic update: re-parent the moved module + reindex all siblings
    await prisma.$transaction(async (tx) => {
      // Re-parent (and re-level) the moved module if its parent actually changed
      if (movedModule.parentId !== newParentId) {
        await tx.formModule.update({
          where: { id: moduleId },
          data: {
            parentId: newParentId,
            level: newLevel,
          },
        });
      }

      // Reindex every sibling so sortOrder == index in orderedSiblingIds
      await Promise.all(
        orderedSiblingIds.map((id, index) =>
          tx.formModule.update({
            where: { id },
            data: { sortOrder: index },
          })
        )
      );
    });

    return NextResponse.json({
      success: true,
      message: "Module reordered successfully",
    });
  } catch (error: any) {
    console.error("[API] Module reorder error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to reorder module",
      },
      { status: 500 }
    );
  }
}
