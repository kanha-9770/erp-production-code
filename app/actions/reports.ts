'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getDateRange } from '@/lib/date-utils';

// ──────────────────────────────────────────────────
// Helpers (same patterns as intelligence.ts)
// ──────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════
// Aggregate ALL report data in a single call
// ══════════════════════════════════════════════════
export async function getFullReportData(dateRange: string) {
  const session = await requireAuth();
  const orgId = session.user.organizationId;
  const orgName = session.user.organization?.name || 'Organization';
  const userName = [session.user.first_name, session.user.last_name].filter(Boolean).join(' ') || session.user.email;
  const { startDate, endDate } = getDateRange(dateRange);

  const periodMs = endDate.getTime() - startDate.getTime();
  const prevStart = new Date(startDate.getTime() - periodMs);
  const prevEnd = new Date(startDate);

  const orgUserIds = orgId ? await getOrgUserIds(orgId) : [];
  const orgFormIds = orgId ? await getOrgFormIds(orgId) : [];
  const userFilter = orgId && orgUserIds.length > 0 ? { userId: { in: orgUserIds } } : {};

  // ── Parallel data fetch ──
  const [
    totalUsers,
    activeToday,
    active7d,
    active30d,
    totalModules,
    loginSuccess,
    loginFailed,
    prevLogins,
    auditCurrent,
    prevAudit,
    modules,
    alerts,
    roles,
    unassignedUsers,
    recentAudits,
    recentLogins,
  ] = await Promise.all([
    orgId ? prisma.user.count({ where: { organizationId: orgId } }) : prisma.user.count(),

    prisma.loginHistory.findMany({
      where: { status: 'Success', ...userFilter, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.loginHistory.findMany({
      where: { status: 'Success', ...userFilter, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.loginHistory.findMany({
      where: { status: 'Success', ...userFilter, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      distinct: ['userId'],
      select: { userId: true },
    }),

    prisma.formModule.count({ where: { ...(orgId && { organizationId: orgId }), isActive: true } }),

    prisma.loginHistory.count({ where: { ...userFilter, status: 'Success', createdAt: { gte: startDate, lte: endDate } } }),
    prisma.loginHistory.count({ where: { ...userFilter, status: 'Failed', createdAt: { gte: startDate, lte: endDate } } }),
    prisma.loginHistory.count({ where: { ...userFilter, status: 'Success', createdAt: { gte: prevStart, lte: prevEnd } } }),

    prisma.auditLog.count({ where: { ...(orgId && { organizationId: orgId }), createdAt: { gte: startDate, lte: endDate } } }),
    prisma.auditLog.count({ where: { ...(orgId && { organizationId: orgId }), createdAt: { gte: prevStart, lte: prevEnd } } }),

    // Modules with form details
    prisma.formModule.findMany({
      where: { ...(orgId && { organizationId: orgId }), isActive: true },
      include: { forms: { select: { id: true, name: true, isPublished: true } } },
      orderBy: { sortOrder: 'asc' },
    }),

    // Smart alerts data
    (async () => {
      const alertsList: Array<{ severity: 'critical' | 'warning' | 'info'; title: string; description: string }> = [];

      const recentFails = await prisma.loginHistory.count({
        where: { ...userFilter, status: 'Failed', createdAt: { gte: new Date(Date.now() - 86400000) } },
      });
      if (recentFails > 10) alertsList.push({ severity: 'critical', title: 'High Failed Logins', description: `${recentFails} failed logins in 24h` });
      else if (recentFails > 3) alertsList.push({ severity: 'warning', title: 'Failed Login Attempts', description: `${recentFails} failed logins in 24h` });

      if (orgId) {
        const ua = await prisma.user.count({ where: { organizationId: orgId, unitAssignments: { none: {} } } });
        if (ua > 0) alertsList.push({ severity: 'info', title: 'Unassigned Users', description: `${ua} users have no role` });

        const unpublished = await prisma.form.count({ where: { module: { organizationId: orgId }, isPublished: false } });
        if (unpublished > 0) alertsList.push({ severity: 'info', title: 'Draft Forms', description: `${unpublished} forms unpublished` });
      }

      if (orgFormIds.length > 0) {
        let pending = 0;
        for (let t = 1; t <= 15; t++) {
          const model = `formRecord${t}` as keyof typeof prisma;
          pending += await (prisma[model] as any).count({ where: { formId: { in: orgFormIds }, status: 'pending' } });
        }
        if (pending > 50) alertsList.push({ severity: 'warning', title: 'Pending Backlog', description: `${pending} records awaiting approval` });
        else if (pending > 0) alertsList.push({ severity: 'info', title: 'Pending Approvals', description: `${pending} records pending` });
      }

      return alertsList.sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      });
    })(),

    // Role data
    orgId
      ? prisma.role.findMany({
          where: { organizationId: orgId },
          include: { userAssignments: { select: { userId: true } }, rolePermissions: { select: { id: true } } },
          orderBy: { level: 'asc' },
        })
      : Promise.resolve([]),
    orgId
      ? prisma.user.count({ where: { organizationId: orgId, unitAssignments: { none: {} } } })
      : Promise.resolve(0),

    // Recent audit logs
    prisma.auditLog.findMany({
      where: { ...(orgId && { organizationId: orgId }), createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { email: true, first_name: true, last_name: true } } },
    }),

    // Recent logins
    prisma.loginHistory.findMany({
      where: { ...userFilter, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { email: true, first_name: true, last_name: true } } },
    }),
  ]);

  // ── Submission counts per module ──
  const moduleStats = await Promise.all(
    modules.map(async (mod) => {
      let totalRecords = 0;
      for (const form of mod.forms) {
        for (let t = 1; t <= 15; t++) {
          const model = `formRecord${t}` as keyof typeof prisma;
          totalRecords += await (prisma[model] as any).count({
            where: { formId: form.id, submittedAt: { gte: startDate, lte: endDate } },
          });
        }
      }
      return {
        name: mod.name,
        type: mod.moduleType,
        formCount: mod.forms.length,
        publishedForms: mod.forms.filter((f) => f.isPublished).length,
        totalRecords,
      };
    })
  );

  // ── Total submissions current + previous ──
  let totalSubmissionsCurrent = 0;
  let totalSubmissionsPrev = 0;
  let pendingRecords = 0;
  if (orgFormIds.length > 0) {
    for (let t = 1; t <= 15; t++) {
      const model = `formRecord${t}` as keyof typeof prisma;
      totalSubmissionsCurrent += await (prisma[model] as any).count({ where: { formId: { in: orgFormIds }, submittedAt: { gte: startDate, lte: endDate } } });
      totalSubmissionsPrev += await (prisma[model] as any).count({ where: { formId: { in: orgFormIds }, submittedAt: { gte: prevStart, lte: prevEnd } } });
      pendingRecords += await (prisma[model] as any).count({ where: { formId: { in: orgFormIds }, status: 'pending' } });
    }
  }

  const calcGrowth = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  return {
    meta: {
      organizationName: orgName,
      dateRange,
      generatedAt: new Date().toISOString(),
      generatedBy: userName,
    },
    kpis: {
      totalUsers,
      activeToday: activeToday.length,
      active7d: active7d.length,
      active30d: active30d.length,
      totalModules,
      totalSubmissions: totalSubmissionsCurrent,
      submissionGrowth: calcGrowth(totalSubmissionsCurrent, totalSubmissionsPrev),
      pendingApprovals: pendingRecords,
      loginSuccess,
      loginFailed,
      loginGrowth: calcGrowth(loginSuccess, prevLogins),
      failureRate: loginSuccess + loginFailed > 0 ? Math.round((loginFailed / (loginSuccess + loginFailed)) * 100) : 0,
      auditEntries: auditCurrent,
      auditGrowth: calcGrowth(auditCurrent, prevAudit),
    },
    modules: moduleStats,
    alerts,
    roles: roles.map((r) => ({
      name: r.name,
      level: r.level,
      isAdmin: r.isAdmin,
      userCount: r.userAssignments.length,
      permissionCount: r.rolePermissions.length,
    })),
    unassignedUsers,
    recentAudits: recentAudits.map((a) => ({
      date: a.createdAt.toISOString(),
      action: a.action,
      module: a.module,
      user: [a.user?.first_name, a.user?.last_name].filter(Boolean).join(' ') || a.performedBy,
      details: a.recordName || '-',
    })),
    recentLogins: recentLogins.map((l) => ({
      date: l.createdAt.toISOString(),
      email: l.email,
      name: l.user ? [l.user.first_name, l.user.last_name].filter(Boolean).join(' ') : '-',
      status: l.status,
      ip: l.ipAddress || '-',
    })),
  };
}
