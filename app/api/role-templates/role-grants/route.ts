/**
 * GET /api/role-templates/role-grants?roleId=...
 *
 * Returns a role's current grants as a LABELLED, deselectable bundle so the
 * Quick Setup "copy from another role" flow can preview it and let the admin
 * uncheck items before applying.
 *
 *   { success, routes: [{ value, label }], actions: [{ value, label }] }
 *
 * `routes`  = the role's granted RouteRoleAccess patterns (page access).
 * `actions` = the role's org-level granted RolePermission permission names.
 * Admin / org-owner only.
 */
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { isOrgAdmin } from "@/lib/permissions/has-permission";
import { STATIC_PAGES } from "@/lib/static-pages";

const PAGE_LABEL = new Map(STATIC_PAGES.map((p) => [p.path, p.label]));

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!user.organizationId)
      return NextResponse.json({ success: false, error: "No organization" }, { status: 403 });
    if (!(await isOrgAdmin(user.id)))
      return NextResponse.json({ success: false, error: "Admins only" }, { status: 403 });

    const organizationId = user.organizationId;
    const roleId = new URL(request.url).searchParams.get("roleId");
    if (!roleId)
      return NextResponse.json({ success: false, error: "roleId is required" }, { status: 400 });

    const role = await prisma.role.findFirst({
      where: { id: roleId, organizationId },
      select: { id: true },
    });
    if (!role)
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });

    const [routeRows, permRows] = await Promise.all([
      prisma.routeRoleAccess.findMany({
        where: { roleId, granted: true, routePermission: { organizationId } },
        select: { routePermission: { select: { pattern: true, description: true } } },
      }),
      prisma.rolePermission.findMany({
        where: {
          roleId,
          granted: true,
          moduleId: null,
          formId: null,
          sectionId: null,
          formFieldId: null,
          pagePath: null,
          role: { organizationId },
        },
        select: { permission: { select: { name: true, description: true } } },
      }),
    ]);

    const routes = routeRows.map((r) => ({
      value: r.routePermission.pattern,
      label:
        PAGE_LABEL.get(r.routePermission.pattern) ??
        r.routePermission.description ??
        r.routePermission.pattern,
    }));

    const actions = permRows.map((p) => ({
      value: p.permission.name,
      label: p.permission.description || p.permission.name,
    }));

    return NextResponse.json({ success: true, routes, actions });
  } catch (e: any) {
    console.error("[GET /api/role-templates/role-grants]", e);
    return NextResponse.json(
      { success: false, error: "Failed to load role grants" },
      { status: 500 },
    );
  }
}
