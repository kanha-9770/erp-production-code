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

// Helper: count records across all 15 FormRecord tables scoped by formIds
async function getFormRecordCounts(startDate: Date, endDate: Date, formIds: string[]) {
  if (formIds.length === 0) return { total: 0, byTable: Array.from({ length: 15 }, (_, i) => ({ table: i + 1, count: 0 })) };

  const counts = await Promise.all(
    Array.from({ length: 15 }, (_, i) => {
      const model = `formRecord${i + 1}` as keyof typeof prisma;
      return (prisma[model] as any).count({
        where: {
          formId: { in: formIds },
          submittedAt: { gte: startDate, lte: endDate },
        },
      });
    })
  );

  return {
    total: counts.reduce((a: number, b: number) => a + b, 0),
    byTable: counts.map((count: number, i: number) => ({ table: i + 1, count })),
  };
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

  const modules = await prisma.formModule.findMany({
    where: {
      isActive: true,
      ...(orgId && { organizationId: orgId }),
    },
    include: {
      forms: {
        select: {
          id: true,
          name: true,
          isPublished: true,
          _count: {
            select: {
              records1: true,
              records2: true,
              records3: true,
              records4: true,
              records5: true,
              records6: true,
              records7: true,
              records8: true,
              records9: true,
              records10: true,
              records11: true,
              records12: true,
              records13: true,
              records14: true,
              records15: true,
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
        f._count.records1 + f._count.records2 + f._count.records3 + f._count.records4 +
        f._count.records5 + f._count.records6 + f._count.records7 + f._count.records8 +
        f._count.records9 + f._count.records10 + f._count.records11 + f._count.records12 +
        f._count.records13 + f._count.records14 + f._count.records15;
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
        f._count.records1 + f._count.records2 + f._count.records3 + f._count.records4 +
        f._count.records5 + f._count.records6 + f._count.records7 + f._count.records8 +
        f._count.records9 + f._count.records10 + f._count.records11 + f._count.records12 +
        f._count.records13 + f._count.records14 + f._count.records15;
    }, 0),
  }));
}

// ============================================================
// Form-level Deep Analytics (org-scoped module)
// ============================================================
export async function getModuleDeepAnalytics(moduleId: string, dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const { startDate, endDate } = getDateRange(dateRange);

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

  const formsWithStats = await Promise.all(
    module.forms.map(async (form) => {
      const recordsByTable = await Promise.all(
        Array.from({ length: 15 }, (_, i) => {
          const model = `formRecord${i + 1}` as keyof typeof prisma;
          return (prisma[model] as any).findMany({
            where: {
              formId: form.id,
              submittedAt: { gte: startDate, lte: endDate },
            },
            select: {
              id: true,
              status: true,
              submittedAt: true,
              submittedBy: true,
              userId: true,
              amount: true,
            },
            orderBy: { submittedAt: 'desc' },
          });
        })
      );

      const allRecords = recordsByTable.flat();

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
    })
  );

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
  const { startDate, endDate } = getDateRange(dateRange);

  const modules = await prisma.formModule.findMany({
    where: {
      isActive: true,
      ...(orgId && { organizationId: orgId }),
      ...(selectedModuleIds && selectedModuleIds.length > 0 && { id: { in: selectedModuleIds } }),
    },
    include: {
      forms: { select: { id: true, name: true } },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const performance = await Promise.all(
    modules.map(async (mod) => {
      let total = 0;
      const dailyMap: Record<string, number> = {};
      let completed = 0;

      for (const form of mod.forms) {
        for (let t = 1; t <= 15; t++) {
          const model = `formRecord${t}` as keyof typeof prisma;
          const records = await (prisma[model] as any).findMany({
            where: {
              formId: form.id,
              submittedAt: { gte: startDate, lte: endDate },
            },
            select: { submittedAt: true, status: true },
          });
          total += records.length;
          records.forEach((r: any) => {
            const d = new Date(r.submittedAt).toISOString().split('T')[0];
            dailyMap[d] = (dailyMap[d] || 0) + 1;
            if (r.status === 'submitted' || r.status === 'completed' || r.status === 'approved') {
              completed++;
            }
          });
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
  const { startDate, endDate } = getDateRange(dateRange);

  const users = await prisma.user.findMany({
    where: {
      ...(orgId && { organizationId: orgId }),
    },
    include: {
      employee: { select: { employeeName: true, department: true, designation: true, status: true } },
      unitAssignments: { include: { role: true, unit: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const userAnalytics = await Promise.all(
    users.map(async (user) => {
      const loginCount = await prisma.loginHistory.count({
        where: {
          userId: user.id,
          status: 'Success',
          createdAt: { gte: startDate, lte: endDate },
        },
      });

      const activityCount = await prisma.auditLog.count({
        where: {
          userId: user.id,
          createdAt: { gte: startDate, lte: endDate },
        },
      });

      let submissions = 0;
      for (let t = 1; t <= 15; t++) {
        const model = `formRecord${t}` as keyof typeof prisma;
        submissions += await (prisma[model] as any).count({
          where: {
            userId: user.id,
            submittedAt: { gte: startDate, lte: endDate },
          },
        });
      }

      const roleName = user.unitAssignments[0]?.role?.name || 'No Role';

      return {
        userId: user.id,
        email: user.email,
        name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.email,
        role: roleName,
        status: user.status,
        department: user.employee?.department || user.department || '-',
        submissions,
        loginCount,
        activityCount,
        joinedDate: user.createdAt.toLocaleDateString(),
      };
    })
  );

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
  const { startDate, endDate } = getDateRange(dateRange);

  const where: any = {
    createdAt: { gte: startDate, lte: endDate },
    ...(orgId && { organizationId: orgId }),
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
  const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];

  const [org, totalUsers, totalModules, totalForms, totalAuditLogs, totalRoles, totalUnits, totalEmployees] =
    await Promise.all([
      orgId ? prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, createdAt: true } }) : null,
      orgId ? prisma.user.count({ where: { organizationId: orgId } }) : prisma.user.count(),
      prisma.formModule.count({ where: { ...(orgId && { organizationId: orgId }), isActive: true } }),
      // Forms belonging to org modules
      orgId
        ? prisma.form.count({ where: { module: { organizationId: orgId } } })
        : prisma.form.count(),
      prisma.auditLog.count({ where: { ...(orgId && { organizationId: orgId }) } }),
      orgId ? prisma.role.count({ where: { organizationId: orgId } }) : 0,
      orgId ? prisma.organizationUnit.count({ where: { organizationId: orgId } }) : 0,
      orgId && orgUserIds.length > 0
        ? prisma.employee.count({ where: { userId: { in: orgUserIds } } })
        : prisma.employee.count(),
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
  const { startDate, endDate } = getDateRange(dateRange);

  const orgFormIds = await getOrgFormIds(orgId, selectedModuleIds);

  if (orgFormIds.length === 0) return [];

  const timeSeries: Record<string, number> = {};

  for (let t = 1; t <= 15; t++) {
    const model = `formRecord${t}` as keyof typeof prisma;
    const records = await (prisma[model] as any).findMany({
      where: {
        formId: { in: orgFormIds },
        submittedAt: { gte: startDate, lte: endDate },
      },
      select: { submittedAt: true },
    });
    records.forEach((r: any) => {
      const d = new Date(r.submittedAt).toISOString().split('T')[0];
      timeSeries[d] = (timeSeries[d] || 0) + 1;
    });
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
  const { startDate, endDate } = getDateRange(dateRange);

  const breakdown = await prisma.auditLog.groupBy({
    by: ['action'],
    where: {
      ...(orgId && { organizationId: orgId }),
      createdAt: { gte: startDate, lte: endDate },
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

  if (!query || query.length < 2) return { results: [], total: 0 };

  const searchType = filters?.type || 'all';
  const results: any[] = [];

  // Search Users (org-scoped)
  if (searchType === 'all' || searchType === 'users') {
    const users = await prisma.user.findMany({
      where: {
        ...(orgId && { organizationId: orgId }),
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

  // Search Form Modules (org-scoped)
  if (searchType === 'all' || searchType === 'modules') {
    const modules = await prisma.formModule.findMany({
      where: {
        ...(orgId && { organizationId: orgId }),
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

  // Search Forms (org-scoped via module)
  if (searchType === 'all' || searchType === 'forms') {
    const forms = await prisma.form.findMany({
      where: {
        ...(orgId && { module: { organizationId: orgId } }),
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

  // Search Employees (org-scoped via userId)
  if (searchType === 'all' || searchType === 'employees') {
    const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
    const employees = await prisma.employee.findMany({
      where: {
        ...(orgId && orgUserIds.length > 0 && { userId: { in: orgUserIds } }),
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

  // Search Audit Logs (org-scoped)
  if (searchType === 'all' || searchType === 'audit') {
    const audits = await prisma.auditLog.findMany({
      where: {
        ...(orgId && { organizationId: orgId }),
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
  const { startDate, endDate } = getDateRange(dateRange);

  const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
  const userFilter = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};

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
  const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];

  const employeeWhere = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};

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

  if (!orgId) return { roles: [], totalRoles: 0, totalPermissions: 0 };

  const [roles, totalPermissions] = await Promise.all([
    prisma.role.findMany({
      where: { organizationId: orgId },
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
              records1: true, records2: true, records3: true, records4: true,
              records5: true, records6: true, records7: true, records8: true,
              records9: true, records10: true, records11: true, records12: true,
              records13: true, records14: true, records15: true,
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
        f._count.records1 + f._count.records2 + f._count.records3 + f._count.records4 +
        f._count.records5 + f._count.records6 + f._count.records7 + f._count.records8 +
        f._count.records9 + f._count.records10 + f._count.records11 + f._count.records12 +
        f._count.records13 + f._count.records14 + f._count.records15;
      return { id: f.id, name: f.name, isPublished: f.isPublished, totalRecords, sectionCount: f._count.sections };
    }),
    totalRecords: m.forms.reduce((sum, f) => {
      return sum +
        f._count.records1 + f._count.records2 + f._count.records3 + f._count.records4 +
        f._count.records5 + f._count.records6 + f._count.records7 + f._count.records8 +
        f._count.records9 + f._count.records10 + f._count.records11 + f._count.records12 +
        f._count.records13 + f._count.records14 + f._count.records15;
    }, 0),
  }));

  // Count user's submissions only in permitted forms
  let mySubmissions = 0;
  if (permittedFormIds.length > 0) {
    for (let t = 1; t <= 15; t++) {
      const model = `formRecord${t}` as keyof typeof prisma;
      mySubmissions += await (prisma[model] as any).count({
        where: {
          userId,
          formId: { in: permittedFormIds },
          submittedAt: { gte: startDate, lte: endDate },
        },
      });
    }
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

  // User's submission time series scoped to permitted forms
  const timeSeries: Record<string, number> = {};
  if (permittedFormIds.length > 0) {
    for (let t = 1; t <= 15; t++) {
      const model = `formRecord${t}` as keyof typeof prisma;
      const records = await (prisma[model] as any).findMany({
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