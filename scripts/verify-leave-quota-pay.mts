/**
 * Edge cases for splitLeavePayByQuota — "within quota = paid, beyond = LOP".
 * Run: npx tsx scripts/verify-leave-quota-pay.mts
 */
import { splitLeavePayByQuota } from '../lib/hr/leave-quota-pay';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got =${JSON.stringify(got)}\n      want=${JSON.stringify(want)}`); }
}

console.log('\n=== Fully within quota → all paid ===');
eq('quota 2, none used, take 0.5',
  splitLeavePayByQuota({ allocated: 2, usedBefore: 0, daysTaken: 0.5 }),
  { paidDays: 0.5, lopDays: 0, remainingPaidAfter: 1.5 });
eq('quota 6, used 2, take 3',
  splitLeavePayByQuota({ allocated: 6, usedBefore: 2, daysTaken: 3 }),
  { paidDays: 3, lopDays: 0, remainingPaidAfter: 1 });

console.log('\n=== Crossing the boundary → split paid + LOP ===');
eq('quota 2, used 1.5, take 1 → 0.5 paid, 0.5 LOP',
  splitLeavePayByQuota({ allocated: 2, usedBefore: 1.5, daysTaken: 1 }),
  { paidDays: 0.5, lopDays: 0.5, remainingPaidAfter: 0 });
eq('exact boundary: quota 2, used 2, take 0.5 → all LOP',
  splitLeavePayByQuota({ allocated: 2, usedBefore: 2, daysTaken: 0.5 }),
  { paidDays: 0, lopDays: 0.5, remainingPaidAfter: 0 });

console.log('\n=== Quota already exhausted → all LOP ===');
eq('quota 2, used 5 (overrun), take 0.5',
  splitLeavePayByQuota({ allocated: 2, usedBefore: 5, daysTaken: 0.5 }),
  { paidDays: 0, lopDays: 0.5, remainingPaidAfter: 0 });

console.log('\n=== Zero quota (truly unpaid type) → all LOP ===');
eq('quota 0, take 1',
  splitLeavePayByQuota({ allocated: 0, usedBefore: 0, daysTaken: 1 }),
  { paidDays: 0, lopDays: 1, remainingPaidAfter: 0 });

console.log('\n=== Carry-forward adds to paid quota ===');
eq('allocated 2 + carried 1 = 3 paid; used 2, take 2 → 1 paid, 1 LOP',
  splitLeavePayByQuota({ allocated: 2, carriedForward: 1, usedBefore: 2, daysTaken: 2 }),
  { paidDays: 1, lopDays: 1, remainingPaidAfter: 0 });

console.log('\n=== Half-day granularity ===');
eq('quota 1 (=2 half-days), used 0.5, take 0.5 → paid',
  splitLeavePayByQuota({ allocated: 1, usedBefore: 0.5, daysTaken: 0.5 }),
  { paidDays: 0.5, lopDays: 0, remainingPaidAfter: 0 });
eq('quota 1, used 1.0, take 0.5 → LOP (over)',
  splitLeavePayByQuota({ allocated: 1, usedBefore: 1, daysTaken: 0.5 }),
  { paidDays: 0, lopDays: 0.5, remainingPaidAfter: 0 });

console.log('\n=== Defensive: negatives clamp to 0 ===');
eq('negative usedBefore treated as 0',
  splitLeavePayByQuota({ allocated: 2, usedBefore: -3, daysTaken: 1 }),
  { paidDays: 1, lopDays: 0, remainingPaidAfter: 1 });
eq('negative daysTaken → nothing',
  splitLeavePayByQuota({ allocated: 2, usedBefore: 0, daysTaken: -1 }),
  { paidDays: 0, lopDays: 0, remainingPaidAfter: 2 });

console.log('\n=== Shubham scenario: Half quota 2, takes 3 half-days over month ===');
// 3 half-days = 1.5 days. Priced as one batch from used=0.
eq('Shubham: 1.5 taken vs quota 2 → all paid',
  splitLeavePayByQuota({ allocated: 2, usedBefore: 0, daysTaken: 1.5 }),
  { paidDays: 1.5, lopDays: 0, remainingPaidAfter: 0.5 });
// Now he takes 0.5 more → over quota → LOP.
eq('Shubham: next 0.5 after 1.5 used vs quota 2 → 0.5 paid (lands exactly on 2)',
  splitLeavePayByQuota({ allocated: 2, usedBefore: 1.5, daysTaken: 0.5 }),
  { paidDays: 0.5, lopDays: 0, remainingPaidAfter: 0 });
eq('Shubham: another 0.5 after quota full → LOP',
  splitLeavePayByQuota({ allocated: 2, usedBefore: 2, daysTaken: 0.5 }),
  { paidDays: 0, lopDays: 0.5, remainingPaidAfter: 0 });

console.log(`\n──────────────────────────────────────────`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log('All quota-pay split cases pass ✅');
