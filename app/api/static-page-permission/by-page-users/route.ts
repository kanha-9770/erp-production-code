/**
 * GET /api/static-page-permission/by-page-users?pagePath=/payroll
 *
 * Page-centric USER × PERMISSION matrix for a single static page, with the
 * users grouped by the role(s) they hold. Powers the "By Page" view:
 *
 *     Page (Static):  [ Payroll ]            CREATE  EDIT  DELETE  VIEW
 *       ▸ Roles
 *           user1                              [ ]    [ ]   [ ]    [ ]
 *           user2                              [ ]    [ ]   [ ]    [ ]
 *       ▸ Roles2
 *           user4                              [ ]    [ ]   [ ]    [ ]
 *
 * One batched read returns everything the grid needs:
 *   - actions    : the four page actions (CREATE / EDIT / DELETE / VIEW) with
 *                  their real Permission ids, in mockup order.
 *   - roles      : every role in the caller's org, each carrying the users that
 *                  hold it ({ id, name, isAdmin, users:[{ id, name, email }] }).
 *                  A user who holds two roles appears under both.
 *   - roleGrants : the per-ROLE grants for THIS page ({ roleId, permissionId }),
 *                  from the RolePermission engine scoped by pagePath. A role
 *                  grant PROPAGATES to every user that holds the role (the
 *                  inherited baseline shown under each user).
 *   - userGrants : the per-USER explicit overrides for THIS page
 *                  ({ userId, permissionId }), from the UserPermission engine
 *                  scoped by pagePath. These take precedence over inheritance.
 *
 * SAVING goes through the existing engines (this route is read-only):
 *   - role changes → PUT /api/role-permissions   ({ roleId, pagePath, granted })
 *   - user changes → PUT /api/user-permissions   ({ userId, pagePath, granted })
 *
 * Cross-tenant safety: roles, users and grants are all filtered by the
 * caller's organizationId; the pagePath is validated against the registry.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { getPagePermissions } from "@/lib/database/database";
import { findStaticPage } from "@/lib/static-pages";

// The four actions the matrix exposes, in the mockup's column order. The page
// registry can carry more (IMPORT / EXPORT / PRINT / APPROVAL); the per-user
// page grid keeps to these four to stay scannable.
const ACTION_ORDER = ["CREATE", "EDIT", "DELETE", "VIEW"];

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
    // Page-switch fast path: the actions and the roles+users list are
    // page-INDEPENDENT, so the client loads them once and then asks only for
    // the per-page grants on each subsequent page selection. This skips the
    // expensive getPagePermissions() seed-check and the roles×users join.
    const grantsOnly = request.nextUrl.searchParams.get("grantsOnly") === "1";

    // Per-ROLE grants for THIS page (propagate to the role's users).
    const fetchRoleGrants = () =>
      prisma.rolePermission.findMany({
        where: {
          pagePath,
          granted: true,
          sectionId: null,
          formFieldId: null,
          role: { organizationId: orgId },
        },
        select: { roleId: true, permissionId: true },
      });
    // Per-USER explicit overrides for THIS page. NOT filtered by `granted` — an
    // explicit DENY (granted:false) must survive a reload so the grid can tell
    // "explicit deny" from "inherit".
    const fetchUserGrants = () =>
      prisma.userPermission.findMany({
        where: { pagePath, isActive: true, user: { organizationId: orgId } },
        select: { userId: true, permissionId: true, granted: true },
      });

    if (grantsOnly) {
      const [roleGrantRows, userGrantRows] = await Promise.all([
        fetchRoleGrants(),
        fetchUserGrants(),
      ]);
      return NextResponse.json({
        success: true,
        roleGrants: roleGrantRows.map((g) => ({
          roleId: g.roleId,
          permissionId: g.permissionId,
        })),
        userGrants: userGrantRows.map((g) => ({
          userId: g.userId,
          permissionId: g.permissionId,
          granted: g.granted,
        })),
      });
    }

    const [allActions, roleRows, roleGrantRows, userGrantRows] =
      await Promise.all([
        // The page action set with real ids; filtered + ordered below.
        getPagePermissions(),
        // Every role in the org with the users that hold it.
        prisma.role.findMany({
          where: { organizationId: orgId },
          select: {
            id: true,
            name: true,
            isAdmin: true,
            userAssignments: {
              select: {
                user: {
                  select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    username: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: [{ isAdmin: "desc" }, { name: "asc" }],
        }),
        fetchRoleGrants(),
        fetchUserGrants(),
      ]);

    // Keep only CREATE/EDIT/DELETE/VIEW, in column order.
    const actions = ACTION_ORDER.map((name) =>
      allActions.find((a: any) => a.name === name),
    )
      .filter(Boolean)
      .map((a: any) => ({ id: a.id, name: a.name }));

    const roles = roleRows.map((r) => {
      // Dedup users within a role (a user can have >1 unit assignment to the
      // same role) and build a friendly display name.
      const byId = new Map<string, { id: string; name: string; email: string }>();
      for (const ua of r.userAssignments) {
        const u = ua.user;
        if (!u || byId.has(u.id)) continue;
        const name =
          [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
          u.username ||
          u.email;
        byId.set(u.id, { id: u.id, name, email: u.email });
      }
      return {
        id: r.id,
        name: r.name,
        isAdmin: r.isAdmin,
        users: Array.from(byId.values()).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      };
    });

    return NextResponse.json({
      success: true,
      page: findStaticPage(pagePath),
      actions,
      roles,
      roleGrants: roleGrantRows.map((g) => ({
        roleId: g.roleId,
        permissionId: g.permissionId,
      })),
      userGrants: userGrantRows.map((g) => ({
        userId: g.userId,
        permissionId: g.permissionId,
        granted: g.granted,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/static-page-permission/by-page-users]", error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "Failed to load matrix" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/static-page-permission/by-page-users
 *
 * The VIEW→visibility bridge. Granting CREATE/EDIT/DELETE/VIEW in the matrix
 * writes RolePermission/UserPermission rows (page-level action enforcement via
 * usePermissions.hasPermission), but the SIDEBAR + middleware + server route
 * guards read `allowedRoutes`/`deniedRoutes`, which `computeRouteMeta` derives
 * SOLELY from the RoutePermission table. So a VIEW grant only actually
 * shows/hides the page if it also lands in RoutePermission's role/user access.
 *
 * This action ensures the RoutePermission row for the page exists, then upserts
 * the VIEW access for the given roles/users (granted true OR false — a false
 * row is an explicit deny that keeps the route restricted).
 *
 * Body: {
 *   pagePath: string,
 *   roleUpdates?: Array<{ roleId: string; granted: boolean }>,
 *   userUpdates?: Array<{ userId: string; granted: boolean }>,
 * }
 */
