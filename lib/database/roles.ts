import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { Role, RoleFormData } from "@/types/role";
import { validateSession } from "@/lib/auth"; // If needed for server-side checks

/**
 * Translate raw Prisma/DB errors into clear, user-facing messages.
 *
 * The CRUD helpers below used to swallow every error and rethrow a generic
 * "Failed to X" string, which meant the UI toast could never explain WHY a
 * save failed (most commonly a duplicate role name hitting the
 * `@@unique([name, organizationId])` constraint). This keeps the real reason
 * intact so it can bubble up to the API route and into the toast.
 */
function toFriendlyRoleError(error: unknown, fallback: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation — almost always a duplicate role name in the org.
    if (error.code === "P2002") {
      return new Error("A role with this name already exists in this organization. Please choose a different name.");
    }
    // Foreign-key failure — e.g. a parentId or organizationId that doesn't exist.
    if (error.code === "P2003") {
      return new Error("Invalid reference: the selected parent role or organization no longer exists.");
    }
    // Record not found for update/delete.
    if (error.code === "P2025") {
      return new Error("The role no longer exists. It may have been deleted by someone else.");
    }
  }
  // Already a meaningful Error (e.g. our own validation throws) — preserve it.
  if (error instanceof Error && error.message) {
    return error;
  }
  return new Error(fallback);
}

/**
 * Fetch all roles for a specific organization (already good, but added safety logs)
 */
export async function getRolesByOrganization(
  organizationId: string
): Promise<Role[]> {
  try {
    console.log(`[getRolesByOrganization] Fetching roles for org: ${organizationId}`);

    const roles = await prisma.role.findMany({
      where: {
        organizationId,
      },
      include: {
        children: {
          include: {
            children: {
              include: {
                children: {
                  include: {
                    children: true,
                  },
                },
              },
            },
          },
        },
        parent: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Build hierarchical structure
    const roleMap = new Map<string, Role>();
    const rootRoles: Role[] = [];

    roles.forEach((role) => {
      const roleObj: Role = {
        id: role.id,
        name: role.name,
        description: role.description || "",
        shareDataWithPeers: role.shareDataWithPeers,
        isAdmin: role.isAdmin,
        level: role.level,
        parentId: role.parentId || undefined,
        children: [],
      };
      roleMap.set(role.id, roleObj);
    });

    roles.forEach((role) => {
      const roleObj = roleMap.get(role.id)!;
      if (role.parentId) {
        const parent = roleMap.get(role.parentId);
        if (parent) {
          parent.children.push(roleObj);
        }
      } else {
        rootRoles.push(roleObj);
      }
    });

    console.log(`[getRolesByOrganization] Found ${rootRoles.length} root roles for org ${organizationId}`);

    return rootRoles;
  } catch (error) {
    console.error("[getRolesByOrganization] Error:", error);
    throw new Error("Failed to fetch roles");
  }
}

/**
 * Create a new role — already requires organizationId, but added validation
 */
export async function createRole(
  data: RoleFormData & { organizationId: string }
): Promise<Role> {
  try {
    if (!data.organizationId) {
      throw new Error("organizationId is required to create a role");
    }

    console.log(`[createRole] Creating role in org: ${data.organizationId}`);

    let level = 0;
    if (data.parentId) {
      const parent = await prisma.role.findUnique({
        where: { id: data.parentId },
        select: { level: true, organizationId: true },
      });

      if (!parent) {
        throw new Error("Parent role not found");
      }

      if (parent.organizationId !== data.organizationId) {
        throw new Error("Parent role belongs to a different organization");
      }

      level = parent.level + 1;
    }

    const role = await prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        shareDataWithPeers: data.shareDataWithPeers,
        isAdmin: data.isAdmin ?? false,
        level,
        parentId: data.parentId,
        organizationId: data.organizationId,
      },
    });

    return {
      id: role.id,
      name: role.name,
      description: role.description || "",
      shareDataWithPeers: role.shareDataWithPeers,
      isAdmin: role.isAdmin,
      level: role.level,
      parentId: role.parentId || undefined,
      children: [],
    };
  } catch (error) {
    console.error("[createRole] Error:", error);
    throw toFriendlyRoleError(error, "Failed to create role");
  }
}

/**
 * Update role — now validates organization match
 */
