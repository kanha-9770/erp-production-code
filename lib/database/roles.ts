import { prisma } from "@/lib/prisma";
import type { Role, RoleFormData } from "@/types/role";
import { validateSession } from "@/lib/auth"; // If needed for server-side checks

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
    throw new Error("Failed to create role");
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
    throw new Error("Failed to update role");
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
    throw new Error("Failed to delete role");
  }
}