// // /api/permissions/field/[fieldId]/route.ts

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: any }
) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      console.error("[Permissions GET] User not authenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ROBUST PARAM EXTRACTION
    const resolvedParams = await params;
    const resourceType = resolvedParams?.resourceType;
    const resourceId = resolvedParams?.resourceId || resolvedParams?.id || resolvedParams?.fieldId;

    console.log("[Permissions GET] resourceType:", resourceType, "resourceId:", resourceId);

    if (!resourceId) {
      console.error("[Permissions GET] Missing resourceId in params:", resolvedParams);
      return NextResponse.json({ error: "Resource ID is required" }, { status: 400 });
    }

    // Handle different resource types
    if (resourceType === "field") {
      return await handleFieldPermissions(authUser, resourceId);
    }

    // Fallback: treat as field ID (legacy behavior)
    return await handleFieldPermissions(authUser, resourceId);
  } catch (error: any) {
    console.error("[Permissions GET Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error?.message },
      { status: 500 }
    );
  }
}

async function handleFieldPermissions(authUser: any, fieldId: string) {
  console.log("[handleFieldPermissions] fieldId:", fieldId);

  // 1. Fetch field metadata with more details
  const fieldMetadata = await prisma.formField.findUnique({
    where: { id: fieldId },
    select: { sectionId: true, subformId: true, label: true },
  });

  console.log("[handleFieldPermissions] fieldMetadata:", fieldMetadata);

  if (!fieldMetadata) {
    console.error("[handleFieldPermissions] Field not found in database:", fieldId);
    // Check if ANY field exists to help debug
    const fieldCount = await prisma.formField.count();
    console.log("[handleFieldPermissions] Total fields in database:", fieldCount);
    return NextResponse.json(
      { error: "Field not found in database", fieldId, totalFieldsInDB: fieldCount },
      { status: 404 }
    );
  }

  // 2. Fetch Data in Parallel
  // First get ALL roles to debug
  const allRoles = await prisma.role.findMany({
    where: {
      organizationId: authUser.organizationId,
    },
    orderBy: { sortOrder: "asc" },
  });

  console.log("[handleFieldPermissions] All roles in org:", allRoles.length);
  allRoles.forEach((r) => {
    console.log("[handleFieldPermissions] Role:", r.id, r.name, "isActive:", r.isActive, "isAdmin:", r.isAdmin);
  });

  // Filter to active, non-admin roles
  const roles = allRoles.filter((r) => r.isActive && !r.isAdmin);
  console.log("[handleFieldPermissions] Filtered roles (active, non-admin):", roles.length);

  const [fieldOverrides, sectionPermissions, permissionsRes] = await Promise.all([
    prisma.rolePermission.findMany({
      where: { formFieldId: fieldId, granted: true },
    }),
    fieldMetadata.sectionId
      ? prisma.rolePermission.findMany({
          where: { sectionId: fieldMetadata.sectionId, formFieldId: null, granted: true },
        })
      : Promise.resolve([]),
    fetch("http://localhost:3000/api/permissions", {
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .catch(() => ({ data: [] })),
  ]);

  console.log("[handleFieldPermissions] roles:", roles.length, "fieldOverrides:", fieldOverrides.length);

  const availablePermissions = permissionsRes.data || [];

  // 3. Map profiles
  const profiles = roles.map((role) => {
    const fieldSpecific = fieldOverrides.find((a) => a.roleId === role.id);
    const sectionDefault = sectionPermissions.find((a) => a.roleId === role.id);

    return {
      id: role.id,
      name: role.name,
      permission: fieldSpecific?.permissionId || "NONE",
      inheritedPermission: sectionDefault?.permissionId || "NONE",
    };
  });

  console.log("[handleFieldPermissions] profiles:", profiles);
  return NextResponse.json({ profiles, availablePermissions });
}

export async function PUT(
  request: NextRequest,
  context: { params: any }
) {
  return POST(request, context);
}

export async function POST(
  request: NextRequest,
  { params }: { params: any }
) {
  try {
    const { roleId, permissionId } = await request.json();

    const resolvedParams = await params;
    const resourceType = resolvedParams?.resourceType;
    const fieldId = resolvedParams?.resourceId || resolvedParams?.id || resolvedParams?.fieldId;

    console.log("[Permissions POST] resourceType:", resourceType, "fieldId:", fieldId, "roleId:", roleId, "permissionId:", permissionId);

    if (!fieldId || !roleId) {
      return NextResponse.json({ error: "Field ID and Role ID are required" }, { status: 400 });
    }

    // 1. Verify field exists
    const fieldData = await prisma.formField.findUnique({
      where: { id: fieldId },
      include: {
        section: {
          select: {
            id: true,
            form: {
              select: { id: true, moduleId: true },
            },
          },
        },
        subform: {
          select: {
            id: true,
          },
        },
      },
    });

    console.log("[Permissions POST] fieldData found:", !!fieldData);

    if (!fieldData) {
      console.error("[Permissions POST] Field not found:", fieldId);
      const fieldCount = await prisma.formField.count();
      console.log("[Permissions POST] Total fields in database:", fieldCount);
      return NextResponse.json({ error: "Field not found", fieldId, totalFieldsInDB: fieldCount }, { status: 404 });
    }

    // 2. Verify role exists
    const roleExists = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, isActive: true, isAdmin: true, organizationId: true },
    });

    console.log("[Permissions POST] role found:", !!roleExists);
    if (roleExists) {
      console.log("[Permissions POST] role details:", {
        id: roleExists.id,
        name: roleExists.name,
        isActive: roleExists.isActive,
        isAdmin: roleExists.isAdmin,
        organizationId: roleExists.organizationId,
        userOrgId: authUser.organizationId,
      });
    }

    if (!roleExists) {
      console.error("[Permissions POST] Role not found:", roleId);
      const allRoles = await prisma.role.findMany({
        select: { id: true, name: true, organizationId: true, isActive: true, isAdmin: true },
      });
      console.log("[Permissions POST] All roles in database:", allRoles);
      return NextResponse.json({
        error: "Role not found",
        roleId,
        allRolesCount: allRoles.length,
        allRoles: allRoles,
      }, { status: 404 });
    }

    // 3. Verify permission exists (if not NONE)
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

    // 4. Extract context safely
    const sectionId = fieldData.section?.id || null;
    const formId = fieldData.section?.form?.id || null;
    const moduleId = fieldData.section?.form?.moduleId || null;

    console.log("[Permissions POST] context - sectionId:", sectionId, "formId:", formId, "moduleId:", moduleId);

    // 5. Update permission
    await prisma.$transaction(async (tx) => {
      // Delete any existing permission for this role + field
      await tx.rolePermission.deleteMany({
        where: {
          roleId,
          formFieldId: fieldId,
        },
      });

      console.log("[Permissions POST] Deleted old permissions");

      // Only create if not "NONE"
      if (permissionId !== "NONE") {
        const created = await tx.rolePermission.create({
          data: {
            roleId,
            permissionId,
            granted: true,
            formFieldId: fieldId,
            sectionId: sectionId,
            formId: formId,
            moduleId: moduleId,
          },
        });
        console.log("[Permissions POST] Created permission:", created.id);
      }
    });

    console.log("[Permissions POST] Success");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Permissions POST Error]:", error);
    return NextResponse.json(
      {
        error: "Failed to update",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}