export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/forms
 * Fetches forms accessible to the authenticated user, based on module and direct form permissions
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const userId = authUser.id;
    const organizationId = authUser.organizationId;
    if (!organizationId) {
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 }
      );
    }
    // 🔹 Fetch roles
    const roles = await prisma.$queryRaw<{ role_name: string }[]>`
      SELECT r.name AS role_name
      FROM user_unit_assignments uua
      JOIN roles r ON r.id = uua.role_id
      WHERE uua.user_id = ${userId}
    `;
    const isAdmin = roles.some((r) => r.role_name === "ADMIN");
    let finalForms: any[] = [];
    if (isAdmin) {
      // 🔹 ADMIN gets all published forms for active modules in their organization
      finalForms = await prisma.$queryRaw`
        SELECT
          f.id AS form_id,
          f.name AS form_name,
          f.description,
          f.module_id,
          f.is_published,
          fm.level AS module_level,
          fm.sort_order AS module_sort_order
        FROM forms f
        JOIN form_modules fm ON fm.id = f.module_id
        WHERE f.is_published = TRUE
        AND fm.is_active = TRUE
        AND fm.organization_id = ${organizationId}
        ORDER BY fm.level ASC, fm.sort_order ASC, f.name ASC
      `;
    } else {
      // 🔹 Execute role-based and user-based queries in parallel, split by module/direct perms
      const [
        roleModuleBasedForms,
        roleFormBasedForms,
        userModuleBasedForms,
        userFormBasedForms
      ] = await Promise.all([
        // 🔹 Role perms on modules → forms in those modules
        prisma.$queryRaw`
          SELECT DISTINCT
            f.id AS form_id,
            f.name AS form_name,
            f.description,
            f.module_id,
            f.is_published,
            fm.level AS module_level,
            fm.sort_order AS module_sort_order
          FROM forms f
          JOIN form_modules fm ON fm.id = f.module_id AND fm.is_active = TRUE
          JOIN role_permissions rp ON rp.module_id = fm.id AND rp.granted = TRUE
          JOIN roles r ON r.id = rp.role_id
          JOIN user_unit_assignments uua ON uua.role_id = r.id
          WHERE uua.user_id = ${userId}
          AND fm.organization_id = ${organizationId}
          AND f.is_published = TRUE
        `,
        // 🔹 Role perms direct on forms
        prisma.$queryRaw`
          SELECT DISTINCT
            f.id AS form_id,
            f.name AS form_name,
            f.description,
            f.module_id,
            f.is_published,
            fm.level AS module_level,
            fm.sort_order AS module_sort_order
          FROM forms f
          JOIN form_modules fm ON fm.id = f.module_id AND fm.is_active = TRUE
          JOIN role_permissions rp ON rp.form_id = f.id AND rp.granted = TRUE
          JOIN roles r ON r.id = rp.role_id
          JOIN user_unit_assignments uua ON uua.role_id = r.id
          WHERE uua.user_id = ${userId}
          AND fm.organization_id = ${organizationId}
          AND f.is_published = TRUE
        `,
        // 🔹 User perms on modules → forms in those modules
        prisma.$queryRaw`
          SELECT DISTINCT
            f.id AS form_id,
            f.name AS form_name,
            f.description,
            f.module_id,
            f.is_published,
            fm.level AS module_level,
            fm.sort_order AS module_sort_order
          FROM forms f
          JOIN form_modules fm ON fm.id = f.module_id AND fm.is_active = TRUE
          JOIN user_permissions up ON up.module_id = fm.id AND up.granted = TRUE
          JOIN users u ON u.id = up.user_id
          WHERE u.id = ${userId}
          AND fm.organization_id = ${organizationId}
          AND f.is_published = TRUE
        `,
        // 🔹 User perms direct on forms
        prisma.$queryRaw`
          SELECT DISTINCT
            f.id AS form_id,
            f.name AS form_name,
            f.description,
            f.module_id,
            f.is_published,
            fm.level AS module_level,
            fm.sort_order AS module_sort_order
          FROM forms f
          JOIN form_modules fm ON fm.id = f.module_id AND fm.is_active = TRUE
          JOIN user_permissions up ON up.form_id = f.id AND up.granted = TRUE
          JOIN users u ON u.id = up.user_id
          WHERE u.id = ${userId}
          AND fm.organization_id = ${organizationId}
          AND f.is_published = TRUE
        `,
      ]);
      // 🔹 Deduplicate forms (faster using Map)
      const allForms = [
        ...(roleModuleBasedForms as any[]),
        ...(roleFormBasedForms as any[]),
        ...(userModuleBasedForms as any[]),
        ...(userFormBasedForms as any[]),
      ];
      const uniqueFormsMap = new Map(allForms.map((f) => [f.form_id, f]));
      finalForms = Array.from(uniqueFormsMap.values());
      // 🔹 Sort forms by module hierarchy then name
      finalForms.sort(
        (a: any, b: any) =>
          a.module_level - b.module_level ||
          a.module_sort_order - b.module_sort_order ||
          a.form_name.localeCompare(b.form_name)
      );
    }
    return NextResponse.json({ success: true, forms: finalForms });
  } catch (error) {
    console.error("❌ Get permitted forms error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}