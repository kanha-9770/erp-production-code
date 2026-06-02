'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth2';
import { getDateRange } from '@/lib/utils/date-utils';

// Helper: get org-scoped user IDs (for filtering LoginHistory, Employee, etc.)
async function getOrgUserIds(orgId: string | null | undefined): Promise<string[]> {
  if (!orgId) return [];
  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// Helper: get org-scoped form IDs (Forms belonging to org's modules)
async function getOrgFormIds(orgId: string | null | undefined, selectedModuleIds?: string[]): Promise<string[]> {
  const moduleWhere: any = { isActive: true };
  if (orgId) moduleWhere.organizationId = orgId;
  if (selectedModuleIds && selectedModuleIds.length > 0) {
    moduleWhere.id = { in: selectedModuleIds };
  }

  const modules = await prisma.formModule.findMany({
    where: moduleWhere,
    select: { forms: { select: { id: true } } },
  });
  return modules.flatMap((m) => m.forms.map((f) => f.id));
}

// Prisma @@map means actual PG table names are snake_case.
// Field @map means actual PG column names are also snake_case.
const FR_TABLE = (n: number) => `form_records_${n}`;

// Helper: count records across all 15 FormRecord tables in ONE round-trip.
// Uses UNION ALL instead of 15 parallel queries so a single connection handles
// everything — critical for staying inside Supabase's session-mode pool limit.
async function getFormRecordCounts(startDate: Date, endDate: Date, formIds: string[]) {
  if (formIds.length === 0) return { total: 0, byTable: Array.from({ length: 15 }, (_, i) => ({ table: i + 1, count: 0 })) };

  const union = Array.from({ length: 15 }, (_, i) =>
    `SELECT ${i + 1}::int AS tbl, COUNT(*)::bigint AS cnt FROM "${FR_TABLE(i + 1)}" WHERE "form_id" = ANY($1::text[]) AND "submitted_at" >= $2 AND "submitted_at" <= $3`
  ).join(' UNION ALL ');

  const rows = await prisma.$queryRawUnsafe<{ tbl: number; cnt: bigint }[]>(union, formIds, startDate, endDate);
  const byTable = Array.from({ length: 15 }, (_, i) => ({
    table: i + 1,
    count: Number(rows.find((r) => r.tbl === i + 1)?.cnt ?? 0),
  }));
  return { total: byTable.reduce((a, b) => a + b.count, 0), byTable };
}

// Maps the camelCase Prisma field names to their actual PG column names.
const COL_DB: Record<'formId' | 'userId', string> = { formId: 'form_id', userId: 'user_id' };

// Helper: sum records grouped by formId or userId across all 15 tables — one query.
// Replaces N×15 count() calls with a single aggregated SQL round-trip.
async function countRecordsGroupedBy(
  col: 'formId' | 'userId',
  ids: string[],
  startDate: Date,
  endDate: Date,
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const dbCol = COL_DB[col];
  const inner = Array.from({ length: 15 }, (_, i) =>
    `SELECT "${dbCol}" AS gkey, COUNT(*)::bigint AS cnt FROM "${FR_TABLE(i + 1)}" WHERE "${dbCol}" = ANY($1::text[]) AND "submitted_at" >= $2 AND "submitted_at" <= $3 GROUP BY "${dbCol}"`
  ).join(' UNION ALL ');
  const rows = await prisma.$queryRawUnsafe<{ gkey: string; total: bigint }[]>(
    `SELECT gkey, SUM(cnt)::bigint AS total FROM (${inner}) sub GROUP BY gkey`,
    ids, startDate, endDate,
  );
  return Object.fromEntries(rows.map((r) => [r.gkey, Number(r.total)]));
}

// Helper: fetch record rows from all 15 tables in one UNION ALL, keyed by formId.
// Replaces forms.length × 15 findMany() calls with a single SQL round-trip.
async function fetchRecordsByForm(
  formIds: string[],
  startDate: Date,
  endDate: Date,
): Promise<Map<string, Array<{ id: string; formId: string; status: string; submittedAt: Date; submittedBy: string | null; userId: string | null; amount: string | null }>>> {
  const map = new Map<string, any[]>();
  if (formIds.length === 0) return map;
  // Alias snake_case PG columns back to camelCase so downstream code is unchanged.
  const union = Array.from({ length: 15 }, (_, i) =>
    `SELECT "id", "form_id" AS "formId", "status", "submitted_at" AS "submittedAt", "submitted_by" AS "submittedBy", "user_id" AS "userId", "amount"::text AS amount FROM "${FR_TABLE(i + 1)}" WHERE "form_id" = ANY($1::text[]) AND "submitted_at" >= $2 AND "submitted_at" <= $3`
  ).join(' UNION ALL ');
  const rows = await prisma.$queryRawUnsafe<any[]>(union, formIds, startDate, endDate);
  for (const row of rows) {
    if (!map.has(row.formId)) map.set(row.formId, []);
    map.get(row.formId)!.push({ ...row, submittedAt: new Date(row.submittedAt) });
  }
  return map;
}

// ============================================================
// KPI Metrics  (fully org-scoped)
// ============================================================
export async function getOrganizationKPIs(dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const { startDate, endDate } = getDateRange(dateRange);

  const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
  const orgFormIds = orgId ? await getOrgFormIds(orgId) : [];

  const [totalUsers, activeUserLogins, auditLogEntries, totalEmployees, totalAttendances, totalModules] =
    await Promise.all([
      // Users in this org
      orgId
        ? prisma.user.count({ where: { organizationId: orgId } })
        : prisma.user.count(),

      // Active users: distinct userIds who logged in successfully (org-scoped)
      prisma.loginHistory.findMany({
        where: {
          status: 'Success',
          userId: orgId ? { in: orgUserIds } : { not: null },
          createdAt: { gte: startDate, lte: endDate },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),

      // Audit logs for this org
      prisma.auditLog.count({
        where: {
          ...(orgId && { organizationId: orgId }),
          createdAt: { gte: startDate, lte: endDate },
        },
      }),

      // Employees linked to org users
      orgId && orgUserIds.length > 0
        ? prisma.employee.count({ where: { userId: { in: orgUserIds } } })
        : prisma.employee.count(),

      // Attendances for org users
      orgId && orgUserIds.length > 0
        ? prisma.attendance.count({
            where: {
              userId: { in: orgUserIds },
              createdAt: { gte: startDate, lte: endDate },
            },
          })
        : prisma.attendance.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),

      // Modules for this org
      prisma.formModule.count({
        where: { ...(orgId && { organizationId: orgId }), isActive: true },
      }),
    ]);

  // Form records scoped to org's forms
  const recordCounts = await getFormRecordCounts(startDate, endDate, orgFormIds.length > 0 ? orgFormIds : []);

  return {
    totalUsers,
    activeUsers: activeUserLogins.length,
    totalFormSubmissions: recordCounts.total,
    auditLogEntries,
    totalEmployees,
    totalAttendances,
    totalModules,
  };
}

// ============================================================
// Form Modules & Records Analytics  (org-scoped)
// ============================================================
export async function getFormModules() {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);

  const modules = await prisma.formModule.findMany({
    where: {
      isActive: true,
      ...(orgId && { organizationId: orgId }),
      ...(!ctx.isAdmin && { id: { in: ctx.permittedModuleIds && ctx.permittedModuleIds.length > 0 ? ctx.permittedModuleIds : [] } }),
    },
    include: {
      forms: {
        select: {
          id: true,
          name: true,
          isPublished: true,
          _count: {
            select: {
              // Unified table only (kept complete via dual-write); was 16
              // correlated COUNT subqueries per form.
              records: true,
              sections: true,
            },
          },
        },
      },
      children: {
        where: { isActive: true, ...(orgId && { organizationId: orgId }) },
        select: { id: true, name: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  return modules.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    icon: m.icon,
    color: m.color,
    moduleType: m.moduleType,
    level: m.level,
    parentId: m.parentId,
    childCount: m.children.length,
    forms: m.forms.map((f) => {
      const totalRecords =
        f._count.records;
      return {
        id: f.id,
        name: f.name,
        isPublished: f.isPublished,
        totalRecords,
        sectionCount: f._count.sections,
      };
    }),
    totalRecords: m.forms.reduce((sum, f) => {
      return sum +
        f._count.records;
    }, 0),
  }));
}

// ============================================================
// Form-level Deep Analytics (org-scoped module)
// ============================================================
export async function getModuleDeepAnalytics(moduleId: string, dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);
  const { startDate, endDate } = getDateRange(dateRange);

  // Non-admin: check if user has permission for this module
  if (!ctx.isAdmin && ctx.permittedModuleIds !== null && !ctx.permittedModuleIds.includes(moduleId)) {
    return null;
  }

  const module = await prisma.formModule.findUnique({
    where: { id: moduleId },
    include: {
      forms: {
        include: {
          sections: {
            include: { fields: true },
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  });

  if (!module) return null;
  // Verify module belongs to user's org
  if (orgId && module.organizationId && module.organizationId !== orgId) return null;

  const formIds = module.forms.map((f) => f.id);
  const recordsByFormMap = await fetchRecordsByForm(formIds, startDate, endDate);

  const formsWithStats = module.forms.map((form) => {
      const allRecords = (recordsByFormMap.get(form.id) ?? []).sort(
        (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
      );

      const dailyMap: Record<string, number> = {};
      allRecords.forEach((r: any) => {
        const d = new Date(r.submittedAt).toISOString().split('T')[0];
        dailyMap[d] = (dailyMap[d] || 0) + 1;
      });

      const statusMap: Record<string, number> = {};
      allRecords.forEach((r: any) => {
        statusMap[r.status] = (statusMap[r.status] || 0) + 1;
      });

      return {
        formId: form.id,
        formName: form.name,
        isPublished: form.isPublished,
        totalRecords: allRecords.length,
        sections: form.sections.map((s) => ({
          id: s.id,
          title: s.title,
          fieldCount: s.fields.length,
          fields: s.fields.map((f) => ({
            id: f.id,
            label: f.label,
            type: f.type,
          })),
        })),
        dailyBreakdown: Object.entries(dailyMap)
          .map(([date, count]) => ({ date, submissions: count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        statusBreakdown: Object.entries(statusMap).map(([status, count]) => ({ status, count })),
      };
  });

  return {
    moduleId: module.id,
    moduleName: module.name,
    description: module.description,
    forms: formsWithStats,
    totalRecords: formsWithStats.reduce((s, f) => s + f.totalRecords, 0),
  };
}

// ============================================================
// Form Performance (org-scoped)
// ============================================================
export async function getFormMetrics(dateRange: string, selectedModuleIds?: string[]) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);
  const { startDate, endDate } = getDateRange(dateRange);

  // For non-admin: intersect selected modules with permitted modules
  let effectiveModuleIds = selectedModuleIds;
  if (!ctx.isAdmin && ctx.permittedModuleIds !== null) {
    const permitted = new Set(ctx.permittedModuleIds);
    effectiveModuleIds = effectiveModuleIds
      ? effectiveModuleIds.filter((id) => permitted.has(id))
      : ctx.permittedModuleIds;
    if (effectiveModuleIds.length === 0) return [];
  }

  const modules = await prisma.formModule.findMany({
    where: {
      isActive: true,
      ...(orgId && { organizationId: orgId }),
      ...(effectiveModuleIds && effectiveModuleIds.length > 0 && { id: { in: effectiveModuleIds } }),
    },
    include: {
      forms: { select: { id: true, name: true } },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const performance = await Promise.all(
    modules.map(async (mod) => {
      const modFormIds = mod.forms.map((f) => f.id);
      const dailyMap: Record<string, number> = {};
      let total = 0;
      let completed = 0;

      if (modFormIds.length > 0) {
        const union = Array.from({ length: 15 }, (_, i) =>
          `SELECT "status", "submitted_at"::text AS sat FROM "${FR_TABLE(i + 1)}" WHERE "form_id" = ANY($1::text[]) AND "submitted_at" >= $2 AND "submitted_at" <= $3`
        ).join(' UNION ALL ');
        const rows = await prisma.$queryRawUnsafe<{ status: string; sat: string }[]>(union, modFormIds, startDate, endDate);
        for (const r of rows) {
          total++;
          const d = r.sat.split('T')[0];
          dailyMap[d] = (dailyMap[d] || 0) + 1;
          if (r.status === 'submitted' || r.status === 'completed' || r.status === 'approved') completed++;
        }
      }

      return {
        formModule: mod.name,
        moduleId: mod.id,
        totalSubmissions: total,
        completed,
        pending: total - completed,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        dailyBreakdown: Object.entries(dailyMap)
          .map(([date, count]) => ({ date, submissions: count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    })
  );

  return performance.sort((a, b) => b.totalSubmissions - a.totalSubmissions);
}

// ============================================================
// User Analytics  (org-scoped)
// ============================================================
export async function getUserAnalytics(dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);
  const { startDate, endDate } = getDateRange(dateRange);

  const users = await prisma.user.findMany({
    where: {
      ...(orgId && { organizationId: orgId }),
      // Non-admin: only see own user data
      ...(!ctx.isAdmin && { id: ctx.userId }),
    },
    include: {
      employee: { select: { employeeName: true, department: true, designation: true, status: true } },
      unitAssignments: { include: { role: true, unit: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const userIds = users.map((u) => u.id);

  // Replace N×17 sequential queries with 3 bulk queries.
  const [loginGroups, activityGroups, submissionsMap] = await Promise.all([
    prisma.loginHistory.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, status: 'Success', createdAt: { gte: startDate, lte: endDate } },
      _count: { id: true },
    }),
    prisma.auditLog.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, createdAt: { gte: startDate, lte: endDate } },
      _count: { id: true },
    }),
    countRecordsGroupedBy('userId', userIds, startDate, endDate),
  ]);

  const loginMap = Object.fromEntries(loginGroups.map((g) => [g.userId!, g._count.id]));
  const activityMap = Object.fromEntries(activityGroups.map((g) => [g.userId, g._count.id]));

  const userAnalytics = users.map((user) => ({
    userId: user.id,
    email: user.email,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.email,
    role: user.unitAssignments[0]?.role?.name || 'No Role',
    status: user.status,
    department: user.employee?.department || user.department || '-',
    submissions: submissionsMap[user.id] ?? 0,
    loginCount: loginMap[user.id] ?? 0,
    activityCount: activityMap[user.id] ?? 0,
    joinedDate: user.createdAt.toLocaleDateString(),
  }));

  return userAnalytics;
}

// ============================================================
// Audit Trail  (org-scoped)
// ============================================================
export async function getAuditTrail(dateRange: string, limit: number = 50, offset: number = 0, filters?: {
  action?: string;
  module?: string;
  userId?: string;
  search?: string;
}) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);
  const { startDate, endDate } = getDateRange(dateRange);

  const where: any = {
    createdAt: { gte: startDate, lte: endDate },
    ...(orgId && { organizationId: orgId }),
    // Non-admin: only see own audit logs
    ...(!ctx.isAdmin && { userId: ctx.userId }),
    ...(filters?.action && { action: filters.action }),
    ...(filters?.module && { module: filters.module }),
    ...(filters?.userId && { userId: filters.userId }),
    ...(filters?.search && {
      OR: [
        { action: { contains: filters.search, mode: 'insensitive' } },
        { module: { contains: filters.search, mode: 'insensitive' } },
        { details: { contains: filters.search, mode: 'insensitive' } },
        { performedBy: { contains: filters.search, mode: 'insensitive' } },
        { recordName: { contains: filters.search, mode: 'insensitive' } },
      ],
    }),
  };

  const [auditLogs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { email: true, first_name: true, last_name: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      module: log.module,
      recordId: log.recordId,
      recordName: log.recordName,
      details: log.details,
      performedBy: log.performedBy,
      userEmail: log.user?.email || log.performedBy,
      userName: [log.user?.first_name, log.user?.last_name].filter(Boolean).join(' ') || log.user?.username || log.performedBy,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      timestamp: log.createdAt.toLocaleString(),
      createdAt: log.createdAt,
    })),
    total,
    hasMore: offset + limit < total,
  };
}

// ============================================================
// Organization Setup Metrics  (org-scoped)
// ============================================================
export async function getOrganizationSetupMetrics() {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);

  const orgUserIds = ctx.isAdmin && orgId ? await getOrgUserIds(orgId) : [];

  const [org, totalUsers, totalModules, totalForms, totalAuditLogs, totalRoles, totalUnits, totalEmployees] =
    await Promise.all([
      orgId ? prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, createdAt: true } }) : null,
      // Non-admin: count 1 (self); Admin: all org users
      ctx.isAdmin
        ? (orgId ? prisma.user.count({ where: { organizationId: orgId } }) : prisma.user.count())
        : Promise.resolve(1),
      // Non-admin: count only permitted modules
      ctx.isAdmin
        ? prisma.formModule.count({ where: { ...(orgId && { organizationId: orgId }), isActive: true } })
        : Promise.resolve(ctx.permittedModuleIds?.length || 0),
      // Non-admin: count only permitted forms
      ctx.isAdmin
        ? (orgId ? prisma.form.count({ where: { module: { organizationId: orgId } } }) : prisma.form.count())
        : Promise.resolve(ctx.permittedFormIds?.length || 0),
      // Non-admin: only own audit logs
      ctx.isAdmin
        ? prisma.auditLog.count({ where: { ...(orgId && { organizationId: orgId }) } })
        : prisma.auditLog.count({ where: { userId: ctx.userId } }),
      orgId ? prisma.role.count({ where: { organizationId: orgId } }) : 0,
      orgId ? prisma.organizationUnit.count({ where: { organizationId: orgId } }) : 0,
      ctx.isAdmin
        ? (orgId && orgUserIds.length > 0
            ? prisma.employee.count({ where: { userId: { in: orgUserIds } } })
            : prisma.employee.count())
        : prisma.employee.count({ where: { userId: ctx.userId } }),
    ]);

  const setupItems = [
    { name: 'Organization Details', completed: !!org },
    { name: 'Team Members', completed: totalUsers > 0 },
    { name: 'Roles Configured', completed: totalRoles > 0 },
    { name: 'Org Units Created', completed: totalUnits > 0 },
    { name: 'Form Modules', completed: totalModules > 0 },
    { name: 'Forms Created', completed: totalForms > 0 },
    { name: 'Employees Added', completed: totalEmployees > 0 },
    { name: 'Audit Logging', completed: totalAuditLogs > 0 },
  ];

  const completedItems = setupItems.filter((i) => i.completed).length;

  return {
    organizationName: org?.name || 'Your Organization',
    teamMembers: totalUsers,
    formsCreated: totalForms,
    modulesCreated: totalModules,
    rolesCreated: totalRoles,
    unitsCreated: totalUnits,
    totalEmployees,
    auditEntries: totalAuditLogs,
    setupItems,
    completionPercentage: Math.round((completedItems / setupItems.length) * 100),
  };
}

// ============================================================
// Submission Time Series  (org-scoped)
// ============================================================
export async function getSubmissionTimeSeries(dateRange: string, selectedModuleIds?: string[]) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);
  const { startDate, endDate } = getDateRange(dateRange);

  // For non-admin: intersect selected modules with permitted modules
  let effectiveModuleIds = selectedModuleIds;
  if (!ctx.isAdmin && ctx.permittedModuleIds !== null) {
    const permitted = new Set(ctx.permittedModuleIds);
    effectiveModuleIds = effectiveModuleIds
      ? effectiveModuleIds.filter((id) => permitted.has(id))
      : ctx.permittedModuleIds;
    if (effectiveModuleIds.length === 0) return [];
  }

  const orgFormIds = await getOrgFormIds(orgId, effectiveModuleIds);

  if (orgFormIds.length === 0) return [];

  const timeSeries: Record<string, number> = {};

  const tsUnion = Array.from({ length: 15 }, (_, i) =>
    `SELECT "submitted_at"::text AS sat FROM "${FR_TABLE(i + 1)}" WHERE "form_id" = ANY($1::text[]) AND "submitted_at" >= $2 AND "submitted_at" <= $3`
  ).join(' UNION ALL ');
  const tsRows = await prisma.$queryRawUnsafe<{ sat: string }[]>(tsUnion, orgFormIds, startDate, endDate);
  for (const r of tsRows) {
    const d = r.sat.split('T')[0];
    timeSeries[d] = (timeSeries[d] || 0) + 1;
  }

  return Object.entries(timeSeries)
    .map(([date, count]) => ({ date, submissions: count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================
// Action Breakdown for Audit (org-scoped)
// ============================================================
export async function getActionBreakdown(dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);
  const { startDate, endDate } = getDateRange(dateRange);

  const breakdown = await prisma.auditLog.groupBy({
    by: ['action'],
    where: {
      ...(orgId && { organizationId: orgId }),
      createdAt: { gte: startDate, lte: endDate },
      // Non-admin: only own actions
      ...(!ctx.isAdmin && { userId: ctx.userId }),
    },
    _count: true,
  });

  return breakdown.map((item) => ({
    action: item.action,
    count: item._count,
  }));
}

// ============================================================
// Advanced Global Search  (org-scoped)
// ============================================================
export async function globalSearch(query: string, filters?: {
  type?: 'all' | 'users' | 'forms' | 'modules' | 'audit' | 'employees' | 'records';
  dateRange?: string;
  moduleId?: string;
}) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);

  if (!query || query.length < 2) return { results: [], total: 0 };

  const searchType = filters?.type || 'all';
  const results: any[] = [];

  // Search Users (org-scoped; non-admin: only own user)
  if (searchType === 'all' || searchType === 'users') {
    const users = await prisma.user.findMany({
      where: {
        ...(orgId && { organizationId: orgId }),
        ...(!ctx.isAdmin && { id: ctx.userId }),
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } },
          { first_name: { contains: query, mode: 'insensitive' } },
          { last_name: { contains: query, mode: 'insensitive' } },
          { department: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, email: true, first_name: true, last_name: true,
        username: true, status: true, department: true, createdAt: true,
      },
      take: 10,
    });
    results.push(
      ...users.map((u) => ({
        type: 'user' as const,
        id: u.id,
        title: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.email,
        subtitle: u.email,
        meta: { status: u.status, department: u.department },
        createdAt: u.createdAt,
      }))
    );
  }

  // Search Form Modules (org-scoped; non-admin: only permitted modules)
  if (searchType === 'all' || searchType === 'modules') {
    const modules = await prisma.formModule.findMany({
      where: {
        ...(orgId && { organizationId: orgId }),
        ...(!ctx.isAdmin && ctx.permittedModuleIds !== null && {
          id: { in: ctx.permittedModuleIds.length > 0 ? ctx.permittedModuleIds : [] },
        }),
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, name: true, description: true, moduleType: true, isActive: true,
        _count: { select: { forms: true } },
      },
      take: 10,
    });
    results.push(
      ...modules.map((m) => ({
        type: 'module' as const,
        id: m.id,
        title: m.name,
        subtitle: m.description || 'Form Module',
        meta: { moduleType: m.moduleType, formCount: m._count.forms, isActive: m.isActive },
      }))
    );
  }

  // Search Forms (org-scoped via module; non-admin: only permitted forms)
  if (searchType === 'all' || searchType === 'forms') {
    const forms = await prisma.form.findMany({
      where: {
        ...(orgId && { module: { organizationId: orgId } }),
        ...(!ctx.isAdmin && ctx.permittedFormIds !== null && {
          id: { in: ctx.permittedFormIds.length > 0 ? ctx.permittedFormIds : [] },
        }),
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { module: { select: { name: true } } },
      take: 10,
    });
    results.push(
      ...forms.map((f) => ({
        type: 'form' as const,
        id: f.id,
        title: f.name,
        subtitle: `Module: ${f.module.name}`,
        meta: { isPublished: f.isPublished, moduleId: f.moduleId },
      }))
    );
  }

  // Search Employees (org-scoped via userId; non-admin: only own employee)
  if (searchType === 'all' || searchType === 'employees') {
    const employeeUserFilter = !ctx.isAdmin
      ? { userId: ctx.userId }
      : orgId
        ? { userId: { in: (await getOrgUserIds(orgId)) } }
        : {};
    const employees = await prisma.employee.findMany({
      where: {
        ...employeeUserFilter,
        OR: [
          { employeeName: { contains: query, mode: 'insensitive' } },
          { department: { contains: query, mode: 'insensitive' } },
          { designation: { contains: query, mode: 'insensitive' } },
          { emailAddress1: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, employeeName: true, department: true, designation: true, status: true },
      take: 10,
    });
    results.push(
      ...employees.map((e) => ({
        type: 'employee' as const,
        id: e.id,
        title: e.employeeName,
        subtitle: `${e.department || ''} ${e.designation ? `- ${e.designation}` : ''}`.trim(),
        meta: { status: e.status },
      }))
    );
  }

  // Search Audit Logs (org-scoped; non-admin: only own audit logs)
  if (searchType === 'all' || searchType === 'audit') {
    const audits = await prisma.auditLog.findMany({
      where: {
        ...(orgId && { organizationId: orgId }),
        ...(!ctx.isAdmin && { userId: ctx.userId }),
        OR: [
          { action: { contains: query, mode: 'insensitive' } },
          { module: { contains: query, mode: 'insensitive' } },
          { details: { contains: query, mode: 'insensitive' } },
          { performedBy: { contains: query, mode: 'insensitive' } },
          { recordName: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { user: { select: { email: true, first_name: true, last_name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    results.push(
      ...audits.map((a) => ({
        type: 'audit' as const,
        id: a.id,
        title: `${a.action} - ${a.module}`,
        subtitle: a.details || `By: ${a.performedBy}`,
        meta: { performedBy: a.performedBy, ipAddress: a.ipAddress, recordName: a.recordName },
        createdAt: a.createdAt,
      }))
    );
  }

  return { results, total: results.length };
}

// ============================================================
// Login History Analytics  (org-scoped)
// ============================================================
export async function getLoginAnalytics(dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);
  const { startDate, endDate } = getDateRange(dateRange);

  // Non-admin: only own login data; Admin: all org users
  let userFilter: any = {};
  if (!ctx.isAdmin) {
    userFilter = { userId: ctx.userId };
  } else {
    const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
    userFilter = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};
  }

  const [loginHistory, successCount, failedCount] = await Promise.all([
    prisma.loginHistory.findMany({
      where: { ...userFilter, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { email: true, first_name: true, last_name: true } } },
    }),
    prisma.loginHistory.count({
      where: { ...userFilter, status: 'Success', createdAt: { gte: startDate, lte: endDate } },
    }),
    prisma.loginHistory.count({
      where: { ...userFilter, status: 'Failed', createdAt: { gte: startDate, lte: endDate } },
    }),
  ]);

  const dailyMap: Record<string, { success: number; failed: number }> = {};
  loginHistory.forEach((l) => {
    const d = l.createdAt.toISOString().split('T')[0];
    if (!dailyMap[d]) dailyMap[d] = { success: 0, failed: 0 };
    if (l.status === 'Success') dailyMap[d].success++;
    else dailyMap[d].failed++;
  });

  return {
    history: loginHistory.map((l) => ({
      id: l.id,
      email: l.email,
      userName: l.user ? [l.user.first_name, l.user.last_name].filter(Boolean).join(' ') : l.email,
      status: l.status,
      reason: l.reason,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      createdAt: l.createdAt,
    })),
    successCount,
    failedCount,
    dailyBreakdown: Object.entries(dailyMap)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ============================================================
// Employee Analytics  (org-scoped)
// ============================================================
export async function getEmployeeAnalytics() {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);

  // Non-admin: only own employee data; Admin: all org employees
  let employeeWhere: any = {};
  if (!ctx.isAdmin) {
    employeeWhere = { userId: ctx.userId };
  } else {
    const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
    employeeWhere = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};
  }

  const [employees, departmentBreakdown] = await Promise.all([
    prisma.employee.findMany({
      where: employeeWhere,
      include: { user: { select: { email: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.employee.groupBy({
      by: ['department'],
      where: employeeWhere,
      _count: true,
    }),
  ]);

  const statusBreakdown = await prisma.employee.groupBy({
    by: ['status'],
    where: employeeWhere,
    _count: true,
  });

  return {
    employees: employees.map((e) => ({
      id: e.id,
      name: e.employeeName,
      department: e.department || '-',
      designation: e.designation || '-',
      status: e.status,
      dateOfJoining: e.dateOfJoining,
      email: e.user?.email || '-',
    })),
    totalEmployees: employees.length,
    departmentBreakdown: departmentBreakdown
      .filter((d) => d.department)
      .map((d) => ({ department: d.department!, count: d._count })),
    statusBreakdown: statusBreakdown.map((s) => ({
      status: s.status || 'Unknown',
      count: s._count,
    })),
  };
}

// ============================================================
// Roles & Permissions Analytics  (org-scoped)
// ============================================================
export async function getRolesAnalytics() {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const ctx = await getPermissionContext(session);

  if (!orgId) return { roles: [], totalRoles: 0, totalPermissions: 0 };

  // Non-admin: only see roles they are assigned to
  const userRoleIds = !ctx.isAdmin
    ? session.user.unitAssignments
        ?.filter((ua: any) => ua.role?.isActive)
        ?.map((ua: any) => ua.role.id) || []
    : null;

  const [roles, totalPermissions] = await Promise.all([
    prisma.role.findMany({
      where: {
        organizationId: orgId,
        ...(userRoleIds !== null && { id: { in: userRoleIds } }),
      },
      include: {
        rolePermissions: { select: { id: true } },
        userAssignments: { select: { id: true } },
        children: { select: { id: true, name: true } },
      },
      orderBy: { level: 'asc' },
    }),
    prisma.permission.count({ where: { organizationId: orgId } }),
  ]);

  return {
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      level: r.level,
      isAdmin: r.isAdmin,
      isActive: r.isActive,
      permissionCount: r.rolePermissions.length,
      userCount: r.userAssignments.length,
      childCount: r.children.length,
    })),
    totalRoles: roles.length,
    totalPermissions,
  };
}

// ============================================================
// Helper: get permitted module IDs for a user (role + user-level)
// ============================================================
async function getPermittedModuleIds(userId: string, roleIds: string[]): Promise<string[]> {
  const allowedSet = new Set<string>();

  // Role-level VIEW permissions on modules
  if (roleIds.length > 0) {
    const roleModulePerms = await prisma.rolePermission.findMany({
      where: {
        roleId: { in: roleIds },
        granted: true,
        moduleId: { not: null },
        permission: { name: 'VIEW' },
      },
      select: { moduleId: true },
    });
    for (const rmp of roleModulePerms) {
      if (rmp.moduleId) allowedSet.add(rmp.moduleId);
    }
  }

  // User-level module permissions (override role-level)
  const userModulePerms = await prisma.userPermission.findMany({
    where: {
      userId,
      isActive: true,
      moduleId: { not: null },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { moduleId: true, canView: true, granted: true },
  });

  for (const ump of userModulePerms) {
    if (!ump.moduleId) continue;
    if (ump.canView && ump.granted) {
      allowedSet.add(ump.moduleId);
    } else {
      allowedSet.delete(ump.moduleId);
    }
  }

  return [...allowedSet];
}

// ============================================================
// Permission context: determines what the current user can see
// ============================================================
async function getPermissionContext(session: any) {
  const userId = session.user.id;
  const orgId = session.user.organizationId;

  // Check admin via role flag OR role name containing 'admin'
  const hasAdminRole = session.user.unitAssignments?.some(
    (ua: any) => ua.role?.isAdmin || ua.role?.name?.toLowerCase().includes('admin')
  ) || false;

  // Check if user owns the organization
  const isOrgOwner = orgId
    ? !!(await prisma.organization.findFirst({ where: { id: orgId, ownerId: userId }, select: { id: true } }))
    : false;

  const isAdmin = hasAdminRole || isOrgOwner;

  if (isAdmin) {
    return { userId, orgId, isAdmin: true as const, permittedModuleIds: null as string[] | null, permittedFormIds: null as string[] | null };
  }

  const roleIds = session.user.unitAssignments
    ?.filter((ua: any) => ua.role?.isActive && ua.unit?.isActive)
    ?.map((ua: any) => ua.role.id) || [];

  const permittedModuleIds = await getPermittedModuleIds(userId, roleIds);

  const permittedModules = permittedModuleIds.length > 0
    ? await prisma.formModule.findMany({
        where: { id: { in: permittedModuleIds }, isActive: true },
        select: { forms: { select: { id: true } } },
      })
    : [];
  const permittedFormIds = permittedModules.flatMap((m) => m.forms.map((f) => f.id));

  return { userId, orgId, isAdmin: false as const, permittedModuleIds, permittedFormIds };
}

// ============================================================
// User-specific Dashboard Data  (permission-filtered)
// ============================================================
export async function getUserDashboardData(dateRange: string) {
  const session = await requireAuth();
  const userId = session.user.id;
  const orgId = session.user.organizationId;
  const { startDate, endDate } = getDateRange(dateRange);

  // Get user info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      employee: {
        select: {
          employeeName: true,
          department: true,
          designation: true,
          status: true,
          dateOfJoining: true,
        },
      },
      unitAssignments: {
        include: {
          role: { select: { id: true, name: true, isAdmin: true, isActive: true } },
          unit: { select: { id: true, name: true, isActive: true } },
        },
      },
    },
  });

  // Get user's role IDs for permission lookup (only active roles in active units)
  const roleIds = user?.unitAssignments
    .filter((ua) => ua.role.isActive && ua.unit.isActive)
    .map((ua) => ua.role.id) || [];

  // Get modules the user has VIEW permission for
  const permittedModuleIds = await getPermittedModuleIds(userId, roleIds);

  // Fetch only permitted modules
  const modules = await prisma.formModule.findMany({
    where: {
      isActive: true,
      ...(orgId && { organizationId: orgId }),
      ...(permittedModuleIds.length > 0
        ? { id: { in: permittedModuleIds } }
        : { id: { in: [] } }), // no permissions = no modules
    },
    include: {
      forms: {
        select: {
          id: true,
          name: true,
          isPublished: true,
          _count: {
            select: {
              // Unified table only (kept complete via dual-write).
              records: true,
              sections: true,
            },
          },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  // Collect permitted form IDs for scoping submissions/time series
  const permittedFormIds = modules.flatMap((m) => m.forms.map((f) => f.id));

  const formattedModules = modules.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    icon: m.icon,
    color: m.color,
    moduleType: m.moduleType,
    forms: m.forms.map((f) => {
      const totalRecords =
        f._count.records;
      return { id: f.id, name: f.name, isPublished: f.isPublished, totalRecords, sectionCount: f._count.sections };
    }),
    totalRecords: m.forms.reduce((sum, f) => {
      return sum +
        f._count.records;
    }, 0),
  }));

  // Count user's submissions only in permitted forms. One query against the
  // unified table (complete via dual-write, indexed on userId/formId/submittedAt)
  // instead of 15 sequential per-shard counts.
  let mySubmissions = 0;
  if (permittedFormIds.length > 0) {
    mySubmissions = await prisma.formRecord.count({
      where: {
        userId,
        formId: { in: permittedFormIds },
        submittedAt: { gte: startDate, lte: endDate },
      },
    });
  }

  // User's attendance in period
  const myAttendance = await prisma.attendance.count({
    where: {
      userId,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  // User's recent activity (audit logs)
  const myActivityCount = await prisma.auditLog.count({
    where: {
      userId,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  // User's login count
  const myLoginCount = await prisma.loginHistory.count({
    where: {
      userId,
      status: 'Success',
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  // User's submission time series scoped to permitted forms. One unified-table
  // query instead of 15 sequential per-shard findManys.
  const timeSeries: Record<string, number> = {};
  if (permittedFormIds.length > 0) {
    const records = await prisma.formRecord.findMany({
      where: {
        userId,
        formId: { in: permittedFormIds },
        submittedAt: { gte: startDate, lte: endDate },
      },
      select: { submittedAt: true },
    });
    records.forEach((r: any) => {
      const d = new Date(r.submittedAt).toISOString().split('T')[0];
      timeSeries[d] = (timeSeries[d] || 0) + 1;
    });
  }

  const myTimeSeries = Object.entries(timeSeries)
    .map(([date, count]) => ({ date, submissions: count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Recent audit logs for the user
  const recentActivity = await prisma.auditLog.findMany({
    where: {
      userId,
      createdAt: { gte: startDate, lte: endDate },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      action: true,
      module: true,
      recordName: true,
      createdAt: true,
    },
  });

  return {
    user: {
      name: [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || user?.email || '',
      email: user?.email || '',
      department: user?.employee?.department || user?.department || '-',
      designation: user?.employee?.designation || '-',
      status: user?.employee?.status || user?.status || '-',
      dateOfJoining: user?.employee?.dateOfJoining?.toLocaleDateString() || '-',
      roles: user?.unitAssignments.map((ua) => ({
        roleName: ua.role.name,
        unitName: ua.unit.name,
      })) || [],
    },
    stats: {
      mySubmissions,
      myAttendance,
      myActivityCount,
      myLoginCount,
    },
    modules: formattedModules,
    timeSeries: myTimeSeries,
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      action: a.action,
      module: a.module,
      recordName: a.recordName,
      timestamp: a.createdAt.toLocaleString(),
    })),
  };
}

// ============================================================
// Admin "today's pulse" — operational signals an admin needs first.
// ============================================================
//
// Returns counts the admin actually cares about on landing:
//   - presentToday      number of org members who punched in today
//   - onLeaveToday      number on approved leave that covers today
//   - totalEmployees    org headcount (Employee rows linked to org users)
//   - pendingLeaves     leave requests still awaiting decision
//   - newApplications   job applications in early stages (NEW/SCREENING)
//   - submissionsThisWeek / submissionsPriorWeek  for a delta widget
//   - auditEntries7d    audit volume last 7 days (security signal)
//
// All counts are org-scoped. Returns zeros if the user isn't in an org —
// the UI uses that as the empty state.
export async function getAdminPulse() {
  const session = await requireAuth();
  const orgId = session.user.organizationId;

  if (!orgId) {
    return {
      presentToday: 0,
      onLeaveToday: 0,
      totalEmployees: 0,
      pendingLeaves: 0,
      newApplications: 0,
      submissionsThisWeek: 0,
      submissionsPriorWeek: 0,
      auditEntries7d: 0,
    };
  }

  // YYYY-MM-DD in the server's locale — matches how Attendance.date and
  // LeaveRequest.startDate/endDate are stored.
  const todayStr = new Date().toISOString().slice(0, 10);

  // [now-7d, now) — "this week"
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 14);

  const orgUserIds = await getOrgUserIds(orgId);
  const orgFormIds = await getOrgFormIds(orgId);

  const [
    presentToday,
    onLeaveToday,
    totalEmployees,
    pendingLeaves,
    newApplications,
    auditEntries7d,
    submissionsThisWeek,
    submissionsPriorWeek,
  ] = await Promise.all([
    prisma.attendance.count({
      where: {
        organizationId: orgId,
        date: todayStr,
        checkedIn: true,
      },
    }),
    prisma.leaveRequest.count({
      where: {
        organizationId: orgId,
        status: 'APPROVED',
        startDate: { lte: todayStr },
        endDate: { gte: todayStr },
      },
    }),
    orgUserIds.length > 0
      ? prisma.employee.count({ where: { userId: { in: orgUserIds } } })
      : Promise.resolve(0),
    prisma.leaveRequest.count({
      where: { organizationId: orgId, status: 'PENDING' },
    }),
    prisma.jobApplication.count({
      where: {
        organizationId: orgId,
        status: { in: ['NEW', 'SCREENING'] },
      },
    }),
    prisma.auditLog.count({
      where: { organizationId: orgId, createdAt: { gte: sevenDaysAgo } },
    }),
    getFormRecordCounts(sevenDaysAgo, now, orgFormIds).then((r) => r.total),
    getFormRecordCounts(fourteenDaysAgo, sevenDaysAgo, orgFormIds).then((r) => r.total),
  ]);

  return {
    presentToday,
    onLeaveToday,
    totalEmployees,
    pendingLeaves,
    newApplications,
    submissionsThisWeek,
    submissionsPriorWeek,
    auditEntries7d,
  };
}

// ============================================================
// Check if current user is admin  (server-side helper)
// ============================================================
export async function checkIsAdmin(): Promise<boolean> {
  const session = await requireAuth();
  const user = session.user;

  const isOrgOwner = !!(user as any).ownedOrganization;
  const hasAdminRole = user.unitAssignments.some(
    (ua: any) => ua.role.isAdmin || ua.role.name.toLowerCase().includes('admin')
  );

  return isOrgOwner || hasAdminRole;
}