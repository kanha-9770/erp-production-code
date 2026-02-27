// // /api/permissions/field/[fieldId]/route.ts

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: any }
) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    const session = await validateSession(token || "");

    if (!session?.user?.organization?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ROBUST PARAM EXTRACTION
    const resolvedParams = await params;
    console.log("[Field Permissions GET] Received params:", resolvedParams);
    const fieldId = resolvedParams?.resourceId || resolvedParams?.id || resolvedParams?.fieldId;
    console.log("[Field Permissions GET] Resolved fieldId:", fieldId, "from params:", resolvedParams);
    if (!fieldId) {
      console.error("[Field Permissions GET] Missing fieldId in params:", resolvedParams);
      return NextResponse.json({ error: "Field ID is required" }, { status: 400 });
    }

    // 1. Fetch field metadata
    const fieldMetadata = await prisma.formField.findUnique({
      where: { id: fieldId },
      select: { sectionId: true, subformId: true },
    });

    if (!fieldMetadata) {
      return NextResponse.json({ error: "Field not found in database" }, { status: 404 });
    }

    // 2. Determine internal URL dynamically
    const { protocol, host } = request.nextUrl;
    const internalApiUrl = `${protocol}/${host}/api/permissions`;

    // 3. Fetch Data in Parallel
    const [roles, fieldOverrides, sectionPermissions, permissionsRes] = await Promise.all([
      prisma.role.findMany({
        where: {
          organizationId: session.user.organization.id,
          isActive: true,
          isAdmin: false,
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.rolePermission.findMany({
        where: { formFieldId: fieldId, granted: true },
      }),
      fieldMetadata.sectionId
        ? prisma.rolePermission.findMany({
          where: { sectionId: fieldMetadata.sectionId, formFieldId: null, granted: true },
        })
        : Promise.resolve([]),
      fetch(internalApiUrl, {
        headers: { cookie: `auth-token=${token}` },
        cache: "no-store",
      })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .catch((err) => {
          console.warn("Internal permissions fetch failed, using fallback:", err.message);
          return { data: [] };
        }),
    ]);

    const availablePermissions = permissionsRes.data || [];

    // 4. Map profiles
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

    return NextResponse.json({ profiles, availablePermissions });
  } catch (error: any) {
    console.error("[Field Permissions GET Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: any }
) {
  try {
    const { roleId, permissionId } = await request.json();

    const resolvedParams = await params;
    const fieldId = resolvedParams?.resourceId || resolvedParams?.id || resolvedParams?.fieldId;

    if (!fieldId) {
      return NextResponse.json({ error: "Field ID is required" }, { status: 400 });
    }

    // Fetch field with safe includes (removed invalid subform.section)
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
            // Removed invalid 'section' relation
            // If your Subform model has sectionId (scalar), you can use it below
            // sectionId: true,   // ← uncomment if exists in schema
            // formId: true,      // ← uncomment if exists
          },
        },
      },
    });

    if (!fieldData) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }

    // Safely extract context (works whether field is in section or subform)
    const sectionId =
      fieldData.section?.id ||
      // If subform has sectionId scalar field (common pattern)
      // fieldData.subform?.sectionId ||
      null;

    const formId =
      fieldData.section?.form?.id ||
      // fieldData.subform?.formId ||   // ← uncomment if exists
      null;

    const moduleId =
      fieldData.section?.form?.moduleId ||
      // fieldData.subform?.section?.form?.moduleId ||   // only if relation added later
      null;

    await prisma.$transaction(async (tx) => {
      // Delete any existing permission for this role + field
      await tx.rolePermission.deleteMany({
        where: {
          roleId,
          formFieldId: fieldId,
        },
      });

      // Only create if not "NONE"
      if (permissionId !== "NONE") {
        await tx.rolePermission.create({
          data: {
            roleId,
            permissionId,
            granted: true,
            formFieldId: fieldId,
            sectionId: sectionId || null,
            formId: formId || null,
            moduleId: moduleId || null,
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Field Permissions POST Error]:", error);
    return NextResponse.json(
      {
        error: "Failed to update",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}