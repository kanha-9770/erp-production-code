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
import { moveToTrash } from "@/lib/trash";
import { invalidatePayrollCache } from "@/lib/utils/payroll-live";
import bcrypt from "bcryptjs";

// Compensation fields on Employee that affect the payroll engine. When any
// of these change in an update, the live payroll cache must be invalidated so
// the next read of /api/payroll recomputes against the new values instead of
// serving a stale 5s-cached row. Keep this list in sync with the salary
// pickers in getEmployeesFromDB.
const PAYROLL_RELEVANT_EMPLOYEE_FIELDS = new Set([
  "totalSalary",
  "givenSalary",
  "bonusAmount",
  "nightAllowance",
  "overTime",
  "oneHourExtra",
  "dateOfJoining",
  "dateOfLeaving",
  "status",
  "department",
  "designation",
]);

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

      await moveToTrash("User", userId, {
        userId: authUser.id,
        userName: authUser.email,
        organizationId: authUser.organizationId,
      });

      return NextResponse.json({ message: "User moved to recycle bin" });
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
        emailAddress1: true, personalContact: true,
        dateOfJoining: true, dateOfLeaving: true,
        companyName: true, employeeEngagementTeamName: true,
        engagementTeamId: true,
        gender: true, shiftType: true,
      } as any;

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

  // GET /api/employees/[id]
  async getEmployee(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const employee = await prisma.employee.findFirst({
        where: {
          id,
          OR: [
            { user: { organizationId: authUser.organizationId } },
            { userId: null },
          ],
        },
      });
      if (!employee) {
        return NextResponse.json({ error: "Employee not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, employee });
    }, "getEmployee");
  },

  // POST /api/employees
  async createEmployee(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();

      if (!body?.employeeName || !String(body.employeeName).trim()) {
        return NextResponse.json(
          { error: "Employee name is required" },
          { status: 400 }
        );
      }

      const data = sanitizeEmployeePayload(body) as any;

      // The list query (`getEmployees`) filters by the linked user's
      // organizationId — Employee has no organization column of its own. If
      // we create an Employee with `userId: null`, it ends up orphaned and
      // invisible to every admin in every org. Attach a placeholder User in
      // the creator's org so the row immediately shows up in the table.
      if (!data.userId) {
        const nameParts = String(body.employeeName).trim().split(/\s+/);
        const firstName = nameParts[0] ?? "";
        const lastName = nameParts.slice(1).join(" ") || null;

        // Prefer the email the admin typed (so a later real-user signup can
        // claim this account); fall back to a deterministic placeholder so
        // the unique constraint on User.email never collides.
        const candidateEmail =
          (typeof body.emailAddress1 === "string" && body.emailAddress1.trim()) ||
          `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.local`;

        // Resolve a User to attach this Employee to:
        //   - email matches a user in the same org → reuse (1:1 unique would
        //     otherwise prevent this user from holding any Employee row, but
        //     reuse is still the right move if the slot is free)
        //   - email matches a user in a *different* org → don't leak across
        //     tenants; mint a fresh placeholder address instead
        //   - no match → mint a fresh placeholder User
        const existing = await prisma.user.findUnique({
          where: { email: candidateEmail },
          select: { id: true, organizationId: true },
        });

        let userId: string;
        if (existing && existing.organizationId === authUser.organizationId) {
          // Reuse only if the user doesn't already own an Employee row —
          // Employee.userId has @unique, so reusing a taken slot would 500.
          const taken = await prisma.employee.findUnique({
            where: { userId: existing.id },
            select: { id: true },
          });
          if (taken) {
            const placeholderEmail = `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.local`;
            const newUser = await prisma.user.create({
              data: {
                email: placeholderEmail,
                organizationId: authUser.organizationId,
                // Admin-created users skip the email-verification flow —
                // the login route rejects sign-in with "Please verify your
                // email first" otherwise. ACTIVE + email_verified:true is
                // the same combo used by /api/create-user-from-employee.
                status: "ACTIVE",
                email_verified: true,
                first_name: firstName,
                last_name: lastName,
              },
            });
            userId = newUser.id;
          } else {
            userId = existing.id;
          }
        } else {
          // Either no user with that email, or the email belongs to another
          // org — mint a fresh placeholder so we never cross tenants.
          const email = existing
            ? `placeholder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.local`
            : candidateEmail;
          const newUser = await prisma.user.create({
            data: {
              email,
              organizationId: authUser.organizationId,
              // Admin-created users skip the email-verification flow —
              // the login route rejects sign-in with "Please verify your
              // email first" otherwise. ACTIVE + email_verified:true is
              // the same combo used by /api/create-user-from-employee.
              status: "ACTIVE",
              email_verified: true,
              first_name: firstName,
              last_name: lastName,
            },
          });
          userId = newUser.id;
        }

        data.userId = userId;
      }

      const employee = await prisma.employee.create({ data });
      // New employee → drop the live payroll cache so they appear in the
      // dashboard on the next fetch instead of waiting for the 5s TTL.
      if (authUser.organizationId) invalidatePayrollCache(authUser.organizationId);
      return NextResponse.json({ success: true, employee }, { status: 201 });
    }, "createEmployee");
  },

  // PUT /api/employees/[id]
  async updateEmployee(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();

      const existing = await prisma.employee.findFirst({
        where: {
          id,
          OR: [
            { user: { organizationId: authUser.organizationId } },
            { userId: null },
          ],
        },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Employee not found" }, { status: 404 });
      }

      const data = sanitizeEmployeePayload(body, { partial: true });
      const employee = await prisma.employee.update({ where: { id }, data });

      // If the update touched any field the payroll engine reads, drop the
      // live cache for this org so the next /api/payroll fetch recomputes
      // against the new salary / dates / department instead of serving a
      // stale TTL row. Without this, edits to CTC in Employee Master could
      // sit invisible for up to 5 seconds and confuse the admin.
      const changedKeys = Object.keys(data ?? {});
      const touchesPayroll = changedKeys.some((k) => PAYROLL_RELEVANT_EMPLOYEE_FIELDS.has(k));
      if (touchesPayroll && authUser.organizationId) {
        invalidatePayrollCache(authUser.organizationId);
      }

      return NextResponse.json({ success: true, employee });
    }, "updateEmployee");
  },

  // DELETE /api/employees/[id]
  async deleteEmployee(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await prisma.employee.findFirst({
        where: {
          id,
          OR: [
            { user: { organizationId: authUser.organizationId } },
            { userId: null },
          ],
        },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Employee not found" }, { status: 404 });
      }
      await prisma.employee.delete({ where: { id } });
      // Drop the live payroll cache so the deleted row disappears from the
      // dashboard on the next fetch.
      if (authUser.organizationId) invalidatePayrollCache(authUser.organizationId);
      return NextResponse.json({ success: true });
    }, "deleteEmployee");
  },
};

