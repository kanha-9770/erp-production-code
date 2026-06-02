/**
 * READ-ONLY payroll verification: runs the REAL payroll engine
 * (calculatePayroll) for one org + month and prints, per employee, the net
 * pay and the paid-vs-LOP leave split, so you can eyeball the actual numbers
 * the quota logic produces BEFORE running a real Generate.
 *
 * It only COMPUTES (no persist, no balance writes, no DB mutation) — safe to
 * run against production. calculatePayroll itself never writes; only the
 * separate Generate action persists.
 *
 * Usage:
 *   npx tsx scripts/verify-payroll-leave-sync.mts <organizationId> <YYYY-MM>
 *   npx tsx scripts/verify-payroll-leave-sync.mts <organizationId>          # defaults to current month
 *
 * Find your organizationId from the app (or the User row). The month is the
 * payroll month, e.g. 2026-06.
 */

import { calculatePayroll } from '../lib/utils/payroll-utils';
import { getLeaveQuotaContext } from '../lib/utils/payroll-store';
import { prisma } from '../lib/prisma';

function money(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
function d1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

async function main() {
  const orgId = (process.argv[2] ?? '').trim();
  const month = (process.argv[3] ?? '').trim() || new Date().toISOString().slice(0, 7);
  if (!orgId) {
    console.error('Usage: npx tsx scripts/verify-payroll-leave-sync.mts <organizationId> [YYYY-MM]');
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    console.error(`Bad month "${month}" — expected YYYY-MM`);
    process.exit(1);
  }

  console.log(`\nPayroll leave-sync check — org ${orgId}, month ${month}`);
  console.log('(read-only: computes, does not persist or deduct)\n');

  // Quota context the engine uses, surfaced so we can show the allowance too.
  const quotaCtx = await getLeaveQuotaContext(orgId, month);

  const rows = await calculatePayroll(orgId, month);
  if (rows.length === 0) {
    console.log('No payroll rows produced — check that employees + attendance exist for this month.');
    await prisma.$disconnect();
    return;
  }

  let totalNet = 0;
  let anyLeave = false;
  let anyLop = false;

  // Sort: employees with leave first, so the interesting rows are on top.
  const sorted = [...rows].sort((a, b) => {
    const al = a.breakdown.paidLeaveDays + a.breakdown.unpaidLeaveDays;
    const bl = b.breakdown.paidLeaveDays + b.breakdown.unpaidLeaveDays;
    return bl - al;
  });

  for (const r of sorted) {
    totalNet += r.netSalary;
    const b = r.breakdown;
    const paid = b.paidLeaveDays;
    const lop = b.unpaidLeaveDays + b.absentDays;
    if (paid > 0 || lop > 0) anyLeave = true;
    if (lop > 0) anyLop = true;

    // Only print employees with something noteworthy (leave or LOP) plus a
    // compact line; fully-present employees are summarised at the end.
    if (paid > 0 || lop > 0) {
      const byType = Object.entries(b.leaveByType)
        .map(([k, v]) => `${k}:${d1(v)}`)
        .join(', ');
      console.log(
        `• ${r.employeeName.padEnd(22)} ` +
        `net=${money(r.netSalary).padStart(10)}  ` +
        `payable=${d1(b.payableDays)}/${b.daysInMonth}  ` +
        `paidLeave=${d1(paid)}  LOP=${d1(lop)}` +
        (byType ? `  [${byType}]` : ''),
      );
    }
  }

  const presentOnly = rows.length - sorted.filter((r) => {
    const b = r.breakdown;
    return b.paidLeaveDays > 0 || b.unpaidLeaveDays > 0 || b.absentDays > 0;
  }).length;

  console.log(`\n── Summary ──`);
  console.log(`employees:        ${rows.length}`);
  console.log(`with leave/LOP:   ${rows.length - presentOnly}`);
  console.log(`no leave:         ${presentOnly}`);
  console.log(`total net pay:    ${money(totalNet)}`);
  if (!anyLeave) {
    console.log('\nNote: no employee has any leave this month — leave-quota logic had nothing to price.');
  } else if (!anyLop) {
    console.log('\nAll leave this month was within quota → fully paid, no salary docked. ✅');
  } else {
    console.log('\nSome leave exceeded quota → those days are LOP (deducted). Spot-check a few above.');
  }

  // Surface the quota allowances so you can confirm allocations are actually set.
  const zeroQuota = Array.from(quotaCtx.values()).filter((c) => c.paidQuota === 0).length;
  if (quotaCtx.size === 0) {
    console.log(
      '\n⚠️  No LeaveBalance allocations found for this org/year. Every leave will be treated as ' +
      'OVER quota (LOP). If employees should have paid quota (e.g. Full 6 / Half 1.0), allocate it first.',
    );
  } else if (zeroQuota > 0) {
    console.log(
      `\n⚠️  ${zeroQuota} (user,type) balance rows have paidQuota=0 — leave of those types will be docked. ` +
      'Confirm that is intended.',
    );
  }
}

main()
  .catch((err) => {
    console.error('\nVerification failed to run:', err);
    process.exit(2);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
