/**
 * User Management API Handlers
 * Centralized business logic for: Users, Employees
 *
 * Usage in route files:
 *   import { UserManagementHandlers as H } from "@/lib/api-handlers/user-management"
 *   export const GET = (req) => H.getUsers(req)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import bcrypt from "bcryptjs";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with any organization" },
      { status: 403 }
    );
  return user;
}

async function handle(
  fn: () => Promise<NextResponse>,
  label: string
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[UserManagementHandlers] ${label}:`, e?.message);
    if (e?.code === "P2002")
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/** Check if the currently-authenticated user is an admin. */
async function isAdmin(authUserId: string): Promise<boolean> {
  const userWithRoles = await prisma.user.findUnique({
    where: { id: authUserId },
    select: {
      unitAssignments: { include: { role: true } },
      ownedOrganization: { select: { id: true } },
    },
  });
  return !!(
    userWithRoles?.unitAssignments?.some(
      (ua: any) => ua.role?.isAdmin || ua.role?.name?.toLowerCase().includes("admin")
    ) || userWithRoles?.ownedOrganization
  );
}

/** Standard user shape returned to the frontend. */
function transformUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    avatar: user.avatar,
    department: user.department || "",
    unitAssignments: user.unitAssignments ?? [],
    email_verified: user.email_verified,
    employee: user.employee
      ? { ...user.employee, totalSalary: user.employee.totalSalary ? Number(user.employee.totalSalary) : null }
      : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// USER HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export const UserManagementHandlers = {
  // GET /api/users
  async getUsers(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);

      const users = await prisma.user.findMany({
        where: { organizationId: authUser.organizationId },
        include: {
          unitAssignments: { include: { unit: true, role: true } },
          organization: true,
          permissionOverrides: { include: { permission: true } },
          employee: {
            select: {
              department: true,
              designation: true,
              companyName: true,
              employeeEngagementTeamName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json(
        users.map((u) => ({
          id: u.id, email: u.email,
          first_name: u.first_name || "", last_name: u.last_name || "",
          avatar: u.avatar, department: u.department || "",
          unitAssignments: u.unitAssignments,
          email_verified: u.email_verified,
          // Employee data sourced for audit-log display (department + management
          // team). `companyName` is the closest field to "management team" in
          // the Employee model.
          employee: u.employee
            ? {
                department: u.employee.department || "",
                designation: u.employee.designation || "",
                companyName: u.employee.companyName || "",
                employeeEngagementTeamName: u.employee.employeeEngagementTeamName || "",
              }
            : null,
        }))
      );
    }, "getUsers");
  },

  // POST /api/users
  async createUser(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();
      const { email, first_name, last_name, department, password, unitId, roleId } = body;

      if (!email || !first_name)
        return NextResponse.json(
          { error: "Email, first name, are required" },
          { status: 400 }
        );

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing)
        return NextResponse.json({ error: "Email already exists" }, { status: 409 });

      let hashedPassword: string | null = null;
      if (password?.trim()) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(password, salt);
      }

      const user = await prisma.user.create({
        data: {
          email, password: hashedPassword,
          first_name, last_name,
          department: department || null,
          organizationId: authUser.organizationId,
          email_verified: true,
          status: "ACTIVE",
          unitAssignments: unitId && roleId ? { create: { unitId, roleId } } : undefined,
        },
        include: { unitAssignments: { include: { unit: true, role: true } } },
      });

      return NextResponse.json(
        {
          id: user.id, email: user.email,
          first_name: user.first_name || "", last_name: user.last_name || "",
          avatar: user.avatar, department: user.department || "",
          unitAssignments: user.unitAssignments.map((ua) => ({
            id: ua.id,
            unit: { id: ua.unit.id, name: ua.unit.name, level: ua.unit.level || 0 },
            role: { id: ua.role.id, name: ua.role.name, isAdmin: ua.role.isAdmin || false, level: ua.role.level || 0 },
            notes: ua.notes || "",
          })),
          email_verified: user.email_verified,
        },
        { status: 201 }
      );
    }, "createUser");
  },

  // GET /api/users/[id]
  async getUser(request: NextRequest, userId: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const userAdmin = await isAdmin(authUser.id);

      if (!userAdmin && authUser.id !== userId)
        return NextResponse.json(
          { error: "Unauthorized: Only admins or self can view this user" },
          { status: 403 }
        );

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          unitAssignments: { include: { unit: true, role: true } },
          organization: true,
          permissionOverrides: { include: { permission: true } },
          employee: true,
        },
      });

      if (!user)
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      if (user.organizationId !== authUser.organizationId)
        return NextResponse.json({ error: "Unauthorized access to user" }, { status: 403 });

      return NextResponse.json(transformUser(user));
    }, "getUser");
  },

  // PUT /api/users/[id]
  async updateUser(request: NextRequest, userId: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const userAdmin = await isAdmin(authUser.id);

      if (!userAdmin)
        return NextResponse.json({ error: "Unauthorized: Only admins can update users" }, { status: 403 });

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.organizationId !== authUser.organizationId)
        return NextResponse.json({ error: "User not found or not in organization" }, { status: 404 });

      const body = await request.json();
      const {
        email, first_name, last_name, department, avatar, phone, location,
        joinDate, unitId, roleId, password, status, mobile, employeeData,
      } = body;

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
      if (password) updatedData.password = await bcrypt.hash(password, 10);

      await prisma.user.update({ where: { id: userId }, data: updatedData });

      if (unitId && roleId) {
        await prisma.userUnitAssignment.upsert({
          where: { userId_unitId: { userId, unitId } },
          update: { roleId },
          create: { userId, unitId, roleId },
        });
      }

      if (employeeData) {
        const derivedName = [
          employeeData.employeeName,
          [updatedData.first_name ?? user.first_name, updatedData.last_name ?? user.last_name]
            .filter(Boolean)
            .join(" ")
            .trim(),
          user.email,
        ].find((v) => typeof v === "string" && v.trim().length > 0);

        await prisma.employee.upsert({
          where: { userId },
          update: {
            ...employeeData,
            totalSalary: employeeData.totalSalary ? parseFloat(employeeData.totalSalary) : undefined,
            dob: employeeData.dob ? new Date(employeeData.dob) : undefined,
            dateOfJoining: employeeData.dateOfJoining ? new Date(employeeData.dateOfJoining) : undefined,
          },
          create: {
            userId,
            ...employeeData,
            employeeName: derivedName || "Unknown",
            totalSalary: employeeData.totalSalary ? parseFloat(employeeData.totalSalary) : undefined,
            dob: employeeData.dob ? new Date(employeeData.dob) : undefined,
            dateOfJoining: employeeData.dateOfJoining ? new Date(employeeData.dateOfJoining) : undefined,
          },
        });
      }

      const finalUser = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          unitAssignments: { include: { unit: true, role: true } },
          organization: true,
          permissionOverrides: { include: { permission: true } },
          employee: true,
        },
      });

      return NextResponse.json(transformUser(finalUser));
    }, "updateUser");
  },

  // DELETE /api/users/[id]
  async deleteUser(request: NextRequest, userId: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const userAdmin = await isAdmin(authUser.id);

      if (!userAdmin)
        return NextResponse.json({ error: "Unauthorized: Only admins can delete users" }, { status: 403 });

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.organizationId !== authUser.organizationId)
        return NextResponse.json({ error: "User not found or not in organization" }, { status: 404 });

      await prisma.user.delete({ where: { id: userId } });

      return NextResponse.json({ message: "User deleted successfully" });
    }, "deleteUser");
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EMPLOYEE HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/employees
  async getEmployees(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);

      const userWithRoles = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: { unitAssignments: { include: { role: { select: { name: true } } } } },
      });
      const adminUser = userWithRoles?.unitAssignments.some(
        (ua: any) => ua.role.name.toLowerCase().includes("admin")
      ) ?? false;

      const employeeSelect = {
        id: true, userId: true, employeeName: true, department: true,
        designation: true, totalSalary: true, givenSalary: true,
        bonusAmount: true, nightAllowance: true, overTime: true,
        oneHourExtra: true, status: true,
      };

      let employees;

      if (adminUser) {
        const adminUserIds = await prisma.$queryRaw<{ id: string }[]>`
          SELECT DISTINCT u.id
          FROM users u
          JOIN user_unit_assignments uua ON uua.user_id = u.id
          JOIN roles r ON r.id = uua.role_id
          WHERE u.organization_id = ${authUser.organizationId}
          AND r.name ILIKE '%admin%'
        `.then((rows) => rows.map((r) => r.id));

        employees = await prisma.employee.findMany({
          where: {
            status: "ACTIVE",
            userId: adminUserIds.length > 0 ? { notIn: adminUserIds } : undefined,
            user: { organizationId: authUser.organizationId },
          },
          select: employeeSelect,
          orderBy: { employeeName: "asc" },
        });
      } else {
        employees = await prisma.employee.findMany({
          where: { userId: authUser.id, status: "ACTIVE" },
          select: employeeSelect,
        });
      }

      return NextResponse.json({ success: true, employees, isAdmin: adminUser });
    }, "getEmployees");
  },
};