// Coerces the raw client payload into a Prisma-safe Employee write. With
// `partial: true` only fields actually present on the body are forwarded, so
// PATCH/PUT calls don't blank out untouched columns.
function sanitizeEmployeePayload(
  body: Record<string, any>,
  opts: { partial?: boolean } = {}
): Record<string, any> {
  const data: Record<string, any> = {};
  const partial = opts.partial ?? false;

  const strField = (key: string, target = key, trim = true) => {
    if (!(key in body)) return;
    const v = body[key];
    if (v === null || v === undefined || v === "") {
      if (!partial) data[target] = null;
      else data[target] = null;
      return;
    }
    data[target] = typeof v === "string" && trim ? v.trim() : v;
  };
  const numField = (key: string, target = key) => {
    if (!(key in body)) return;
    const v = body[key];
    if (v === null || v === undefined || v === "") {
      data[target] = null;
      return;
    }
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    data[target] = Number.isFinite(n) ? n : null;
  };
  const intField = (key: string, target = key) => {
    if (!(key in body)) return;
    const v = body[key];
    if (v === null || v === undefined || v === "") {
      data[target] = null;
      return;
    }
    const n = typeof v === "string" ? parseInt(v, 10) : Math.trunc(Number(v));
    data[target] = Number.isFinite(n) ? n : null;
  };
  const dateField = (key: string, target = key) => {
    if (!(key in body)) return;
    const v = body[key];
    if (!v) {
      data[target] = null;
      return;
    }
    const d = new Date(v);
    data[target] = Number.isNaN(d.getTime()) ? null : d;
  };
  const boolField = (key: string, target = key) => {
    if (!(key in body)) return;
    data[target] = !!body[key];
  };

  if ("employeeName" in body) data.employeeName = String(body.employeeName).trim();
  strField("department");
  strField("designation");
  strField("nativePlace");
  strField("country");
  strField("permanentAddress");
  strField("currentAddress");
  strField("personalContact");
  strField("alternateNo1");
  strField("alternateNo2");
  strField("emailAddress1");
  strField("emailAddress2");
  strField("aadharCardNo");
  strField("aadharCardUpload");
  strField("panCardUpload");
  strField("passportUpload");
  strField("bankName");
  strField("bankAccountNo");
  strField("ifscCode");
  strField("shiftType");
  strField("inTime");
  strField("outTime");
  strField("companyName");
  strField("employeeEngagementTeamName");
  // FK to EngagementTeam — accept null/"" to clear. We trust the client-side
  // dropdown to only feed valid team ids; if not, Prisma's FK constraint
  // will reject the write.
  if ("engagementTeamId" in body) {
    const raw = body.engagementTeamId;
    data.engagementTeamId =
      typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }

  if ("gender" in body) {
    const g = String(body.gender || "").toUpperCase();
    data.gender = ["MALE", "FEMALE", "OTHER"].includes(g) ? g : "OTHER";
  }
  if ("status" in body) {
    const s = String(body.status || "").toUpperCase();
    data.status = ["ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"].includes(s)
      ? s
      : "ACTIVE";
  }

  numField("totalSalary");
  numField("givenSalary");
  numField("bonusAmount");
  numField("nightAllowance");
  numField("overTime");
  numField("oneHourExtra");

  intField("incrementMonth");
  intField("yearsOfAgreement");
  intField("bonusAfterYears");

  dateField("dob");
  dateField("dateOfJoining");
  dateField("dateOfLeaving");

  boolField("companySimIssue");

  return data;
}
