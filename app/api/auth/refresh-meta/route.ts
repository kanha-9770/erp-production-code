import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { computeRouteMeta } from "@/lib/auth/route-meta";

/**
 * POST /api/auth/refresh-meta
 *
 * Re-computes the auth-meta cookie (isAdmin, roleNames, deniedRoutes)
 * from the current DB state. Call this after route permissions are updated
 * so the middleware picks up the changes without requiring re-login.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await validateSession(token);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const userId = session.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        organizationId: true,
        unitAssignments: {
          select: {
            role: { select: { id: true, name: true, isAdmin: true } },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isAdmin =
      user.unitAssignments?.some(
        (ua) => ua.role.isAdmin || ua.role.name.toUpperCase() === "ADMIN"
      ) ?? false;
    const roleNames = user.unitAssignments?.map((ua) => ua.role.name) ?? [];
    const roleIds = user.unitAssignments?.map((ua) => ua.role.id) ?? [];

    const { deniedRoutes, allowedRoutes } = isAdmin
      ? { deniedRoutes: [], allowedRoutes: [] }
      : await computeRouteMeta(userId, user.organizationId, roleIds);

    const response = NextResponse.json({ success: true });

    response.cookies.set(
      "auth-meta",
      JSON.stringify({ isAdmin, roleNames, deniedRoutes, allowedRoutes }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      }
    );

    console.log(
      `[refresh-meta] auth-meta refreshed for user=${userId} isAdmin=${isAdmin} roles=[${roleNames}] allowed=[${allowedRoutes}] denied=[${deniedRoutes}]`
    );

    return response;
  } catch (error) {
    console.error("Refresh meta error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
