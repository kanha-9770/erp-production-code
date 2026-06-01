import { prisma } from "@/lib/prisma";
import { invalidatePermissionCache } from "@/lib/api-helpers";

export interface DatabaseUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
  department?: string;
  location?: string;
  phone?: string;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseRole {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  parentId?: string;
  level: number;
  shareDataWithPeers: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DatabasePermission {
  id: string;
  name: string;
  description: string;
  category: "READ" | "WRITE" | "DELETE" | "ADMIN" | "SPECIAL";
  resource: string;
  resourceId?: string;
  resourceType?: string;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseModule {
  id: string;
  name: string;
  description: string;
  icon?: string;
  color?: string;
  settings?: any;
  parentId?: string;
  level: number;
  path?: string;
  moduleType: "standard" | "submodule";
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  forms?: DatabaseForm[];
}

export interface DatabaseForm {
  id: string;
  name: string;
  description?: string;
  moduleId: string;
  isPublished: boolean;
  isEmployeeForm?: boolean;
  isUserForm?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RolePermissionUpdate {
  roleId: string;
  permissionId: string;
  moduleId?: string;
  sectionId: string | null;
  formFieldId: string | null;
  formId?: string;
  granted: boolean;
  canDelegate?: boolean;
}

export interface UserPermissionUpdate {
  userId: string;
  permissionId: string;
  moduleId?: string | null;
  formId?: string | null;
  /** Static-page scope. When set (and module/form unset) this is a per-user
   *  override for a registry static page. */
  pagePath?: string | null;
  granted: boolean;
  reason?: string;
  grantedBy?: string | null;
  expiresAt?: Date | null;
  isActive?: boolean;
}

// Helper function to check database connectivity
async function isDatabaseConnected(): Promise<boolean> {
  if (!prisma) return false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    return false;
  }
}

// Helper function to get or create a valid organizationId
async function getValidOrganizationId(): Promise<string> {
  const defaultOrgId = "default-org";

  const isConnected = await isDatabaseConnected();
  if (!isConnected) {
    return defaultOrgId;
  }

  try {
    let organization = await prisma.organization.findFirst({
      select: { id: true },
    });

    if (!organization) {
      organization = await prisma.organization.create({
        data: {
          id: defaultOrgId,
          name: "Default Organization",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        select: { id: true },
      });
    }

    return organization.id;
  } catch (error) {
    console.error("[v0] Failed to fetch or create organization:", error);
    return defaultOrgId;
  }
}

// Helper function to ensure standard permissions exist in the database
async function ensureStandardPermissionsExist(): Promise<void> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) {
    return;
  }

  try {
    const organizationId = await getValidOrganizationId();

    const standardPermissions = [
      { id: "1", name: "VIEW", category: "READ", resource: "form" },
      { id: "2", name: "CREATE", category: "WRITE", resource: "form" },
      { id: "3", name: "EDIT", category: "WRITE", resource: "form" },
      { id: "4", name: "DELETE", category: "DELETE", resource: "form" },
      { id: "5", name: "IMPORT", category: "WRITE", resource: "form" },
      { id: "6", name: "EXPORT", category: "READ", resource: "form" },
      { id: "7", name: "PRINT", category: "READ", resource: "form" },
    ];

    for (const perm of standardPermissions) {
      await prisma.permission.upsert({
        where: { id: perm.id },
        update: {},
        create: {
          id: perm.id,
          name: perm.name,
          category: perm.category as any,
          resource: perm.resource,
          organizationId,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      // Drop any stale `not-found` cache entry that pre-existed this upsert.
      // Best-effort — cache failures must not break seeding.
      await invalidatePermissionCache(perm.name).catch(() => {});
    }
  } catch (error) {
    console.error("[v0] Failed to ensure standard permissions:", error);
  }
}

// Page-only permission(s). Kept OUT of `ensureStandardPermissionsExist` so the
// form/module permission matrix never gains an APPROVAL column — APPROVAL is
// exposed only on the static-page matrix (see getPagePermissions).
const PAGE_ONLY_PERMISSIONS = [
  { id: "8", name: "APPROVAL", category: "SPECIAL", resource: "page" },
];

async function ensurePagePermissionsExist(): Promise<void> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) return;

  try {
    const organizationId = await getValidOrganizationId();
    for (const perm of PAGE_ONLY_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { id: perm.id },
        update: {},
        create: {
          id: perm.id,
          name: perm.name,
          category: perm.category as any,
          resource: perm.resource,
          organizationId,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await invalidatePermissionCache(perm.name).catch(() => {});
    }
  } catch (error) {
    console.error("[v0] Failed to ensure page permissions:", error);
  }
}

export async function getRolesWithUsers(): Promise<any[]> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) {
    return [];
  }

  try {
    const roles = await prisma.role.findMany({
      include: {
        userAssignments: {
          include: {
            user: true,
            unit: true,
          },
        },
      },
    });

    return roles.map((role: any) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      level: role.level,
      isActive: role.isActive,
      userCount: role.userAssignments.length,
      users: role.userAssignments.map((assignment: any) => ({
        id: assignment.user.id,
        first_name: assignment.user.first_name,
        last_name: assignment.user.last_name,
        email: assignment.user.email,
        department: assignment.user.department,
        location: assignment.user.location,
        status: assignment.user.status,
        unitAssignments: [
          {
            unitId: assignment.unitId,
            unit: { name: assignment.unit?.name || "Unknown Unit" },
            roleId: role.id,
          },
        ],
      })),
    }));
  } catch (error) {
    return [];
  }
}

