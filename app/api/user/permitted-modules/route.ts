export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma"; // ✅ using global instance (no new PrismaClient per request)

/**
 * GET /api/modules
 * Fetches modules accessible to the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!authUser.organizationId) return NextResponse.json({ error: "User is not associated with any organization" }, { status: 403 });

    const userId = authUser.id;
    const organizationId = authUser.organizationId;

    const isAdmin = await isUserAdmin(userId, organizationId);

    let finalModules: any[] = [];

    if (isAdmin) {
      // 🔹 ADMIN gets all active modules for their organization
      finalModules = await prisma.$queryRaw`
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
    } else {
      // 🔹 Execute both role-based and user-based queries in parallel
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

      // 🔹 Deduplicate modules (faster using Map)
      const allModules = [...(roleBasedModules as any[]), ...(userBasedModules as any[])];
      const uniqueModulesMap = new Map(allModules.map((m) => [m.module_id, m]));
      const uniqueModules = Array.from(uniqueModulesMap.values());

      // 🔹 Get child IDs
      const childModuleIds = uniqueModules.map((m) => m.module_id);

      if (childModuleIds.length > 0) {
        // 🔹 Fetch parent hierarchy
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
              WHERE id = ANY(${childModuleIds}::text[]) 
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

        // 🔹 Merge + deduplicate again
        const mergedModules = [...uniqueModules, ...(parentModules as any[])];
        const finalModulesMap = new Map(mergedModules.map((m) => [m.module_id, m]));
        finalModules = Array.from(finalModulesMap.values());
      } else {
        finalModules = uniqueModules;
      }

      // 🔹 Sort modules by hierarchy
      finalModules.sort(
        (a: any, b: any) => a.level - b.level || a.sort_order - b.sort_order
      );
    }

    // 🔹 Fetch published forms for all modules and attach them
    const moduleIds = finalModules.map((m: any) => m.module_id);
    if (moduleIds.length > 0) {
      const forms = await prisma.form.findMany({
        where: {
          moduleId: { in: moduleIds },
          isPublished: true,
        },
        select: {
          id: true,
          name: true,
          moduleId: true,
          isPublished: true,
          description: true,
        },
        orderBy: { name: "asc" },
      });

      // Group forms by moduleId
      const formsByModule = new Map<string, any[]>();
      for (const form of forms) {
        const list = formsByModule.get(form.moduleId) || [];
        list.push(form);
        formsByModule.set(form.moduleId, list);
      }

      // Attach forms to each module
      for (const mod of finalModules) {
        mod.forms = formsByModule.get(mod.module_id) || [];
      }
    }

    return NextResponse.json({ success: true, modules: finalModules });
  } catch (error) {
    console.error("❌ Get permitted modules error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
