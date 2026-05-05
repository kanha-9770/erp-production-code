import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/api-helpers"
import { moveToTrash } from "@/lib/trash"

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;

    // 1. Authenticate & get current user's org
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const currentOrgId = authUser.organizationId;

    if (!currentOrgId) {
      return NextResponse.json({ error: "No organization context" }, { status: 403 });
    }

    // 2. Fetch target user & check same organization
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.organizationId !== currentOrgId) {
      return NextResponse.json(
        { error: "You can only view assignments within your organization" },
        { status: 403 }
      );
    }

    // 3. Safe to fetch assignments
    const assignments = await prisma.userUnitAssignment.findMany({
      where: { userId },
      include: {
        unit: true,
        role: true,
      },
    });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error("Error fetching user assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch user assignments" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;

    // Same auth + org check as GET
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return unauthorized();

    const currentOrgId = authUser.organizationId;

    if (!currentOrgId) return forbidden();

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });

    if (!targetUser) return notFound();
    if (targetUser.organizationId !== currentOrgId) return forbidden("Cross-organization assignment denied");

    const { unitId, roleId, notes } = await request.json();

    const assignment = await prisma.userUnitAssignment.upsert({
      where: {
        userId_unitId: { userId, unitId },
      },
      update: { roleId, notes },
      create: { userId, unitId, roleId, notes },
      include: {
        unit: true,
        role: true,
      },
    });

    return NextResponse.json(assignment);
  } catch (error) {
    console.error("Error creating/updating user assignment:", error);
    return NextResponse.json(
      { error: "Failed to create/update user assignment" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = params.id;

    // Same auth + org check
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return unauthorized();

    const currentOrgId = authUser.organizationId;

    if (!currentOrgId) return forbidden();

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });

    if (!targetUser) return notFound();
    if (targetUser.organizationId !== currentOrgId) return forbidden("Cross-organization delete denied");

    const { searchParams } = new URL(request.url);
    const unitId = searchParams.get("unitId");

    if (!unitId) {
      return NextResponse.json({ error: "Unit ID is required" }, { status: 400 });
    }

    // UserUnitAssignment uses (userId, unitId) as the unique key but also
    // has its own `id` cuid. Look it up first, then snapshot via the helper
    // which keys off `id`.
    const assignment = await prisma.userUnitAssignment.findUnique({
      where: { userId_unitId: { userId, unitId } },
      select: { id: true },
    });
    if (!assignment) {
      return NextResponse.json({ success: false, error: "Assignment not found" }, { status: 404 });
    }
    await moveToTrash("UserUnitAssignment", assignment.id, {
      userId: authUser.id,
      userName: authUser.email,
      organizationId: currentOrgId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user assignment:", error);
    return NextResponse.json(
      { error: "Failed to delete user assignment" },
      { status: 500 }
    );
  }
}

// Helper functions (cleaner than repeating code)
function unauthorized() {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

function forbidden(msg = "Forbidden") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

function notFound() {
  return NextResponse.json({ error: "User not found" }, { status: 404 });
}