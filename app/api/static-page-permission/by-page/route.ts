/**
 * GET /api/static-page-permission/by-page?pagePath=/payroll
 *
 * Page-centric ROLE × PERMISSION matrix for a single static page — one batched
 * read that powers the By-Page view: pick a page, then a grid of every role
 * (rows) against every page action (columns).
 *
 *     Page (Static):  [ Payroll ▾ ]
 *                            VIEW  CREATE  EDIT  DELETE  …
 *       Role 1               [ ]    [ ]    [ ]    [ ]
 *       Role 2               [ ]    [ ]    [ ]    [ ]
 *
 * Returns everything the grid needs in a single round-trip:
 *   - actions : the page permission set (VIEW / CREATE / EDIT / … with real ids)
 *   - roles   : every role in the caller's org (id, name, isAdmin)
 *   - grants  : the role's existing page grants for THIS page
 *               ({ roleId, permissionId }), from the RolePermission engine
 *               scoped by pagePath.
 *
 * SAVING is done through the existing `PUT /api/role-permissions` (it already
 * persists page-scoped role grants, batched and cross-tenant-checked) — this
 * route is read-only.
 *
 * Cross-tenant safety: roles and grants are filtered by the caller's
 * organizationId; the pagePath is validated against the static-page registry.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { getPagePermissions } from "@/lib/database/database";
import { findStaticPage } from "@/lib/static-pages";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "No organization context" },
        { status: 403 },
      );
    }

    const pagePath = request.nextUrl.searchParams.get("pagePath");
    if (!pagePath || !findStaticPage(pagePath)) {
      return NextResponse.json(
        { success: false, error: "Unknown or missing pagePath" },
        { status: 400 },
      );
    }

    const orgId = authUser.organizationId;

    const [actions, roles, grantRows] = await Promise.all([
      // The page action set (VIEW / CREATE / EDIT / DELETE / …) with real ids.
      getPagePermissions(),
      // Every role in the org.
      prisma.role.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, isAdmin: true },
        orderBy: [{ isAdmin: "desc" }, { name: "asc" }],
      }),
      // Existing page-scoped grants for THIS page across all org roles.
      prisma.rolePermission.findMany({
        where: {
          pagePath,
          granted: true,
          sectionId: null,
          formFieldId: null,
          role: { organizationId: orgId },
        },
        select: { roleId: true, permissionId: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      page: findStaticPage(pagePath),
      actions: actions.map((p: any) => ({ id: p.id, name: p.name })),
      roles,
      grants: grantRows.map((g) => ({
        roleId: g.roleId,
        permissionId: g.permissionId,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/static-page-permission/by-page]", error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "Failed to load matrix" },
      { status: 500 },
    );
  }
}