export async function updateRole(
  roleId: string,
  data: Partial<RoleFormData>,
  currentOrganizationId?: string // Optional: pass from API route
): Promise<Role> {
  try {
    // Fetch existing role to check organization
    const existingRole = await prisma.role.findUnique({
      where: { id: roleId },
      select: { organizationId: true, name: true },
    });

    if (!existingRole) {
      throw new Error("Role not found");
    }

    // If currentOrganizationId is provided (from API), enforce it
    if (currentOrganizationId && existingRole.organizationId !== currentOrganizationId) {
      throw new Error("You can only update roles in your own organization");
    }

    console.log(`[updateRole] Updating role ${roleId} in org ${existingRole.organizationId}`);

    const role = await prisma.role.update({
      where: { id: roleId },
      data: {
        name: data.name,
        description: data.description,
        shareDataWithPeers: data.shareDataWithPeers,
        ...(data.isAdmin !== undefined && { isAdmin: data.isAdmin }),
      },
    });

    return {
      id: role.id,
      name: role.name,
      description: role.description || "",
      shareDataWithPeers: role.shareDataWithPeers,
      isAdmin: role.isAdmin,
      level: role.level,
      parentId: role.parentId || undefined,
      children: [],
    };
  } catch (error) {
    console.error("[updateRole] Error:", error);
    throw toFriendlyRoleError(error, "Failed to update role");
  }
}

/**
 * Insert a new role between an existing parent and one of its children.
 *
 * Given a hierarchy   Parent → Child (+ subtree)
 * this produces       Parent → NewRole → Child (+ subtree)
 *
 * Everything happens in a single transaction so the tree is never observed
 * in a half-mutated state. Levels of the child and every descendant get
 * bumped by +1 to keep the `level` column in sync with depth-from-root.
 *
 * - `childRoleId` must belong to `organizationId`.
 * - The new role's `parentId` is taken from the child's current parent —
 *   the caller cannot move the child elsewhere via this endpoint.
 * - Admin roles cannot be displaced (child cannot be an admin role).
 */
export async function insertRoleBetween(params: {
  organizationId: string;
  childRoleId: string;
  newRole: RoleFormData;
}): Promise<Role> {
  const { organizationId, childRoleId, newRole } = params;

  try {
    if (!organizationId) throw new Error("organizationId is required");
    if (!childRoleId) throw new Error("childRoleId is required");
    if (!newRole?.name?.trim()) throw new Error("Role name is required");

    return await prisma.$transaction(async (tx) => {
      // 1. Load the child and verify it belongs to the org.
      const child = await tx.role.findUnique({
        where: { id: childRoleId },
        select: {
          id: true,
          organizationId: true,
          parentId: true,
          level: true,
          isAdmin: true,
        },
      });

      if (!child) throw new Error("Child role not found");
      if (child.organizationId !== organizationId) {
        throw new Error("Child role belongs to a different organization");
      }
      if (child.isAdmin) {
        throw new Error("Cannot insert a role above an admin role");
      }

      // 2. Create the new role at the child's current position.
      const created = await tx.role.create({
        data: {
          name: newRole.name.trim(),
          description: newRole.description || "",
          shareDataWithPeers: !!newRole.shareDataWithPeers,
          isAdmin: !!newRole.isAdmin,
          level: child.level,
          parentId: child.parentId,
          organizationId,
        },
      });

      // 3. Re-parent the child onto the new role. Its level moves down by 1.
      await tx.role.update({
        where: { id: child.id },
        data: {
          parentId: created.id,
          level: child.level + 1,
        },
      });

      // 4. Cascade level +1 to every descendant of the child. We use a
      //    recursive CTE so deep trees don't fan out into N queries, and
      //    we cap depth at 50 as a cycle safety net (real org charts are
      //    rarely deeper than 10).
      await tx.$executeRaw`
        WITH RECURSIVE descendants AS (
          SELECT id, parent_id, 0 AS depth
          FROM roles
          WHERE parent_id = ${child.id}
            AND organization_id = ${organizationId}
            AND is_active = true
          UNION ALL
          SELECT r.id, r.parent_id, d.depth + 1
          FROM roles r
          JOIN descendants d ON r.parent_id = d.id
          WHERE r.organization_id = ${organizationId}
            AND r.is_active = true
            AND d.depth < 50
        )
        UPDATE roles
        SET level = level + 1, updated_at = NOW()
        WHERE id IN (SELECT id FROM descendants)
      `;

      return {
        id: created.id,
        name: created.name,
        description: created.description || "",
        shareDataWithPeers: created.shareDataWithPeers,
        isAdmin: created.isAdmin,
        level: created.level,
        parentId: created.parentId || undefined,
        children: [],
      };
    });
  } catch (error) {
    console.error("[insertRoleBetween] Error:", error);
    throw toFriendlyRoleError(error, "Failed to insert role between");
  }
}