export async function POST(request: NextRequest) {
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
    const orgId = authUser.organizationId;

    const body = await request.json();
    const { pagePath, roleUpdates, userUpdates } = body as {
      pagePath?: string;
      roleUpdates?: Array<{ roleId: string; granted: boolean }>;
      userUpdates?: Array<{ userId: string; granted: boolean }>;
    };

    const page = pagePath ? findStaticPage(pagePath) : null;
    if (!pagePath || !page) {
      return NextResponse.json(
        { success: false, error: "Unknown or missing pagePath" },
        { status: 400 },
      );
    }
    if (!roleUpdates?.length && !userUpdates?.length) {
      return NextResponse.json({ success: true, noop: true });
    }

    // Ensure the RoutePermission row exists for this page (pattern = pagePath).
    let route = await prisma.routePermission.findFirst({
      where: { organizationId: orgId, pattern: pagePath },
      select: { id: true },
    });
    if (!route) {
      route = await prisma.routePermission.create({
        data: {
          organizationId: orgId,
          pattern: pagePath,
          description: page.label,
        },
        select: { id: true },
      });
    }
    const routeId = route.id;

    // Cross-tenant guard: only touch roles/users that belong to the org.
    const roleIds = (roleUpdates ?? []).map((r) => r.roleId);
    const userIds = (userUpdates ?? []).map((u) => u.userId);
    const [validRoles, validUsers] = await Promise.all([
      roleIds.length
        ? prisma.role.findMany({
            where: { id: { in: roleIds }, organizationId: orgId },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds }, organizationId: orgId },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
    ]);
    const okRole = new Set(validRoles.map((r) => r.id));
    const okUser = new Set(validUsers.map((u) => u.id));

    // Bulk pattern (fixed query count, not one upsert per row): read existing
    // access rows for this route, partition each update into create / set-true
    // / set-false, then a single createMany + up to two updateMany per side.
    const [existingRoleAccess, existingUserAccess] = await Promise.all([
      prisma.routeRoleAccess.findMany({
        where: { routePermissionId: routeId },
        select: { id: true, roleId: true },
      }),
      prisma.routeUserAccess.findMany({
        where: { routePermissionId: routeId },
        select: { id: true, userId: true },
      }),
    ]);
    const roleAccessId = new Map(existingRoleAccess.map((r) => [r.roleId, r.id]));
    const userAccessId = new Map(existingUserAccess.map((r) => [r.userId, r.id]));

    const roleCreate: Array<{ routePermissionId: string; roleId: string; granted: boolean }> = [];
    const roleSetTrue: string[] = [];
    const roleSetFalse: string[] = [];
    for (const u of roleUpdates ?? []) {
      if (!okRole.has(u.roleId)) continue;
      const id = roleAccessId.get(u.roleId);
      if (id) (u.granted ? roleSetTrue : roleSetFalse).push(id);
      else roleCreate.push({ routePermissionId: routeId, roleId: u.roleId, granted: u.granted });
    }

    const userCreate: Array<{ routePermissionId: string; userId: string; granted: boolean }> = [];
    const userSetTrue: string[] = [];
    const userSetFalse: string[] = [];
    for (const u of userUpdates ?? []) {
      if (!okUser.has(u.userId)) continue;
      const id = userAccessId.get(u.userId);
      if (id) (u.granted ? userSetTrue : userSetFalse).push(id);
      else userCreate.push({ routePermissionId: routeId, userId: u.userId, granted: u.granted });
    }

    await prisma.$transaction(async (tx) => {
      if (roleCreate.length) await tx.routeRoleAccess.createMany({ data: roleCreate, skipDuplicates: true });
      if (roleSetTrue.length) await tx.routeRoleAccess.updateMany({ where: { id: { in: roleSetTrue } }, data: { granted: true } });
      if (roleSetFalse.length) await tx.routeRoleAccess.updateMany({ where: { id: { in: roleSetFalse } }, data: { granted: false } });
      if (userCreate.length) await tx.routeUserAccess.createMany({ data: userCreate, skipDuplicates: true });
      if (userSetTrue.length) await tx.routeUserAccess.updateMany({ where: { id: { in: userSetTrue } }, data: { granted: true } });
      if (userSetFalse.length) await tx.routeUserAccess.updateMany({ where: { id: { in: userSetFalse } }, data: { granted: false } });
      // Widen past Prisma's 2s/5s defaults — the Supabase pooler times out the
      // connection-acquire step otherwise (P2028).
    }, { maxWait: 15_000, timeout: 30_000 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/static-page-permission/by-page-users]", error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "Failed to sync route access" },
      { status: 500 },
    );
  }
}
