export const dynamic = 'force-dynamic';
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { moveToTrash } from "@/lib/trash";
import { invalidateFormCache } from "@/lib/forms/form-cache";

export async function GET(
  request: NextRequest,
  { params }: { params: { subformId: string } }
) {
  try {
    const { subformId } = params;
    const { searchParams } = new URL(request.url);
    const includeNested = searchParams.get('includeNested') === 'true';

    const subform = await prisma.subform.findUnique({
      where: { id: subformId },
      include: {
        fields: { orderBy: { order: 'asc' } },
        childSubforms: includeNested ? {
          include: {
            fields: { orderBy: { order: 'asc' } },
            childSubforms: {
              include: {
                fields: { orderBy: { order: 'asc' } },
                childSubforms: true,
              },
            },
          },
          orderBy: { order: 'asc' },
        } : true,
        parentSubform: true,
      },
    });

    if (!subform) {
      return NextResponse.json(
        { success: false, error: "Subform not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: subform });
  } catch (error) {
    console.error("Error fetching subform:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch subform" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { subformId: string } }
) {
  try {
    const { subformId } = params;
    const body = await request.json();
    const { name, description, order, collapsed, columns, visible, parentSubformId, conditional } = body;

    const existingSubform = await prisma.subform.findUnique({
      where: { id: subformId },
      include: { parentSubform: true },
    });

    if (!existingSubform) {
      return NextResponse.json(
        { success: false, error: "Subform not found" },
        { status: 404 }
      );
    }

    let updateData: any = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(order !== undefined && { order }),
      ...(collapsed !== undefined && { collapsed }),
      ...(columns !== undefined && { columns }),
      ...(visible !== undefined && { visible }),
      ...(conditional !== undefined && { conditional: conditional ?? Prisma.JsonNull }),
    };

    if (parentSubformId !== undefined && parentSubformId !== existingSubform.parentSubformId) {
      let newLevel = 0;
      let newPath = "";

      if (parentSubformId) {
        const newParent = await prisma.subform.findUnique({
          where: { id: parentSubformId },
        });

        if (!newParent) {
          return NextResponse.json(
            { success: false, error: "New parent subform not found" },
            { status: 404 }
          );
        }

        newLevel = (newParent.level || 0) + 1;
        const siblingCount = await prisma.subform.count({ where: { parentSubformId } });
        newPath = newParent.path ? `${newParent.path}.${siblingCount + 1}` : `${siblingCount + 1}`;
      } else {
        const siblingCount = await prisma.subform.count({
          where: { formId: existingSubform.formId, parentSubformId: null },
        });
        newPath = `${siblingCount + 1}`;
      }

      updateData = { ...updateData, parentSubformId, level: newLevel, path: newPath };
    }

    const updatedSubform = await prisma.subform.update({
      where: { id: subformId },
      data: updateData,
      include: {
        fields: { orderBy: { order: 'asc' } },
        childSubforms: {
          include: {
            fields: { orderBy: { order: 'asc' } },
            childSubforms: true,
          },
          orderBy: { order: 'asc' },
        },
        parentSubform: true,
      },
    });

    if (updatedSubform.formId) {
      await invalidateFormCache(updatedSubform.formId);
    }

    return NextResponse.json({ success: true, data: updatedSubform });
  } catch (error) {
    console.error("Error updating subform:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update subform" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { subformId: string } }
) {
  try {
    const { subformId } = params;
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const existingSubform = await prisma.subform.findUnique({ where: { id: subformId } });
    if (!existingSubform) {
      return NextResponse.json({ success: false, error: "Subform not found" }, { status: 404 });
    }

    await moveToTrash("Subform", subformId, {
      userId: user.id,
      userName: user.email,
      organizationId: user.organizationId,
    });

    // existingSubform.formId captured before the trash move.
    if (existingSubform.formId) {
      await invalidateFormCache(existingSubform.formId);
    }

    return NextResponse.json({
      success: true,
      message: "Subform moved to recycle bin",
    });
  } catch (error: any) {
    console.error("[Subform API DELETE] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete subform" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { subformId: string } }
) {
  try {
    const { subformId } = params;
    const body = await request.json();

    const { conditional, ...otherUpdates } = body;

    if (conditional !== undefined && typeof conditional !== 'object') {
      return NextResponse.json(
        { success: false, error: "conditional must be a JSON object or null" },
        { status: 400 }
      );
    }

    const updateData: any = { ...otherUpdates };
    if (conditional !== undefined) {
      updateData.conditional = conditional ?? Prisma.JsonNull;
    }

    const existing = await prisma.subform.findUnique({ where: { id: subformId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Subform not found" },
        { status: 404 }
      );
    }

    const updated = await prisma.subform.update({
      where: { id: subformId },
      data: updateData,
      select: { id: true, conditional: true, updatedAt: true },
    });

    if (existing.formId) await invalidateFormCache(existing.formId);

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("[Subform API PATCH] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update subform" },
      { status: 500 }
    );
  }
}