export async function getUsers(): Promise<any[]> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) {
    return [];
  }

  try {
    const users = await prisma.user.findMany({
      include: {
        unitAssignments: {
          include: {
            unit: true,
            role: true,
          },
        },
      },
    });

    return users.map((user: any) => ({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      department: user.department,
      location: user.location,
      status: user.status,
      unitAssignments: user.unitAssignments.map((assignment: any) => ({
        unitId: assignment.unitId,
        unit: { name: assignment.unit?.name || "Unknown Unit" },
        roleId: assignment.roleId,
      })),
    }));
  } catch (error) {
    return [];
  }
}

export async function getPermissions(): Promise<any[]> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) {
    return [];
  }

  try {
    await ensureStandardPermissionsExist();

    const permissions = await prisma.permission.findMany({
      // Exclude page-only permissions (e.g. APPROVAL) so the form/module
      // matrix keeps its original 7 columns.
      where: { isActive: true, NOT: { name: { in: PAGE_ONLY_PERMISSIONS.map((p) => p.name) } } },
      orderBy: { name: "asc" },
    });

    return permissions.map(
      (p: {
        id: string;
        name: string;
        category: string;
        resource: string;
      }) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        resource: p.resource,
      })
    );
  } catch (error) {
    return [];
  }
}

// Permissions exposed on the STATIC-PAGE matrix: the standard 7 plus the
// page-only set (APPROVAL). Returned in a stable, human-friendly order.
const PAGE_PERMISSION_ORDER = [
  "VIEW", "CREATE", "EDIT", "DELETE", "IMPORT", "EXPORT", "PRINT", "APPROVAL",
];

export async function getPagePermissions(): Promise<any[]> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) return [];

  try {
    await ensureStandardPermissionsExist();
    await ensurePagePermissionsExist();

    const permissions = await prisma.permission.findMany({
      where: { isActive: true },
    });

    return permissions
      .map((p: { id: string; name: string; category: string; resource: string }) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        resource: p.resource,
      }))
      .filter((p) => PAGE_PERMISSION_ORDER.includes(p.name))
      .sort(
        (a, b) =>
          PAGE_PERMISSION_ORDER.indexOf(a.name) - PAGE_PERMISSION_ORDER.indexOf(b.name),
      );
  } catch (error) {
    return [];
  }
}

export async function getRolePermissions(
  roleId?: string
): Promise<any[]> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) {
    return [];
  }

  try {
    const where: any = {};
    if (roleId) {
      where.roleId = roleId;
    }

    const rolePermissions = await prisma.rolePermission.findMany({
      where,
      include: {
        role: true,
        permission: true,
        module: true,
      },
    });

    return rolePermissions.map((rp: any) => ({
      roleId: rp.roleId,
      permissionId: rp.permissionId,
      moduleId: rp.moduleId || "general",
      formId: rp.formId,
      granted: rp.granted,
      canDelegate: rp.canDelegate,
    }));
  } catch (error) {
    return [];
  }
}

export async function getUserPermissionOverrides(): Promise<any[]> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) {
    return [];
  }

  try {
    const overrides = await prisma.userPermissionOverride.findMany({
      include: {
        user: true,
        permission: true,
      },
    });

    return overrides.map((override: any) => ({
      userId: override.userId,
      permissionId: override.permissionId,
      moduleId: override.moduleId || "general",
      formId: override.formId || null,
      granted: override.granted,
      reason: override.reason,
      grantedBy: override.grantedBy,
      grantedAt: override.grantedAt,
      expiresAt: override.expiresAt,
      isActive: override.isActive,
    }));
  } catch (error) {
    return [];
  }
}

