/**
 * Integration check for the CHRONOLOGICAL consumption of the yearly paid
 * quota across a sequence of leave days — the exact pattern classifyDay uses
 * (a running `quotaConsumed` counter feeding the real splitLeavePayByQuota).
 *
 * Run: npx tsx scripts/verify-quota-pay-chrono.mts
 */
import { splitLeavePayByQuota } from '../lib/hr/leave-quota-pay';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got =${JSON.stringify(got)}\n      want=${JSON.stringify(want)}`); }
}

/**
 * Replicate classifyDay's consumption: walk leave events in date order,
 * carrying a running counter seeded from prior months, charging each against
 * the real splitter. Returns the per-event paid/lop and final totals.
 */
function runChrono(
  paidQuota: number,
  usedBeforeMonth: number,
  events: { date: string; days: number }[],
) {
  let consumed = usedBeforeMonth;
  let paidTotal = 0, lopTotal = 0;
  const perEvent: { date: string; paid: number; lop: number }[] = [];
  for (const ev of events.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    const s = splitLeavePayByQuota({ allocated: paidQuota, usedBefore: consumed, daysTaken: ev.days });
    consumed += s.paidDays; // only paid days consume quota (matches classifyDay)
    paidTotal += s.paidDays;
    lopTotal += s.lopDays;
    perEvent.push({ date: ev.date, paid: s.paidDays, lop: s.lopDays });
  }
  return { paidTotal, lopTotal, perEvent };
}

console.log('\n=== Within-month: quota 2, four half-days (Shubham) ===');
{
  // 4 half-days = 2.0 days total; quota exactly 2 → all paid, 0 LOP.
  const r = runChrono(2, 0, [
    { date: '2026-06-02', days: 0.5 },
    { date: '2026-06-09', days: 0.5 },
    { date: '2026-06-16', days: 0.5 },
    { date: '2026-06-23', days: 0.5 },
  ]);
  eq('all four half-days paid', r.paidTotal, 2);
  eq('nothing docked', r.lopTotal, 0);
}

console.log('\n=== Within-month: a FIFTH half-day tips into LOP ===');
{
  const r = runChrono(2, 0, [
    { date: '2026-06-02', days: 0.5 },
    { date: '2026-06-09', days: 0.5 },
    { date: '2026-06-16', days: 0.5 },
    { date: '2026-06-23', days: 0.5 },
    { date: '2026-06-30', days: 0.5 }, // 5th → over quota
  ]);
  eq('4 paid', r.paidTotal, 2);
  eq('5th docked', r.lopTotal, 0.5);
  eq('only the last event is LOP', r.perEvent.filter((e) => e.lop > 0).map((e) => e.date), ['2026-06-30']);
}

console.log('\n=== Across months: prior usage seeds the counter ===');
{
  // Yearly quota 2. Earlier months already used 1.5 (usedBeforeMonth). This
  // month takes 0.5 (paid, lands on 2) + 0.5 (LOP).
  const r = runChrono(2, 1.5, [
    { date: '2026-06-05', days: 0.5 },
    { date: '2026-06-20', days: 0.5 },
  ]);
  eq('first event paid (fills quota)', r.perEvent[0], { date: '2026-06-05', paid: 0.5, lop: 0 });
  eq('second event LOP (over)', r.perEvent[1], { date: '2026-06-20', paid: 0, lop: 0.5 });
}

console.log('\n=== Across months: quota already exhausted before this month ===');
{
  const r = runChrono(2, 2, [{ date: '2026-06-05', days: 1 }]);
  eq('whole day docked', r.lopTotal, 1);
  eq('nothing paid', r.paidTotal, 0);
}

console.log('\n=== Full-day leaves crossing the boundary ===');
{
  // quota 6, used 5 prior. Take a 3-day leave this month → 1 paid, 2 LOP.
  const r = runChrono(6, 5, [{ date: '2026-06-10', days: 3 }]);
  eq('partial: 1 paid', r.paidTotal, 1);
  eq('partial: 2 LOP', r.lopTotal, 2);
}

console.log('\n=== Order matters: same set, shuffled input → same totals ===');
{
  const events = [
    { date: '2026-06-30', days: 0.5 },
    { date: '2026-06-02', days: 0.5 },
    { date: '2026-06-16', days: 0.5 },
  ];
  const a = runChrono(1, 0, events);
  const b = runChrono(1, 0, [...events].reverse());
  eq('totals stable regardless of input order', { p: a.paidTotal, l: a.lopTotal }, { p: b.paidTotal, l: b.lopTotal });
  // quota 1 → first two half-days paid (1.0), third LOP.
  eq('chronological: last date is the LOP one', a.perEvent.find((e) => e.lop > 0)?.date, '2026-06-30');
}

console.log(`\n──────────────────────────────────────────`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log('All chronological repricing cases pass ✅');
