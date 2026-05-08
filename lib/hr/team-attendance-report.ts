/**
 * Server-side generator for the scheduled team-attendance email report.
 *
 * Mirrors the query used by /api/attendance/team but runs without an HTTP
 * request context so the cron scheduler and admin "send now" endpoint can
 * share one code path. Output is an XLSX buffer (Detail + Summary sheets)
 * plus a small HTML snippet the mailer drops into the email body.
 *
 * Day-status derivation matches the convention used by the dashboard:
 *  - PRESENT : any check-in time recorded
 *  - ABSENT  : no check-in on a working day
 *  - LATE    : present AND lateMinutes > 0
 * Weekly-off / holiday / leave classification is intentionally NOT replicated
 * here — those rows simply don't appear (no Attendance row was written), so
 * the per-user "absent days" count below is "missed work days", which is
 * what HR actually wants to see in a daily/weekly/monthly digest.
 */

import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { getAttendanceConfig } from '@/lib/hr/attendance-config';

export type ReportKind = 'daily' | 'weekly' | 'monthly';

export interface TeamAttendanceReport {
  filename: string;
  buffer: Buffer;
  summary: {
    organizationId: string;
    organizationName: string;
    kind: ReportKind;
    from: string;
    to: string;
    userCount: number;
    totalRecords: number;
    presentDays: number;
    lateDays: number;
    autoCheckedOutDays: number;
    totalOvertimeMinutes: number;
    totalLateMinutes: number;
  };
  htmlSummary: string;
  recipients: string[];
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  department: string | null;
  designation: string | null;
}

interface AttendanceRow {
  id: string;
  userId: string;
  date: string;
  checkedIn: boolean;
  checkedOut: boolean;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  lateMinutes: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  isAutoCheckedOut: boolean;
  status: string | null;
}

