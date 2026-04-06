'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth2';
import { getDateRange } from '@/lib/utils/date-utils';

// Helpers
function isSessionAdmin(session: any): boolean {
  const isOrgOwner = session.user.organization?.ownerId === session.user.id;
  const hasAdminRole = session.user.unitAssignments?.some(
    (ua: any) => ua.role?.isAdmin && ua.role?.isActive !== false
  );
  return isOrgOwner || !!hasAdminRole;
}

async function getUserAllowedModuleIds(userId: string, orgId: string): Promise<string[]> {
  const perms = await prisma.rolePermission.findMany({
    where: {
      role: { userAssignments: { some: { userId } } },
      moduleId: { not: null },
      granted: true,
    },
    select: { moduleId: true },
  });
  const moduleIds = Array.from(new Set(perms.map((p) => p.moduleId!)));
  return moduleIds;
}

async function getUserAllowedFormIds(userId: string, orgId: string, moduleIds?: string[]): Promise<string[]> {
  const allowedModules = moduleIds ?? await getUserAllowedModuleIds(userId, orgId);
  if (allowedModules.length === 0) return [];
  const modules = await prisma.formModule.findMany({
    where: { id: { in: allowedModules }, organizationId: orgId, isActive: true },
    select: { forms: { select: { id: true } } },
  });
  return modules.flatMap((m) => m.forms.map((f) => f.id));
}

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
  const admin = isSessionAdmin(session);
  const userId = session.user.id;
  const { startDate, endDate } = getDateRange(dateRange);

  // Calculate previous period for comparison
  const periodMs = endDate.getTime() - startDate.getTime();
  const prevStart = new Date(startDate.getTime() - periodMs);
  const prevEnd = new Date(startDate);

  // For admin: org-wide data. For user: only own data.
  const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
  const loginUserFilter = admin
    ? (orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {})
    : { userId };

  const orgFormIds = admin
    ? (orgId ? await getOrgFormIds(orgId) : [])
    : (orgId ? await getUserAllowedFormIds(userId, orgId) : []);

  // Current period metrics
  const [
    totalUsers, activeToday, active7d, active30d,
    totalSubmissionsCurrent, auditCurrent, pendingRecords,
    totalModules, loginSuccess, loginFailed,
  ] = await Promise.all([
    // Total users - admin only, user gets 0
    admin
      ? (orgId ? prisma.user.count({ where: { organizationId: orgId } }) : prisma.user.count())
      : Promise.resolve(0),

    // Active today - admin only
    admin
      ? prisma.loginHistory.findMany({
          where: {
            status: 'Success',
            ...loginUserFilter,
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
          distinct: ['userId'],
          select: { userId: true },
        })
      : Promise.resolve([]),

    // Active last 7d - admin only
    admin
      ? prisma.loginHistory.findMany({
          where: {
            status: 'Success',
            ...loginUserFilter,
            createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
          },
          distinct: ['userId'],
          select: { userId: true },
        })
      : Promise.resolve([]),

    // Active last 30d - admin only
    admin
      ? prisma.loginHistory.findMany({
          where: {
            status: 'Success',
            ...loginUserFilter,
            createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
          },
          distinct: ['userId'],
          select: { userId: true },
        })
      : Promise.resolve([]),

    // Total submissions current period (scoped by user's allowed forms for non-admin)
    (async () => {
      if (orgFormIds.length === 0) return 0;
      let total = 0;
      const recordFilter: any = { formId: { in: orgFormIds }, submittedAt: { gte: startDate, lte: endDate } };
      if (!admin) recordFilter.userId = userId;
      for (let t = 1; t <= 15; t++) {
        const model = `formRecord${t}` as keyof typeof prisma;
        total += await (prisma[model] as any).count({ where: recordFilter });
      }
      return total;
    })(),

    // Audit logs current (scoped to user for non-admin)
    admin
      ? prisma.auditLog.count({
          where: { ...(orgId && { organizationId: orgId }), createdAt: { gte: startDate, lte: endDate } },
        })
      : prisma.auditLog.count({
          where: { performedBy: userId, createdAt: { gte: startDate, lte: endDate } },
        }),

    // Pending records (scoped by user's forms for non-admin)
    (async () => {
      if (orgFormIds.length === 0) return 0;
      let pending = 0;
      const recordFilter: any = { formId: { in: orgFormIds }, status: 'pending' };
      if (!admin) recordFilter.userId = userId;
      for (let t = 1; t <= 15; t++) {
        const model = `formRecord${t}` as keyof typeof prisma;
        pending += await (prisma[model] as any).count({ where: recordFilter });
      }
      return pending;
    })(),

    // Total modules (user sees only allowed modules count)
    admin
      ? prisma.formModule.count({ where: { ...(orgId && { organizationId: orgId }), isActive: true } })
      : (async () => {
          if (!orgId) return 0;
          const allowed = await getUserAllowedModuleIds(userId, orgId);
          return allowed.length;
        })(),

    // Login success (scoped to user for non-admin)
    prisma.loginHistory.count({
      where: { ...loginUserFilter, status: 'Success', createdAt: { gte: startDate, lte: endDate } },
    }),

    // Login failed (scoped to user for non-admin)
    prisma.loginHistory.count({
      where: { ...loginUserFilter, status: 'Failed', createdAt: { gte: startDate, lte: endDate } },
    }),
  ]);

  // Previous period for growth
  const [prevSubmissions, prevAudit, prevLogins] = await Promise.all([
    (async () => {
      if (orgFormIds.length === 0) return 0;
      let total = 0;
      const recordFilter: any = { formId: { in: orgFormIds }, submittedAt: { gte: prevStart, lte: prevEnd } };
      if (!admin) recordFilter.userId = userId;
      for (let t = 1; t <= 15; t++) {
        const model = `formRecord${t}` as keyof typeof prisma;
        total += await (prisma[model] as any).count({ where: recordFilter });
      }
      return total;
    })(),
    admin
      ? prisma.auditLog.count({
          where: { ...(orgId && { organizationId: orgId }), createdAt: { gte: prevStart, lte: prevEnd } },
        })
      : prisma.auditLog.count({
          where: { performedBy: userId, createdAt: { gte: prevStart, lte: prevEnd } },
        }),
    prisma.loginHistory.count({
      where: { ...loginUserFilter, status: 'Success', createdAt: { gte: prevStart, lte: prevEnd } },
    }),
  ]);

  const calcGrowth = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  return {
    isAdmin: admin,
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
  const admin = isSessionAdmin(session);
  const userId = session.user.id;
  const { startDate, endDate } = getDateRange(dateRange);

  // Non-admin: only modules they have permission to
  const allowedModuleIds = !admin && orgId ? await getUserAllowedModuleIds(userId, orgId) : [];
  const moduleFilter: any = { ...(orgId && { organizationId: orgId }), isActive: true };
  if (!admin && allowedModuleIds.length > 0) moduleFilter.id = { in: allowedModuleIds };
  else if (!admin && allowedModuleIds.length === 0 && orgId) return [];

  const modules = await prisma.formModule.findMany({
    where: moduleFilter,
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
          const recordFilter: any = { formId: form.id, submittedAt: { gte: startDate, lte: endDate } };
          if (!admin) recordFilter.userId = userId;
          const records = await (prisma[model] as any).findMany({
            where: recordFilter,
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
  const admin = isSessionAdmin(session);
  const userId = session.user.id;
  const { startDate, endDate } = getDateRange(dateRange);

  // Non-admin: only forms from allowed modules
  let formFilter: any = { ...(orgId && { module: { organizationId: orgId } }) };
  if (!admin && orgId) {
    const allowedModuleIds = await getUserAllowedModuleIds(userId, orgId);
    if (allowedModuleIds.length === 0) return [];
    formFilter = { module: { organizationId: orgId, id: { in: allowedModuleIds } } };
  }

  const forms = await prisma.form.findMany({
    where: formFilter,
    include: { module: { select: { name: true, color: true } } },
  });

  const formStats = await Promise.all(
    forms.map(async (form) => {
      let totalRecords = 0;
      let latestSubmission: Date | null = null;

      for (let t = 1; t <= 15; t++) {
        const model = `formRecord${t}` as keyof typeof prisma;
        const recordFilter: any = { formId: form.id, submittedAt: { gte: startDate, lte: endDate } };
        if (!admin) recordFilter.userId = userId;
        const count = await (prisma[model] as any).count({ where: recordFilter });
        totalRecords += count;

        if (count > 0) {
          const latestFilter: any = { formId: form.id };
          if (!admin) latestFilter.userId = userId;
          const latest = await (prisma[model] as any).findFirst({
            where: latestFilter,
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
  const admin = isSessionAdmin(session);
  const userId = session.user.id;
  const { startDate, endDate } = getDateRange(dateRange);

  // Admin: org-wide. User: own activity only.
  let loginFilter: any = { status: 'Success', createdAt: { gte: startDate, lte: endDate } };
  let auditFilter: any = { createdAt: { gte: startDate, lte: endDate } };
  if (admin) {
    const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
    if (orgId && orgUserIds.length > 0) loginFilter.userId = { in: orgUserIds };
    if (orgId) auditFilter.organizationId = orgId;
  } else {
    loginFilter.userId = userId;
    auditFilter.performedBy = userId;
  }

  // Get login timestamps
  const logins = await prisma.loginHistory.findMany({
    where: loginFilter,
    select: { createdAt: true },
  });

  // Get audit log timestamps
  const audits = await prisma.auditLog.findMany({
    where: auditFilter,
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
  const admin = isSessionAdmin(session);
  const userId = session.user.id;

  const [audits, logins] = await Promise.all([
    prisma.auditLog.findMany({
      where: admin
        ? { ...(orgId && { organizationId: orgId }) }
        : { performedBy: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { email: true, first_name: true, last_name: true, avatar: true } } },
    }),
    (async () => {
      let loginFilter: any = {};
      if (admin) {
        const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
        loginFilter = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};
      } else {
        loginFilter = { userId };
      }
      return prisma.loginHistory.findMany({
        where: loginFilter,
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
  const admin = isSessionAdmin(session);

  // Non-admin users cannot see other users' data
  if (!admin) return [];

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
  const admin = isSessionAdmin(session);

  // Non-admin users cannot see role analysis
  if (!admin) return { roles: [], unassignedUsers: 0 };

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
  const admin = isSessionAdmin(session);
  const userId = session.user.id;

  const alerts: Array<{ severity: 'critical' | 'warning' | 'info'; title: string; description: string }> = [];

  if (admin) {
    // Admin: org-wide alerts
    const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
    const userFilter = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};

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

    // Pending records (org-wide)
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
  } else {
    // Non-admin: user-specific alerts only
    // Own failed logins last 24h
    const ownFailedLogins = await prisma.loginHistory.count({
      where: { userId, status: 'Failed', createdAt: { gte: new Date(Date.now() - 86400000) } },
    });
    if (ownFailedLogins > 0) {
      alerts.push({ severity: 'warning', title: 'Failed Login Attempts', description: `${ownFailedLogins} failed login attempt(s) on your account in last 24 hours` });
    }

    // Own pending records
    if (orgId) {
      const allowedFormIds = await getUserAllowedFormIds(userId, orgId);
      if (allowedFormIds.length > 0) {
        let pending = 0;
        for (let t = 1; t <= 15; t++) {
          const model = `formRecord${t}` as keyof typeof prisma;
          pending += await (prisma[model] as any).count({ where: { formId: { in: allowedFormIds }, userId, status: 'pending' } });
        }
        if (pending > 0) {
          alerts.push({ severity: 'info', title: 'Your Pending Records', description: `You have ${pending} record(s) awaiting approval` });
        }
      }
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
  const admin = isSessionAdmin(session);
  const userId = session.user.id;
  const { startDate, endDate } = getDateRange(dateRange);

  // Scoped form IDs
  const scopedFormIds = admin
    ? (orgId ? await getOrgFormIds(orgId) : [])
    : (orgId ? await getUserAllowedFormIds(userId, orgId) : []);
  const formFilter: any = scopedFormIds.length > 0 ? { formId: { in: scopedFormIds } } : {};
  // Non-admin: also filter by own userId
  if (!admin) formFilter.userId = userId;

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
