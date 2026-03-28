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
      console.error("[Section Permissions GET] User not authenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sectionId } = params;
    console.log("[Section Permissions GET] sectionId:", sectionId);

    if (!sectionId) {
      return NextResponse.json({ error: "Section ID is required" }, { status: 400 });
    }

    // Verify section exists
    const sectionExists = await prisma.formSection.findUnique({
      where: { id: sectionId },
    });

    console.log("[Section Permissions GET] section found:", !!sectionExists);

    if (!sectionExists) {
      console.error("[Section Permissions GET] Section not found:", sectionId);
      const sectionCount = await prisma.formSection.count();
      console.log("[Section Permissions GET] Total sections in database:", sectionCount);
      return NextResponse.json({ error: "Section not found", sectionId, totalSectionsInDB: sectionCount }, { status: 404 });
    }

    const { protocol, host } = request.nextUrl;
    const internalApiUrl = `${protocol}//${host}/api/permissions`;

    // First get ALL roles to debug
    const allRoles = await prisma.role.findMany({
      where: {
        organizationId: authUser.organizationId,
      },
      orderBy: { sortOrder: "asc" },
    });

    console.log("[Section Permissions GET] All roles in org:", allRoles.length);
    allRoles.forEach((r) => {
      console.log("[Section Permissions GET] Role:", r.id, r.name, "isActive:", r.isActive, "isAdmin:", r.isAdmin);
    });

    // Filter to active, non-admin roles
    const roles = allRoles.filter((r) => r.isActive && !r.isAdmin);
    console.log("[Section Permissions GET] Filtered roles (active, non-admin):", roles.length);

    const [assignments, permissionsRes] = await Promise.all([
      prisma.rolePermission.findMany({
        // TARGET ONLY SECTION: formFieldId MUST be null
        where: { sectionId: sectionId, formFieldId: null, granted: true },
        include: { permission: { select: { id: true, name: true, category: true } } },
      }),
      fetch(internalApiUrl, {
        headers: {
          cookie: request.headers.get("cookie") || "",
          "Content-Type": "application/json",
        },
        cache: "no-store",
      })
        .then((res) => (res.ok ? res.json() : { data: [] }))
        .catch(() => ({ data: [] })),
    ]);

    console.log("[Section Permissions GET] roles:", roles.length, "assignments:", assignments.length);

    const availablePermissions = permissionsRes.data || [];

    const profiles = roles.map((role) => {
      const roleAssignments = assignments.filter((a: any) => a.roleId === role.id);
      const firstAssigned = roleAssignments[0] as any;
      const permissionNames = roleAssignments.map(
        (a: any) => a.permission?.name || a.permissionId
      );
      return {
        id: role.id,
        name: role.name,
        permission: firstAssigned?.permissionId || "NONE",
        permissions: permissionNames.length > 0 ? permissionNames : ["NONE"],
      };
    });

    console.log("[Section Permissions GET] profiles:", profiles);
    return NextResponse.json({ profiles, availablePermissions });
  } catch (error: any) {
    console.error("[Section Permissions GET Error]:", error);
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
   