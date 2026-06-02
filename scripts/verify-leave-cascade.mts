/**
 * Edge cases for the Half→Full→LOP cascade resolver. Pure, no DB.
 * Run: npx tsx scripts/verify-leave-cascade.mts
 */
import { resolveHalfDayCascade, cascadeHint } from '../lib/hr/leave-cascade';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got =${JSON.stringify(got)}\n      want=${JSON.stringify(want)}`); }
}

console.log('\n=== Half Day quota covers it ===');
{
  const r = resolveHalfDayCascade({ halfDayAvailable: 2, fullDayAvailable: 6 });
  eq('within half quota: fromHalfDay', r.fromHalfDay, 0.5);
  eq('within half quota: fromFullDay', r.fromFullDay, 0);
  eq('within half quota: lop', r.lop, 0);
  eq('within half quota: no hint', cascadeHint(r), null);
}

console.log('\n=== Half exhausted → Full covers it ===');
{
  const r = resolveHalfDayCascade({ halfDayAvailable: 0, fullDayAvailable: 6 });
  eq('overflow to full: fromHalfDay', r.fromHalfDay, 0);
  eq('overflow to full: fromFullDay', r.fromFullDay, 0.5);
  eq('overflow to full: lop', r.lop, 0);
  eq('overflow to full: hint', cascadeHint(r), 'Half Day quota is used up — this will use 0.5 of your Full Day quota.');
}

console.log('\n=== Both exhausted → LOP ===');
{
  const r = resolveHalfDayCascade({ halfDayAvailable: 0, fullDayAvailable: 0 });
  eq('both gone: lop', r.lop, 0.5);
  eq('both gone: fromFullDay', r.fromFullDay, 0);
  eq('both gone: hint', cascadeHint(r),
    'Half Day quota is used up and no Full Day quota remains — this day will be unpaid (LOP).');
}

console.log('\n=== Sliver split: 0.25 left in Half, rest from Full ===');
{
  const r = resolveHalfDayCascade({ halfDayAvailable: 0.25, fullDayAvailable: 6 });
  eq('split: charges', r.charges, [
    { source: 'HALF_DAY', days: 0.25 },
    { source: 'FULL_DAY', days: 0.25 },
  ]);
  eq('split: sums to 0.5', r.fromHalfDay + r.fromFullDay + r.lop, 0.5);
}

console.log('\n=== Sliver split into LOP: 0.25 Half, 0.1 Full, rest LOP ===');
{
  const r = resolveHalfDayCascade({ halfDayAvailable: 0.25, fullDayAvailable: 0.1 });
  eq('triple split: fromHalfDay', r.fromHalfDay, 0.25);
  eq('triple split: fromFullDay', r.fromFullDay, 0.1);
  eq('triple split: lop', Number(r.lop.toFixed(4)), 0.15);
  eq('triple split: partial-full hint',
    cascadeHint(r),
    'Half Day quota is used up — 0.1 day will draw from Full Day quota and the rest will be unpaid (LOP).');
}

console.log('\n=== Charges always sum to requested ===');
for (const [h, f] of [[0,0],[0.5,0],[0,0.5],[1,1],[0.3,0.3],[5,5]] as const) {
  const r = resolveHalfDayCascade({ halfDayAvailable: h, fullDayAvailable: f });
  const total = r.charges.reduce((a, c) => a + c.days, 0);
  eq(`sum==0.5 for half=${h} full=${f}`, Number(total.toFixed(6)), 0.5);
}

console.log(`\n──────────────────────────────────────────`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log('All cascade resolver cases pass ✅');
