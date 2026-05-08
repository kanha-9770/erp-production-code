/**
 * In-process scheduler for the team-attendance email reports.
 *
 * Reads every active AttendanceConfiguration on boot and registers up to
 * three node-cron jobs per org (daily/weekly/monthly) when the matching
 * `report*Enabled` flag is on AND `reportRecipients` is non-empty. Every
 * job fires `hour` wall-time of the org's `reportTimezone` and emails an
 * XLSX of the previous period to the configured recipients.
 *
 * IMPORTANT: this is an in-process scheduler. It assumes a single Node
 * process — if the app is scaled horizontally (multiple PM2 instances,
 * Docker replicas, k8s pods) every replica will fire its own copy of the
 * email. Either run with a single replica, or migrate to an external
 * scheduler that POSTs /api/cron/team-attendance with CRON_SECRET.
 *
 * Re-syncing: after admins change a config (toggle a cadence, edit
 * recipients, change timezone) call `syncOrganizationSchedule(orgId)` so
 * we don't have to reboot the server. The hot path is small — at most 3
 * jobs per org are torn down and re-registered.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { prisma } from '@/lib/prisma';
import { sendWorkflowEmail } from '@/lib/email';
import {
  generateTeamAttendanceReport,
  rangeForKind,
  type ReportKind,
} from '@/lib/hr/team-attendance-report';
import { getAttendanceConfig } from '@/lib/hr/attendance-config';

type JobsByKind = Partial<Record<ReportKind, ScheduledTask>>;
const jobsByOrg = new Map<string, JobsByKind>();
let started = false;

const KINDS: ReportKind[] = ['daily', 'weekly', 'monthly'];

function cronExprFor(kind: ReportKind, hour: number): string {
  const h = Math.min(23, Math.max(0, Math.floor(hour)));
  switch (kind) {
    case 'daily':
      return `0 ${h} * * *`; // every day at HH:00
    case 'weekly':
      return `0 ${h} * * 1`; // Mondays at HH:00
    case 'monthly':
      return `0 ${h} 1 * *`; // 1st of month at HH:00
  }
}

function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function runReport(
  organizationId: string,
  kind: ReportKind,
  now: Date = new Date(),
): Promise<{ sent: boolean; reason?: string; recipientCount?: number }> {
  const config = await getAttendanceConfig(organizationId);
  if (!config.reportRecipients || config.reportRecipients.length === 0) {
    return { sent: false, reason: 'no recipients configured' };
  }
  const enabled =
    (kind === 'daily' && config.reportDailyEnabled) ||
    (kind === 'weekly' && config.reportWeeklyEnabled) ||
    (kind === 'monthly' && config.reportMonthlyEnabled);
  if (!enabled) {
    return { sent: false, reason: `${kind} cadence disabled` };
  }

  const tz = isValidTimezone(config.reportTimezone) ? config.reportTimezone : undefined;
  const { from, to } = rangeForKind(kind, now, tz);
  const report = await generateTeamAttendanceReport(organizationId, from, to, kind);

  const subject = `[${report.summary.organizationName}] Team attendance ${kind} report — ${
    kind === 'daily' ? to : `${from} → ${to}`
  }`;
  const body = `<p>Attached: <b>${report.filename}</b></p>${report.htmlSummary}<p style="color:#64748b;font-size:12px;margin-top:18px;">Generated automatically by the attendance scheduler. To change recipients or cadence, edit Attendance Configuration.</p>`;

  const result = await sendWorkflowEmail({
    to: report.recipients.join(', '),
    subject,
    body,
    isHtml: true,
    attachments: [
      {
        filename: report.filename,
        content: report.buffer,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  });

  if (!result.success) {
    console.error(
      `[attendance-scheduler] ${organizationId}/${kind} email failed:`,
      result.error,
    );
    return { sent: false, reason: result.error || 'email send failed' };
  }
  console.log(
    `[attendance-scheduler] ${organizationId}/${kind} sent to ${report.recipients.length} recipient(s) (${from}…${to})`,
  );
  return { sent: true, recipientCount: report.recipients.length };
}

function teardownOrg(organizationId: string) {
  const existing = jobsByOrg.get(organizationId);
  if (!existing) return;
  for (const job of Object.values(existing)) {
    try {
      job?.stop();
    } catch {
      /* ignore */
    }
  }
  jobsByOrg.delete(organizationId);
}

export async function syncOrganizationSchedule(organizationId: string): Promise<void> {
  const config = await getAttendanceConfig(organizationId);
  teardownOrg(organizationId);

  // Skip orgs with nothing to do — saves us a stray timer.
  const anyEnabled =
    config.reportDailyEnabled ||
    config.reportWeeklyEnabled ||
    config.reportMonthlyEnabled;
  if (!anyEnabled || config.reportRecipients.length === 0) {
    return;
  }

  const tz = isValidTimezone(config.reportTimezone) ? config.reportTimezone : undefined;
  const hour = config.reportSendHour;
  const fresh: JobsByKind = {};

  for (const kind of KINDS) {
    const enabled =
      (kind === 'daily' && config.reportDailyEnabled) ||
      (kind === 'weekly' && config.reportWeeklyEnabled) ||
      (kind === 'monthly' && config.reportMonthlyEnabled);
    if (!enabled) continue;
    const expr = cronExprFor(kind, hour);
    try {
      const task = cron.schedule(
        expr,
        () => {
          runReport(organizationId, kind).catch((err) => {
            console.error(
              `[attendance-scheduler] ${organizationId}/${kind} threw:`,
              err,
            );
          });
        },
        tz ? { timezone: tz } : undefined,
      );
      fresh[kind] = task;
      console.log(
        `[attendance-scheduler] registered ${organizationId}/${kind} \`${expr}\`${tz ? ` (${tz})` : ''}`,
      );
    } catch (err) {
      console.error(
        `[attendance-scheduler] failed to register ${organizationId}/${kind}:`,
        err,
      );
    }
  }
  jobsByOrg.set(organizationId, fresh);
}

export async function startAttendanceReportScheduler(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const configs = await (prisma as any).attendanceConfiguration.findMany({
      where: { isActive: true, organizationId: { not: null } },
      select: { organizationId: true },
    });
    for (const c of configs) {
      if (!c.organizationId) continue;
      await syncOrganizationSchedule(c.organizationId);
    }
    console.log(
      `[attendance-scheduler] started — ${jobsByOrg.size} org(s) with active jobs`,
    );
  } catch (err) {
    console.error('[attendance-scheduler] start failed:', err);
    started = false;
  }
}

/** Test-only: number of orgs with at least one active job. */
export function activeOrgCount(): number {
  return jobsByOrg.size;
}
