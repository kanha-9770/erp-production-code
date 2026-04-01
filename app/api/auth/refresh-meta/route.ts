import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { computeRouteMeta } from "@/lib/auth/route-meta";

/**
 * Shared: fetch user roles and compute the full auth-meta payload.
 * Returns null if session/user is invalid.
 */
async function buildAuthMeta(token: string) {
  const session = await validateSession(token);
  if (!session) return null;

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

  if (!user) return null;

  const isAdmin =
    user.unitAssignments?.some(
      (ua) => ua.role.isAdmin || ua.role.name.toUpperCase() === "ADMIN"
    ) ?? false;
  const roleNames = user.unitAssignments?.map((ua) => ua.role.name) ?? [];
  const roleIds = user.unitAssignments?.map((ua) => ua.role.id) ?? [];

  // Admin gets full access — skip DB queries
  if (isAdmin) {
    return { v: 2, isAdmin: true, roleNames, deniedRoutes: [], allowedRoutes: [], allowedModuleIds: [] };
  }

  const { deniedRoutes, allowedRoutes, allowedModuleIds } = await computeRouteMeta(
    userId,
    user.organizationId,
    roleIds
  );

  return { v: 2, isAdmin, roleNames, deniedRoutes, allowedRoutes, allowedModuleIds };
}

/** Set the auth-meta cookie on a response */
function setAuthMetaCookie(
  response: NextResponse,
  meta: {
    isAdmin: boolean;
    roleNames: string[];
    deniedRoutes: string[];
    allowedRoutes: string[];
    allowedModuleIds: string[];
  }
) {
  response.cookies.set("auth-meta", JSON.stringify(meta), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
}

/**
 * GET /api/auth/refresh-meta?callbackUrl=/some-page
 *
 * Called by middleware when auth-meta cookie is missing or invalid.
 * Computes the cookie from DB, sets it, and redirects back.
 */
export async function GET(request: NextRequest) {
  try {
    const callbackUrl =
      new URL(request.url).searchParams.get("callbackUrl") || "/";

    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const meta = await buildAuthMeta(token);
    if (!meta) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", callbackUrl);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete("auth-token");
      response.cookies.delete("auth-meta");
      return response;
    }

    const response = NextResponse.redirect(new URL(callbackUrl, request.url));
    setAuthMetaCookie(response, meta);

    console.log(
      `[refresh-meta/GET] set cookie isAdmin=${meta.isAdmin} roles=[${meta.roleNames}] allowedModules=${meta.allowedModuleIds.length} denied=${meta.deniedRoutes.length}`
    );

    return response;
  } catch (error) {
    console.error("Refresh meta GET error:", error);
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

/**
 * POST /api/auth/refresh-meta
 *
 * Called by the settings UI after route permissions are updated.
 * Re-computes auth-meta cookie from current DB state.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const meta = await buildAuthMeta(token);
    if (!meta) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    setAuthMetaCookie(response, meta);

    console.log(
      `[refresh-meta/POST] set cookie isAdmin=${meta.isAdmin} roles=[${meta.roleNames}] allowedModules=${meta.allowedModuleIds.length} denied=${meta.deniedRoutes.length}`
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
