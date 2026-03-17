// app/api/users/[id]/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import bcrypt from 'bcryptjs';

function isAdmin(user: any) {
  const hasAdminRole = user?.unitAssignments?.some(
    (ua: any) => ua.role?.isAdmin || ua.role?.name?.toLowerCase().includes("admin")
  ) || false;
  const isOrgOwner = !!user?.ownedOrganization;
  return hasAdminRole || isOrgOwner;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await validateSession(token);

    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const organizationId = session.user?.organizationId || session.user?.organization?.id;

    if (!organizationId) {
      return NextResponse.json({ error: "User is not associated with any organization" }, { status: 403 });
    }

    const isUserAdmin = isAdmin(session.user);

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        unitAssignments: {
          include: {
            unit: true,
            role: true,
          },
        },
        organization: true,
        permissionOverrides: {
          include: {
            permission: true,
          },
        },
        employee: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.organizationId !== organizationId) {
      return NextResponse.json({ error: "Unauthorized access to user" }, { status: 403 });
    }

    if (!isUserAdmin && session.user.id !== params.id) {
      return NextResponse.json({ error: "Unauthorized: Only admins or self can view this user" }, { status: 403 });
    }

    // Transform to match format
    const transformedUser = {
      id: user.id,
      email: user.email,
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      avatar: user.avatar,
      department: user.department || "",
      unitAssignments: user.unitAssignments,
      employee: user.employee ? {
        ...user.employee,
        totalSalary: user.employee.totalSalary ? Number(user.employee.totalSalary) : null,
        // Similarly for other decimals
      } : null,
      // Add other fields as needed
    };

    return NextResponse.json(transformedUser);
  } catch (error) {
    console.error("[GET /api/users/[id]] Error:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await validateSession(token);

    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    if (!isAdmin(session.user)) {
      return NextResponse.json({ error: "Unauthorized: Only admins can update users" }, { status: 403 });
    }

    const organizationId = session.user?.organizationId || session.user?.organization?.id;

    const body = await request.json();
    const {
      email,
      first_name,
      last_name,
      department,
      avatar,
      phone,
      location,
      joinDate,
      unitId,
      roleId,
      password,
      status,
      mobile,
      employeeData,
    } = body;

    const user = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!user || user.organizationId !== organizationId) {
      return NextResponse.json({ error: "User not found or not in organization" }, { status: 404 });
    }

    let hashedPassword;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const updatedData: any = {};
    if (email) updatedData.email = email;
    if (first_name) updatedData.first_name = first_name;
    if (last_name) updatedData.last_name = last_name;
    if (department) updatedData.department = department;
    if (avatar) updatedData.avatar = avatar;
    if (phone) updatedData.phone = phone;
    if (location) updatedData.location = location;
    if (joinDate) updatedData.joinDate = new Date(joinDate);
    if (status) updatedData.status = status;
    if (mobile) updatedData.mobile = mobile;
    if (hashedPassword) updatedData.password = hashedPassword;

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: updatedData,
      include: {
        unitAssignments: {
          include: {
            unit: true,
            role: true,
          },
        },
      },
    });

    if (unitId && roleId) {
      await prisma.userUnitAssignment.upsert({
        where: {
          userId_unitId: {
            userId: params.id,
            unitId,
          },
        },
        update: { roleId },
        create: {
          userId: params.id,
          unitId,
          roleId,
        },
      });
    }

    if (employeeData) {
      await prisma.employee.upsert({
        where: { userId: params.id },
        update: {
          ...employeeData,
          totalSalary: employeeData.totalSalary ? parseFloat(employeeData.totalSalary) : undefined,
          // Similarly for other decimal fields
          dob: employeeData.dob ? new Date(employeeData.dob) : undefined,
          dateOfJoining: employeeData.dateOfJoining ? new Date(employeeData.dateOfJoining) : undefined,
          // etc.
        },
        create: {
          userId: params.id,
          ...employeeData,
          totalSalary: employeeData.totalSalary ? parseFloat(employeeData.totalSalary) : undefined,
          // etc.
        },
      });
    }

    // Refresh updated user with includes
    const finalUser = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        unitAssignments: {
          include: {
            unit: true,
            role: true,
          },
        },
        organization: true,
        permissionOverrides: {
          include: {
            permission: true,
          },
        },
        employee: true,
      },
    });

    // Transform
    const transformedUser = {
      id: finalUser?.id,
      email: finalUser?.email,
      first_name: finalUser?.first_name || "",
      last_name: finalUser?.last_name || "",
      avatar: finalUser?.avatar,
      department: finalUser?.department || "",
      unitAssignments: finalUser?.unitAssignments,
      // Add employee transformed
    };

    return NextResponse.json(transformedUser);
  } catch (error) {
    console.error("[PUT /api/users/[id]] Error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await validateSession(token);

    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    if (!isAdmin(session.user)) {
      return NextResponse.json({ error: "Unauthorized: Only admins can delete users" }, { status: 403 });
    }

    const organizationId = session.user?.organizationId || session.user?.organization?.id;

    const user = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!user || user.organizationId !== organizationId) {
      return NextResponse.json({ error: "User not found or not in organization" }, { status: 404 });
    }

    await prisma.user.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("[DELETE /api/users/[id]] Error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}