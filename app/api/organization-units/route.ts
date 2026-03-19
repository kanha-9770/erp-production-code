// app/api/organization-units/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate user
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // 2. Extract organization ID from authUser
    const organizationId = authUser.organizationId;

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "User is not associated with any organization" },
        { status: 403 }
      );
    }

    // 3. Fetch active organization units for this organization
    const units = await prisma.organizationUnit.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        level: true,
        parentId: true,
        sortOrder: true,
        // Optional: include children or roles/users if needed later
        // children: { select: { id: true, name: true } },
        // unitRoles: { select: { role: { select: { id: true, name: true } } } },
      },
      orderBy: [
        { level: "asc" },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });

    // 4. Optional: simple flatten + hierarchy info for frontend dropdown
    // (you can also move this logic to frontend if preferred)
    const unitsForDropdown = units.map(unit => ({
      id: unit.id,
      name: unit.name,
      level: unit.level,
      parentId: unit.parentId,
      description: unit.description || undefined,
    }));

    return NextResponse.json({
      success: true,
      data: unitsForDropdown,
      count: unitsForDropdown.length,
      organizationId,
    }, { status: 200 });

  } catch (error) {
    console.error("[GET /api/organization-units] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch organization units",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
