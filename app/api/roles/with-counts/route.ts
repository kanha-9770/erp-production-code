/**
 * GET /api/roles/with-counts
 *
 * Returns every role in the caller's organization along with its user count
 * and permission count. Single batched query — replaces what used to be a
 * roles-fetch followed by N separate count queries.
 *
 * Response shape:
 *   {
 *     success: true,
 *     roles: Array<{
 *       id, name, description, isAdmin, parentId,
 *       userCount, permissionCount,
 *     }>
 *   }
 *
 * Caller must be authenticated. We do NOT require admin-level access on the
 * read path so the page renders for any signed-in user; write endpoints
 * (PUT/POST elsewhere) enforce admin themselves.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "No organization context" },
        { status: 403 },
      );
    }

    // Pull every role + counts in two relation queries (one for users, one
    // for permissions). Prisma _count is a Prisma-side aggregation that adds
    // exactly one extra SQL clause per relation — no N+1 fan-out.
    const roles = await prisma.role.findMany({
      where: { organizationId: authUser.organizationId },
      select: {
        id: true,
        name: true,
        description: true,
        isAdmin: true,
        parentId: true,
        createdAt: true,
        _count: {
          select: {
            userAssignments: true,
            rolePermissions: { where: { granted: true } },
          },
        },
      },
      orderBy: [{ isAdmin: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({
      success: true,
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        isAdmin: r.isAdmin,
        parentId: r.parentId,
        userCount: r._count.userAssignments,
        permissionCount: r._count.rolePermissions,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/roles/with-counts]", error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "Failed to fetch roles" },
      { status: 500 },
    );
  }
}