export async function getModulesWithForms(
  organizationId?: number,
  permittedModuleIds?: number[],
  directlyPermittedModuleIds?: Set<number>
): Promise<any[]> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) {
    return [];
  }

  try {
    const where: any = { isActive: true };
    if (organizationId !== undefined) {
      where.organizationId = organizationId;
    }
    if (permittedModuleIds && permittedModuleIds.length > 0) {
      where.id = { in: permittedModuleIds };
    }

    // Fetch every accessible module flat (any depth), then assemble the tree
    // via parentId. The previous implementation only fetched two levels, so
    // forms on grandchildren and deeper never reached the UI.
    const flat = await prisma.formModule.findMany({
      where,
      include: {
        forms: {
          select: {
            id: true,
            name: true,
            description: true,
            isEmployeeForm: true,
            isUserForm: true,
            moduleId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    type Node = {
      id: any;
      name: string;
      description: any;
      icon: any;
      color: any;
      parentId: any;
      level: number;
      sortOrder: number;
      forms: any[];
      children: Node[];
    };

    const byId = new Map<any, Node>();
    for (const m of flat as any[]) {
      const showForms =
        !directlyPermittedModuleIds ||
        directlyPermittedModuleIds.has(m.id);
      byId.set(m.id, {
        id: m.id,
        name: m.name,
        description: m.description,
        icon: m.icon,
        color: m.color,
        parentId: m.parentId ?? null,
        level: m.level,
        sortOrder: m.sortOrder ?? 0,
        forms: showForms ? m.forms || [] : [],
        children: [],
      });
    }

    const roots: Node[] = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        // Either a true top-level module, or one whose parent is not in the
        // permitted set — surface it as a root so the user can still see it.
        roots.push(node);
      }
    }

    const sortTree = (nodes: Node[]) => {
      nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      for (const n of nodes) sortTree(n.children);
    };
    sortTree(roots);

    return roots;
  } catch (error) {
    return [];
  }
}

// FIX: getModules now calls getModulesWithForms without required args (all are now optional)
export async function getModules(): Promise<any[]> {
  return await getModulesWithForms();
}

export async function updateRolePermissions(
  updates: RolePermissionUpdate[]
): Promise<boolean> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) return true;

  try {
    await ensureStandardPermissionsExist();

    // 1. BATCH LOAD ALL DATA
    const [roles, permissions, forms, modules] = await Promise.all([
      prisma.role.findMany({ select: { id: true } }),
      prisma.permission.findMany({ select: { id: true } }),
      prisma.form.findMany({ select: { id: true, moduleId: true } }),
      prisma.formModule.findMany({ select: { id: true } }),
    ]);

    const roleSet = new Set(roles.map((r) => r.id));
    const permSet = new Set(permissions.map((p) => p.id));
    const formModuleMap = new Map(forms.map((f) => [f.id, f.moduleId]));
    const moduleSet = new Set(modules.map((m) => m.id));

    // 2. PRE-VALIDATE ALL UPDATES
    const validUpdates: {
      roleId: string;
      permissionId: string;
      moduleId: string | null;
      formId: string | null;
      granted: boolean;
      canDelegate: boolean;
    }[] = [];

    for (const u of updates) {
      if (!u.roleId || !u.permissionId) continue;
      if (!roleSet.has(u.roleId)) continue;
      if (!permSet.has(u.permissionId)) continue;

      let moduleId: string | null = null;
      let formId: string | null = null;

      if (u.formId) {
        formId = u.formId;
        moduleId = formModuleMap.get(u.formId) || null;
        if (!moduleId) continue;
      } else if (u.moduleId) {
        const cleanId = u.moduleId.replace(/_self-perm$|_self$/, "");
        if (!moduleSet.has(cleanId)) continue;
        moduleId = cleanId;
      } else {
        continue;
      }

      validUpdates.push({
        roleId: u.roleId,
        permissionId: u.permissionId,
        moduleId,
        formId,
        granted: u.granted,
        canDelegate: u.canDelegate ?? false,
      });
    }

    if (validUpdates.length === 0) return true;

    // 3. ONE TRANSACTION, NO AWAITS IN LOOP
    // FIX: Use the correct Prisma compound unique key name.
    // Schema has: @@unique([roleId, permissionId, moduleId], map: "role_perm_module_unique")
    // The `map` name is for the DB constraint only. Prisma client uses the auto-generated
    // compound key: roleId_permissionId_moduleId
    await prisma.$transaction(
      async (tx) => {
        for (const u of validUpdates) {
          await tx.rolePermission.upsert({
            where: {
              roleId_permissionId_moduleId: {
                roleId: u.roleId,
                permissionId: u.permissionId,
                moduleId: u.moduleId!,
              },
            },
            update: {
              formId: u.formId,
              granted: u.granted,
              canDelegate: u.canDelegate,
            },
            create: {
              roleId: u.roleId,
              permissionId: u.permissionId,
              moduleId: u.moduleId!,
              formId: u.formId,
              sectionId: null,
              formFieldId: null,
              granted: u.granted,
              canDelegate: u.canDelegate,
            },
          });
        }
      },
      { timeout: 30000 }
    );

    return true;
  } catch (error) {
    console.error("[v0] Failed to update role permissions:", error);
    throw error;
  }
}

