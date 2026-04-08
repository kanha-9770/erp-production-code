// app/api/roles/[id]/route.ts
export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from "next/server";
import { OrganizationHandlers as H } from "@/lib/api-handlers/organization";
import { prisma } from "@/lib/prisma";
import { updateRole } from "@/lib/database/roles";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return H.deleteRole(request, params.id);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const roleId = params.id;

    // Check if the role exists and if it's an admin role
    const existingRole = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, isAdmin: true, name: true },
    });

    if (!existingRole) {
      return NextResponse.json(
        { success: false, error: "Role not found" },
        { status: 404 }
      );
    }

    // Block editing of admin roles — name, isAdmin, and core settings are locked
    if (existingRole.isAdmin) {
      return NextResponse.json(
        { success: false, error: "Admin roles are protected and cannot be modified" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const updated = await updateRole(roleId, {
      name: body.name,
      description: body.description,
      shareDataWithPeers: body.shareDataWithPeers,
      isAdmin: body.isAdmin,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("[PUT /api/roles/[id]] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to update role" },
      { status: 500 }
    );
  }
}
