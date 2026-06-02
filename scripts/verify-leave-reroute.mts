/**
 * Verifies the apply-time reroute DECISION (Half Day quota → Full Day quota →
 * stay/LOP) — the same branch logic used server-side in applyLeave and in the
 * dialog's cascadeHintText. Pure reimplementation of that decision so we can
 * assert every branch without a DB.
 *
 * Run: npx tsx scripts/verify-leave-reroute.mts
 */

type Decision = 'HALF' | 'REROUTE_FULL' | 'STAY_HALF_LOP';

// Mirror of the server decision in lib/hr/leave-service.ts applyLeave:
//   halfAvail > 0            → charge Half (no reroute)
//   halfAvail <= 0 & fullAvail > 0 → reroute onto Full Day type
//   halfAvail <= 0 & fullAvail <= 0 → stay on Half (records; pay = LOP later)
function decide(halfAvail: number, fullAvail: number, fullTypeExists = true): Decision {
  if (halfAvail > 1e-9) return 'HALF';
  if (fullTypeExists && fullAvail > 1e-9) return 'REROUTE_FULL';
  return 'STAY_HALF_LOP';
}

// Mirror of the dialog hint (cascadeHintText).
function hint(halfAvail: number, fullAvail: number): string | null {
  if (halfAvail > 1e-9) return null;
  if (fullAvail > 1e-9) return 'Half Day quota is used up — this request will draw 0.5 day from your Full Day quota.';
  return 'Half Day and Full Day quota are both used up — this day will be unpaid (LOP).';
}

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
}

console.log('\n=== Reroute decision ===');
eq('half has 2 days → charge Half', decide(2, 6), 'HALF');
eq('half has 0.5 left → charge Half', decide(0.5, 6), 'HALF');
eq('half empty, full has 6 → reroute to Full', decide(0, 6), 'REROUTE_FULL');
eq('half empty, full has 0.5 → reroute to Full', decide(0, 0.5), 'REROUTE_FULL');
eq('both empty → stay Half (LOP at payroll)', decide(0, 0), 'STAY_HALF_LOP');
eq('half empty, full empty, no Full type → stay Half', decide(0, 0, false), 'STAY_HALF_LOP');
eq('half empty, full exists but 0 → stay Half', decide(0, 0, true), 'STAY_HALF_LOP');
eq('negative half (overrun) treated as empty → reroute', decide(-1, 3), 'REROUTE_FULL');

console.log('\n=== Dialog hint matches decision ===');
eq('within quota → no hint', hint(2, 6), null);
eq('overflow → Full hint', hint(0, 6),
  'Half Day quota is used up — this request will draw 0.5 day from your Full Day quota.');
eq('both gone → LOP hint', hint(0, 0),
  'Half Day and Full Day quota are both used up — this day will be unpaid (LOP).');

console.log('\n=== Decision ⇔ hint consistency (no contradictions) ===');
for (const [h, f] of [[2,6],[0.5,0],[0,6],[0,0.5],[0,0],[-1,3]] as const) {
  const d = decide(h, f);
  const hn = hint(h, f);
  // If we reroute, the hint must mention Full Day. If LOP, hint must mention unpaid.
  if (d === 'REROUTE_FULL') eq(`h=${h} f=${f}: reroute ⇒ Full hint`, /Full Day quota/.test(hn ?? ''), true);
  else if (d === 'STAY_HALF_LOP') eq(`h=${h} f=${f}: LOP ⇒ unpaid hint`, /unpaid/.test(hn ?? ''), true);
  else eq(`h=${h} f=${f}: within quota ⇒ no hint`, hn, null);
}

console.log(`\n──────────────────────────────────────────`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log('All reroute decision cases pass ✅');
