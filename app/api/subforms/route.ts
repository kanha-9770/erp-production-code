export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { invalidateFormCache } from "@/lib/forms/form-cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      formId,
      parentSubformId,
      name,
      description,
      order,
      level,
      columns,
      visible,
      collapsible,
      collapsed,
      targetSectionId, // Declare targetSectionId here
    } = body;

    // Validate required fields
    if (!name) {
      console.error("[Subform API] Missing required field: name");
      return NextResponse.json(
        { success: false, error: "Missing required field: name" },
        { status: 400 },
      );
    }

    // For top-level subforms, we need formId
    // For nested subforms, formId is optional (inherited from parent)
    // NOTE: Currently using sectionId field to store formId until schema is migrated
    let targetFormId = formId;
    let parentSubform = null;

    if (parentSubformId) {
      // Get parent subform to inherit formId
      parentSubform = await prisma.subform.findUnique({
        where: { id: parentSubformId },
      });

      if (!parentSubform) {
        console.error(
          "[Subform API] Parent subform not found:",
          parentSubformId,
        );
        return NextResponse.json(
          { success: false, error: "Parent subform not found" },
          { status: 404 },
        );
      }

      // Inherit formId from parent subform (stored in sectionId field temporarily)
      targetFormId = parentSubform.sectionId || formId;
    }

    // Validate that we have a formId (either provided or inherited)
    if (!targetFormId) {
      console.error(
        "[Subform API] No formId available - either provide formId or valid parentSubformId",
      );
      return NextResponse.json(
        {
          success: false,
          error: "Either formId or parentSubformId must be provided",
        },
        { status: 400 },
      );
    }

    // Verify the form exists
    const form = await prisma.form.findUnique({
      where: { id: targetFormId },
    });

    if (!form) {
      console.error("[Subform API] Form not found:", targetFormId);
      return NextResponse.json(
        { success: false, error: "Form not found" },
        { status: 404 },
      );
    }

    // Calculate level and path for nested subforms
    let calculatedLevel = level || 0;
    let calculatedPath = "";

    if (parentSubform) {
      calculatedLevel = (parentSubform.level || 0) + 1;
      const parentPath = parentSubform.path || "";
      const siblingCount = await prisma.subform.count({
        where: { parentSubformId },
      });
      calculatedPath = parentPath
        ? `${parentPath}.${siblingCount + 1}`
        : `${siblingCount + 1}`;
    } else {
      // Root level subform in form
      const siblingCount = await prisma.subform.count({
        where: { formId: targetFormId, parentSubformId: null },
      });
      calculatedPath = `${siblingCount + 1}`;
    }

    // Calculate order if not provided
    let calculatedOrder = order || 0;
    if (calculatedOrder === 0) {
      if (parentSubformId) {
        calculatedOrder = await prisma.subform.count({
          where: { parentSubformId },
        });
      } else {
        calculatedOrder = await prisma.subform.count({
          where: { formId: targetFormId, parentSubformId: null },
        });
      }
    }

    // Create the subform
    const subform = await prisma.subform.create({
      data: {
        formId: targetFormId,
        parentSubformId: parentSubformId || undefined,
        parentSectionId: body.parentSectionId || null,
        name,
        description: description || "",
        order: calculatedOrder,
        level: calculatedLevel,
        path: calculatedPath,
        columns: columns || 1,
        visible: visible !== undefined ? visible : true,
        collapsible: collapsible !== undefined ? collapsible : true,
        collapsed: collapsed !== undefined ? collapsed : false,
      },
      include: {
        fields: {
          orderBy: { order: "asc" },
        },
        childSubforms: {
          include: {
            fields: {
              orderBy: { order: "asc" },
            },
            childSubforms: true,
          },
          orderBy: { order: "asc" },
        },
      },
    });

    // New subform added — drop the parent form's cached structure.
    if (subform.formId) await invalidateFormCache(subform.formId);

    return NextResponse.json({
      success: true,
      data: subform,
    });
  } catch (error) {
    console.error("[Subform API] Error creating subform:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create subform" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get("formId");
    const parentSubformId = searchParams.get("parentSubformId");
    const includeNested = searchParams.get("includeNested") === "true";

    let subforms;
    const includeClause = {
      fields: {
        orderBy: { order: "asc" as const },
      },
      ...(includeNested && {
        childSubforms: {
          include: {
            fields: {
              orderBy: { order: "asc" as const },
            },
            childSubforms: {
              include: {
                fields: {
                  orderBy: { order: "asc" as const },
                },
                childSubforms: true,
              },
            },
          },
          orderBy: { order: "asc" as const },
        },
      }),
    };
    if (formId) {
      // Get top-level subforms for the form
      subforms = await prisma.subform.findMany({
        where: {
          formId,
          parentSubformId: null, // Only root level subforms
        },
        include: includeClause,
        orderBy: { order: "asc" },
      });
    } else if (parentSubformId) {
      subforms = await prisma.subform.findMany({
        where: { parentSubformId },
        include: includeClause,
        orderBy: { order: "asc" },
      });
    } else {
      subforms = await prisma.subform.findMany({
        include: includeClause,
        orderBy: { order: "asc" },
      });
    }

    return NextResponse.json({
      success: true,
      data: subforms,
    });
  } catch (error) {
    console.error("Error fetching subforms:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch subforms" },
      { status: 500 },
    );
  }
}
