import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { sectionId: string } }
) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    const session = await validateSession(token || "");
    if (!session?.user?.organization?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sectionId } = params;

    const [roles, assignments, permissionsRes] = await Promise.all([
      prisma.role.findMany({
        where: {
          organizationId: session.user.organization.id,
          isActive: true,
          isAdmin: false,
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.rolePermission.findMany({
        // TARGET ONLY SECTION: formFieldId MUST be null
        where: { sectionId: sectionId, formFieldId: null, granted: true },
      }),
      fetch("http://localhost:5001/api/permissions", {
        headers: {
          cookie: `auth-token=${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }).then((res) => res.json()),
    ]);

    const availablePermissions = permissionsRes.data || [];

    const profiles = roles.map((role) => {
      const assigned = assignments.find((a) => a.roleId === role.id);
      return {
        id: role.id,
        name: role.name,
        permission: assigned?.permissionId || "NONE",
      };
    });

    return NextResponse.json({ profiles, availablePermissions });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { sectionId: string } }
) {
  try {
    const { roleId, permissionId } = await request.json();
    const { sectionId } = params;

    await prisma.$transaction(async (tx) => {
      // 1. DELETE ONLY the Section-level record.
      // We check formFieldId: null so we do NOT wipe out field overrides.
      await tx.rolePermission.deleteMany({
        where: {
          roleId,
          sectionId,
          formFieldId: null,
        },
      });

      // 2. CREATE Section record if not NONE
      if (permissionId !== "NONE") {
        await tx.rolePermission.create({
          data: {
            roleId,
            permissionId,
            granted: true,
            sectionId,
            formFieldId: null, // Explicitly null for section level
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
   