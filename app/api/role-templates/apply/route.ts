/**
 * Apply an EXPLICIT set of grants to a target role.
 *
 *   POST { targetRoleId, routes: string[], actions: string[] }
 *
 * `routes` (page patterns) and `actions` (named permission names) are the
 * FINAL, user-edited bundle — the client resolves them from a template or from
 * another role's grants (GET ./role-grants), lets the admin deselect any they
 * don't want, and sends only the chosen ones here.
 *
 * MERGE semantics: grants are ADDED (RouteRoleAccess + org-level RolePermission
 * set to granted=true). Nothing is revoked — removing access stays the job of
 * the per-role screens, so applying can never silently strip a role.
 *
 * Writes the SAME tables the rest of the system reads. Admin / org-owner only.
 */
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { isOrgAdmin } from "@/lib/permissions/has-permission";
import { ensureCatalogPermissions } from "@/lib/permissions/ensure-catalog";
import { cacheInvalidate, buildKey } from "@/lib/cache";

const TX_OPTS = { maxWait: 15_000, timeout: 30_000 };

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!user.organizationId)
      return NextResponse.json({ success: false, error: "No organization" }, { status: 403 });
    if (!(await isOrgAdmin(user.id)))
      return NextResponse.json({ success: false, error: "Admins only" }, { status: 403 });

    const organizationId = user.organizationId;
    const body = await request.json().catch(() => ({}));
    const targetRoleId: string | undefined = body?.targetRoleId;
    const routePatterns: string[] = Array.isArray(body?.routes)
      ? Array.from(new Set(body.routes.filter((r: unknown): r is string => typeof r === "string")))
      : [];
    const actionNames: string[] = Array.isArray(body?.actions)
      ? Array.from(new Set(body.actions.filter((a: unknown): a is string => typeof a === "string")))
      : [];

    if (!targetRoleId)
      return NextResponse.json({ success: false, error: "targetRoleId is required" }, { status: 400 });
    if (routePatterns.length === 0 && actionNames.length === 0)
      return NextResponse.json(
        { success: false, error: "Nothing selected to grant" },
        { status: 400 },
      );

    const targetRole = await prisma.role.findFirst({
      where: { id: targetRoleId, organizationId },
      select: { id: true, isAdmin: true },
    });
    if (!targetRole)
      return NextResponse.json({ success: false, error: "Target role not found" }, { status: 404 });
    if (targetRole.isAdmin)
      return NextResponse.json(
        { success: false, error: "Admin roles already have full access — nothing to apply." },
        { status: 400 },
      );

    // ── Resolve action names → permissionIds (catalog ensured first) ─────────
    let permissionIds: string[] = [];
    if (actionNames.length) {
      await ensureCatalogPermissions(organizationId); // create any catalog rows
      const perms = await prisma.permission.findMany({
        where: { name: { in: actionNames }, organizationId },
        select: { id: true },
      });
      permissionIds = perms.map((p) => p.id);
    }

    // ── Ensure RoutePermission rows exist for the patterns we'll grant ───────
    let routeIds: string[] = [];
    if (routePatterns.length) {
      const existing = await prisma.routePermission.findMany({
        where: { organizationId, pattern: { in: routePatterns } },
        select: { id: true, pattern: true },
      });
      const have = new Set(existing.map((r) => r.pattern));
      const missing = routePatterns.filter((p) => !have.has(p));
      if (missing.length) {
        await prisma.routePermission.createMany({
          data: missing.map((pattern) => ({ pattern, organizationId })),
          skipDuplicates: true,
        });
      }
      const all = missing.length
        ? await prisma.routePermission.findMany({
            where: { organizationId, pattern: { in: routePatterns } },
            select: { id: true },
          })
        : existing;
      routeIds = all.map((r) => r.id);
    }

    let routesGranted = 0;
    let actionsGranted = 0;

    await prisma.$transaction(async (tx) => {
      // Routes — create missing RouteRoleAccess (granted), flip any denied ones on.
      if (routeIds.length) {
        const existingAccess = await tx.routeRoleAccess.findMany({
          where: { routePermissionId: { in: routeIds }, roleId: targetRoleId },
          select: { routePermissionId: true, granted: true },
        });
        const accessByRoute = new Map(existingAccess.map((a) => [a.routePermissionId, a.granted]));
        const toCreate = routeIds.filter((id) => !accessByRoute.has(id));
        const toEnable = routeIds.filter((id) => accessByRoute.get(id) === false);

        if (toCreate.length) {
          await tx.routeRoleAccess.createMany({
            data: toCreate.map((routePermissionId) => ({
              routePermissionId,
              roleId: targetRoleId,
              granted: true,
            })),
            skipDuplicates: true,
          });
        }
        if (toEnable.length) {
          await tx.routeRoleAccess.updateMany({
            where: { routePermissionId: { in: toEnable }, roleId: targetRoleId },
            data: { granted: true },
          });
        }
        routesGranted = toCreate.length + toEnable.length;
      }

      // Actions — org-level RolePermission rows (all scope null), granted.
      if (permissionIds.length) {
        const existingPerms = await tx.rolePermission.findMany({
          where: {
            roleId: targetRoleId,
            permissionId: { in: permissionIds },
            moduleId: null,
            formId: null,
            sectionId: null,
            formFieldId: null,
            pagePath: null,
          },
          select: { permissionId: true, granted: true },
        });
        const permState = new Map(existingPerms.map((p) => [p.permissionId, p.granted]));
        const toCreate = permissionIds.filter((id) => !permState.has(id));
        const toEnable = existingPerms.filter((p) => !p.granted).map((p) => p.permissionId);

        if (toCreate.length) {
          await tx.rolePermission.createMany({
            data: toCreate.map((permissionId) => ({
              roleId: targetRoleId,
              permissionId,
              granted: true,
            })),
          });
        }
        if (toEnable.length) {
          await tx.rolePermission.updateMany({
            where: {
              roleId: targetRoleId,
              permissionId: { in: toEnable },
              moduleId: null,
              formId: null,
              sectionId: null,
              formFieldId: null,
              pagePath: null,
            },
            data: { granted: true },
          });
        }
        actionsGranted = toCreate.length + toEnable.length;
      }
    }, TX_OPTS);

    await cacheInvalidate("auth", buildKey("auth", "perm-version", organizationId));

    return NextResponse.json({
      success: true,
      routesGranted,
      actionsGranted,
      routesRequested: routePatterns.length,
      actionsRequested: actionNames.length,
    });
  } catch (e: any) {
    console.error("[POST /api/role-templates/apply]", e);
    return NextResponse.json(
      { success: false, error: "Failed to apply grants" },
      { status: 500 },
    );
  }
}
