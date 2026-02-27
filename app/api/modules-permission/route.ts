import { getModulesWithForms } from "@/lib/database";
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await validateSession(token);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch organizationId and roles in parallel
    const [user, roles] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      }),
      prisma.$queryRaw<{ role_name: string }[]>`
        SELECT r.name AS role_name
        FROM user_unit_assignments uua
        JOIN roles r ON r.id = uua.role_id
        WHERE uua.user_id = ${userId}
      `,
    ]);

    if (!user?.organizationId) {
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 }
      );
    }

    const organizationId = user.organizationId;
    const isAdmin = roles.some((r) => r.role_name === "ADMIN");

    let permittedModuleIds: number[] | undefined;
    let directlyPermittedModuleIds: Set<number> | undefined;

    if (isAdmin) {
      // ADMIN gets all active modules (no filtering needed beyond org)
      permittedModuleIds = undefined;
      directlyPermittedModuleIds = undefined;
    } else {
      // Execute both role-based and user-based queries in parallel
      const [roleBasedModules, userBasedModules] = await Promise.all([
        prisma.$queryRaw`
          SELECT DISTINCT 
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
          FROM users u
          JOIN user_unit_assignments uua ON uua.user_id = u.id
          JOIN roles r ON r.id = uua.role_id
          JOIN role_permissions rp ON rp.role_id = r.id AND rp.granted = TRUE
          JOIN form_modules fm ON fm.id = rp.module_id AND fm.is_active = TRUE
          WHERE u.id = ${userId}
          AND fm.organization_id = ${organizationId}
        `,
        prisma.$queryRaw`
          SELECT DISTINCT 
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
          FROM users u
          JOIN user_permissions up ON up.user_id = u.id AND up.granted = TRUE
          JOIN form_modules fm ON fm.id = up.module_id AND fm.is_active = TRUE
          WHERE u.id = ${userId}
          AND fm.organization_id = ${organizationId}
        `,
      ]);

      // Collect directly permitted module IDs
      const allDirectModules = [...(roleBasedModules as any[]), ...(userBasedModules as any[])];
      directlyPermittedModuleIds = new Set(allDirectModules.map((m: any) => m.module_id));

      // Get direct IDs for parent fetching
      const directModuleIds = allDirectModules.map((m: any) => m.module_id);

      let allPermittedModules: any[] = allDirectModules;

      if (directModuleIds.length > 0) {
        // Fetch parent hierarchy
        const parentModules = await prisma.$queryRaw`
          WITH RECURSIVE parent_hierarchy AS (
            SELECT DISTINCT 
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
            WHERE fm.id IN (
              SELECT DISTINCT parent_id 
              FROM form_modules 
              WHERE id = ANY(${directModuleIds.map(id => id.toString())}::text[]) 
              AND parent_id IS NOT NULL
              AND organization_id = ${organizationId}
            )
            AND fm.is_active = TRUE
            AND fm.organization_id = ${organizationId}
            
            UNION
            
            SELECT DISTINCT
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
            INNER JOIN parent_hierarchy ph ON fm.id = ph.parent_id
            WHERE fm.is_active = TRUE
            AND fm.organization_id = ${organizationId}
          )
          SELECT * FROM parent_hierarchy
        `;

        // Merge + deduplicate
        const mergedWithParents = [...allDirectModules, ...(parentModules as any[])];
        const mergedMap = new Map(mergedWithParents.map((m: any) => [m.module_id, m]));
        allPermittedModules = Array.from(mergedMap.values());

        // Sort by hierarchy
        allPermittedModules.sort(
          (a: any, b: any) => a.level - b.level || a.sort_order - b.sort_order
        );
      }

      // Now fetch descendants of the permitted modules (direct + ancestors)
      const startingIds = allPermittedModules.map((m: any) => m.module_id);
      let descendantIds: number[] = [];

      if (startingIds.length > 0) {
        const descendantsResult = await prisma.$queryRaw<{ id: number }[]>`
          WITH RECURSIVE descendants AS (
            -- Direct children of starting modules
            SELECT fm.id
            FROM form_modules fm
            WHERE fm.parent_id = ANY(${startingIds.map(id => id.toString())}::text[])
            AND fm.is_active = TRUE
            AND fm.organization_id = ${organizationId}
            
            UNION
            
            -- Recursive children
            SELECT fm.id
            FROM form_modules fm
            INNER JOIN descendants d ON fm.parent_id = d.id
            WHERE fm.is_active = TRUE
            AND fm.organization_id = ${organizationId}
          )
          SELECT id FROM descendants
        `;

        descendantIds = descendantsResult.map((d: any) => d.id);
      }

      // Combine all: direct + ancestors + descendants
      const allAccessibleIds = new Set([
        ...allPermittedModules.map((m: any) => m.module_id),
        ...descendantIds
      ]);
      permittedModuleIds = Array.from(allAccessibleIds);
    }

    console.log(
      "[v0] GET /api/modules-permission - Starting request for permitted modules with forms"
    );

    const modules = await getModulesWithForms(organizationId, permittedModuleIds, directlyPermittedModuleIds);
    console.log(
      `[v0] Retrieved permitted modules with forms from database: ${modules.length}`
    );

    // Log form counts for debugging
    const totalForms = modules.reduce((total, module) => {
      const moduleForms = module.forms?.length || 0;
      const submoduleForms =
        module.children?.reduce((subTotal: number, child: any) => {
          return subTotal + (child.forms?.length || 0);
        }, 0) || 0;
      console.log(
        `[v0] Module ${module.name}: ${moduleForms} forms, ${submoduleForms} submodule forms`
      );
      return total + moduleForms + submoduleForms;
    }, 0);

    console.log(`[v0] Total forms across all permitted modules: ${totalForms}`);
    console.log(
      "[v0] Successfully retrieved",
      modules.length,
      "permitted modules with forms"
    );

    return NextResponse.json({
      success: true,
      data: modules,
      meta: {
        totalModules: modules.length,
        totalSubmodules: modules.reduce(
          (total, m) => total + (m.children?.length || 0),
          0
        ),
        totalForms: totalForms,
      },
    });
  } catch (error) {
    console.error("[v0] Failed to fetch permitted modules with forms:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch permitted modules with forms",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}