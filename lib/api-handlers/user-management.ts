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
import {
  getCallerRoleContext,
  getDescendantRoleIds,
} from "@/lib/database/roles";
import { moveToTrash } from "@/lib/trash";
import { invalidateAllSessionsForUser } from "@/lib/auth";
import { invalidatePayrollCache } from "@/lib/utils/payroll-live";
import { fireWorkflow } from "@/lib/workflow/static-triggers";
import {
  buildEmployeeFilterClauses,
  buildEmployeeOrderBy,
  type AdvancedCondition,
} from "@/lib/api-handlers/employee-filters";
import bcrypt from "bcryptjs";
import { canManageUsers } from "@/lib/permissions/has-permission";

// Compensation fields on Employee that affect the payroll engine. When any
// of these change in an update, the live payroll cache must be invalidated so
// the next read of /api/payroll recomputes against the new values instead of
// serving a stale 5s-cached row. Keep this list in sync with the salary
// pickers in getEmployeesFromDB.
const PAYROLL_RELEVANT_EMPLOYEE_FIELDS = new Set([
  "totalSalary",
  "givenSalary",
  "baseSalary",
  "perHourSalary",
  "totalWorkingHours",
  "isOvertimeApplicable",
  "bonusAmount",
  "nightAllowance",
  "overTime",
  "oneHourExtra",
  "dateOfJoining",
  "dateOfLeaving",
  "resignationLetterDate",
  "status",
  "department",
  "designation",
  "employmentType",
  "branch",
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

      const sp = request.nextUrl.searchParams;
      const rawPage = parseInt(sp.get("page") ?? "", 10);
      const rawSize = parseInt(sp.get("pageSize") ?? "", 10);
      const search = sp.get("search")?.trim() || "";

      const paginate = Number.isFinite(rawSize) && rawSize > 0;
      const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
      const pageSize = paginate ? rawSize : 10;

      console.log('GET_USERS API PARAMS:', {
        url: request.url,
        rawPage: sp.get("page"),
        rawSize: sp.get("pageSize"),
        search,
        paginate,
        page,
        pageSize,
      });

      let whereClause: any = {
        organizationId: authUser.organizationId,
        // Exclude admin users from regular user directory listing
        unitAssignments: {
          none: {
            role: {
              OR: [
                { isAdmin: true },
                { name: { contains: "admin", mode: "insensitive" } }
              ]
            }
          }
        }
      };

      if (search) {
        whereClause.AND = [
          {
            OR: [
              { first_name: { contains: search, mode: "insensitive" } },
              { last_name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { department: { contains: search, mode: "insensitive" } },
              {
                unitAssignments: {
                  some: {
                    OR: [
                      { role: { name: { contains: search, mode: "insensitive" } } },
                      { unit: { name: { contains: search, mode: "insensitive" } } }
                    ]
                  }
                }
              }
            ]
          }
        ];
      }

      if (paginate) {
        const total = await prisma.user.count({ where: whereClause });
        const users = await prisma.user.findMany({
          where: whereClause,
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
          skip: (page - 1) * pageSize,
          take: pageSize,
        });

        const data = users.map((u) => ({
          id: u.id, email: u.email,
          first_name: u.first_name || "", last_name: u.last_name || "",
          avatar: u.avatar, department: u.department || "",
          unitAssignments: u.unitAssignments,
          email_verified: u.email_verified,
          employee: u.employee
            ? {
                department: u.employee.department || "",
                designation: u.employee.designation || "",
                companyName: u.employee.companyName || "",
                employeeEngagementTeamName: u.employee.employeeEngagementTeamName || "",
              }
            : null,
        }));

        return NextResponse.json({
          success: true,
          data,
          total,
          page,
          pageSize,
        });
      } else {
        const users = await prisma.user.findMany({
          where: whereClause,
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
      }
    }, "getUsers");
  },

  // POST /api/users
  async createUser(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);

      // Gate creation behind MANAGE_USERS. Previously this handler had no
      // permission check at all — any authenticated user could create users
      // by POSTing here directly. Admins and roles granted MANAGE_USERS
      // (e.g. HR) pass.
      const canManage = await canManageUsers(authUser.id);
      if (!canManage)
        return NextResponse.json(
          { error: "Unauthorized: requires MANAGE_USERS permission" },
          { status: 403 }
        );

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
      const canManage = await canManageUsers(authUser.id);

      if (!canManage && authUser.id !== userId)
        return NextResponse.json(
          { error: "Unauthorized: requires MANAGE_USERS permission or self-access" },
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
      const canManage = await canManageUsers(authUser.id);

      if (!canManage)
        return NextResponse.json(
          { error: "Unauthorized: requires MANAGE_USERS permission" },
          { status: 403 }
        );

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

      // The user row changed (avatar/name/email/status/etc.) — drop the
      // cached session so /api/auth/me and the header avatar reflect it
      // immediately instead of serving the 5-min-stale session cache.
      if (Object.keys(updatedData).length > 0) {
        await invalidateAllSessionsForUser(userId);
      }

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

      // Reverse of the sync in updateEmployee: push the account's shared
      // identity/contact fields onto the linked Employee record so Employee
      // Master shows the same values. `updatedData` only carries fields the
      // caller actually changed, so a partial edit never blanks the other
      // side. updateMany is a no-op when the user has no employee row.
      const employeeSync: Record<string, any> = {};
      if (updatedData.email) employeeSync.emailAddress1 = updatedData.email;
      if (updatedData.first_name !== undefined) employeeSync.firstName = updatedData.first_name;
      if (updatedData.last_name !== undefined) employeeSync.lastName = updatedData.last_name;
      if (updatedData.department !== undefined) employeeSync.department = updatedData.department;
      if (updatedData.phone !== undefined) employeeSync.personalContact = updatedData.phone;
      if (updatedData.avatar !== undefined) employeeSync.employeeImage = updatedData.avatar;
      // Recompose the employee display name when either name part changed.
      if (updatedData.first_name !== undefined || updatedData.last_name !== undefined) {
        const fn = updatedData.first_name ?? user.first_name ?? "";
        const ln = updatedData.last_name ?? user.last_name ?? "";
        const full = `${fn} ${ln}`.trim();
        if (full) employeeSync.employeeName = full;
      }
      if (Object.keys(employeeSync).length > 0) {
        await prisma.employee.updateMany({ where: { userId }, data: employeeSync });
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
      const canManage = await canManageUsers(authUser.id);

      if (!canManage)
        return NextResponse.json(
          { error: "Unauthorized: requires MANAGE_USERS permission" },
          { status: 403 }
        );

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

      // ── Parse pagination + filter + sort params ──────────────────────────
      // All optional — when absent the endpoint falls back to "return every
      // row" so older callers keep working. `page` is 0-based.
      const sp = request.nextUrl.searchParams;
      const rawPage = parseInt(sp.get("page") ?? "", 10);
      const rawSize = parseInt(sp.get("pageSize") ?? "", 10);
      const paginate = Number.isFinite(rawSize) && rawSize > 0;
      const page = Number.isFinite(rawPage) && rawPage >= 0 ? rawPage : 0;
      const pageSize = paginate ? rawSize : 0;

      let conditions: AdvancedCondition[] = [];
      const rawConditions = sp.get("conditions");
      if (rawConditions) {
        try {
          const parsed = JSON.parse(rawConditions);
          if (Array.isArray(parsed)) conditions = parsed;
        } catch {
          // Malformed conditions param — ignore rather than 400 so a stale
          // saved view can't wedge the whole list.
        }
      }

      const filterClauses = buildEmployeeFilterClauses({
        search: sp.get("search") ?? undefined,
        status: sp.get("status") ?? undefined,
        gender: sp.get("gender") ?? undefined,
        department: sp.get("department") ?? undefined,
        minSalary: sp.get("minSalary") ?? undefined,
        maxSalary: sp.get("maxSalary") ?? undefined,
        conditions,
      });
      const orderBy = buildEmployeeOrderBy({
        sortBy: sp.get("sortBy") ?? undefined,
        sortDir: (sp.get("sortDir") as "asc" | "desc") ?? undefined,
      });

      const userWithRoles = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: { unitAssignments: { include: { role: { select: { name: true, isAdmin: true } } } } },
      });
      // Admin if any assigned role is flagged isAdmin OR named "*admin*".
      // We keep the name-based check alongside the boolean so older orgs
      // that named a role "Admin" without setting the flag still work.
      const adminUser = userWithRoles?.unitAssignments.some(
        (ua: any) =>
          ua.role.isAdmin === true ||
          ua.role.name.toLowerCase().includes("admin")
      ) ?? false;

      // Mirror EmployeeListItem — selects every field exposed by the static
      // Employee Form so the Employee Master table can offer a column for
      // each one via the Manage Columns dialog. Keep this in sync with the
      // EmployeeListItem interface in lib/api/employees.ts.
      const employeeSelect = {
        // Identifiers + Section 1 (Personal)
        id: true, userId: true, employeeName: true,
        // Avatar so the master table can show the same photo the user set on
        // their profile (synced via syncUserToEmployee → employeeImage).
        employeeImage: true,
        salutation: true, firstName: true, lastName: true,
        dob: true, placeOfBirth: true, bloodGroup: true,
        maritalStatus: true, nationality: true, gender: true,
        // Section 2 (Contact)
        emailAddress1: true, emailAddress2: true, personalContact: true,
        alternateNo1: true, alternateNo2: true,
        currentCity: true, currentState: true, currentCountry: true,
        permanentCity: true, permanentState: true, permanentCountry: true,
        emergencyContactName: true, emergencyPhone: true, emergencyRelation: true,
        // Section 3 (Employment)
        employmentType: true, department: true, designation: true,
        companyName: true, branch: true, status: true,
        dateOfJoining: true, dateOfLeaving: true,
        shiftType: true, inTime: true, outTime: true,
        totalWorkingHours: true, employeeEngagementTeamName: true,
        // engagementTeamId picked up from the incoming branch — keeps the
        // FK link to the engagement-team lookup table so the table can show
        // both the name AND the id for joins/filters.
        engagementTeamId: true,
        yearsOfAgreement: true,
        // Section 4 (Documents)
        aadharCardNo: true, aadharCardUpload: true,
        panCardUpload: true, passportUpload: true,
        // Section 5 (Salary & Compensation)
        salaryMode: true, baseSalary: true, totalSalary: true,
        perHourSalary: true, isOvertimeApplicable: true,
        overTime: true, bonusAmount: true, bonusAfterYears: true,
        incrementMonth: true,
        givenSalary: true, nightAllowance: true, oneHourExtra: true,
        // Section 6 (Bank)
        bankName: true, bankAccountNo: true, ifscCode: true, swiftCode: true,
        // Section 7 (Exit / Resignation)
        resignationLetterDate: true, reasonOfLeaving: true, noticeServed: true,
      };

      // The final Prisma `where` differs for admin vs non-admin (different
      // visibility rules). We capture it in one variable so the page slice,
      // the count, AND the optional aggregates all run against the exact same
      // constraint set — keeping the summary/group-by numbers consistent with
      // what the table shows.
      let where: any;

      if (adminUser) {
        const adminUserIds = await prisma.$queryRaw<{ id: string }[]>`
          SELECT DISTINCT u.id
          FROM users u
          JOIN user_unit_assignments uua ON uua.user_id = u.id
          JOIN roles r ON r.id = uua.role_id
          WHERE u.organization_id = ${authUser.organizationId}
          AND r.name ILIKE '%admin%'
        `.then((rows) => rows.map((r) => r.id));

        // Visibility constraints + the page's filter clauses, AND-ed together.
        where = {
          AND: [
            {
              status: "ACTIVE",
              userId: adminUserIds.length > 0 ? { notIn: adminUserIds } : undefined,
              user: { organizationId: authUser.organizationId },
            },
            ...filterClauses,
          ],
        };
      } else {
        // Hierarchy-based visibility: a parent role (e.g. HR) sees the
        // employee records of every role *below* it in the org's role tree,
        // not just their own.
        //
        // NOTE: unlike form-record visibility (which uses the unit-scoped
        // getInheritedUserIds to keep teams isolated), Employee Master is an
        // HR/management tool — a parent role should see every employee in a
        // descendant role regardless of which unit they sit in. So we walk
        // the role tree directly and pull all users in those roles, without
        // the shared-unit guard. The caller's own record is always added so
        // a leaf employee (no descendants) still sees themselves.
        const callerCtx = await getCallerRoleContext(
          authUser.id,
          authUser.organizationId as string,
        );
        const descendantRoleIds = await getDescendantRoleIds(
          authUser.organizationId as string,
          callerCtx.roleIds,
        );
        const descendantUsers =
          descendantRoleIds.length > 0
            ? await prisma.userUnitAssignment.findMany({
                where: {
                  roleId: { in: descendantRoleIds },
                  role: { organizationId: authUser.organizationId as string },
                },
                select: { userId: true },
                distinct: ["userId"],
              })
            : [];
        const visibleUserIds = Array.from(
          new Set<string>([
            authUser.id,
            ...descendantUsers.map((a) => a.userId),
          ]),
        );

        // Creators whose freshly-onboarded (still role-less) employees the
        // caller should see: the caller plus anyone who shares one of the
        // caller's roles. This makes the orphan window peer-shared — e.g. if
        // two people both hold the HR role, each sees employees the other
        // created even before a role/unit is assigned. Once a role IS
        // assigned the record shows up via the hierarchy arm for everyone
        // above it regardless of creator.
        const peerCreators =
          callerCtx.roleIds.length > 0
            ? await prisma.userUnitAssignment.findMany({
                where: {
                  roleId: { in: callerCtx.roleIds },
                  role: { organizationId: authUser.organizationId as string },
                },
                select: { userId: true },
                distinct: ["userId"],
              })
            : [];
        const creatorIds = Array.from(
          new Set<string>([authUser.id, ...peerCreators.map((a) => a.userId)]),
        );

        where = {
          AND: [
            {
              status: "ACTIVE",
              user: { organizationId: authUser.organizationId },
              // Visible if the employee's linked user is the caller or sits
              // below them in the role hierarchy, OR the record was created by
              // the caller or one of their role-peers. The createdById arm
              // covers the gap where a freshly onboarded employee has no role
              // yet (so isn't in the hierarchy) but should still be seen by the
              // HR/manager team that added them.
              OR: [
                { userId: { in: visibleUserIds } },
                { createdById: { in: creatorIds } },
              ],
            },
            ...filterClauses,
          ],
        };
      }

      // Shared across both visibility branches — same `where` for count, the
      // page slice, and the aggregates below.
      const total = await prisma.employee.count({ where });
      const employees = await prisma.employee.findMany({
        where,
        select: employeeSelect,
        orderBy,
        ...(paginate ? { skip: page * pageSize, take: pageSize } : {}),
      });

      // Optional roll-up totals + group-by counts for the summary strip and the
      // Group By chips. Computed over the FULL filtered set (not just the page)
      // so the numbers reflect every matching employee. Opt-in via
      // `withAggregates=1` so callers that only need the list don't pay for it.
      let aggregates:
        | {
            totalSalarySum: number;
            avgSalary: number;
            statusCounts: Record<string, number>;
            departmentCounts: Array<{ department: string; count: number }>;
          }
        | undefined;
      if (sp.get("withAggregates") === "1") {
        const [salary, byStatus, byDept] = await Promise.all([
          prisma.employee.aggregate({
            where,
            _sum: { totalSalary: true },
            _avg: { totalSalary: true },
          }),
          prisma.employee.groupBy({
            by: ["status"],
            where,
            _count: { _all: true },
          }),
          prisma.employee.groupBy({
            by: ["department"],
            where,
            _count: { _all: true },
            orderBy: { _count: { department: "desc" } },
            take: 50,
          }),
        ]);

        const statusCounts: Record<string, number> = {};
        for (const row of byStatus as any[]) {
          if (row.status) statusCounts[row.status] = row._count._all;
        }
        const departmentCounts = (byDept as any[])
          .filter((r) => r.department)
          .map((r) => ({ department: r.department as string, count: r._count._all }));

        aggregates = {
          totalSalarySum: Number(salary._sum.totalSalary ?? 0),
          avgSalary: Number(salary._avg.totalSalary ?? 0),
          statusCounts,
          departmentCounts,
        };
      }

      return NextResponse.json({
        success: true,
        employees,
        isAdmin: adminUser,
        total,
        page,
        pageSize,
        ...(aggregates ? { aggregates } : {}),
      });
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
      // Stamp the creator so the employee-list visibility filter can show
      // this record to whoever onboarded it, even while it has no role/unit
      // assignment yet (and is therefore outside the role hierarchy).
      data.createdById = authUser.id;

      // Guard against duplicate work emails. A real (non-blank) emailAddress1
      // that already belongs to another employee in this org is almost always
      // a data-entry mistake — and, combined with the user-reuse below + the
      // User<->Employee identity sync, it's exactly how one person's details
      // bleed onto another's record (two rows sharing one email, one backed by
      // a placeholder login). Reject it with a clear message instead of
      // silently creating the conflicting row. Blank emails are exempt —
      // multiple not-yet-contacted rows may legitimately have none.
      const incomingEmail =
        typeof body.emailAddress1 === "string" ? body.emailAddress1.trim() : "";
      if (incomingEmail) {
        const emailClash = await prisma.employee.findFirst({
          where: {
            emailAddress1: { equals: incomingEmail, mode: "insensitive" },
            // Same visibility scope the list uses: employees linked to a user
            // in this org, plus org-less orphan rows (which show in every org's
            // table). Without the orphan arm a duplicate against an unlinked
            // row would slip through.
            OR: [
              { user: { organizationId: authUser.organizationId } },
              { userId: null },
            ],
          },
          select: { employeeName: true },
        });
        if (emailClash) {
          return NextResponse.json(
            {
              error: `An employee with the email "${incomingEmail}" already exists${
                emailClash.employeeName ? ` (${emailClash.employeeName})` : ""
              }. Each employee needs a unique email address.`,
            },
            { status: 409 }
          );
        }
      }

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
          select: { id: true, organizationId: true, first_name: true, last_name: true },
        });

        // Reuse an existing account ONLY when it's safe to assume the same
        // identity — the account has no real name yet (a placeholder waiting to
        // be claimed) OR its name matches the new employee's. Reusing a *named,
        // different* person's login would bind this employee to someone else
        // and let the name sync overwrite one identity with the other (the
        // root cause of the "edit shows another user's data" bug). When it's
        // not clearly the same person, fall through to a fresh placeholder.
        const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
        const sameIdentity =
          !!existing &&
          ((!existing.first_name && !existing.last_name) ||
            `${norm(existing.first_name)} ${norm(existing.last_name)}`.trim() ===
              `${norm(firstName)} ${norm(lastName)}`.trim());

        // The login account we attach is created WITH `candidateEmail`, so the
        // employee's contact email and their login email are identical from the
        // start — never a placeholder that silently diverges from what was
        // typed. A blank contact email falls back to a random placeholder
        // address (the employee simply has no login email yet).
        const usingRealEmail = !candidateEmail.endsWith("@placeholder.local");

        let userId: string;
        if (existing && existing.organizationId === authUser.organizationId && sameIdentity) {
          // Same person who already has a login-only account in this org. Reuse
          // it so the one account holds both the login and the employee record
          // — but only if they don't already own an Employee row (Employee.userId
          // is @unique, and a person can't have two employee records).
          const taken = await prisma.employee.findUnique({
            where: { userId: existing.id },
            select: { id: true },
          });
          if (taken) {
            return NextResponse.json(
              { error: `This person already has an employee record. Edit the existing one instead of creating a duplicate.` },
              { status: 409 }
            );
          }
          userId = existing.id;
        } else if (existing && usingRealEmail) {
          // A real email that belongs to a DIFFERENT person (or another org).
          // Minting a placeholder login here is what produced the "employee
          // shows one email, user list shows another" bug. Reject so the
          // operator uses a unique email instead.
          return NextResponse.json(
            { error: `The email "${candidateEmail}" is already used by another account. Each person needs a unique email address.` },
            { status: 409 }
          );
        } else {
          // No account owns this email → create one WITH this email so the login
          // and the employee's contact email match from the start.
          const newUser = await prisma.user.create({
            data: {
              email: candidateEmail,
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

      // Sync the employee's department (and phone) onto the linked User so the
      // User Management list at /settings/users shows the same department that
      // was set on the Employee Master form. The user was just created/reused
      // above with only name + email; without this the department column there
      // stays blank until the employee is edited. Mirrors the Employee→User
      // sync the update path already does. Best-effort — never fail the create.
      if (employee.userId) {
        const userSync: Record<string, any> = {};
        const dept =
          typeof data.department === "string" && data.department.trim()
            ? data.department.trim()
            : null;
        if (dept) userSync.department = dept;
        const phone =
          typeof data.personalContact === "string" && data.personalContact.trim()
            ? data.personalContact.trim()
            : null;
        if (phone) userSync.phone = phone;
        if (Object.keys(userSync).length > 0) {
          try {
            await prisma.user.update({
              where: { id: employee.userId },
              data: userSync,
            });
            await invalidateAllSessionsForUser(employee.userId);
          } catch (err: any) {
            console.warn(
              "[createEmployee] department→user sync failed:",
              err?.message || err,
            );
          }
        }
      }

      // New employee → drop the live payroll cache so they appear in the
      // dashboard on the next fetch instead of waiting for the 5s TTL.
      if (authUser.organizationId) invalidatePayrollCache(authUser.organizationId);
      // Fire any workflow rule attached to the Employee Master module so
      // welcome emails / onboarding notifications can run.
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Employee Master",
          action: "Create",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: employee.id,
          recordData: employee as any,
        });
      }
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
        // Pull the previous resignation date so we can detect a null → set
        // transition and trigger offboarding. userId lets us keep the linked
        // login email in lockstep with the contact email below.
        select: { id: true, userId: true, resignationLetterDate: true, dateOfLeaving: true, reasonOfLeaving: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Employee not found" }, { status: 404 });
      }

      const data = sanitizeEmployeePayload(body, { partial: true });

      // Keep the email unique AND consistent on edits. A person has two email
      // columns — Employee.emailAddress1 (contact) and User.email (login) — and
      // they must stay equal, never silently diverge into a placeholder. Before
      // writing anything, if this edit sets a non-blank emailAddress1, reject it
      // when that value is already used by (a) another employee, or (b) another
      // user's login. Both checks run BEFORE the update so we never leave the
      // contact email changed while the login stays behind.
      if (typeof data.emailAddress1 === "string" && data.emailAddress1.trim()) {
        const wantEmail = data.emailAddress1.trim();

        const employeeClash = await prisma.employee.findFirst({
          where: {
            id: { not: id },
            emailAddress1: { equals: wantEmail, mode: "insensitive" },
            OR: [
              { user: { organizationId: authUser.organizationId } },
              { userId: null },
            ],
          },
          select: { employeeName: true },
        });
        if (employeeClash) {
          return NextResponse.json(
            {
              error: `Another employee already uses the email "${wantEmail}"${
                employeeClash.employeeName ? ` (${employeeClash.employeeName})` : ""
              }. Each employee needs a unique email address.`,
            },
            { status: 409 }
          );
        }

        // Login-email collision (with any account other than this employee's
        // own). Previously this was silently skipped, which is exactly what
        // left the contact email and login email out of sync.
        const loginClash = await prisma.user.findFirst({
          where: {
            email: { equals: wantEmail, mode: "insensitive" },
            NOT: { id: existing.userId ?? "" },
          },
          select: { id: true },
        });
        if (loginClash) {
          return NextResponse.json(
            {
              error: `The email "${wantEmail}" is already used as a login by another account. Use a unique email so the employee and their login stay in sync.`,
            },
            { status: 409 }
          );
        }
      }

      const employee = await prisma.employee.update({ where: { id }, data });

      // Offboarding trigger: HR sets `resignationLetterDate` on the Employee
      // form when a resignation comes in. The first time that field goes
      // from null → set, materialise the exit checklist with the default
      // task seeds. Idempotent on the service side, so re-saves are safe.
      const resignedNow =
        "resignationLetterDate" in data &&
        data.resignationLetterDate != null &&
        !existing.resignationLetterDate;
      if (resignedNow && authUser.organizationId) {
        const { materializeExitChecklist } = await import("@/lib/hr/offboarding-service");
        void materializeExitChecklist({
          organizationId: authUser.organizationId,
          employeeId: employee.id,
          initiatedAt: new Date(),
          lastWorkingDate: (employee as any).dateOfLeaving ?? null,
          reason: (employee as any).reasonOfLeaving ?? null,
          createdById: authUser.id,
        }).catch((err) =>
          console.error("[updateEmployee] materialise exit checklist:", err),
        );
      }

      // Mirror the shared identity/contact fields onto the linked User
      // account so an edit in Employee Master shows up everywhere the User
      // record is read (the "Create Users from Employee" / Edit User panel,
      // the header avatar, etc). updateUser does the exact reverse, so these
      // fields behave as one value editable from either side. Only fields
      // actually present (non-empty) in this payload are synced, so a partial
      // edit never blanks the other side.
      if (employee.userId) {
        const linkedUser = await prisma.user.findUnique({
          where: { id: employee.userId },
          select: { id: true, email: true },
        });
        if (linkedUser) {
          const userSync: Record<string, any> = {};
          const str = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
          const firstName = str(data.firstName);
          const lastName = str(data.lastName);
          if (firstName !== undefined) userSync.first_name = firstName;
          if (lastName !== undefined) userSync.last_name = lastName;
          if (str(data.department) !== undefined) userSync.department = str(data.department);
          if (str(data.personalContact) !== undefined) userSync.phone = str(data.personalContact);
          // Photo: sync both a new image AND an explicit removal. sanitize-
          // EmployeePayload normalises employeeImage to a trimmed string (set)
          // or null (cleared), and only includes the key when the payload
          // actually carried it — so mirroring the raw value keeps removal
          // symmetric with the profile-side remove-avatar, while an absent key
          // still leaves User.avatar untouched.
          if ("employeeImage" in data) userSync.avatar = data.employeeImage ?? null;

          // Email maps to the login address. Any collision was already rejected
          // before the employee write above, so here we sync it through
          // unconditionally — the contact email and login email always end up
          // equal (never a silent placeholder divergence).
          const newEmail = str(data.emailAddress1);
          if (newEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) && linkedUser.email !== newEmail) {
            userSync.email = newEmail;
          }

          if (Object.keys(userSync).length > 0) {
            await prisma.user.update({ where: { id: linkedUser.id }, data: userSync });
            // Drop the linked user's cached session so the avatar/name/email
            // edit made from Employee Master shows immediately (header avatar,
            // /api/auth/me) instead of the 5-min-stale session cache.
            await invalidateAllSessionsForUser(linkedUser.id);
          }
        }
      }

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

      // Status changes, role/dept changes, etc. → workflow rules fire so
      // notifications / field-update actions can run.
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Employee Master",
          action: "Edit",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: employee.id,
          recordData: employee as any,
        });
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
      await moveToTrash("Employee", id, {
        userId: authUser.id,
        userName: authUser.email,
        organizationId: authUser.organizationId,
      });
      // Drop the live payroll cache so the deleted row disappears from the
      // dashboard on the next fetch.
      if (authUser.organizationId) invalidatePayrollCache(authUser.organizationId);
      if (authUser.organizationId) {
        fireWorkflow({
          moduleName: "Employee Master",
          action: "Delete",
          organizationId: authUser.organizationId,
          userId: authUser.id,
          recordId: id,
          recordData: { id },
        });
      }
      return NextResponse.json({ success: true });
    }, "deleteEmployee");
  },

  // POST /api/employees/bulk — apply one action to many employees at once.
  // Body: { action: "delete" | "status", ids: string[], status?: EmployeeStatus }
  // Mirrors the single-row handlers' org scoping: only employees the caller's
  // organization owns (or unassigned orphan records) are touched, so a crafted
  // id list can never reach another org's data.
  async bulkUpdateEmployees(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);

      let body: { action?: string; ids?: unknown; status?: string };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
      }

      const action = body.action;
      const ids = Array.isArray(body.ids)
        ? Array.from(new Set(body.ids.filter((x): x is string => typeof x === "string")))
        : [];

      if (action !== "delete" && action !== "status") {
        return NextResponse.json(
          { error: "action must be 'delete' or 'status'" },
          { status: 400 },
        );
      }
      if (ids.length === 0) {
        return NextResponse.json({ error: "No employee ids provided" }, { status: 400 });
      }
      // Cap the batch so one request can't enqueue an unbounded amount of work.
      if (ids.length > 200) {
        return NextResponse.json(
          { error: "Too many records selected (max 200 per action)" },
          { status: 400 },
        );
      }

      const VALID_STATUSES = ["ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"];
      if (action === "status" && !VALID_STATUSES.includes(body.status ?? "")) {
        return NextResponse.json(
          { error: "Invalid status value" },
          { status: 400 },
        );
      }

      // Keep only ids this caller's org may touch (same scope as single delete).
      const scoped = await prisma.employee.findMany({
        where: {
          id: { in: ids },
          OR: [
            { user: { organizationId: authUser.organizationId } },
            { userId: null },
          ],
        },
        select: { id: true },
      });
      const validIds = scoped.map((e) => e.id);
      if (validIds.length === 0) {
        return NextResponse.json(
          { error: "None of the selected employees were found" },
          { status: 404 },
        );
      }

      let affected = 0;
      if (action === "delete") {
        // Reuse the same soft-delete primitive as single delete so trash /
        // restore behaves identically. Sequential to keep snapshot writes safe.
        for (const id of validIds) {
          try {
            await moveToTrash("Employee", id, {
              userId: authUser.id,
              userName: authUser.email,
              organizationId: authUser.organizationId,
            });
            affected++;
          } catch (err) {
            console.error(`[bulkUpdateEmployees] delete ${id} failed:`, err);
          }
        }
      } else {
        const res = await prisma.employee.updateMany({
          where: { id: { in: validIds } },
          data: { status: body.status as any },
        });
        affected = res.count;
      }

      // Refresh the live payroll cache (status/headcount changes feed it).
      if (authUser.organizationId) invalidatePayrollCache(authUser.organizationId);

      return NextResponse.json({ success: true, action, affected });
    }, "bulkUpdateEmployees");
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

  // Section 1 — Personal information
  if ("employeeName" in body) data.employeeName = String(body.employeeName).trim();
  strField("salutation");
  strField("firstName");
  strField("lastName");
  strField("placeOfBirth");
  strField("bloodGroup");
  strField("maritalStatus");
  strField("nationality");
  strField("employeeImage");
  strField("nativePlace");
  strField("country");
  strField("department");
  strField("designation");

  // Section 2 — Contact information (legacy single-field addresses + structured)
  strField("permanentAddress");
  strField("currentAddress");
  strField("personalContact");
  strField("alternateNo1");
  strField("alternateNo2");
  strField("emailAddress1");
  strField("emailAddress2");
  strField("currentAddressLine1");
  strField("currentAddressLine2");
  strField("currentCity");
  strField("currentState");
  strField("currentPostalCode");
  strField("currentCountry");
  strField("currentAccommodationType");
  strField("permanentAddressLine1");
  strField("permanentAddressLine2");
  strField("permanentCity");
  strField("permanentState");
  strField("permanentPostalCode");
  strField("permanentCountry");
  strField("permanentAccommodationType");
  strField("emergencyContactName");
  strField("emergencyPhone");
  strField("emergencyRelation");
  // emergencyContacts: stored as JSON array of {name, phone, relation}. The
  // form sends an array; we accept null/undefined → wipe, and otherwise
  // coerce to a plain array of normalized objects so junk values can't
  // poison the column.
  if ("emergencyContacts" in body) {
    const raw = body.emergencyContacts;
    if (Array.isArray(raw)) {
      data.emergencyContacts = raw
        .map((c: any) => ({
          name: typeof c?.name === "string" ? c.name.trim() : "",
          phone: typeof c?.phone === "string" ? c.phone.trim() : "",
          relation: typeof c?.relation === "string" ? c.relation.trim() : "",
        }))
        .filter((c) => c.name || c.phone);
    } else if (raw === null || raw === undefined) {
      data.emergencyContacts = null;
    }
  }

  // Section 3 — Employment details
  strField("employmentType");
  strField("branch");
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

  // Section 4 — Document uploads
  strField("aadharCardNo");
  strField("aadharCardUpload");
  strField("panCardUpload");
  strField("passportUpload");

  // Section 5 — Salary & compensation
  strField("salaryMode");

  // Section 6 — Bank details
  strField("bankName");
  strField("bankAccountNo");
  strField("ifscCode");
  strField("swiftCode");

  // Section 7 — Exit / Resignation
  strField("reasonOfLeaving");

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
  numField("baseSalary");
  numField("perHourSalary");
  numField("totalWorkingHours");
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
  dateField("resignationLetterDate");

  boolField("companySimIssue");
  boolField("isOvertimeApplicable");
  boolField("noticeServed");
  boolField("permanentSameAsCurrent");

  // Pass-through for builder-added field values. Keyed by FormField.id.
  if ("customFields" in body) {
    const v = body.customFields;
    if (v === null || v === undefined) {
      data.customFields = null;
    } else if (typeof v === "object" && !Array.isArray(v)) {
      data.customFields = v;
    } else {
      throw new Error("customFields must be an object");
    }
  }

  return data;
}