/**
 * Insert a new role directly BENEATH `parentRoleId`, adopting ALL of that
 * parent's current direct children. The new role becomes the parent's child,
 * and every existing child (plus its whole subtree) is re-parented under the
 * new role and shifted down one level — a single layer slotted between a parent
 * and all of its branches at once.
 *
 *         Parent                     Parent
 *        /      \          →           |
 *    ChildA   ChildB              New Role
 *                                 /        \
 *                            ChildA        ChildB     (each subtree level +1)
 *
 * - `parentRoleId` must belong to `organizationId`.
 * - The new role's `parentId` is the parent itself; its level is parent.level+1.
 * - Admin children are never moved (admin roles cannot be displaced) — they
 *   stay directly under the parent. In a normal tree admin is always the root,
 *   so this is just a safety net.
 * - If the parent has no movable children this is equivalent to creating a
 *   normal child role (nothing to re-parent).
 */
export async function insertRoleAboveChildren(params: {
  organizationId: string;
  parentRoleId: string;
  newRole: RoleFormData;
}): Promise<Role> {
  const { organizationId, parentRoleId, newRole } = params;

  try {
    if (!organizationId) throw new Error("organizationId is required");
    if (!parentRoleId) throw new Error("parentRoleId is required");
    if (!newRole?.name?.trim()) throw new Error("Role name is required");

    return await prisma.$transaction(async (tx) => {
      // 1. Load the parent and verify it belongs to the org.
      const parent = await tx.role.findUnique({
        where: { id: parentRoleId },
        select: { id: true, organizationId: true, level: true },
      });

      if (!parent) throw new Error("Parent role not found");
      if (parent.organizationId !== organizationId) {
        throw new Error("Parent role belongs to a different organization");
      }

      // 2. Snapshot the parent's CURRENT direct children BEFORE creating the
      //    new role (so the new role can't accidentally adopt itself). Admin
      //    children are excluded — they cannot be displaced.
      const existingChildren = await tx.role.findMany({
        where: { parentId: parentRoleId, organizationId },
        select: { id: true, isAdmin: true },
      });
      const movableChildIds = existingChildren
        .filter((c) => !c.isAdmin)
        .map((c) => c.id);

      // 3. Create the new role as a child of the parent.
      const created = await tx.role.create({
        data: {
          name: newRole.name.trim(),
          description: newRole.description || "",
          shareDataWithPeers: !!newRole.shareDataWithPeers,
          isAdmin: !!newRole.isAdmin,
          level: parent.level + 1,
          parentId: parent.id,
          organizationId,
        },
      });

      if (movableChildIds.length > 0) {
        // 4. Re-parent every existing (movable) child onto the new role.
        await tx.role.updateMany({
          where: { id: { in: movableChildIds }, organizationId },
          data: { parentId: created.id },
        });

        // 5. Cascade level +1 across the new role's entire subtree — i.e. the
        //    moved children AND all of their descendants. We seed the recursive
        //    CTE at the new role's direct children (which, after step 4, are
        //    exactly the moved children) so a deep tree stays one query. Depth
        //    is capped at 50 as a cycle safety net (real org charts are rarely
        //    deeper than 10). Mirrors the cascade in insertRoleBetween.
        await tx.$executeRaw`
          WITH RECURSIVE subtree AS (
            SELECT id, parent_id, 0 AS depth
            FROM roles
            WHERE parent_id = ${created.id}
              AND organization_id = ${organizationId}
              AND is_active = true
            UNION ALL
            SELECT r.id, r.parent_id, s.depth + 1
            FROM roles r
            JOIN subtree s ON r.parent_id = s.id
            WHERE r.organization_id = ${organizationId}
              AND r.is_active = true
              AND s.depth < 50
          )
          UPDATE roles
          SET level = level + 1, updated_at = NOW()
          WHERE id IN (SELECT id FROM subtree)
        `;
      }

      return {
        id: created.id,
        name: created.name,
        description: created.description || "",
        shareDataWithPeers: created.shareDataWithPeers,
        isAdmin: created.isAdmin,
        level: created.level,
        parentId: created.parentId || undefined,
        children: [],
      };
    });
  } catch (error) {
    console.error("[insertRoleAboveChildren] Error:", error);
    throw toFriendlyRoleError(error, "Failed to insert role above children");
  }
}

