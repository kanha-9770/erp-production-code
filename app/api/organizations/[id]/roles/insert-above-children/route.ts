import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { insertRoleAboveChildren } from "@/lib/database/roles";

/**
 * POST /api/organizations/[id]/roles/insert-above-children
 *
 * Insert a new role directly beneath an existing parent, adopting ALL of that
 * parent's current direct children. The new role becomes the parent's child;
 * every existing child (and its whole subtree) is re-parented one level down
 * under the new role — a single layer slotted between a parent and all of its
 * branches at once.
 *
 * Body:
 *   {
 *     parentRoleId: string,       // role whose children get pushed down a level
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

    if (!body?.parentRoleId) {
      return NextResponse.json(
        { error: "parentRoleId is required" },
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

    const role = await insertRoleAboveChildren({
      organizationId,
      parentRoleId: body.parentRoleId,
      newRole: {
        name: body.name,
        description: body.description ?? "",
        shareDataWithPeers: !!body.shareDataWithPeers,
        isAdmin: !!body.isAdmin,
        parentId: "", // ignored — parent is the target node itself
      },
    });

    return NextResponse.json({ success: true, data: role }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /roles/insert-above-children] Error:", error);
    const message: string = error?.message || "Failed to insert role above children";
    let status = 500;
    if (message.includes("already exists")) status = 409;
    else if (message.includes("not found") || message.includes("no longer exists")) status = 404;
    else if (message.includes("different organization") || message.includes("admin role")) status = 400;
    return NextResponse.json({ error: message, message }, { status });
  }
}
