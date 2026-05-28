/**
 * GET /api/roles/[id]/users-with-overrides
 *
 * Returns every user assigned to the role, along with a count of how many
 * UserPermission rows (overrides) each one has. Used by the "Users" tab of
 * the role-detail panel.
 *
 * Single query: one Prisma findMany on UserUnitAssignment joining user + unit
 * with a _count of the user's UserPermission relation. No N+1.
 *
 * Response:
 *   {
 *     success: true,
 *     role: { id, name, organizationId },
 *     users: Array<{
 *       userId, name, email, username, unitName, overrideCount, assignmentId,
 *     }>,
 *   }
 *
 * Cross-tenant guard: the role's organizationId is checked against the
 * caller's organizationId, so an admin in Org A cannot query roles in Org B.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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

    const roleId = params.id;
    if (!roleId) {
      return NextResponse.json(
        { success: false, error: "Missing role id" },
        { status: 400 },
      );
    }

    // Verify the role belongs to the caller's org before returning anything.
    const role = await prisma.role.findFirst({
      where: { id: roleId, organizationId: authUser.organizationId },
      select: { id: true, name: true, organizationId: true, isAdmin: true },
    });
    if (!role) {
      return NextResponse.json(
        { success: false, error: "Role not found" },
        { status: 404 },
      );
    }

    const assignments = await prisma.userUnitAssignment.findMany({
      where: { roleId },
      select: {
        id: true,
        notes: true,
        unit: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            first_name: true,
            last_name: true,
            status: true,
            _count: { select: { permissions: true } },
          },
        },
      },
      orderBy: { user: { username: "asc" } },
    });

    const users = assignments.map((a) => {
      const fullName =
        [a.user.first_name, a.user.last_name].filter(Boolean).join(" ").trim() ||
        a.user.username ||
        a.user.email;
      return {
        userId: a.user.id,
        name: fullName,
        email: a.user.email,
        username: a.user.username,
        status: a.user.status,
        unitName: a.unit?.name ?? null,
        overrideCount: a.user._count.permissions,
        assignmentId: a.id,
        notes: a.notes ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      role: { id: role.id, name: role.name, isAdmin: role.isAdmin },
      users,
    });
  } catch (error: any) {
    console.error("[GET /api/roles/[id]/users-with-overrides]", error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "Failed to fetch users" },
      { status: 500 },
    );
  }
}
