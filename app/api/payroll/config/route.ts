import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";

// GET - Fetch current payroll configuration
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const config = await prisma.payrollConfiguration.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("[v0] Error fetching payroll config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch configuration" },
      { status: 500 }
    );
  }
}

// POST - Save payroll configuration (Admin only)
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const userWithRoles = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { unitAssignments: { include: { role: { select: { isAdmin: true, name: true } } } } },
    });
    const isAdmin = userWithRoles?.unitAssignments.some(
      (ua: any) => ua.role?.isAdmin || ua.role?.name?.toLowerCase().includes("admin")
    ) ?? false;

    if (!isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized. Only admins can configure payroll.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { formIds, fieldMappings, organizationId } = body;

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

    await prisma.payrollConfiguration.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const config = await prisma.payrollConfiguration.create({
      data: {
        attendanceFormIds: formIds,
        leaveFormIds: formIds,
        attendanceFieldMappings: fieldMappings,
        leaveFieldMappings: fieldMappings,
        organizationId,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("[v0] Error saving payroll config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save configuration" },
      { status: 500 }
    );
  }
}
