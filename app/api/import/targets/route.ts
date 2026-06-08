export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/import/targets
 *
 * Returns the COMPLETE active module tree for the user's organization (flat
 * list carrying parent_id / level / sort_order so the client rebuilds the
 * hierarchy), with ALL forms per module attached — published and draft.
 *
 * Why the full org tree (not a permission-filtered subset):
 *   - This is an admin-facing data-migration tool, and the actual write is
 *     permission-gated per form at /api/import/stage|start|process
 *     (hasFormPermission … "IMPORT"). The picker only needs to *show* the
 *     catalogue.
 *   - The previous permission-walk returned a module's ancestors but not its
 *     descendants, so deeply nested children (e.g. Inventory & Storefront →
 *     Machine Inventory) silently disappeared even though the sidebar showed
 *     them. Returning the whole tree keeps the picker in lockstep with the
 *     sidebar.
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!authUser.organizationId)
      return NextResponse.json({ error: "User is not associated with any organization" }, { status: 403 });

    const organizationId = authUser.organizationId;

    const finalModules = await prisma.$queryRaw<any[]>`
      SELECT
        fm.id AS module_id,
        fm.name AS module_name,
        fm.description,
        fm.icon,
        fm.color,
        fm.path,
        fm.parent_id,
        fm.level,
        fm.sort_order,
        fm.module_type
      FROM form_modules fm
      WHERE fm.is_active = TRUE
      AND fm.organization_id = ${organizationId}
      ORDER BY fm.level ASC, fm.sort_order ASC
    `;

    // Attach ALL forms (published + draft) for every module.
    const moduleIds = finalModules.map((m: any) => m.module_id);
    if (moduleIds.length > 0) {
      const forms = await prisma.form.findMany({
        where: { moduleId: { in: moduleIds } },
        select: { id: true, name: true, moduleId: true, isPublished: true, description: true },
        orderBy: { name: "asc" },
      });

      const formsByModule = new Map<string, any[]>();
      for (const form of forms) {
        const list = formsByModule.get(form.moduleId) || [];
        list.push(form);
        formsByModule.set(form.moduleId, list);
      }
      for (const mod of finalModules) {
        mod.forms = formsByModule.get(mod.module_id) || [];
      }
    }

    return NextResponse.json({ success: true, modules: finalModules });
  } catch (error) {
    console.error("❌ Get import targets error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
