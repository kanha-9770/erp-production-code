/**
 * DEPRECATED — superseded by the generic workflow scheduler.
 *
 * This module used to register node-cron jobs at boot for every org's
 * AttendanceConfiguration report* settings. Those schedules now live as
 * scheduled WorkflowRules (executeBasedOn = "schedule") with a Report Export
 * action, fired by lib/workflow/scheduler.ts. See:
 *   - scripts/migrate-attendance-schedules-to-workflows.ts (one-time migrator)
 *   - lib/workflow/scheduler.ts (the generic engine)
 *   - lib/workflow/report-builder.ts (generates the XLSX, including attendance)
 *
 * The boot path is gone (instrumentation.ts no longer calls
 * startAttendanceReportScheduler). `syncOrganizationSchedule` is now a no-op
 * so editing AttendanceConfiguration doesn't double-register cron jobs
 * alongside the migrated WorkflowRules. `runReport` is preserved as a thin
 * wrapper so /api/cron/team-attendance keeps working for any external caller
 * that hasn't switched to /api/workflow-rules/:id/run yet.
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

/**
 * No-op now. Editing an AttendanceConfiguration used to re-register cron
 * jobs in-process; with the generic workflow scheduler in charge of all
 * scheduled emails, the legacy tear-down/re-register path is intentionally
 * disabled to avoid duplicate fires. Admins should manage cadence + recipients
 * via the workflow rule directly (Settings → Workflow Rules).
 */
export async function syncOrganizationSchedule(organizationId: string): Promise<void> {
  // Tear down any leftover legacy timers from a process that booted under
  // the old code path. Idempotent — safe to call repeatedly.
  teardownOrg(organizationId);
  return;
}

/**
 * Deprecated — instrumentation.ts no longer calls this. Left as a no-op so
 * any forgotten callsite doesn't crash. The generic scheduler at
 * lib/workflow/scheduler.ts is the source of truth.
 */
export async function startAttendanceReportScheduler(): Promise<void> {
  if (started) return;
  started = true;
  console.warn(
    '[attendance-scheduler] startAttendanceReportScheduler is deprecated — workflow scheduler handles scheduled reports now',
  );
}

/** Test-only: number of orgs with at least one active job. */
export function activeOrgCount(): number {
  return jobsByOrg.size;
}
