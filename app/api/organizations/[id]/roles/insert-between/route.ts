import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { insertRoleBetween } from "@/lib/database/roles";

/**
 * POST /api/organizations/[id]/roles/insert-between
 *
 * Insert a new role between an existing parent and one of its children.
 * The new role replaces the child's position; the child (and its whole
 * subtree) gets re-parented one level down.
 *
 * Body:
 *   {
 *     childRoleId: string,        // role to push down one level
 *     name: string,
 *     description?: string,
 *     shareDataWithPeers?: boolean,
 *     isAdmin?: boolean,
 *   }
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const organizationId = params.id;
    const body = await request.json();

    if (!body?.childRoleId) {
      return NextResponse.json(
        { error: "childRoleId is required" },
        { status: 400 }
      );
    }
    if (!body?.name?.trim?.()) {
      return NextResponse.json(
        { error: "Role name is required" },
        { status: 400 }
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) {
      return NextResponse.json(
        { error: `Organization with id ${organizationId} not found` },
        { status: 404 }
      );
    }

    const role = await insertRoleBetween({
      organizationId,
      childRoleId: body.childRoleId,
      newRole: {
        name: body.name,
        description: body.description ?? "",
        shareDataWithPeers: !!body.shareDataWithPeers,
        isAdmin: !!body.isAdmin,
        parentId: "", // ignored — parent is derived from the child
      },
    });

    return NextResponse.json({ success: true, data: role }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /roles/insert-between] Error:", error);
    const message: string = error?.message || "Failed to insert role between";
    let status = 500;
    if (message.includes("already exists")) status = 409;
    else if (message.includes("not found") || message.includes("no longer exists")) status = 404;
    else if (message.includes("different organization") || message.includes("admin role")) status = 400;
    return NextResponse.json({ error: message, message }, { status });
  }
}
