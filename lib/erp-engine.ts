import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type AccessRole = 'user' | 'manager' | 'admin' | 'super_admin';

export interface ERPContext {
  userId: string;
  organizationId: string;
  accessRole: AccessRole;
  roleLevel: number;
  isAdmin: boolean;
  allowedModuleIds: string[];
  allowedFormIds: string[];
}

export interface FormRecordRow {
  id: string;
  formId: string;
  formName: string;
  moduleName: string;
  recordData: Record<string, unknown>;
  status: string;
  submittedAt: Date;
  submittedBy: string | null;
  userId: string | null;
  amount: number | null;
  date: Date | null;
}

// ---------------------------------------------------------------------------
// 1. Resolve the requesting user's access role & permissions
// ---------------------------------------------------------------------------
export async function resolveERPContext(userId: string, organizationId: string): Promise<ERPContext> {
  // Get user's role assignments
  const assignments = await prisma.userUnitAssignment.findMany({
    where: { userId },
    include: { role: true },
  });

  // Get direct permissions
  const permissions = await prisma.userPermission.findMany({
    where: { userId, isActive: true, granted: true },
  });

  // Determine highest role
  let accessRole: AccessRole = 'user';
  let roleLevel = 999;
  let isAdmin = false;

  for (const a of assignments) {
    if (a.role.isAdmin) {
      isAdmin = true;
      accessRole = 'admin';
    }
    if (a.role.level < roleLevel) {
      roleLevel = a.role.level;
    }
  }

  // Check if owner
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });
  if (org?.ownerId === userId) {
    accessRole = 'super_admin';
    isAdmin = true;
    roleLevel = 0;
  } else if (roleLevel <= 1 && isAdmin) {
    accessRole = 'admin';
  } else if (roleLevel <= 2) {
    accessRole = 'manager';
  }

  // Check system admin flag
  if (permissions.some(p => p.isSystemAdmin)) {
    accessRole = 'super_admin';
    isAdmin = true;
  }

  // Resolve allowed modules/forms
  let allowedModuleIds: string[] = [];
  let allowedFormIds: string[] = [];

  if (accessRole === 'super_admin' || accessRole === 'admin') {
    // Admin/super_admin: all modules and forms in org
    const modules = await prisma.formModule.findMany({
      where: { organizationId },
      select: { id: true },
    });
    allowedModuleIds = modules.map(m => m.id);

    const forms = await prisma.form.findMany({
      where: { module: { organizationId } },
      select: { id: true },
    });
    allowedFormIds = forms.map(f => f.id);
  } else {
    // Filter by permissions
    const modulePerms = permissions.filter(p => p.moduleId && p.canView);
    allowedModuleIds = [...new Set(modulePerms.map(p => p.moduleId!))];

    const formPerms = permissions.filter(p => p.formId && p.canView);
    allowedFormIds = [...new Set(formPerms.map(p => p.formId!))];

    // Also include forms from allowed modules
    if (allowedModuleIds.length > 0) {
      const moduleForms = await prisma.form.findMany({
        where: { moduleId: { in: allowedModuleIds } },
        select: { id: true },
      });
      allowedFormIds = [...new Set([...allowedFormIds, ...moduleForms.map(f => f.id)])];
    }
  }

  return {
    userId,
    organizationId,
    accessRole,
    roleLevel,
    isAdmin,
    allowedModuleIds,
    allowedFormIds,
  };
}

// ---------------------------------------------------------------------------
// 2. Dynamic metadata discovery -- no hardcoded assumptions
// ---------------------------------------------------------------------------
export async function discoverOrgStructure(ctx: ERPContext) {
  const [modules, users, roles, units, employees] = await Promise.all([
    prisma.formModule.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      include: {
        forms: {
          select: {
            id: true, name: true, isPublished: true,
            sections: { include: { fields: { select: { id: true, label: true, type: true } } } },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.user.count({ where: { organizationId: ctx.organizationId } }),
    prisma.role.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true, level: true, isAdmin: true },
    }),
    prisma.organizationUnit.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true, level: true },
    }),
    prisma.employee.count({
      where: { user: { organizationId: ctx.organizationId } },
    }),
  ]);

  return { modules, totalUsers: users, roles, units, totalEmployees: employees };
}

// ---------------------------------------------------------------------------
// 3. Dynamic form record querying across FormRecord1..15
// ---------------------------------------------------------------------------
const RECORD_TABLE_NAMES = [
  'form_records_1', 'form_records_2', 'form_records_3', 'form_records_4',
  'form_records_5', 'form_records_6', 'form_records_7', 'form_records_8',
  'form_records_9', 'form_records_10', 'form_records_11', 'form_records_12',
  'form_records_13', 'form_records_14', 'form_records_15',
] as const;

export async function getFormTableMapping(formId: string): Promise<string | null> {
  const mapping = await prisma.formTableMapping.findUnique({
    where: { formId },
    select: { storageTable: true },
  });
  return mapping?.storageTable ?? null;
}

/**
 * Query records from the correct FormRecord table for a given form.
 * Applies role-based filtering:
 *  - user: own records only
 *  - manager: team records (same unit)
 *  - admin/super_admin: all org records
 */
