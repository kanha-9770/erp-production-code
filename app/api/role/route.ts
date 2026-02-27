export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    console.log("[GET /api/roles] Starting request");

    // 1. Authenticate user
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      console.warn("[GET /api/roles] No auth token provided");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await validateSession(token);
    if (!session || !session.user) {
      console.warn("[GET /api/roles] Invalid session");
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // 2. Get current user's organization
    const organizationId =
      session.user?.organizationId ||
      session.user?.organization?.id ||
      session.user?.orgId ||
      session.user?.tenantId;

    console.log("[GET /api/roles] Session user:", {
      userId: session.user.id,
      email: session.user.email,
      organizationId: organizationId || "MISSING"
    });

    if (!organizationId) {
      console.warn("[GET /api/roles] No organizationId found in session");
      return NextResponse.json(
        { error: "User is not associated with any organization" },
        { status: 403 }
      );
    }

    // 3. Fetch ONLY roles from this organization
    const roles = await prisma.role.findMany({
      where: {
        organizationId,           // ← This line fixes the leak
        isActive: true,
      },
      include: {
        userAssignments: {
          select: {
            userId: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
          },
        },
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { level: "asc" },
        { name: "asc" },
      ],
    });

    // Optional: enrich with user count
    const rolesWithCount = roles.map(role => ({
      ...role,
      userCount: role.userAssignments.length,
    }));

    console.log(
      `[GET /api/roles] Successfully retrieved ${rolesWithCount.length} roles ` +
      `for organization ${organizationId}`
    );

    return NextResponse.json({
      success: true,
      data: rolesWithCount,
      meta: {
        count: rolesWithCount.length,
        organizationId,
      },
    });
  } catch (error) {
    console.error("[GET /api/roles] Failed to fetch roles:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch roles",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}