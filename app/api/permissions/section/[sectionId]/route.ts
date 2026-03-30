import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { sectionId: string } }
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sectionId } = params;
    console.log("[SectionPerm GET] sectionId:", sectionId);

    if (!sectionId) {
      return NextResponse.json({ error: "Section ID is required" }, { status: 400 });
    }

    // Verify section exists (check both FormSection and Subform tables)
    const [sectionExists, subformExists] = await Promise.all([
      prisma.formSection.findUnique({ where: { id: sectionId } }),
      prisma.subform.findUnique({ where: { id: sectionId } }).catch(() => null),
    ]);

    const resourceExists = sectionExists || subformExists;
    console.log("[SectionPerm GET] section found:", !!sectionExists, "subform found:", !!subformExists);

    if (!resourceExists) {
      // Not a section or subform — return empty profiles so the caller
      // treats it as "no restrictions" rather than an error
      console.log("[SectionPerm GET] Section/subform not found:", sectionId, "— returning empty profiles");
      return NextResponse.json({ profiles: [], availablePermissions: [] });
    }

    // Get all roles for this organization
    const allRoles = await prisma.role.findMany({
      where: { organizationId: authUser.organizationId! },
      orderBy: { sortOrder: "asc" },
    });

    // Filter to active, non-admin roles
    const roles = allRoles.filter((r) => r.isActive && !r.isAdmin);

    // Fetch section-level assignments (formFieldId IS null) and
    // field-level assignments (formFieldId IS NOT null) in parallel
    const [sectionAssignments, fieldAssignments, availablePerms] = await Promise.all([
      prisma.rolePermission.findMany({
        where: { sectionId, formFieldId: null, granted: true },
        include: { permission: { select: { id: true, name: true, category: true } } },
      }),
      prisma.rolePermission.findMany({
        where: { sectionId, formFieldId: { not: null }, granted: true },
        include: { permission: { select: { id: true, name: true, category: true } } },
      }),
      prisma.permission.findMany({
        select: { id: true, name: true, category: true },
      }),
    ]);

    console.log("[SectionPerm GET] roles:", roles.length,
      "sectionAssignments:", sectionAssignments.length,
      "fieldAssignments:", fieldAssignments.length);

    // Build profiles with section permissions AND field permissions per role
    const profiles = roles.map((role) => {
      // Section-level permissions for this role
      const roleSectionAssigns = sectionAssignments.filter((a: any) => a.roleId === role.id);
      const firstAssigned = roleSectionAssigns[0] as any;
      const permissionNames = roleSectionAssigns.map(
        (a: any) => a.permission?.name || a.permissionId
      );

      // Field-level permissions for this role: { fieldId: permissionName }
      const roleFieldAssigns = fieldAssignments.filter((a: any) => a.roleId === role.id);
      const fieldPermissions: Record<string, string> = {};
      roleFieldAssigns.forEach((a: any) => {
        if (a.formFieldId) {
          fieldPermissions[a.formFieldId] = a.permission?.name || a.permissionId;
        }
      });

      return {
        id: role.id,
        name: role.name,
        permission: firstAssigned?.permissionId || "NONE",
        permissions: permissionNames,
        fieldPermissions,
      };
    });

    console.log("[SectionPerm GET] profiles:", JSON.stringify(profiles.map(p => ({
      role: p.name, perms: p.permissions, fields: p.fieldPermissions,
    }))));

    return NextResponse.json({ profiles, availablePermissions: availablePerms });
  } catch (error: any) {
    console.error("[SectionPerm GET Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error?.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: { sectionId: string } }
) {
  return POST(request, context);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { sectionId: string } }
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      console.error("[Section Permissions POST] User not authenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { roleId, permissionId } = await request.json();
    const { sectionId } = params;

    console.log("[Section Permissions POST] sectionId:", sectionId, "roleId:", roleId, "permissionId:", permissionId);

    if (!roleId || !sectionId) {
      return NextResponse.json({ error: "Role ID and Section ID are required" }, { status: 400 });
    }

    // 1. Verify section exists
    const sectionExists = await prisma.formSection.findUnique({
      where: { id: sectionId },
    });

    console.log("[Section Permissions POST] section found:", !!sectionExists);

    if (!sectionExists) {
      console.error("[Section Permissions POST] Section not found:", sectionId);
      return NextResponse.json({ error: "Section not found", sectionId }, { status: 404 });
    }

    // 2. Verify role exists
    const roleExists = await prisma.role.findUnique({
      where: { id: roleId },
    });

    console.log("[Section Permissions POST] role found:", !!roleExists);

    if (!roleExists) {
      console.error("[Section Permissions POST] Role not found:", roleId);
      return NextResponse.json({ error: "Role not found", roleId }, { status: 404 });
    }

    // 3. Verify permission exists
    if (permissionId !== "NONE") {
      const permissionExists = await prisma.permission.findUnique({
        where: { id: permissionId },
      });

      console.log("[Section Permissions POST] permission found:", !!permissionExists);

      if (!permissionExists) {
        console.error("[Section Permissions POST] Permission not found:", permissionId);
        return NextResponse.json({ error: "Permission not found", permissionId }, { status: 404 });
      }
    }

    // 4. Update permission
    await prisma.$transaction(async (tx) => {
      // Delete existing section-level record
      await tx.rolePermission.deleteMany({
        where: {
          roleId,
          sectionId,
          formFieldId: null,
        },
      });

      // Create new permission if not NONE
      if (permissionId !== "NONE") {
        await tx.rolePermission.create({
          data: {
            roleId,
            permissionId,
            granted: true,
            sectionId,
            formFieldId: null,
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Section Permissions POST Error]:", error);
    return NextResponse.json(
      { error: "Failed to save section permission", details: error?.message },
      { status: 500 }
    );
  }
}
   