export async function queryFormRecords(
  ctx: ERPContext,
  formId: string,
  options?: {
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    search?: string;
  }
): Promise<FormRecordRow[]> {
  if (!ctx.allowedFormIds.includes(formId)) return [];

  // Try unified table first (single query, no table routing needed)
  const unifiedResult = await querySpecificTable(ctx, formId, "form_records", options);
  if (unifiedResult.length > 0) return unifiedResult;

  // Fallback to legacy table routing
  const storageTable = await getFormTableMapping(formId);
  if (!storageTable) {
    return queryAllTablesForForm(ctx, formId, options);
  }

  return querySpecificTable(ctx, formId, storageTable, options);
}

async function querySpecificTable(
  ctx: ERPContext,
  formId: string,
  tableName: string,
  options?: { status?: string; dateFrom?: Date; dateTo?: Date; limit?: number; search?: string }
): Promise<FormRecordRow[]> {
  const conditions: string[] = [`fr.form_id = '${formId}'`];

  // Role-based row filtering
  if (ctx.accessRole === 'user') {
    conditions.push(`fr.user_id = '${ctx.userId}'`);
  } else if (ctx.accessRole === 'manager') {
    const teamUserIds = await getTeamUserIds(ctx);
    if (teamUserIds.length > 0) {
      conditions.push(`(fr.user_id IN (${teamUserIds.map(id => `'${id}'`).join(',')}) OR fr.user_id = '${ctx.userId}')`);
    }
  }
  // admin/super_admin: no user_id filter

  if (options?.status) conditions.push(`fr.status = '${options.status}'`);
  if (options?.dateFrom) conditions.push(`fr.submitted_at >= '${options.dateFrom.toISOString()}'`);
  if (options?.dateTo) conditions.push(`fr.submitted_at <= '${options.dateTo.toISOString()}'`);

  const limit = options?.limit ?? 100;
  const whereClause = conditions.join(' AND ');

  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT fr.id, fr.form_id as "formId", fr.record_data as "recordData", 
             fr.status, fr.submitted_at as "submittedAt", fr.submitted_by as "submittedBy",
             fr.user_id as "userId", fr.amount, fr.date,
             f.name as "formName", fm.name as "moduleName"
      FROM "${tableName}" fr
      JOIN forms f ON f.id = fr.form_id
      JOIN form_modules fm ON fm.id = f.module_id
      WHERE ${whereClause}
      ORDER BY fr.submitted_at DESC
      LIMIT ${limit}
    `);
    return rows.map(normalizeRow);
  } catch {
    return [];
  }
}

async function queryAllTablesForForm(
  ctx: ERPContext,
  formId: string,
  options?: { status?: string; dateFrom?: Date; dateTo?: Date; limit?: number; search?: string }
): Promise<FormRecordRow[]> {
  const results: FormRecordRow[] = [];
  for (const tableName of RECORD_TABLE_NAMES) {
    const rows = await querySpecificTable(ctx, formId, tableName, options);
    results.push(...rows);
    if (results.length >= (options?.limit ?? 100)) break;
  }
  return results.slice(0, options?.limit ?? 100);
}

/**
 * Aggregate counts across all record tables for org's forms.
 * Used for KPI calculations.
 */
export async function aggregateOrgRecords(ctx: ERPContext, options?: {
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
}) {
  const results: { tableName: string; formId: string; count: number; formName: string; moduleName: string }[] = [];

  for (const tableName of RECORD_TABLE_NAMES) {
    try {
      const dateCondition = options?.dateFrom
        ? `AND fr.submitted_at >= '${options.dateFrom.toISOString()}' AND fr.submitted_at <= '${(options.dateTo ?? new Date()).toISOString()}'`
        : '';
      const statusCondition = options?.status ? `AND fr.status = '${options.status}'` : '';

      const rows: any[] = await prisma.$queryRawUnsafe(`
        SELECT fr.form_id as "formId", COUNT(*)::int as count, 
               f.name as "formName", fm.name as "moduleName"
        FROM "${tableName}" fr
        JOIN forms f ON f.id = fr.form_id
        JOIN form_modules fm ON fm.id = f.module_id
        WHERE fm.organization_id = '${ctx.organizationId}'
        ${dateCondition} ${statusCondition}
        GROUP BY fr.form_id, f.name, fm.name
      `);
      results.push(...rows.map(r => ({ ...r, tableName })));
    } catch {
      // Table might not have matching records -- skip
    }
  }
  return results;
}

/**
 * Get submission time series for charts.
 */
export async function getSubmissionTimeline(ctx: ERPContext, dateFrom: Date, dateTo: Date) {
  const timeline: { date: string; count: number }[] = [];

  for (const tableName of RECORD_TABLE_NAMES) {
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(`
        SELECT DATE(fr.submitted_at) as date, COUNT(*)::int as count
        FROM "${tableName}" fr
        JOIN forms f ON f.id = fr.form_id
        JOIN form_modules fm ON fm.id = f.module_id
        WHERE fm.organization_id = '${ctx.organizationId}'
          AND fr.submitted_at >= '${dateFrom.toISOString()}'
          AND fr.submitted_at <= '${dateTo.toISOString()}'
        GROUP BY DATE(fr.submitted_at)
      `);
      for (const row of rows) {
        const dateStr = new Date(row.date).toISOString().split('T')[0];
        const existing = timeline.find(t => t.date === dateStr);
        if (existing) existing.count += row.count;
        else timeline.push({ date: dateStr, count: row.count });
      }
    } catch {
      // Skip
    }
  }

  return timeline.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// 4. Helper utilities
// ---------------------------------------------------------------------------
async function getTeamUserIds(ctx: ERPContext): Promise<string[]> {
  // Get units the manager belongs to
  const managerUnits = await prisma.userUnitAssignment.findMany({
    where: { userId: ctx.userId },
    select: { unitId: true },
  });
  const unitIds = managerUnits.map(u => u.unitId);

  if (unitIds.length === 0) return [ctx.userId];

  // Get all users in those units
  const teamMembers = await prisma.userUnitAssignment.findMany({
    where: { unitId: { in: unitIds } },
    select: { userId: true },
    distinct: ['userId'],
  });

  return teamMembers.map(m => m.userId);
}

function normalizeRow(row: any): FormRecordRow {
  return {
    id: row.id,
    formId: row.formId,
    formName: row.formName || '',
    moduleName: row.moduleName || '',
    recordData: typeof row.recordData === 'string' ? JSON.parse(row.recordData) : (row.recordData || {}),
    status: row.status || 'submitted',
    submittedAt: new Date(row.submittedAt),
    submittedBy: row.submittedBy ?? null,
    userId: row.userId ?? null,
    amount: row.amount ? Number(row.amount) : null,
    date: row.date ? new Date(row.date) : null,
  };
}

// ---------------------------------------------------------------------------
// 5. Analytics aggregations for the chatbot
// ---------------------------------------------------------------------------
export async function getOrgKPISummary(ctx: ERPContext) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);

  const orgUserIds = (await prisma.user.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true },
  })).map(u => u.id);

  const [
    totalUsers,
    activeToday,
    active7d,
    active30d,
    totalModules,
    totalForms,
    totalRecords,
    pendingRecords,
    recentAudit,
  ] = await Promise.all([
    prisma.user.count({ where: { organizationId: ctx.organizationId, status: 'ACTIVE' } }),
    prisma.loginHistory.count({
      where: { userId: { in: orgUserIds }, status: 'Success', createdAt: { gte: today } },
    }),
    prisma.loginHistory.findMany({
      where: { userId: { in: orgUserIds }, status: 'Success', createdAt: { gte: sevenDaysAgo } },
      distinct: ['userId'],
      select: { userId: true },
    }).then(r => r.length),
    prisma.loginHistory.findMany({
      where: { userId: { in: orgUserIds }, status: 'Success', createdAt: { gte: thirtyDaysAgo } },
      distinct: ['userId'],
      select: { userId: true },
    }).then(r => r.length),
    prisma.formModule.count({ where: { organizationId: ctx.organizationId, isActive: true } }),
    prisma.form.count({ where: { module: { organizationId: ctx.organizationId } } }),
    aggregateOrgRecords(ctx).then(r => r.reduce((s, x) => s + x.count, 0)),
    aggregateOrgRecords(ctx, { status: 'pending' }).then(r => r.reduce((s, x) => s + x.count, 0)),
    prisma.auditLog.count({
      where: { organizationId: ctx.organizationId, createdAt: { gte: sevenDaysAgo } },
    }),
  ]);

  return {
    totalUsers,
    activeToday,
    active7d,
    active30d,
    totalModules,
    totalForms,
    totalRecords,
    pendingRecords,
    recentAuditActions: recentAudit,
  };
}

export async function getUserActivitySummary(ctx: ERPContext, userId?: string) {
  const targetUserId = userId ?? ctx.userId;

  // Permission check
  if (ctx.accessRole === 'user' && targetUserId !== ctx.userId) {
    return { error: 'Access denied: you can only view your own activity.' };
  }

  const [logins, audits, activities] = await Promise.all([
    prisma.loginHistory.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { status: true, createdAt: true, ipAddress: true },
    }),
    prisma.auditLog.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { action: true, module: true, recordName: true, createdAt: true },
    }),
    prisma.activity.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { type: true, description: true, createdAt: true },
    }),
  ]);

  return { logins, audits, activities };
}

export async function getModuleAnalytics(ctx: ERPContext) {
  const records = await aggregateOrgRecords(ctx);

  // Group by module
  const moduleMap = new Map<string, { moduleName: string; forms: { formId: string; formName: string; count: number }[]; total: number }>();

  for (const r of records) {
    if (!moduleMap.has(r.moduleName)) {
      moduleMap.set(r.moduleName, { moduleName: r.moduleName, forms: [], total: 0 });
    }
    const mod = moduleMap.get(r.moduleName)!;
    mod.forms.push({ formId: r.formId, formName: r.formName, count: r.count });
    mod.total += r.count;
  }

  return Array.from(moduleMap.values()).sort((a, b) => b.total - a.total);
}
