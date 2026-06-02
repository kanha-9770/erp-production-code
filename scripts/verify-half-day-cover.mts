/**
 * Edge-case verification for the half-day → paid-leave cover, using "Shubham".
 * Pure function only (computeHalfDayCover) — no DB. Mirrors how the payroll
 * engine and the Generate deduction both consume it.
 *
 * Run: npx tsx scripts/verify-half-day-cover.mts
 */
import { computeHalfDayCover, type PaidLeaveSource } from '../lib/hr/half-day-cover';

let pass = 0, fail = 0;
const fails: string[] = [];
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}\n      got =${JSON.stringify(got)}\n      want=${JSON.stringify(want)}`); }
}

const CL: PaidLeaveSource = { leaveTypeId: 'cl', leaveTypeName: 'Casual', sortOrder: 1, available: 0 };
const PL: PaidLeaveSource = { leaveTypeId: 'pl', leaveTypeName: 'Privilege', sortOrder: 2, available: 0 };
const src = (over: Partial<PaidLeaveSource>): PaidLeaveSource => ({ ...CL, ...over });

console.log('\n=== A. Nothing to cover ===');
eq('0 excess → no cover', computeHalfDayCover(0, [src({ available: 10 })]),
  { excessHalfDays: 0, coveredHalfDays: 0, leaveDaysConsumed: 0, payDaysRestored: 0, draws: [], remainingDockedHalfDays: 0 });
eq('excess but no sources → all docked',
  computeHalfDayCover(3, []),
  { excessHalfDays: 3, coveredHalfDays: 0, leaveDaysConsumed: 0, payDaysRestored: 0, draws: [], remainingDockedHalfDays: 3 });
eq('excess but sources all zero → all docked',
  computeHalfDayCover(2, [src({ available: 0 })]).remainingDockedHalfDays, 2);

console.log('\n=== B. Full cover ===');
{
  // 2 excess half-days = 1.0 leave day; CL has 5 → fully covered from CL.
  const r = computeHalfDayCover(2, [src({ available: 5 })]);
  eq('2 half covered by CL: coveredHalfDays', r.coveredHalfDays, 2);
  eq('2 half covered by CL: leaveDaysConsumed', r.leaveDaysConsumed, 1);
  eq('2 half covered by CL: payDaysRestored', r.payDaysRestored, 1);
  eq('2 half covered by CL: draws', r.draws, [{ leaveTypeId: 'cl', leaveTypeName: 'Casual', days: 1 }]);
  eq('2 half covered by CL: nothing docked', r.remainingDockedHalfDays, 0);
}

console.log('\n=== C. Partial cover (balance runs out) ===');
{
  // 4 excess = 2.0 days needed; CL has only 1.0 → covers 2 half-days, 2 docked.
  const r = computeHalfDayCover(4, [src({ available: 1 })]);
  eq('partial: coveredHalfDays', r.coveredHalfDays, 2);
  eq('partial: leaveDaysConsumed', r.leaveDaysConsumed, 1);
  eq('partial: remainingDocked', r.remainingDockedHalfDays, 2);
}

console.log('\n=== D. Priority order (sortOrder) + spillover ===');
{
  // 3 excess = 1.5 days. CL(sort1)=1.0 drains first, then PL(sort2)=0.5.
  const r = computeHalfDayCover(3, [{ ...PL, available: 5 }, { ...CL, available: 1 }]);
  eq('drains CL before PL despite input order', r.draws, [
    { leaveTypeId: 'cl', leaveTypeName: 'Casual', days: 1 },
    { leaveTypeId: 'pl', leaveTypeName: 'Privilege', days: 0.5 },
  ]);
  eq('spillover: coveredHalfDays', r.coveredHalfDays, 3);
  eq('spillover: leaveDaysConsumed', r.leaveDaysConsumed, 1.5);
  eq('spillover: nothing docked', r.remainingDockedHalfDays, 0);
}

console.log('\n=== E. Exact-fit and odd half-day counts ===');
{
  // 1 excess half-day = 0.5 day; CL has exactly 0.5.
  const r = computeHalfDayCover(1, [src({ available: 0.5 })]);
  eq('exact 0.5 fit: covered 1', r.coveredHalfDays, 1);
  eq('exact 0.5 fit: docked 0', r.remainingDockedHalfDays, 0);
}
{
  // 5 excess = 2.5 days; CL=2.0, PL=0.4 → covers 2.4 days = 4.8 half-days,
  // leaving 0.2 half-day docked. Verifies fractional safety.
  const r = computeHalfDayCover(5, [{ ...CL, available: 2 }, { ...PL, available: 0.4 }]);
  eq('fractional: leaveDaysConsumed', Number(r.leaveDaysConsumed.toFixed(4)), 2.4);
  eq('fractional: coveredHalfDays', Number(r.coveredHalfDays.toFixed(4)), 4.8);
  eq('fractional: remainingDocked', Number(r.remainingDockedHalfDays.toFixed(4)), 0.2);
}

console.log('\n=== F. Does not mutate caller input ===');
{
  const sources = [src({ available: 5 }), { ...PL, available: 3 }];
  const before = JSON.stringify(sources);
  computeHalfDayCover(2, sources);
  eq('input array untouched', JSON.stringify(sources), before);
}

console.log('\n=== G. End-to-end pay restoration (Shubham, quota already used) ===');
// Scenario: Shubham has 4 half-days this month, monthlyHalfDayQuota=1.
// Quota forgives 1 → excess 3 half-days. He has CL=1.0, PL=5.0.
// 3 half = 1.5 leave-days → CL 1.0 + PL 0.5. Pay restored 1.5 days. 0 docked.
{
  const excess = 4 - 1; // halfDays - halfDaysForgiven
  const r = computeHalfDayCover(excess, [
    { ...CL, available: 1 },
    { ...PL, available: 5 },
  ]);
  eq('Shubham payDaysRestored', r.payDaysRestored, 1.5);
  eq('Shubham CL drained first', r.draws[0], { leaveTypeId: 'cl', leaveTypeName: 'Casual', days: 1 });
  eq('Shubham PL covers rest', r.draws[1], { leaveTypeId: 'pl', leaveTypeName: 'Privilege', days: 0.5 });
  eq('Shubham nothing docked', r.remainingDockedHalfDays, 0);
}

console.log(`\n──────────────────────────────────────────`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) { console.log('FAILURES: ' + fails.join(', ')); process.exit(1); }
console.log('All half-day-cover edge cases pass ✅');
