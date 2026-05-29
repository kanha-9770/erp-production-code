/**
 * Attendance photo cleanup — daily housekeeping that deletes stored
 * attendance JPEGs older than each org's facePhotoRetentionDays setting.
 *
 * The attendance ROW is never deleted by this — only the photo URL
 * column is nulled out and the corresponding file is removed from the
 * Hostinger FTP host. Verification metadata (faceMatch, livenessPassed)
 * stays on the row so the audit trail survives.
 *
 * Triggered by `/api/cron/attendance-photo-cleanup`. The route can be
 * fired by:
 *   • an admin "Run now" button (session auth), or
 *   • an external scheduler with the CRON_SECRET header.
 *
 * Per-org batch size cap keeps a single sweep bounded — large backlogs
 * are drained over multiple runs instead of holding an FTP connection
 * open for 30+ minutes.
 */

import { prisma } from '@/lib/prisma';
import { deleteManyFromHostinger } from '@/lib/hostinger-upload';
import { getAttendanceConfig } from '@/lib/hr/attendance-config';

// Hard ceiling per org per sweep. With ~200 deletes/minute over FTP, this
// caps a single org's sweep at roughly 5 minutes. Backlog beyond this
// drains on the next run. Raise if you've got a quiet host and want to
// catch up faster.
const MAX_DELETIONS_PER_ORG = 1000;

export interface CleanupResult {
  organizationId: string;
  /** Number of attendance rows we considered for cleanup. */
  rowsScanned: number;
  /** Number of photo URLs we attempted to delete. */
  attempted: number;
  /** Successfully removed from the FTP host. */
  removed: number;
  /** File was already missing on the host; treated as success. */
  missing: number;
  /** Delete failed (network / FTP error). Will retry next sweep. */
  failed: number;
  /** Number of attendance rows whose photo columns we nulled out. */
  rowsCleared: number;
  /** Set when cleanup is disabled for this org (retentionDays === 0). */
  skipped?: 'retention_disabled';
}

/**
 * Compute the cutoff date (inclusive) for a given retention window.
 * Returns a `YYYY-MM-DD` string so it can compare against the Attendance.date
 * column directly (which is also a string).
 *
 * retentionDays=30, now=2026-05-27 → cutoff="2026-04-27"
 * Rows with date < cutoff are eligible for cleanup.
 */
export function computeCutoffDate(retentionDays: number, now: Date = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  // YYYY-MM-DD in UTC. `todayKey()` writes the date in the org timezone, so
  // this cutoff can be off by up to one day at the UTC/local boundary — which
  // is immaterial for a multi-day retention window and still yields a
  // well-defined lexicographic string comparison against Attendance.date.
  const y = cutoff.getUTCFullYear();
  const m = String(cutoff.getUTCMonth() + 1).padStart(2, '0');
  const d = String(cutoff.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Sweep one org. Pulls up to MAX_DELETIONS_PER_ORG candidate rows whose
 * date is strictly less than the cutoff and that still have at least one
 * photo URL set, then:
 *   1. Batches the URLs into a single FTP connection delete call.
 *   2. Nulls out the photo columns on those rows so the URLs aren't
 *      tried again on subsequent sweeps even if the FTP delete failed.
 *      (The file may still exist; that's preferable to looping forever
 *      on an unreachable server. Re-running the sweep is harmless.)
 */
export async function cleanupOrgAttendancePhotos(
  organizationId: string,
  now: Date = new Date(),
): Promise<CleanupResult> {
  const cfg = await getAttendanceConfig(organizationId);
  const retention = cfg.facePhotoRetentionDays;
  if (retention <= 0) {
    return {
      organizationId,
      rowsScanned: 0,
      attempted: 0,
      removed: 0,
      missing: 0,
      failed: 0,
      rowsCleared: 0,
      skipped: 'retention_disabled',
    };
  }

  const cutoff = computeCutoffDate(retention, now);

  // Pull a bounded batch of expired rows. Selecting just the columns we
  // need keeps memory low even when the batch is large.
  const rows = await prisma.attendance.findMany({
    where: {
      organizationId,
      date: { lt: cutoff },
      OR: [
        { checkInPhoto: { not: null } },
        { checkOutPhoto: { not: null } },
      ],
    },
    select: {
      id: true,
      checkInPhoto: true,
      checkOutPhoto: true,
    },
    take: MAX_DELETIONS_PER_ORG,
    orderBy: { date: 'asc' },
  });

  if (rows.length === 0) {
    return {
      organizationId,
      rowsScanned: 0,
      attempted: 0,
      removed: 0,
      missing: 0,
      failed: 0,
      rowsCleared: 0,
    };
  }

  // Collect every URL we want gone. A row may contribute 0, 1, or 2 URLs.
  const urls: string[] = [];
  for (const r of rows) {
    if (r.checkInPhoto) urls.push(r.checkInPhoto);
    if (r.checkOutPhoto) urls.push(r.checkOutPhoto);
  }

  // ONE FTP connection for the whole batch — handshake savings is the
  // whole point of `deleteManyFromHostinger`.
  const ftpResult = await deleteManyFromHostinger(urls);

  // Null out the photo columns on every row we touched, regardless of
  // individual FTP success. Failed-but-recorded is the right state: the
  // app no longer references the file, and the FTP host can leak a few
  // stragglers (a janitor sweep can mop those up by directory scan if
  // it ever matters). Avoids re-trying the same URLs forever.
  const ids = rows.map((r) => r.id);
  await prisma.attendance.updateMany({
    where: { id: { in: ids } },
    data: { checkInPhoto: null, checkOutPhoto: null },
  });

  return {
    organizationId,
    rowsScanned: rows.length,
    attempted: urls.length,
    removed: ftpResult.removed,
    missing: ftpResult.missing,
    failed: ftpResult.failed,
    rowsCleared: ids.length,
  };
}

/**
 * Sweep ALL active orgs. Used by the daily cron — iterates orgs and runs
 * `cleanupOrgAttendancePhotos` for each. Orgs are independent so a failure
 * in one doesn't block the rest.
 */
export async function cleanupAllOrgsAttendancePhotos(
  now: Date = new Date(),
): Promise<{
  totalOrgs: number;
  results: CleanupResult[];
  errors: { organizationId: string; message: string }[];
}> {
  // Pull every org that has an attendance config. We don't strictly need
  // `isActive` here — even a deactivated config should still have its
  // photos cleaned up — but we do want to skip orgs that have never
  // configured attendance at all (no row → defaults → retention=30 but
  // nothing to delete anyway).
  const configs = await (prisma as any).attendanceConfiguration.findMany({
    select: { organizationId: true },
    where: { organizationId: { not: null } },
  });

  const results: CleanupResult[] = [];
  const errors: { organizationId: string; message: string }[] = [];
  for (const c of configs as { organizationId: string }[]) {
    try {
      const r = await cleanupOrgAttendancePhotos(c.organizationId, now);
      results.push(r);
      if (r.rowsCleared > 0) {
        console.log(
          `[photo-cleanup] org=${c.organizationId} cleared ${r.rowsCleared} row(s), ftp removed=${r.removed} missing=${r.missing} failed=${r.failed}`,
        );
      }
    } catch (err: any) {
      const message = err?.message ?? String(err);
      console.error(
        `[photo-cleanup] org=${c.organizationId} sweep failed:`,
        message,
      );
      errors.push({ organizationId: c.organizationId, message });
    }
  }

  return { totalOrgs: configs.length, results, errors };
}
