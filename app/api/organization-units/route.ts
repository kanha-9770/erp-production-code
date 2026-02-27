// app/api/organization-units/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth"; // ← your session validation helper (adjust import if name is different)

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. Get auth token from cookies (adjust cookie name if different)
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "No authentication token provided" },
        { status: 401 }
      );
    }

    // 2. Validate session and get user
    const session = await validateSession(token);
    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    // 3. Extract organization ID from session/user
    const organizationId =
      session.user.organizationId ||
      session.user.orgId ||
      session.user.tenantId ||
      session.user.organization?.id;

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "User is not associated with any organization" },
        { status: 403 }
      );
    }

    // 4. Fetch active organization units for this organization
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

    // 5. Optional: simple flatten + hierarchy info for frontend dropdown
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