function fmtDateTime(d: Date | null): string {
  if (!d) return '';
  // YYYY-MM-DD HH:mm in server local time — readable in Excel without
  // importing date-fns server-side.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function fmtMinutes(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export async function generateTeamAttendanceReport(
  organizationId: string,
  from: string,
  to: string,
  kind: ReportKind,
): Promise<TeamAttendanceReport> {
  const [org, config, users] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    }),
    getAttendanceConfig(organizationId),
    prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        username: true,
        first_name: true,
        last_name: true,
        employee: {
          select: { employeeName: true, department: true, designation: true },
        },
      },
      orderBy: { email: 'asc' },
    }),
  ]);
  if (!org) {
    throw new Error(`Organization ${organizationId} not found`);
  }

  const userById = new Map<string, UserRow>();
  for (const u of users) {
    const fullName =
      [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
      u.employee?.employeeName ||
      u.username ||
      u.email;
    userById.set(u.id, {
      id: u.id,
      email: u.email,
      name: fullName,
      department: u.employee?.department ?? null,
      designation: u.employee?.designation ?? null,
    });
  }
  const userIds = Array.from(userById.keys());

  const records = userIds.length
    ? ((await prisma.attendance.findMany({
        where: { userId: { in: userIds }, date: { gte: from, lte: to } },
        orderBy: [{ date: 'asc' }, { userId: 'asc' }],
      })) as unknown as AttendanceRow[])
    : [];

  // ---- Detail sheet rows --------------------------------------------------
  const detailRows = records.map((r) => {
    const u = userById.get(r.userId);
    return {
      Date: r.date,
      Employee: u?.name ?? r.userId,
      Email: u?.email ?? '',
      Department: u?.department ?? '',
      Designation: u?.designation ?? '',
      Status: r.status ?? (r.checkedIn ? 'PRESENT' : ''),
      'Check-in': fmtDateTime(r.checkInAt) || r.checkInTime || '',
      'Check-out': fmtDateTime(r.checkOutAt) || r.checkOutTime || '',
      'Late (min)': r.lateMinutes || 0,
      'Early-out (min)': r.earlyOutMinutes || 0,
      'Overtime (min)': r.overtimeMinutes || 0,
      'Auto-checkout': r.isAutoCheckedOut ? 'YES' : '',
    };
  });

  // ---- Summary sheet rows -------------------------------------------------
  // Per-employee totals across the window.
  const perUser = new Map<
    string,
    {
      presentDays: number;
      lateDays: number;
      autoCheckedOutDays: number;
      lateMinutes: number;
      overtimeMinutes: number;
    }
  >();
  for (const r of records) {
    const cur = perUser.get(r.userId) ?? {
      presentDays: 0,
      lateDays: 0,
      autoCheckedOutDays: 0,
      lateMinutes: 0,
      overtimeMinutes: 0,
    };
    if (r.checkedIn) cur.presentDays += 1;
    if ((r.lateMinutes || 0) > 0) cur.lateDays += 1;
    if (r.isAutoCheckedOut) cur.autoCheckedOutDays += 1;
    cur.lateMinutes += r.lateMinutes || 0;
    cur.overtimeMinutes += r.overtimeMinutes || 0;
    perUser.set(r.userId, cur);
  }

  // Per-user min(check-in) and max(check-out) so the Summary sheet shows
  // the punch times alongside the day-count aggregates. For a daily report
  // this is "the" check-in/out for that day; for weekly/monthly it surfaces
  // the earliest arrival and latest departure across the period — both useful
  // signals on a single line per employee.
  const punchByUser = new Map<
    string,
    { firstIn: Date | null; lastOut: Date | null; firstInRaw: string | null; lastOutRaw: string | null }
  >();
  for (const r of records) {
    const cur = punchByUser.get(r.userId) ?? {
      firstIn: null,
      lastOut: null,
      firstInRaw: null,
      lastOutRaw: null,
    };
    if (r.checkInAt) {
      if (!cur.firstIn || r.checkInAt < cur.firstIn) cur.firstIn = r.checkInAt;
    } else if (r.checkInTime) {
      // Legacy rows only have the wall-clock string. Keep the earliest one.
      if (!cur.firstInRaw || r.checkInTime < cur.firstInRaw) cur.firstInRaw = r.checkInTime;
    }
    if (r.checkOutAt) {
      if (!cur.lastOut || r.checkOutAt > cur.lastOut) cur.lastOut = r.checkOutAt;
    } else if (r.checkOutTime) {
      if (!cur.lastOutRaw || r.checkOutTime > cur.lastOutRaw) cur.lastOutRaw = r.checkOutTime;
    }
    punchByUser.set(r.userId, cur);
  }

  const summaryRows = Array.from(userById.values())
    .map((u) => {
      const t = perUser.get(u.id);
      const p = punchByUser.get(u.id);
      // Prefer the typed timestamp; fall back to the legacy wall-clock string.
      const firstCheckIn = p
        ? fmtDateTime(p.firstIn) || p.firstInRaw || ''
        : '';
      const lastCheckOut = p
        ? fmtDateTime(p.lastOut) || p.lastOutRaw || ''
        : '';
      return {
        Employee: u.name,
        Email: u.email,
        Department: u.department ?? '',
        Designation: u.designation ?? '',
        // Naming: for daily reports this IS the day's check-in/out. For
        // weekly/monthly it's earliest arrival / latest departure in window.
        'First Check-in': firstCheckIn,
        'Last Check-out': lastCheckOut,
        'Present days': t?.presentDays ?? 0,
        'Late days': t?.lateDays ?? 0,
        'Auto-checkout days': t?.autoCheckedOutDays ?? 0,
        'Total late': fmtMinutes(t?.lateMinutes ?? 0),
        'Total overtime': fmtMinutes(t?.overtimeMinutes ?? 0),
      };
    })
    .sort((a, b) => a.Employee.localeCompare(b.Employee));

  // Org-wide totals for the email body.
  let presentDays = 0;
  let lateDays = 0;
  let autoCheckedOutDays = 0;
  let totalLateMinutes = 0;
  let totalOvertimeMinutes = 0;
  for (const t of perUser.values()) {
    presentDays += t.presentDays;
    lateDays += t.lateDays;
    autoCheckedOutDays += t.autoCheckedOutDays;
    totalLateMinutes += t.lateMinutes;
    totalOvertimeMinutes += t.overtimeMinutes;
  }

  // ---- Build workbook -----------------------------------------------------
  const wb = XLSX.utils.book_new();
  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Detail');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const slug = org.name.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '') || 'org';
  const filename =
    kind === 'daily'
      ? `team-attendance-${slug}-${to}.xlsx`
      : `team-attendance-${slug}-${kind}-${from}_to_${to}.xlsx`;

  const summary = {
    organizationId: org.id,
    organizationName: org.name,
    kind,
    from,
    to,
    userCount: userById.size,
    totalRecords: records.length,
    presentDays,
    lateDays,
    autoCheckedOutDays,
    totalOvertimeMinutes,
    totalLateMinutes,
  };

  const periodLabel =
    kind === 'daily' ? to : `${from} → ${to}`;
  const htmlSummary = `
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1e293b;border:1px solid #e2e8f0;">
  <tr style="background:#f1f5f9;"><th align="left" colspan="2">Team attendance — ${escapeHtml(org.name)}</th></tr>
  <tr><td>Period</td><td><b>${escapeHtml(periodLabel)}</b> (${kind})</td></tr>
  <tr><td>Employees</td><td>${summary.userCount}</td></tr>
  <tr><td>Attendance records</td><td>${summary.totalRecords}</td></tr>
  <tr><td>Present-days total</td><td>${summary.presentDays}</td></tr>
  <tr><td>Late-days total</td><td>${summary.lateDays} (${fmtMinutes(summary.totalLateMinutes) || '0m'})</td></tr>
  <tr><td>Overtime total</td><td>${fmtMinutes(summary.totalOvertimeMinutes) || '0m'}</td></tr>
  <tr><td>Auto-checked-out</td><td>${summary.autoCheckedOutDays}</td></tr>
</table>`;

  return {
    filename,
    buffer,
    summary,
    htmlSummary,
    recipients: config.reportRecipients,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Period helpers used by the cron scheduler --------------------------
//
// All ranges are computed in the *configured* timezone, NOT in server-local
// time. Cron fires at the org's wall-time but `new Date()` is absolute, so
// the only safe way to ask "what's yesterday for this org?" is to format
// `now` in their timezone and parse back. Without this, an IST cron firing
// at 01:00 IST (= 19:30 UTC the previous day) would compute the wrong
// "yesterday" on a UTC server.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

interface Ymd {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

function ymdInTz(now: Date, tz: string | undefined): Ymd {
  if (!tz) {
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }
  // en-CA gives YYYY-MM-DD reliably regardless of locale.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [yStr, mStr, dStr] = parts.split('-');
  return { y: Number(yStr), m: Number(mStr), d: Number(dStr) };
}

function ymdToString({ y, m, d }: Ymd): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Convenience: format an arbitrary Date as YYYY-MM-DD in server-local time. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Date arithmetic on a plain {y,m,d} via UTC anchoring (avoids DST drift —
// none of the IANA zones we use observe attendance-relevant DST mid-day,
// but using UTC means we don't have to worry about it at all).
function addDays(ymdIn: Ymd, delta: number): Ymd {
  const utc = new Date(Date.UTC(ymdIn.y, ymdIn.m - 1, ymdIn.d));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return {
    y: utc.getUTCFullYear(),
    m: utc.getUTCMonth() + 1,
    d: utc.getUTCDate(),
  };
}

function dayOfWeek(ymdIn: Ymd): number {
  // 0=Sun … 6=Sat
  return new Date(Date.UTC(ymdIn.y, ymdIn.m - 1, ymdIn.d)).getUTCDay();
}

/** Range covering yesterday (single day) in `tz`. */
export function previousDayRange(
  now: Date = new Date(),
  tz?: string,
): { from: string; to: string } {
  const today = ymdInTz(now, tz);
  const day = ymdToString(addDays(today, -1));
  return { from: day, to: day };
}

/** Range covering the previous Mon–Sun week in `tz`. */
export function previousWeekRange(
  now: Date = new Date(),
  tz?: string,
): { from: string; to: string } {
  const today = ymdInTz(now, tz);
  const weekday = (dayOfWeek(today) + 6) % 7; // Mon=0 … Sun=6
  const monday = addDays(today, -(weekday + 7));
  const sunday = addDays(monday, 6);
  return { from: ymdToString(monday), to: ymdToString(sunday) };
}

/** Range covering the previous calendar month in `tz`. */
export function previousMonthRange(
  now: Date = new Date(),
  tz?: string,
): { from: string; to: string } {
  const today = ymdInTz(now, tz);
  // First of this month → step back one day to get last of prev month.
  const lastOfPrev = addDays({ y: today.y, m: today.m, d: 1 }, -1);
  const firstOfPrev: Ymd = { y: lastOfPrev.y, m: lastOfPrev.m, d: 1 };
  return { from: ymdToString(firstOfPrev), to: ymdToString(lastOfPrev) };
}

export function rangeForKind(
  kind: ReportKind,
  now: Date = new Date(),
  tz?: string,
): { from: string; to: string } {
  switch (kind) {
    case 'daily':
      return previousDayRange(now, tz);
    case 'weekly':
      return previousWeekRange(now, tz);
    case 'monthly':
      return previousMonthRange(now, tz);
  }
}
