'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth2';
import { getDateRange } from '@/lib/utils/date-utils';

// Helpers
async function getOrgUserIds(orgId: string | null | undefined): Promise<string[]> {
  if (!orgId) return [];
  const users = await prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true } });
  return users.map((u) => u.id);
}

async function getOrgFormIds(orgId: string | null | undefined): Promise<string[]> {
  if (!orgId) return [];
  const modules = await prisma.formModule.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { forms: { select: { id: true } } },
  });
  return modules.flatMap((m) => m.forms.map((f) => f.id));
}

// ============================================================
// 1. Executive KPI Layer with growth trends
// ============================================================
export async function getExecutiveKPIs(dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const { startDate, endDate } = getDateRange(dateRange);

  // Calculate previous period for comparison
  const periodMs = endDate.getTime() - startDate.getTime();
  const prevStart = new Date(startDate.getTime() - periodMs);
  const prevEnd = new Date(startDate);

  const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
  const orgFormIds = orgId ? await getOrgFormIds(orgId) : [];
  const userFilter = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};

  // Current period metrics
  const [
    totalUsers, activeToday, active7d, active30d,
    totalSubmissionsCurrent, auditCurrent, pendingRecords,
    totalModules, loginSuccess, loginFailed,
  ] = await Promise.all([
    orgId ? prisma.user.count({ where: { organizationId: orgId } }) : prisma.user.count(),

    // Active today
    prisma.loginHistory.findMany({
      where: {
        status: 'Success',
        ...userFilter,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      distinct: ['userId'],
      select: { userId: true },
    }),

    // Active last 7d
    prisma.loginHistory.findMany({
      where: {
        status: 'Success',
        ...userFilter,
        createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
      },
      distinct: ['userId'],
      select: { userId: true },
    }),

    // Active last 30d
    prisma.loginHistory.findMany({
      where: {
        status: 'Success',
        ...userFilter,
        createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      distinct: ['userId'],
      select: { userId: true },
    }),

    // Total submissions current period
    (async () => {
      if (orgFormIds.length === 0) return 0;
      let total = 0;
      for (let t = 1; t <= 15; t++) {
        const model = `formRecord${t}` as keyof typeof prisma;
        total += await (prisma[model] as any).count({
          where: { formId: { in: orgFormIds }, submittedAt: { gte: startDate, lte: endDate } },
        });
      }
      return total;
    })(),

    // Audit logs current
    prisma.auditLog.count({
      where: { ...(orgId && { organizationId: orgId }), createdAt: { gte: startDate, lte: endDate } },
    }),

    // Pending records
    (async () => {
      if (orgFormIds.length === 0) return 0;
      let pending = 0;
      for (let t = 1; t <= 15; t++) {
        const model = `formRecord${t}` as keyof typeof prisma;
        pending += await (prisma[model] as any).count({
          where: { formId: { in: orgFormIds }, status: 'pending' },
        });
      }
      return pending;
    })(),

    // Total modules
    prisma.formModule.count({ where: { ...(orgId && { organizationId: orgId }), isActive: true } }),

    // Login success
    prisma.loginHistory.count({
      where: { ...userFilter, status: 'Success', createdAt: { gte: startDate, lte: endDate } },
    }),

    // Login failed
    prisma.loginHistory.count({
      where: { ...userFilter, status: 'Failed', createdAt: { gte: startDate, lte: endDate } },
    }),
  ]);

  // Previous period for growth
  const [prevSubmissions, prevAudit, prevLogins] = await Promise.all([
    (async () => {
      if (orgFormIds.length === 0) return 0;
      let total = 0;
      for (let t = 1; t <= 15; t++) {
        const model = `formRecord${t}` as keyof typeof prisma;
        total += await (prisma[model] as any).count({
          where: { formId: { in: orgFormIds }, submittedAt: { gte: prevStart, lte: prevEnd } },
        });
      }
      return total;
    })(),
    prisma.auditLog.count({
      where: { ...(orgId && { organizationId: orgId }), createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    prisma.loginHistory.count({
      where: { ...userFilter, status: 'Success', createdAt: { gte: prevStart, lte: prevEnd } },
    }),
  ]);

  const calcGrowth = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  return {
    totalUsers,
    activeToday: activeToday.length,
    active7d: active7d.length,
    active30d: active30d.length,
    totalSubmissions: totalSubmissionsCurrent,
    submissionGrowth: calcGrowth(totalSubmissionsCurrent, prevSubmissions),
    auditEntries: auditCurrent,
    auditGrowth: calcGrowth(auditCurrent, prevAudit),
    pendingApprovals: pendingRecords,
    totalModules,
    loginSuccess,
    loginFailed,
    loginGrowth: calcGrowth(loginSuccess, prevLogins),
    failureRate: loginSuccess + loginFailed > 0 ? Math.round((loginFailed / (loginSuccess + loginFailed)) * 100) : 0,
  };
}

// ============================================================
// 2. Module Usage Ranking
// ============================================================
export async function getModuleUsageRanking(dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const { startDate, endDate } = getDateRange(dateRange);

  const modules = await prisma.formModule.findMany({
    where: { ...(orgId && { organizationId: orgId }), isActive: true },
    include: { forms: { select: { id: true, name: true } } },
    orderBy: { sortOrder: 'asc' },
  });

  const ranking = await Promise.all(
    modules.map(async (mod) => {
      let totalRecords = 0;
      let uniqueUsers = new Set<string>();

      for (const form of mod.forms) {
        for (let t = 1; t <= 15; t++) {
          const model = `formRecord${t}` as keyof typeof prisma;
          const records = await (prisma[model] as any).findMany({
            where: { formId: form.id, submittedAt: { gte: startDate, lte: endDate } },
            select: { userId: true },
          });
          totalRecords += records.length;
          records.forEach((r: any) => { if (r.userId) uniqueUsers.add(r.userId); });
        }
      }

      return {
        moduleId: mod.id,
        moduleName: mod.name,
        moduleType: mod.moduleType,
        icon: mod.icon,
        color: mod.color,
        formCount: mod.forms.length,
        totalRecords,
        uniqueUsers: uniqueUsers.size,
        avgPerUser: uniqueUsers.size > 0 ? Math.round(totalRecords / uniqueUsers.size) : 0,
      };
    })
  );

  return ranking.sort((a, b) => b.totalRecords - a.totalRecords);
}

// ============================================================
// 3. Form Usage Frequency
// ============================================================
export async function getFormUsageFrequency(dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const { startDate, endDate } = getDateRange(dateRange);

  const forms = await prisma.form.findMany({
    where: { ...(orgId && { module: { organizationId: orgId } }) },
    include: { module: { select: { name: true, color: true } } },
  });

  const formStats = await Promise.all(
    forms.map(async (form) => {
      let totalRecords = 0;
      let latestSubmission: Date | null = null;

      for (let t = 1; t <= 15; t++) {
        const model = `formRecord${t}` as keyof typeof prisma;
        const count = await (prisma[model] as any).count({
          where: { formId: form.id, submittedAt: { gte: startDate, lte: endDate } },
        });
        totalRecords += count;

        if (count > 0) {
          const latest = await (prisma[model] as any).findFirst({
            where: { formId: form.id },
            orderBy: { submittedAt: 'desc' },
            select: { submittedAt: true },
          });
          if (latest && (!latestSubmission || latest.submittedAt > latestSubmission)) {
            latestSubmission = latest.submittedAt;
          }
        }
      }

      return {
        formId: form.id,
        formName: form.name,
        moduleName: form.module.name,
        moduleColor: form.module.color,
        isPublished: form.isPublished,
        totalRecords,
        lastSubmission: latestSubmission,
      };
    })
  );

  return formStats.sort((a, b) => b.totalRecords - a.totalRecords);
}

// ============================================================
// 4. User Activity Trends (hourly heatmap data)
// ============================================================
export async function getUserActivityHeatmap(dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const { startDate, endDate } = getDateRange(dateRange);
  const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
  const userFilter = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};

  // Get login timestamps
  const logins = await prisma.loginHistory.findMany({
    where: { ...userFilter, status: 'Success', createdAt: { gte: startDate, lte: endDate } },
    select: { createdAt: true },
  });

  // Get audit log timestamps
  const audits = await prisma.auditLog.findMany({
    where: { ...(orgId && { organizationId: orgId }), createdAt: { gte: startDate, lte: endDate } },
    select: { createdAt: true },
  });

  // Build heatmap: day of week (0-6) x hour (0-23)
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  [...logins, ...audits].forEach((entry) => {
    const d = new Date(entry.createdAt);
    const day = d.getDay();
    const hour = d.getHours();
    heatmap[day][hour]++;
  });

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const data: Array<{ day: string; hour: number; count: number }> = [];

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      data.push({ day: days[d], hour: h, count: heatmap[d][h] });
    }
  }

  // Peak hours
  const hourTotals = Array(24).fill(0);
  data.forEach((d) => { hourTotals[d.hour] += d.count; });
  const peakHour = hourTotals.indexOf(Math.max(...hourTotals));

  return { heatmap: data, peakHour, totalEvents: [...logins, ...audits].length };
}

// ============================================================
// 5. Live Activity Timeline
// ============================================================
export async function getLiveActivityTimeline(limit: number = 30) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;

  const [audits, logins] = await Promise.all([
    prisma.auditLog.findMany({
      where: { ...(orgId && { organizationId: orgId }) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { email: true, first_name: true, last_name: true, avatar: true } } },
    }),
    (async () => {
      const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
      const userFilter = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};
      return prisma.loginHistory.findMany({
        where: userFilter,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { user: { select: { email: true, first_name: true, last_name: true, avatar: true } } },
      });
    })(),
  ]);

  const timeline = [
    ...audits.map((a) => ({
      id: a.id,
      type: 'audit' as const,
      action: a.action,
      description: `${a.action} in ${a.module}${a.recordName ? ` - ${a.recordName}` : ''}`,
      user: [a.user?.first_name, a.user?.last_name].filter(Boolean).join(' ') || a.performedBy,
      avatar: a.user?.avatar,
      timestamp: a.createdAt,
    })),
    ...logins.map((l) => ({
      id: String(l.id),
      type: 'login' as const,
      action: l.status === 'Success' ? 'LOGIN' : 'LOGIN_FAILED',
      description: `${l.status === 'Success' ? 'Signed in' : 'Failed login'} from ${l.ipAddress || 'unknown'}`,
      user: l.user ? [l.user.first_name, l.user.last_name].filter(Boolean).join(' ') || l.email : l.email,
      avatar: l.user?.avatar,
      timestamp: l.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);

  return timeline;
}

// ============================================================
// 6. Inactive Users Detection
// ============================================================
export async function getInactiveUsers(daysSinceLastLogin: number = 30) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const cutoffDate = new Date(Date.now() - daysSinceLastLogin * 86400000);

  const users = await prisma.user.findMany({
    where: { ...(orgId && { organizationId: orgId }) },
    select: {
      id: true, email: true, first_name: true, last_name: true, username: true, status: true,
      department: true, createdAt: true,
      loginHistory: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      unitAssignments: { include: { role: { select: { name: true } } }, take: 1 },
    },
  });

  return users
    .filter((u) => {
      const lastLogin = u.loginHistory[0]?.createdAt;
      return !lastLogin || lastLogin < cutoffDate;
    })
    .map((u) => ({
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.email,
      email: u.email,
      status: u.status,
      department: u.department || '-',
      role: u.unitAssignments[0]?.role?.name || 'No Role',
      lastLogin: u.loginHistory[0]?.createdAt || null,
      daysSinceLogin: u.loginHistory[0]?.createdAt
        ? Math.floor((Date.now() - new Date(u.loginHistory[0].createdAt).getTime()) / 86400000)
        : null,
      joinedAt: u.createdAt,
    }))
    .sort((a, b) => (a.daysSinceLogin || 999) - (b.daysSinceLogin || 999));
}

// ============================================================
// 7. Role Usage Analysis
// ============================================================
export async function getRoleUsageAnalysis() {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  if (!orgId) return { roles: [], unassignedUsers: 0 };

  const [roles, unassigned] = await Promise.all([
    prisma.role.findMany({
      where: { organizationId: orgId },
      include: {
        userAssignments: { select: { userId: true } },
        rolePermissions: { select: { id: true } },
        children: { select: { id: true } },
      },
      orderBy: { level: 'asc' },
    }),
    prisma.user.count({
      where: { organizationId: orgId, unitAssignments: { none: {} } },
    }),
  ]);

  return {
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      level: r.level,
      isAdmin: r.isAdmin,
      isActive: r.isActive,
      userCount: r.userAssignments.length,
      permissionCount: r.rolePermissions.length,
      childCount: r.children.length,
      description: r.description,
    })),
    unassignedUsers: unassigned,
  };
}

