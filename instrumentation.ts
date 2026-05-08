/**
 * Next.js instrumentation hook. Runs once when the Node server starts —
 * the only safe place to register long-lived background workers like our
 * cron-based attendance report scheduler.
 *
 * Guarded by the runtime check so the file is a no-op in the Edge runtime
 * (no node-cron, no prisma there).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.DISABLE_ATTENDANCE_SCHEDULER === '1') {
    console.log('[instrumentation] attendance scheduler disabled via env');
    return;
  }
  try {
    const { startAttendanceReportScheduler } = await import(
      '@/lib/hr/attendance-report-scheduler'
    );
    await startAttendanceReportScheduler();
  } catch (err) {
    console.error('[instrumentation] attendance scheduler boot failed:', err);
  }
}
