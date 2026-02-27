export const dynamic = 'force-dynamic';
// app/api/user-unit-assignments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, unit_id, role_id, notes } = body;

    if (!user_id || !unit_id || !role_id) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const [user, unit, role] = await Promise.all([
      prisma.user.findUnique({ where: { id: user_id } }),
      prisma.organizationUnit.findUnique({ where: { id: unit_id } }),
      prisma.role.findUnique({ where: { id: role_id } }),
    ]);

    if (!user || !unit || !role) {
      return NextResponse.json(
        { success: false, error: "Invalid user_id, unit_id, or role_id" },
        { status: 400 }
      );
    }

    const assignment = await prisma.userUnitAssignment.upsert({
      where: {
        userId_unitId: { userId: user_id, unitId: unit_id },
      },
      update: {
        roleId: role_id,
        notes: notes ?? null,
        updatedAt: new Date(),
      },
      create: {
        id: crypto.randomUUID(),
        userId: user_id,
        unitId: unit_id,
        roleId: role_id,
        notes: notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "User unit assignment updated successfully",
      data: assignment,
    });
  } catch (error) {
    console.error("[v0] Error in PUT /api/user-unit-assignments:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update user unit assignment" },
      { status: 500 }
    );
  }
}