// ============================================================
// 8. Smart Alerts
// ============================================================
export async function getSmartAlerts() {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
  const userFilter = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};

  const alerts: Array<{ severity: 'critical' | 'warning' | 'info'; title: string; description: string }> = [];

  // Failed logins last 24h
  const recentFailedLogins = await prisma.loginHistory.count({
    where: { ...userFilter, status: 'Failed', createdAt: { gte: new Date(Date.now() - 86400000) } },
  });
  if (recentFailedLogins > 10) {
    alerts.push({ severity: 'critical', title: 'High Failed Login Rate', description: `${recentFailedLogins} failed logins in last 24 hours` });
  } else if (recentFailedLogins > 3) {
    alerts.push({ severity: 'warning', title: 'Failed Login Attempts', description: `${recentFailedLogins} failed logins in last 24 hours` });
  }

  // Inactive users
  const cutoff30 = new Date(Date.now() - 30 * 86400000);
  const totalUsers = orgId ? await prisma.user.count({ where: { organizationId: orgId } }) : 0;
  const activeUsers30 = await prisma.loginHistory.findMany({
    where: { ...userFilter, status: 'Success', createdAt: { gte: cutoff30 } },
    distinct: ['userId'],
    select: { userId: true },
  });
  const inactiveCount = totalUsers - activeUsers30.length;
  if (inactiveCount > 0 && totalUsers > 0 && (inactiveCount / totalUsers) > 0.3) {
    alerts.push({ severity: 'warning', title: 'Many Inactive Users', description: `${inactiveCount} users haven't logged in for 30+ days (${Math.round((inactiveCount / totalUsers) * 100)}%)` });
  }

  // Unassigned users
  if (orgId) {
    const unassigned = await prisma.user.count({ where: { organizationId: orgId, unitAssignments: { none: {} } } });
    if (unassigned > 0) {
      alerts.push({ severity: 'info', title: 'Unassigned Users', description: `${unassigned} users have no role assignment` });
    }
  }

  // Pending records
  const orgFormIds = orgId ? await getOrgFormIds(orgId) : [];
  if (orgFormIds.length > 0) {
    let pending = 0;
    for (let t = 1; t <= 15; t++) {
      const model = `formRecord${t}` as keyof typeof prisma;
      pending += await (prisma[model] as any).count({ where: { formId: { in: orgFormIds }, status: 'pending' } });
    }
    if (pending > 50) {
      alerts.push({ severity: 'warning', title: 'Pending Approvals Backlog', description: `${pending} records awaiting approval` });
    } else if (pending > 0) {
      alerts.push({ severity: 'info', title: 'Pending Approvals', description: `${pending} records awaiting approval` });
    }
  }

  // Unpublished forms
  if (orgId) {
    const unpublished = await prisma.form.count({ where: { module: { organizationId: orgId }, isPublished: false } });
    if (unpublished > 0) {
      alerts.push({ severity: 'info', title: 'Draft Forms', description: `${unpublished} forms not yet published` });
    }
  }

  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}

