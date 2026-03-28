import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { resourceType: string; resourceId: string } }
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      console.error("[Permissions GET] User not authenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { resourceType, resourceId } = params;
    console.log("[Permissions GET] resourceType:", resourceType, "resourceId:", resourceId);

    if (!resourceId) {
      return NextResponse.json({ error: "Resource ID is required" }, { status: 400 });
    }

    // Get all roles in organization
    const allRoles = await prisma.role.findMany({
      where: { organizationId: authUser.organizationId },
      orderBy: { sortOrder: "asc" },
    });

    console.log("[Permissions GET] All roles:", allRoles.length);
    allRoles.forEach((r) => {
      console.log("[Permissions GET] Role:", r.id, r.name, "isActive:", r.isActive, "isAdmin:", r.isAdmin);
    });

    // Filter to active, non-admin roles
    const roles = allRoles.filter((r) => r.isActive && !r.isAdmin);
    console.log("[Permissions GET] Filtered roles (active, non-admin):", roles.length);

    // Get assignments based on resource type (include permission details)
    let assignments: any[] = [];

    if (resourceType === "field") {
      assignments = await prisma.rolePermission.findMany({
        where: { formFieldId: resourceId, granted: true },
        include: { permission: { select: { id: true, name: true, category: true } } },
      });
      console.log("[Permissions GET] Field assignments:", assignments.length);
    } else if (resourceType === "section" || resourceType === "sections") {
      assignments = await prisma.rolePermission.findMany({
        where: { sectionId: resourceId, formFieldId: null, granted: true },
        include: { permission: { select: { id: true, name: true, category: true } } },
      });
      console.log("[Permissions GET] Section assignments:", assignments.length);
    }

    // Get available permissions
    const availablePermissions = await prisma.permission.findMany({
      select: { id: true, name: true, category: true },
    });

    console.log("[Permissions GET] Available permissions:", availablePermissions.length);

    // Map profiles — return ALL granted permissions per role (not just the first)
    const profiles = roles.map((role) => {
      const roleAssignments = assignments.filter((a) => a.roleId === role.id);
      const firstAssigned = roleAssignments[0];
      // `permissions` is an array of all granted permission names.
      // Empty array [] means "no section permissions configured" (inherit form-level).
      const permissionNames = roleAssignments.map(
        (a) => a.permission?.name || a.permissionId
      );
      return {
        id: role.id,
        name: role.name,
        permission: firstAssigned?.permissionId || "NONE",
        permissions: permissionNames,
      };
    });

    console.log("[Permissions GET] Profiles:", profiles);
    return NextResponse.json({ profiles, availablePermissions });
  } catch (error: any) {
    console.error("[Permissions GET Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error?.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: any }
) {
  return POST(request, context);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { resourceType: string; resourceId: string } }
) {
  try {
    const { roleId, permissionId } = await request.json();
    const { resourceType, resourceId } = params;

    console.log("[Permissions POST] resourceType:", resourceType, "resourceId:", resourceId, "roleId:", roleId, "permissionId:", permissionId);

    if (!resourceId || !roleId) {
      return NextResponse.json({ error: "Resource ID and Role ID are required" }, { status: 400 });
    }

    // 1. Verify role exists
    const roleExists = await prisma.role.findUnique({
      where: { id: roleId },
    });

    console.log("[Permissions POST] role found:", !!roleExists);

    if (!roleExists) {
      console.error("[Permissions POST] Role not found:", roleId);
      return NextResponse.json({ error: "Role not found", roleId }, { status: 404 });
    }

    // 2. Verify permission exists (if not NONE)
    if (permissionId !== "NONE") {
      const permExists = await prisma.permission.findUnique({
        where: { id: permissionId },
      });

      console.log("[Permissions POST] permission found:", !!permExists);

      if (!permExists) {
        console.error("[Permissions POST] Permission not found:", permissionId);
        return NextResponse.json({ error: "Permission not found", permissionId }, { status: 404 });
      }
    }

    // 3. Update permission based on resource type
    await prisma.$transaction(async (tx) => {
      if (resourceType === "field") {
        // For fields: delete and recreate field-level permission
        await tx.rolePermission.deleteMany({
          where: {
            roleId,
            formFieldId: resourceId,
          },
        });

        if (permissionId !== "NONE") {
          await tx.rolePermission.create({
            data: {
              roleId,
              permissionId,
              granted: true,
              formFieldId: resourceId,
            },
          });
          console.log("[Permissions POST] Created field permission");
        }
      } else if (resourceType === "section") {
        // For sections: delete and recreate section-level permission (formFieldId must be null)
        await tx.rolePermission.deleteMany({
          where: {
            roleId,
            sectionId: resourceId,
            formFieldId: null,
          },
        });

        if (permissionId !== "NONE") {
          await tx.rolePermission.create({
            data: {
              roleId,
              permissionId,
              granted: true,
              sectionId: resourceId,
              formFieldId: null,
            },
          });
          console.log("[Permissions POST] Created section permission");
        }
      }
    });

    console.log("[Permissions POST] Success");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Permissions POST Error]:", error);
    return NextResponse.json(
      { error: "Failed to update", details: error?.message },
      { status: 500 }
    );
  }
}