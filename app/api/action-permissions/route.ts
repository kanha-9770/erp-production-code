/**
 * Action / functionality permission management API.
 *
 *   GET  → ensure the catalog's Permission rows exist for this org, then return
 *          the catalog + current role grants + current user grants.
 *   PUT  → batch grant/revoke a named action permission to roles and users.
 *
 * Writes the exact tables hasPermission() resolves: RolePermission (org-level,
 * all scope fields null) for roles, UserPermissionOverride for users. Admin /
 * org-owner only — managing permissions is itself privileged.
 */
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { isOrgAdmin } from "@/lib/permissions/has-permission";
import {
  ACTION_CATALOG,
  ALL_ACTION_PERMISSIONS,
} from "@/lib/permissions/action-catalog";

const GRANT_REASON = "Granted via Approvals & Permissions page";

/**
 * Ensure a Permission row exists for every catalogued action in this org.
 * Returns a name → permissionId map (omitting any name whose globally-unique
 * row is owned by a different org — can't be managed here).
 */
async function ensureCatalogPermissions(organizationId: string) {
  const map = new Map<string, string>();
  for (const def of ALL_ACTION_PERMISSIONS) {
    const existing = await prisma.permission.findUnique({
      where: { name: def.name },
      select: { id: true, organizationId: true },
    });
    if (existing) {
      if (existing.organizationId === organizationId) map.set(def.name, existing.id);
      continue; // owned by another org (name is globally unique) — skip
    }
    try {
      const created = await prisma.permission.create({
        data: {
          name: def.name,
          description: def.description,
          category: "SPECIAL",
          resource: def.module,
          organizationId,
          isActive: true,
        },
        select: { id: true },
      });
      map.set(def.name, created.id);
    } catch {
      // Race / cross-org create collision — re-read and use if ours.
      const row = await prisma.permission.findUnique({
        where: { name: def.name },
        select: { id: true, organizationId: true },
      });
      if (row && row.organizationId === organizationId) map.set(def.name, row.id);
    }
  }
  return map;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!user.organizationId)
      return NextResponse.json({ success: false, error: "No organization" }, { status: 403 });
    if (!(await isOrgAdmin(user.id)))
      return NextResponse.json({ success: false, error: "Admins only" }, { status: 403 });

    const organizationId = user.organizationId;
    const permMap = await ensureCatalogPermissions(organizationId);
    const idToName = new Map<string, string>();
    for (const [name, id] of permMap) idToName.set(id, name);
    const permissionIds = Array.from(idToName.keys());

    // Role grants (org-level, unscoped, granted=true).
    const rolePerms = permissionIds.length
      ? await prisma.rolePermission.findMany({
          where: {
            permissionId: { in: permissionIds },
            granted: true,
            moduleId: null,
            formId: null,
            sectionId: null,
            formFieldId: null,
            pagePath: null,
            role: { organizationId },
          },
          select: { roleId: true, permissionId: true },
        })
      : [];

    // User grants (UserPermissionOverride, granted=true) — the model hasPermission reads.
    const userPerms = permissionIds.length
      ? await prisma.userPermissionOverride.findMany({
          where: {
            permissionId: { in: permissionIds },
            granted: true,
            user: { organizationId },
          },
          select: { userId: true, permissionId: true },
        })
      : [];

    const roleGrants: Record<string, string[]> = {};
    for (const rp of rolePerms) {
      const name = idToName.get(rp.permissionId);
      if (!name) continue;
      (roleGrants[name] ??= []).push(rp.roleId);
    }
    const userGrants: Record<string, string[]> = {};
    for (const up of userPerms) {
      const name = idToName.get(up.permissionId);
      if (!name) continue;
      (userGrants[name] ??= []).push(up.userId);
    }

    return NextResponse.json({
      success: true,
      data: { catalog: ACTION_CATALOG, roleGrants, userGrants },
    });
  } catch (e: any) {
    console.error("[GET /api/action-permissions]", e);
    return NextResponse.json(
      { success: false, error: "Failed to load action permissions" },
      { status: 500 },
    );
  }
}

interface Change {
  kind: "role" | "user";
  id: string;
  name: string;
  granted: boolean;
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!user.organizationId)
      return NextResponse.json({ success: false, error: "No organization" }, { status: 403 });
    if (!(await isOrgAdmin(user.id)))
      return NextResponse.json({ success: false, error: "Admins only" }, { status: 403 });

    const organizationId = user.organizationId;
    const body = await request.json();
    const changes: Change[] = Array.isArray(body?.changes) ? body.changes : [];
    if (changes.length === 0)
      return NextResponse.json({ success: true, updatedCount: 0 });

    const permMap = await ensureCatalogPermissions(organizationId);

    // Validate role / user ids belong to this org.
    const roleIds = Array.from(new Set(changes.filter((c) => c.kind === "role").map((c) => c.id)));
    const userIds = Array.from(new Set(changes.filter((c) => c.kind === "user").map((c) => c.id)));
    const [orgRoles, orgUsers] = await Promise.all([
      roleIds.length
        ? prisma.role.findMany({ where: { id: { in: roleIds }, organizationId }, select: { id: true } })
        : Promise.resolve([]),
      userIds.length
        ? prisma.user.findMany({ where: { id: { in: userIds }, organizationId }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    const validRoles = new Set(orgRoles.map((r) => r.id));
    const validUsers = new Set(orgUsers.map((u) => u.id));

    let updated = 0;
    const skipped: Array<{ change: Change; reason: string }> = [];

    await prisma.$transaction(async (tx) => {
      for (const c of changes) {
        const permissionId = permMap.get(c.name);
        if (!permissionId) {
          skipped.push({ change: c, reason: "permission not managed for this org" });
          continue;
        }
        if (c.kind === "role") {
          if (!validRoles.has(c.id)) {
            skipped.push({ change: c, reason: "role not in org" });
            continue;
          }
          // Org-level scope: all scope fields null. Delete-then-create (mirrors
          // /api/role-permissions) keeps exactly one row per (role, permission).
          await tx.rolePermission.deleteMany({
            where: {
              roleId: c.id,
              permissionId,
              moduleId: null,
              formId: null,
              sectionId: null,
              formFieldId: null,
              pagePath: null,
            },
          });
          if (c.granted) {
            await tx.rolePermission.create({ data: { roleId: c.id, permissionId, granted: true } });
          }
          updated++;
        } else {
          if (!validUsers.has(c.id)) {
            skipped.push({ change: c, reason: "user not in org" });
            continue;
          }
          if (c.granted) {
            await tx.userPermissionOverride.upsert({
              where: { userId_permissionId: { userId: c.id, permissionId } },
              create: { userId: c.id, permissionId, granted: true, reason: GRANT_REASON },
              update: { granted: true, reason: GRANT_REASON },
            });
          } else {
            // Off = remove the grant (back to default), not an explicit deny.
            await tx.userPermissionOverride.deleteMany({ where: { userId: c.id, permissionId } });
          }
          updated++;
        }
      }
    });

    return NextResponse.json({
      success: true,
      updatedCount: updated,
      skippedCount: skipped.length,
      skipped: skipped.length ? skipped : undefined,
    });
  } catch (e: any) {
    console.error("[PUT /api/action-permissions]", e);
    return NextResponse.json(
      { success: false, error: "Failed to update action permissions" },
      { status: 500 },
    );
  }
}