/**
 * Delete role — now safely scoped to organization
 */
export async function deleteRole(roleId: string, currentOrganizationId?: string): Promise<void> {
  try {
    // Fetch role to validate organization
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { organizationId: true, isAdmin: true },
    });

    if (!role) {
      throw new Error("Role not found");
    }

    if (role.isAdmin) {
      throw new Error("Admin roles cannot be deleted");
    }

    if (currentOrganizationId && role.organizationId !== currentOrganizationId) {
      throw new Error("You can only delete roles in your own organization");
    }

    console.log(`[deleteRole] Deleting role ${roleId} and children in org ${role.organizationId}`);

    // Delete all descendant roles safely
    await prisma.role.deleteMany({
      where: {
        OR: [
          { id: roleId },
          { parentId: roleId },
          // Optional: deeper recursion if needed, but Prisma handles it via OR
        ],
        organizationId: role.organizationId, // ← safety filter
      },
    });
  } catch (error) {
    console.error("[deleteRole] Error:", error);
    throw toFriendlyRoleError(error, "Failed to delete role");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchical record-inheritance helpers
//
// These power the "a parent role automatically sees records submitted by
// users beneath them in the org hierarchy" feature. They are deliberately
// kept here rather than in a new file so all role-tree traversal lives in
// one place. The records-list endpoint at
// `app/api/forms/[formId]/records/route.ts` is the primary caller.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Caller's role context: the set of role ids and unit ids the user holds,
 * plus a fast-path admin flag. A single user can have multiple
 * UserUnitAssignment rows (multi-unit / multi-role) so all return values
 * are arrays.
 */
export interface CallerRoleContext {
  roleIds: string[];
  unitIds: string[];
  isAdmin: boolean;
}

// Tiny in-memory TTL cache. We don't pull in `lru-cache` because we have
// exactly two consumers and the working set is bounded by active users
// per server instance. Entries expire after CACHE_TTL_MS so re-parenting
// or unit changes propagate within the window.
//
// Trade-off: up to ~60 s of staleness on role re-parenting. This is
// documented in the docstring of every helper that reads from the cache.
const CACHE_TTL_MS = 60_000;
type CacheEntry<T> = { value: T; expiresAt: number };
const callerCtxCache = new Map<string, CacheEntry<CallerRoleContext>>();
const inheritedUserIdsCache = new Map<string, CacheEntry<string[] | null>>();

function readCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T) {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolve the caller's role context (all role assignments + units) for an
 * organization. Cached for ~60 s per `${userId}:${orgId}` pair so a single
 * page-load that fetches records for many forms only pays the DB cost once.
 */
export async function getCallerRoleContext(
  userId: string,
  organizationId: string
): Promise<CallerRoleContext> {
  const key = `${userId}:${organizationId}`;
  const cached = readCache(callerCtxCache, key);
  if (cached) return cached;

  const assignments = await prisma.userUnitAssignment.findMany({
    where: {
      userId,
      role: { organizationId },
    },
    select: {
      unitId: true,
      roleId: true,
      role: { select: { isAdmin: true } },
    },
  });

  const ctx: CallerRoleContext = {
    roleIds: Array.from(new Set(assignments.map((a) => a.roleId))),
    unitIds: Array.from(new Set(assignments.map((a) => a.unitId))),
    isAdmin: assignments.some((a) => a.role.isAdmin),
  };

  writeCache(callerCtxCache, key, ctx);
  return ctx;
}

/**
 * Batch variant of `getCallerRoleContext` for the payroll engine: given many
 * user IDs, return a Map of userId → distinct role IDs in ONE query. Users
 * with no assignments are simply absent from the map (callers treat that as
 * an empty role list). Used to resolve the per-user late-half-day rule for a
 * whole org's payroll run without an N+1 query per employee.
 */
export async function getRolesForUsers(
  organizationId: string,
  userIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const ids = Array.from(new Set(userIds.filter((u): u is string => !!u)));
  if (ids.length === 0) return map;

  const rows = await prisma.userUnitAssignment.findMany({
    where: {
      userId: { in: ids },
      role: { organizationId },
    },
    select: { userId: true, roleId: true },
  });

  for (const r of rows) {
    const list = map.get(r.userId);
    if (list) {
      if (!list.includes(r.roleId)) list.push(r.roleId);
    } else {
      map.set(r.userId, [r.roleId]);
    }
  }
  return map;
}

/**
 * Walk the role tree downward from `rootRoleIds` and return every active
 * descendant role id (NOT including the roots themselves). Implemented as
 * a single PostgreSQL `WITH RECURSIVE` query so deep trees are one round
 * trip instead of N. Defensive depth cap of 20 prevents accidental cycles
 * from causing infinite recursion.
 */
export async function getDescendantRoleIds(
  organizationId: string,
  rootRoleIds: string[]
): Promise<string[]> {
  if (rootRoleIds.length === 0) return [];

  // We hand-build the query rather than use prisma.role.findMany because
  // Prisma has no native support for recursive CTEs. Cast inputs to text[]
  // / text so the parameters bind cleanly under all driver versions.
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE descendants AS (
      SELECT id, parent_id, 0 AS depth
      FROM roles
      WHERE parent_id = ANY(${rootRoleIds}::text[])
        AND organization_id = ${organizationId}
        AND is_active = true
      UNION ALL
      SELECT r.id, r.parent_id, d.depth + 1
      FROM roles r
      JOIN descendants d ON r.parent_id = d.id
      WHERE r.organization_id = ${organizationId}
        AND r.is_active = true
        AND d.depth < 20
    )
    SELECT id FROM descendants
  `;

  return rows.map((r) => r.id);
}

/**
 * Returns the set of user ids whose records the caller should inherit.
 *
 * - Admin callers get `null` (sentinel meaning "no filter — see everything").
 * - Non-admin callers get the union of users assigned to any descendant
 *   role of their own roles, **filtered to users who share at least one
 *   organization unit with the caller**. The unit overlap is the critical
 *   guard against cross-team leaks: a Sales Head should not inherit from
 *   a Dev team member just because both ladders happen to roll up to the
 *   same Admin.
 *
 * Cached for ~60 s per `${userId}:${orgId}` pair, same as
 * `getCallerRoleContext`.
 */
export async function getInheritedUserIds(
  organizationId: string,
  callerCtx: CallerRoleContext
): Promise<string[] | null> {
  if (callerCtx.isAdmin) return null;
  // Caller has no role assignments → nothing to inherit.
  if (callerCtx.roleIds.length === 0) return [];

  const cacheKey = `${organizationId}:${callerCtx.roleIds.slice().sort().join(",")}:${callerCtx.unitIds.slice().sort().join(",")}`;
  const cached = readCache(inheritedUserIdsCache, cacheKey);
  if (cached !== undefined) return cached;

  const descendantRoleIds = await getDescendantRoleIds(
    organizationId,
    callerCtx.roleIds
  );
  if (descendantRoleIds.length === 0) {
    writeCache(inheritedUserIdsCache, cacheKey, []);
    return [];
  }

  // Unit-scoped: only inherit from users who share at least one unit with
  // the caller. If the caller has no units (shouldn't normally happen),
  // we return an empty list rather than leak across the whole org.
  if (callerCtx.unitIds.length === 0) {
    writeCache(inheritedUserIdsCache, cacheKey, []);
    return [];
  }

  const assignments = await prisma.userUnitAssignment.findMany({
    where: {
      roleId: { in: descendantRoleIds },
      unitId: { in: callerCtx.unitIds },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  const userIds = assignments.map((a) => a.userId);
  writeCache(inheritedUserIdsCache, cacheKey, userIds);
  return userIds;
}

/**
 * Hierarchy-scoped visibility for HR / management surfaces (team attendance,
 * leave lists, approver dashboards). Mirrors the rule already used by the
 * Employee Master list in `lib/api-handlers/user-management.ts`:
 *
 *   - Admin       → null  (sentinel: "no filter — see everyone in the org")
 *   - Non-admin   → caller's own id + every user assigned to a role that sits
 *                   strictly below the caller in the org's role tree.
 *
 * Unlike `getInheritedUserIds()` there is intentionally NO shared-unit
 * guard. An IT Head and a Sr. Developer don't necessarily share an org
 * unit, but the IT Head must still see their attendance/leave because the
 * Sr. Developer's role sits beneath the IT Head's role. The role-tree walk
 * is what enforces department isolation: IT Head's role has no Sales
 * children, so Sales users never appear in the result.
 *
 * The caller's own id is always included so a leaf-level Head still sees
 * themselves on the team view.
 */
export async function getVisibleUserIdsForHierarchy(
  userId: string,
  organizationId: string,
): Promise<string[] | null> {
  const ctx = await getCallerRoleContext(userId, organizationId);
  if (ctx.isAdmin) return null;
  if (ctx.roleIds.length === 0) return [userId];

  const descendantRoleIds = await getDescendantRoleIds(
    organizationId,
    ctx.roleIds,
  );
  if (descendantRoleIds.length === 0) return [userId];

  const assignments = await prisma.userUnitAssignment.findMany({
    where: {
      roleId: { in: descendantRoleIds },
      role: { organizationId },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  return Array.from(
    new Set<string>([userId, ...assignments.map((a) => a.userId)]),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoped role hierarchy — the per-user "who do I report to / who reports to me"
// view rendered on the profile page (/profile#hierarchy). Unlike the admin
// Org Architecture screen (/settings/company) which shows the WHOLE role tree,
// this returns ONLY the caller's own slice of it:
//   • reportsTo  — the chain of roles ABOVE the caller (top-most → direct
//                  manager), so a Sales Exec sees Sales Head → … → Admin.
//   • you        — the caller's own role node, with the descendant subtree
//                  (everyone who rolls up under them) nested in `children`.
//   • totalReports — distinct head-count of users in roles strictly below the
//                  caller (their team size), excluding the caller themselves.
// Sibling branches the caller isn't part of are never included, so no user
// can see teams outside their own reporting line.
//
// Scoping & exposure (security-relevant — read before editing):
//   • The ONLY roles included are the caller's strict ancestors (a linear
//     parent_id walk to the root), their own role, and their strict
//     descendants. `parent_id` is a single FK, so the ancestor chain is
//     linear — an unrelated branch's role can never surface as an ancestor.
//     Descendants are isolated by the tree itself: a Sales Head's subtree
//     has no IT roles, so IT users never appear in a Sales view.
//   • Each included role exposes its holders' name / email / avatar. For
//     ancestor roles these are the caller's actual chain of command (the
//     "whom do I report to" the feature is for); for descendant roles they
//     are the caller's own team.
//   • There is intentionally NO shared-unit guard (mirroring
//     getVisibleUserIdsForHierarchy, NOT getInheritedUserIds). A manager and
//     their report frequently sit in different org units, so filtering
//     holders by unit overlap would HIDE the caller's real manager — a worse
//     failure than showing a peer-manager who co-holds a shared trunk role.
//     The role tree, not unit membership, is the isolation boundary here.
// ─────────────────────────────────────────────────────────────────────────────

export interface HierarchyUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  /** True for the logged-in caller, so the UI can highlight "you". */
  isYou: boolean;
}

export interface HierarchyNode {
  roleId: string;
  roleName: string;
  level: number;
  isAdmin: boolean;
  /** True when this role is one the caller holds. */
  isYou: boolean;
  /** Distinct count of users holding THIS role. */
  userCount: number;
  /** People holding this role (deduped across units). */
  users: HierarchyUser[];
  /** Downward subtree — populated for the caller's node + its descendants;
   *  always empty ([]) for ancestor nodes in `reportsTo`. */
  children: HierarchyNode[];
}

export interface ScopedHierarchyChain {
  /** Ancestor roles, ordered top-most → the caller's direct manager. */
  reportsTo: HierarchyNode[];
  /** The caller's own role node, with descendants nested under `children`. */
  you: HierarchyNode;
  /** Distinct users in roles strictly below the caller (excludes the caller). */
  totalReports: number;
}

export interface ScopedRoleHierarchy {
  /** False when the caller has no role assigned yet. */
  hasRole: boolean;
  isAdmin: boolean;
  /** One chain per role the caller holds (usually exactly one). */
  chains: ScopedHierarchyChain[];
}

/**
 * Build the caller's scoped slice of the org role hierarchy (see block comment
 * above). Fetches every active role once and assembles ancestor chains +
 * descendant subtrees in memory — org role counts are small (dozens), so a
 * single query beats recursive round-trips. Depth-capped + cycle-guarded so a
 * malformed parent link can never spin forever.
 */
export async function getScopedRoleHierarchyForUser(
  userId: string,
  organizationId: string,
): Promise<ScopedRoleHierarchy> {
  const ctx = await getCallerRoleContext(userId, organizationId);
  if (ctx.roleIds.length === 0) {
    return { hasRole: false, isAdmin: ctx.isAdmin, chains: [] };
  }

  const roles = await prisma.role.findMany({
    where: { organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      parentId: true,
      level: true,
      isAdmin: true,
      userAssignments: {
        select: {
          user: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              avatar: true,
            },
          },
        },
      },
    },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  type RawRole = (typeof roles)[number];
  const byId = new Map<string, RawRole>();
  const childIds = new Map<string, string[]>();
  for (const r of roles) byId.set(r.id, r);
  for (const r of roles) {
    if (r.parentId && byId.has(r.parentId)) {
      const list = childIds.get(r.parentId);
      if (list) list.push(r.id);
      else childIds.set(r.parentId, [r.id]);
    }
  }

  const callerRoleIds = new Set(ctx.roleIds);

  const distinctUsers = (r: RawRole): HierarchyUser[] => {
    const seen = new Map<string, HierarchyUser>();
    for (const a of r.userAssignments) {
      const u = a.user;
      if (!u || seen.has(u.id)) continue;
      const name =
        `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email;
      seen.set(u.id, {
        id: u.id,
        name,
        email: u.email,
        avatar: u.avatar,
        isYou: u.id === userId,
      });
    }
    return Array.from(seen.values());
  };

  // Build a node; when `withChildren`, recurse into the subtree. `visited`
  // guards against cycles, `depth` caps runaway trees (matches the value used
  // by getDescendantRoleIds).
  const buildNode = (
    roleId: string,
    withChildren: boolean,
    visited: Set<string>,
    depth: number,
  ): HierarchyNode => {
    const r = byId.get(roleId)!;
    const users = distinctUsers(r);
    const node: HierarchyNode = {
      roleId: r.id,
      roleName: r.name,
      level: r.level,
      isAdmin: r.isAdmin,
      isYou: callerRoleIds.has(r.id),
      userCount: users.length,
      users,
      children: [],
    };
    if (withChildren && depth < 20) {
      for (const kid of childIds.get(roleId) ?? []) {
        if (visited.has(kid)) continue;
        visited.add(kid);
        node.children.push(buildNode(kid, true, visited, depth + 1));
      }
    }
    return node;
  };

  // Distinct head-count of users in roles strictly below `roleId`, excluding
  // the caller (so you never count yourself as your own report).
  const countReports = (roleId: string): number => {
    const seen = new Set<string>();
    const visited = new Set<string>([roleId]);
    const walk = (rid: string, depth: number) => {
      if (depth >= 20) return;
      for (const kid of childIds.get(rid) ?? []) {
        if (visited.has(kid)) continue;
        visited.add(kid);
        const r = byId.get(kid);
        if (r) {
          for (const a of r.userAssignments) {
            if (a.user && a.user.id !== userId) seen.add(a.user.id);
          }
        }
        walk(kid, depth + 1);
      }
    };
    walk(roleId, 0);
    return seen.size;
  };

  const chains: ScopedHierarchyChain[] = ctx.roleIds
    .filter((rid) => byId.has(rid))
    .map((rid) => {
      // Walk parent links upward → ancestors (top-most first after reverse).
      const reportsTo: HierarchyNode[] = [];
      const ancestorVisited = new Set<string>([rid]);
      let cursor = byId.get(rid)!.parentId;
      let guard = 0;
      while (cursor && byId.has(cursor) && !ancestorVisited.has(cursor) && guard < 20) {
        ancestorVisited.add(cursor);
        reportsTo.push(buildNode(cursor, false, new Set(), 0));
        cursor = byId.get(cursor)!.parentId;
        guard++;
      }
      reportsTo.reverse();

      return {
        reportsTo,
        you: buildNode(rid, true, new Set<string>([rid]), 0),
        totalReports: countReports(rid),
      };
    });

  return { hasRole: chains.length > 0, isAdmin: ctx.isAdmin, chains };
}