export async function updateUserPermissions(
  updates: UserPermissionUpdate[]
): Promise<boolean> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) return true;

  try {
    await ensureStandardPermissionsExist();

    // Validate existence by reading ONLY the ids the payload references —
    // not the whole users/permissions/forms/modules tables (which on a busy
    // multi-tenant DB is a needless full scan per save, and reads other orgs'
    // rows). Module ids carry an optional `_self`/`_self-perm` suffix that the
    // loop below strips, so normalize here too.
    const refUserIds = Array.from(
      new Set(updates.map((u) => u.userId).filter(Boolean) as string[])
    );
    const refPermIds = Array.from(
      new Set(updates.map((u) => u.permissionId).filter(Boolean) as string[])
    );
    const refFormIds = Array.from(
      new Set(updates.map((u) => u.formId).filter(Boolean) as string[])
    );
    const refModuleIds = Array.from(
      new Set(
        updates
          .map((u) => u.moduleId?.replace(/_self-perm$|_self$/, ""))
          .filter(Boolean) as string[]
      )
    );

    const [users, permissions, forms, modules] = await Promise.all([
      refUserIds.length
        ? prisma.user.findMany({ where: { id: { in: refUserIds } }, select: { id: true } })
        : Promise.resolve([] as { id: string }[]),
      refPermIds.length
        ? prisma.permission.findMany({ where: { id: { in: refPermIds } }, select: { id: true } })
        : Promise.resolve([] as { id: string }[]),
      refFormIds.length
        ? prisma.form.findMany({ where: { id: { in: refFormIds } }, select: { id: true, moduleId: true } })
        : Promise.resolve([] as { id: string; moduleId: string }[]),
      refModuleIds.length
        ? prisma.formModule.findMany({ where: { id: { in: refModuleIds } }, select: { id: true } })
        : Promise.resolve([] as { id: string }[]),
    ]);

    const userSet = new Set(users.map((u) => u.id));
    const permSet = new Set(permissions.map((p) => p.id));
    const formModuleMap = new Map(forms.map((f) => [f.id, f.moduleId]));
    const moduleSet = new Set(modules.map((m) => m.id));

    // FIX: Correct the type annotation (was broken intersection type)
    const validUpdates: Array<
      UserPermissionUpdate & {
        moduleId: string | null;
        formId: string | null;
        pagePath: string | null;
      }
    > = [];

    for (const u of updates) {
      if (!u.userId || !u.permissionId) continue;
      if (!userSet.has(u.userId)) continue;
      if (!permSet.has(u.permissionId)) continue;

      let moduleId: string | null = null;
      let formId: string | null = null;
      let pagePath: string | null = null;

      if (u.formId) {
        formId = u.formId;
        moduleId = formModuleMap.get(u.formId) || null;
        if (!moduleId) continue;
      } else if (u.moduleId) {
        const cleanId = u.moduleId.replace(/_self-perm$|_self$/, "");
        if (!moduleSet.has(cleanId)) continue;
        moduleId = cleanId;
      } else if (u.pagePath) {
        // Static-page override — no module/form scope.
        pagePath = u.pagePath;
      } else {
        continue;
      }

      validUpdates.push({ ...u, moduleId, formId, pagePath });
    }

    if (validUpdates.length === 0) return true;

    // ── Bulk write path ──────────────────────────────────────────────────--
    // The old implementation issued one `upsert` PER item inside the
    // transaction — 2N round-trips to a remote DB, which on a large bulk save
    // (e.g. dozens of per-user overrides) blew past the transaction timeout and
    // threw P2028. Instead we resolve everything with a FIXED number of
    // queries regardless of N:
    //   1 bulk read  →  partition into create / update-groups  →
    //   1 createMany + a handful of updateMany (grouped by identical data).
    //
    // Scope tuple — page-scoped rows key on pagePath; module/form rows key on
    // (moduleId, formId). The two never collide because the prefix differs.
    const tupleKey = (r: {
      userId: string;
      permissionId: string;
      moduleId: string | null;
      formId: string | null;
      pagePath: string | null;
    }) =>
      r.pagePath
        ? `p|${r.userId}|${r.permissionId}|${r.pagePath}`
        : `m|${r.userId}|${r.permissionId}|${r.moduleId ?? ""}|${r.formId ?? ""}`;

    // Dedup by scope tuple (last write wins) so one payload can't ask us to
    // both create and update the same row.
    const deduped = Array.from(
      new Map(validUpdates.map((u) => [tupleKey(u), u])).values()
    );

    // One read covers every row these (user, permission) pairs could touch —
    // including soft-deleted (isActive:false) rows so a re-grant reactivates
    // the existing row instead of hitting the unique constraint.
    const userIds = Array.from(new Set(deduped.map((u) => u.userId)));
    const permIds = Array.from(new Set(deduped.map((u) => u.permissionId)));
    const existingRows = await prisma.userPermission.findMany({
      where: { userId: { in: userIds }, permissionId: { in: permIds } },
      select: {
        id: true,
        userId: true,
        permissionId: true,
        moduleId: true,
        formId: true,
        pagePath: true,
      },
    });
    const existingIdByTuple = new Map(
      existingRows.map((r) => [tupleKey(r as any), r.id])
    );

    // Partition: brand-new rows (createMany) vs existing rows (updateMany).
    // Updates are grouped by an identical-data signature so each distinct
    // (granted, reason, grantedBy, expiresAt, isActive) combo is ONE updateMany
    // — in practice 1–2 groups, since the matrix only varies `granted`.
    const toCreate: any[] = [];
    const updateGroups = new Map<string, { data: any; ids: string[] }>();
    const now = new Date();
    for (const u of deduped) {
      const data = {
        granted: u.granted,
        reason: u.reason ?? "Manual override",
        grantedBy: u.grantedBy ?? null,
        expiresAt: u.expiresAt ?? null,
        isActive: u.isActive ?? true,
      };
      const existingId = existingIdByTuple.get(tupleKey(u));
      if (existingId) {
        const sig = JSON.stringify(data);
        const grp = updateGroups.get(sig);
        if (grp) grp.ids.push(existingId);
        else updateGroups.set(sig, { data, ids: [existingId] });
      } else {
        toCreate.push({
          userId: u.userId,
          permissionId: u.permissionId,
          moduleId: u.moduleId,
          formId: u.formId,
          pagePath: u.pagePath,
          grantedAt: now,
          ...data,
        });
      }
    }

    await prisma.$transaction(
      async (tx) => {
        if (toCreate.length > 0) {
          await tx.userPermission.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
        }
        for (const { data, ids } of updateGroups.values()) {
          await tx.userPermission.updateMany({
            where: { id: { in: ids } },
            data,
          });
        }
      },
      { timeout: 30000 }
    );

    return true;
  } catch (error) {
    console.error("[v0] Failed to update user permissions:", error);
    throw error;
  }
}

export async function getUserPermissions(userId?: string): Promise<any[]> {
  const isConnected = await isDatabaseConnected();
  if (!isConnected) {
    return [];
  }

  try {
    const where: any = { isActive: true };
    if (userId) {
      where.userId = userId;
    }

    const userPermissions = await prisma.userPermission.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
        permission: {
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            resource: true,
          },
        },
        module: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: [
        { user: { first_name: "asc" } },
        { permission: { name: "asc" } },
      ],
    });

    return userPermissions.map((up: any) => ({
      userId: up.userId,
      permissionId: up.permissionId,
      moduleId: up.moduleId,
      formId: up.formId,
      pagePath: up.pagePath,
      resourceType: up.resourceType,
      resourceId: up.resourceId,
      canView: up.canView,
      canCreate: up.canCreate,
      canEdit: up.canEdit,
      canDelete: up.canDelete,
      granted: up.granted,
      reason: up.reason,
      grantedBy: up.grantedBy,
      grantedAt: up.grantedAt,
      expiresAt: up.expiresAt,
      isActive: up.isActive,
      user: up.user,
      permission: up.permission,
      module: up.module,
    }));
  } catch (error) {
    return [];
  }
}
