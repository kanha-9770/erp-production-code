import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";

export const dynamic = 'force-dynamic';

// GET - Fetch the caller's organization's active payroll configuration
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "User is not a member of any organization" },
        { status: 403 }
      );
    }

    const config = await prisma.payrollConfiguration.findFirst({
      where: { isActive: true, organizationId: authUser.organizationId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("[payroll] config GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch configuration" },
      { status: 500 }
    );
  }
}

// POST - Save payroll configuration (Admin only) — pinned to the caller's org
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: "User is not a member of any organization" },
        { status: 403 }
      );
    }

    if (!(await isUserAdmin(authUser.id, authUser.organizationId))) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Only admins can configure payroll.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { formIds, fieldMappings } = body;

    if (!formIds || !Array.isArray(formIds) || formIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one form must be selected" },
        { status: 400 }
      );
    }

    if (!fieldMappings || typeof fieldMappings !== "object") {
      return NextResponse.json(
        { success: false, error: "Field mappings are required" },
        { status: 400 }
      );
    }

    for (const formId of formIds) {
      const mapping = fieldMappings[formId];
      if (!mapping || !mapping.employeeIdField || !mapping.dateField) {
        return NextResponse.json(
          {
            success: false,
            error: `All forms must have Employee ID and Date fields mapped`,
          },
          { status: 400 }
        );
      }
    }

    // Every selected form must belong to the caller's org.
    const ownedCount = await prisma.form.count({
      where: { id: { in: formIds }, module: { organizationId: authUser.organizationId } },
    });
    if (ownedCount !== formIds.length) {
      return NextResponse.json(
        { success: false, error: "One or more selected forms do not belong to your organization" },
        { status: 403 }
      );
    }

    // Deactivate ONLY this org's previous active configs.
    await prisma.payrollConfiguration.updateMany({
      where: { isActive: true, organizationId: authUser.organizationId },
      data: { isActive: false },
    });

    const config = await prisma.payrollConfiguration.create({
      data: {
        attendanceFormIds: formIds,
        leaveFormIds: formIds,
        attendanceFieldMappings: fieldMappings,
        leaveFieldMappings: fieldMappings,
        // Org pinned from session, NOT from client body.
        organizationId: authUser.organizationId,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("[payroll] config POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save configuration" },
      { status: 500 }
    );
  }
}