// ============================================================
// 9. Import/Export Job Analytics
// ============================================================
export async function getImportExportAnalytics(dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const { startDate, endDate } = getDateRange(dateRange);

  // ImportJob & ExportJob don't have direct orgId, but use moduleId/formId
  const orgFormIds = orgId ? await getOrgFormIds(orgId) : [];
  const formFilter = orgFormIds.length > 0 ? { formId: { in: orgFormIds } } : {};

  const [imports, exports] = await Promise.all([
    prisma.importJob.findMany({
      where: { ...formFilter, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.exportJob.findMany({
      where: { ...formFilter, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const importStats = {
    total: imports.length,
    completed: imports.filter((i) => i.status === 'COMPLETED').length,
    failed: imports.filter((i) => i.status === 'FAILED').length,
    processing: imports.filter((i) => i.status === 'PROCESSING').length,
    totalRows: imports.reduce((s, i) => s + i.totalRows, 0),
    successRows: imports.reduce((s, i) => s + i.successRows, 0),
    failedRows: imports.reduce((s, i) => s + i.failedRows, 0),
  };

  const exportStats = {
    total: exports.length,
    completed: exports.filter((e) => e.status === 'COMPLETED').length,
    failed: exports.filter((e) => e.status === 'FAILED').length,
    totalRecords: exports.reduce((s, e) => s + e.totalRecords, 0),
  };

  return { importStats, exportStats };
}
