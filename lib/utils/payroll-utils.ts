import {
  getAttendanceFromDB,
  getEmployeesFromDB,
  getHolidaysFromDB,
  getLeavesFromDB,
  getOrgProfilesContext,
  getPayrollPolicy,
  resolveEmployeeFormulas,
  PayrollFormulas,
  PayrollRecord,
  PayrollPolicy,
  SampleAttendance,
  SampleEmployee,
  SampleHoliday,
  SampleLeave,
} from './payroll-store';
import { prisma } from '@/lib/prisma';

interface PayrollCalculation extends PayrollRecord {}

const STANDARD_HOURS_PER_DAY = 8;
const HALF_DAY_MIN_HOURS = 4; // <4h logged → counted as half-day; 0h → absent

// Legacy fallback constants for the daily-payroll path that doesn't have
// access to organization-level formulas (calculateDailyPayroll). The main
// monthly engine (calculateForEmployee) reads PF/ESI/PT/TDS from the config
// loaded via getPayrollFormulas — see deductions block below.
const PF_PERCENT = 12;
const TAX_PERCENT = 5;
const INSURANCE_FIXED = 500;

const DEFAULT_DAY_HOURS = 8;

// Annual TDS computed against New Regime (FY 2025-26) slabs, plus surcharge
// brackets and 4% Health & Education Cess. Mirrors the SalaryPreview helper
// in components/payroll/payroll-enterprise-config.tsx so the configure-page
// preview and the real payroll always agree.
function computeAnnualTdsNew(annualGross: number): number {
  let taxable = Math.max(0, annualGross - 75000);
  if (taxable <= 1200000) return 0; // 87A rebate
  let tax = 0;
  if (taxable > 2400000) { tax += (taxable - 2400000) * 0.30; taxable = 2400000; }
  if (taxable > 2000000) { tax += (taxable - 2000000) * 0.25; taxable = 2000000; }
  if (taxable > 1600000) { tax += (taxable - 1600000) * 0.20; taxable = 1600000; }
  if (taxable > 1200000) { tax += (taxable - 1200000) * 0.15; taxable = 1200000; }
  if (taxable > 800000)  { tax += (taxable - 800000)  * 0.10; taxable = 800000; }
  if (taxable > 400000)  { tax += (taxable - 400000)  * 0.05; }
  return applySurchargeAndCess(annualGross, tax);
}

// Old Regime FY 2025-26: 0–₹2.5L Nil, ₹2.5–5L 5%, ₹5–10L 20%, >₹10L 30%.
// Standard deduction ₹50k. Rebate u/s 87A applies when taxable ≤ ₹5L. The
// engine does NOT model 80C/80D/HRA exemptions at this layer — those should
// flow in as a per-employee `taxableIncomeOverride` once IT-declarations
// land. Until then this is a baseline that will overstate TDS for employees
// who haven't claimed exemptions; users on Old Regime should expect to true
// up via Form 16.
function computeAnnualTdsOld(annualGross: number): number {
  let taxable = Math.max(0, annualGross - 50000);
  if (taxable <= 500000) return 0; // 87A rebate (Old Regime)
  let tax = 0;
  if (taxable > 1000000) { tax += (taxable - 1000000) * 0.30; taxable = 1000000; }
  if (taxable > 500000)  { tax += (taxable - 500000)  * 0.20; taxable = 500000; }
  if (taxable > 250000)  { tax += (taxable - 250000)  * 0.05; }
  return applySurchargeAndCess(annualGross, tax);
}

function applySurchargeAndCess(annualGross: number, tax: number): number {
  let surcharge = 0;
  if (annualGross > 20000000) surcharge = tax * 0.25;
  else if (annualGross > 10000000) surcharge = tax * 0.15;
  else if (annualGross > 5000000) surcharge = tax * 0.10;
  return (tax + surcharge) * 1.04;
}

/**
 * Parses an HH:mm-ish string. Tolerates "08:54", "08:54:21", "08:54:21 PM",
 * and "8:54 AM". Returns total minutes from midnight, or null if the input
 * is unparseable. We DO honour AM/PM when present so legacy rows written by
 * the old `/api/attendance` POST (which used `toLocaleTimeString` with
 * `hour12: true`) parse correctly. The new punch endpoint always writes
 * 24-hour strings so AM/PM is absent and we treat it as 24h.
 */
function parseTimeToMinutes(raw: string): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([APap][Mm])?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (m[3]) {
    const isPM = m[3].toUpperCase() === 'PM';
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
  }
  return h * 60 + min;
}

/**
 * Raw worked-hours from HH:mm strings. Used as a fallback when ISO
 * timestamps are not available (form-based attendance).
 *
 * Behaviour notes:
 *   - Both empty → 0 (no attendance to read)
 *   - Only one side → DEFAULT_DAY_HOURS (assume full day worked, the
 *     missing punch is treated as "forgot to clock out")
 *   - Both present → checkout-minus-checkin in hours. We do NOT subtract
 *     a fixed lunch break here — that used to silently zero out short
 *     workdays and made the payroll Hours column disagree with the
 *     Team Attendance "Worked" column (which is straight wall-clock).
 *     Lunch policy belongs in pay computation, not in displayed hours.
 */
export function calculateWorkingHours(checkInTime: string, checkOutTime?: string): number {
  if (!checkInTime && !checkOutTime) return 0;
  if (!checkOutTime) return DEFAULT_DAY_HOURS;
  if (!checkInTime) return DEFAULT_DAY_HOURS;
  const inMin = parseTimeToMinutes(checkInTime);
  const outMin = parseTimeToMinutes(checkOutTime);
  if (inMin === null || outMin === null) return 0;
  let diffMinutes = outMin - inMin;
  if (diffMinutes < 0) diffMinutes += 24 * 60;
  return Math.max(0, diffMinutes / 60);
}

/**
 * Authoritative worked-hours computation. Prefers full ISO timestamps
 * (`checkInAt`/`checkOutAt` from the Attendance table) over the HH:mm
 * strings, because the strings drop seconds and AM/PM context. This is
 * the same source the Team Attendance "Worked" column uses, so payroll's
 * Hours column will now match it row-for-row.
 */
function workedHoursFromAttendance(att: {
  checkInTime: string;
  checkOutTime: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
}): number {
  const inAt = att.checkInAt ? Date.parse(att.checkInAt) : NaN;
  const outAt = att.checkOutAt ? Date.parse(att.checkOutAt) : NaN;
  if (Number.isFinite(inAt) && Number.isFinite(outAt) && outAt >= inAt) {
    return (outAt - inAt) / 3_600_000;
  }
  // Only check-in ISO present → assume full day worked.
  if (Number.isFinite(inAt) && !Number.isFinite(outAt)) {
    return DEFAULT_DAY_HOURS;
  }
  // Fall back to the HH:mm strings.
  return calculateWorkingHours(att.checkInTime, att.checkOutTime || undefined);
}

// ---- LeaveRule policy book -------------------------------------------------
// LeaveRule rows are global (not org-scoped in the schema), so we pull every
// active rule once per payroll run and expose a name → rule lookup. The seed
// uses human names like "Sick Leave" / "Casual Leave" — we match on those.

interface ResolvedLeaveRule {
  id: string;
  name: string; // for display in breakdown
  isPaid: boolean;
  deductionPercentage: number; // 0..100, applied only when isPaid=false
  category: 'FULL_DAY' | 'HALF_DAY' | 'SHORT_LEAVE' | 'HOURLY';
  hoursEquivalent: number | null;
}

const LOP_FALLBACK: ResolvedLeaveRule = {
  id: '__lop_fallback__',
  name: 'Unmatched (treated as LOP)',
  isPaid: false,
  deductionPercentage: 100,
  category: 'FULL_DAY',
  hoursEquivalent: null,
};

async function loadLeaveRules(): Promise<Map<string, ResolvedLeaveRule>> {
  const rows = await prisma.leaveRule.findMany({
    where: { isActive: true },
    include: { leaveType: { select: { category: true } } },
  });
  const map = new Map<string, ResolvedLeaveRule>();
  for (const r of rows) {
    const resolved: ResolvedLeaveRule = {
      id: r.id,
      name: r.name,
      isPaid: r.isPaid,
      deductionPercentage: Number(r.deductionPercentage ?? 100),
      category: r.leaveType.category,
      hoursEquivalent:
        r.hoursEquivalent !== null && r.hoursEquivalent !== undefined
          ? Number(r.hoursEquivalent)
          : null,
    };
    // Index by lower-cased name so "sick leave" / "Sick Leave" / "SICK LEAVE"
    // all resolve to the same rule.
    map.set(r.name.trim().toLowerCase(), resolved);
  }
  return map;
}

function resolveLeaveRule(
  raw: string,
  rules: Map<string, ResolvedLeaveRule>,
): ResolvedLeaveRule {
  if (!raw) return LOP_FALLBACK;
  const direct = rules.get(raw.trim().toLowerCase());
  if (direct) return direct;
  // Tolerant fallback: try removing "leave" suffix / extra whitespace before
  // giving up. "sick" matches "sick leave" if the form happens to store the
  // shorter form.
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [key, val] of rules.entries()) {
    if (key.startsWith(trimmed) || trimmed.startsWith(key)) return val;
  }
  return LOP_FALLBACK;
}

// ---- date helpers ----------------------------------------------------------

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function eachDayOfMonth(year: number, monthIndexZero: number): string[] {
  const last = new Date(year, monthIndexZero + 1, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${year}-${String(monthIndexZero + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

function payableDivisor(policy: PayrollPolicy, daysInMonth: number): number {
  if (policy.payableBasis === 'fixed26') return 26;
  if (policy.payableBasis === 'fixed30') return 30;
  return daysInMonth;
}

// ---------------------------------------------------------------------------
// computePayrollFromInputs — pure earnings/deductions math
// ---------------------------------------------------------------------------
// The single source of truth for "given a monthly CTC, payable days, and an
// org's saved formulas, what does the payslip look like?". Used by both the
// auto-generate engine (which derives payable days from attendance) and the
// preview endpoint (which takes payable days from manual form input).
//
// Pure function — no IO. Caller is responsible for loading formulas / policy.

export interface PayrollComputeInputs {
  baseSalary: number; // monthly CTC
  payableDays: number; // already net of LOP / out-of-service
  daysInMonth: number; // for the monthDays divisor
  overtimeHours?: { weekday: number; weekend: number; holiday: number };
  // Per-employee monthly bonus from Employee Master. Pro-rated by payable
  // days and added to gross as a separate "Bonus" earning line. Optional —
  // defaults to 0 so existing callers / synthetic inputs keep working.
  employeeBonus?: number;
}

export interface PayrollComputeResult {
  perDay: number;
  hourlyRate: number;
  proRationFactor: number;
  monthlyGross: number;
  earnings: {
    basic: number;
    hra: number;
    da: number;
    conveyance: number;
    medical: number;
    lta: number;
    // New optional allowances. Zero when their `*Enabled` flag is off.
    food: number;
    telephone: number;
    education: number;
    fuel: number;
    books: number;
    uniform: number;
    specialAllowance: number;
    overtime: number;
    employeeBonus: number;
  };
  grossSalary: number;
  deductionsDetail: {
    pf: number;
    esi: number;
    pt: number;
    tds: number;
    lwf: number;
    nps: number;
  };
  totalDeductions: number;
  netSalary: number;
  cappedOtHours: number;
  // Employer-side cost lines (above-the-line). Populated unconditionally so
  // callers can reliably read them; zero when the corresponding feature is off.
  bonusAccrual: {
    statutory: number;
    performance: number;
    festival: number;
    joining: number;
    retention: number;
    total: number;
  };
  gratuityAccrual: number;
  employerPfContribution: number;
  employerEsiContribution: number;
  totalCtcCost: number;
}

export function computePayrollFromInputs(
  inputs: PayrollComputeInputs,
  policy: PayrollPolicy,
  formulas: PayrollFormulas,
): PayrollComputeResult {
  const { baseSalary, payableDays, daysInMonth } = inputs;
  const ss = formulas.salaryStructure;
  const st = formulas.statutory;
  const ot = formulas.overtime;

  const divisor = payableDivisor(policy, daysInMonth);
  const perDay = divisor > 0 ? baseSalary / divisor : 0;
  const hourlyRate = perDay / STANDARD_HOURS_PER_DAY;
  const proRationFactor = divisor > 0 ? payableDays / divisor : 0;

  // Monthly component split (full-month figures). Each optional allowance
  // is gated by its `*Enabled` flag — disabled rows contribute zero even if
  // an amount is stored (admins can pre-stage a value then flip it on).
  // Legacy configs (pre-toggle) come through with flags inferred from the
  // saved amount, so the engine behavior matches what they had before.
  const ssAny = ss as any;
  const isOn = (flag: string, fallback: boolean) =>
    ssAny[flag] === undefined ? fallback : Boolean(ssAny[flag]);
  // Carve the per-employee bonus out of CTC FIRST, then apply the structure
  // to whatever's left. This matches the HR convention "Total = Basic +
  // Bonus": bonus is a fixed slice of CTC, and basic/HRA/allowances live in
  // the remainder. Without this, basicPercent=100 makes basic alone fill
  // the entire CTC and the bonus stacks on top — producing gross > CTC,
  // which surprises admins ("I set CTC to 10k but the payslip shows 12k").
  // Clamp at 0 so a bonus larger than CTC doesn't push the structure base
  // negative — gross then equals just the bonus, which is the honest result.
  const employeeBonusRaw = Math.max(0, Number(inputs.employeeBonus ?? 0));
  const ctcForStructure = Math.max(0, baseSalary - employeeBonusRaw);
  const monthlyBasic = (ctcForStructure * ss.basicPercent) / 100;
  const monthlyHra = (monthlyBasic * ss.hraPercent) / 100;
  const monthlyDa = isOn('daEnabled', (ss.daPercent ?? 0) > 0)
    ? (monthlyBasic * ss.daPercent) / 100
    : 0;
  const monthlyConv = isOn('conveyanceEnabled', true) ? ss.conveyanceAllowance : 0;
  const monthlyMed = isOn('medicalEnabled', true) ? ss.medicalAllowance : 0;
  const monthlyLta = isOn('ltaEnabled', (ss.lta ?? 0) > 0) && ss.ltaMonthly
    ? ss.lta / 12
    : 0;
  // New top-company allowances, all opt-in (default off when the flag is
  // missing). Amounts read from the same shape but only contribute when
  // enabled.
  const monthlyFood = isOn('foodEnabled', false) ? Number(ssAny.foodAllowance ?? 0) : 0;
  const monthlyPhone = isOn('telephoneEnabled', false)
    ? Number(ssAny.telephoneAllowance ?? 0)
    : 0;
  const monthlyEdu = isOn('educationEnabled', false)
    ? Number(ssAny.educationAllowance ?? 0)
    : 0;
  const monthlyFuel = isOn('fuelEnabled', false) ? Number(ssAny.fuelAllowance ?? 0) : 0;
  const monthlyBooks = isOn('booksEnabled', false) ? Number(ssAny.booksAllowance ?? 0) : 0;
  const monthlyUniform = isOn('uniformEnabled', false)
    ? Number(ssAny.uniformAllowance ?? 0)
    : 0;
  // employeeBonusRaw was carved out of CTC above; treat it as a fixed
  // earning line by including it in monthlyFixedSum so the auto special-
  // allowance balancer accounts for it correctly.
  const monthlyEmployeeBonus = employeeBonusRaw;
  const monthlyFixedSum =
    monthlyBasic + monthlyHra + monthlyDa + monthlyConv + monthlyMed + monthlyLta +
    monthlyFood + monthlyPhone + monthlyEdu + monthlyFuel + monthlyBooks + monthlyUniform +
    monthlyEmployeeBonus;
  // Manual special allowance cannot be negative — a sign-error in config
  // shouldn't silently reduce gross below the sum of fixed components.
  const monthlySpecial =
    ss.specialAllowanceMode === 'auto'
      ? Math.max(0, baseSalary - monthlyFixedSum)
      : Math.max(0, ss.specialAllowanceAmount);
  const monthlyGross = monthlyFixedSum + monthlySpecial;

  // Pro-rated earned components.
  const earnedBasic = monthlyBasic * proRationFactor;
  const earnedHra = monthlyHra * proRationFactor;
  const earnedDa = monthlyDa * proRationFactor;
  const earnedConv = monthlyConv * proRationFactor;
  const earnedMed = monthlyMed * proRationFactor;
  const earnedLta = monthlyLta * proRationFactor;
  const earnedFood = monthlyFood * proRationFactor;
  const earnedPhone = monthlyPhone * proRationFactor;
  const earnedEdu = monthlyEdu * proRationFactor;
  const earnedFuel = monthlyFuel * proRationFactor;
  const earnedBooks = monthlyBooks * proRationFactor;
  const earnedUniform = monthlyUniform * proRationFactor;
  const earnedEmployeeBonus = monthlyEmployeeBonus * proRationFactor;
  const earnedSpecial = monthlySpecial * proRationFactor;

  // Overtime pay capped at maxOvertimeHoursPerMonth across buckets in
  // priority weekday → weekend → holiday.
  let overtimePay = 0;
  let cappedOtHours = 0;
  if (ot.enabled && inputs.overtimeHours) {
    let remaining = Math.max(0, ot.maxOvertimeHoursPerMonth);
    const wkd = Math.min(Math.max(0, inputs.overtimeHours.weekday), remaining); remaining -= wkd;
    const wke = Math.min(Math.max(0, inputs.overtimeHours.weekend), remaining); remaining -= wke;
    const hol = Math.min(Math.max(0, inputs.overtimeHours.holiday), remaining); remaining -= hol;
    overtimePay =
      wkd * hourlyRate * ot.rateMultiplier +
      wke * hourlyRate * ot.weekendMultiplier +
      hol * hourlyRate * ot.holidayMultiplier;
    cappedOtHours = wkd + wke + hol;
  }

  const grossSalary =
    earnedBasic + earnedHra + earnedDa + earnedConv + earnedMed + earnedLta +
    earnedFood + earnedPhone + earnedEdu + earnedFuel + earnedBooks + earnedUniform +
    earnedEmployeeBonus + earnedSpecial + overtimePay;

  // Deductions.
  let pf = 0;
  if (st.pfEnabled) {
    const pfBase = st.pfCapEnabled ? Math.min(earnedBasic, st.pfCapAmount) : earnedBasic;
    pf = Math.floor((pfBase * st.pfPercent) / 100);
  }

  let esi = 0;
  if (st.esiEnabled && monthlyGross <= st.esiThreshold) {
    esi = Math.floor((grossSalary * st.esiEmployeePercent) / 100);
  }

  let pt = 0;
  if (st.ptEnabled && monthlyGross >= st.ptThreshold && payableDays > 0) {
    pt = st.ptAmount;
  }

  let tds = 0;
  if (st.tdsEnabled) {
    if (st.tdsMode === 'slab') {
      const annualTax =
        st.taxRegime === 'old'
          ? computeAnnualTdsOld(monthlyGross * 12)
          : computeAnnualTdsNew(monthlyGross * 12);
      tds = Math.round((annualTax / 12) * proRationFactor);
    } else {
      tds = Math.floor((grossSalary * st.tdsFlatPercent * 1.04) / 100);
    }
  }

  let lwf = 0;
  if (st.lwfEnabled && payableDays > 0) {
    lwf = st.lwfAmount;
  }

  let nps = 0;
  if (st.npsEnabled) {
    nps = Math.floor((earnedBasic * st.npsEmployeePercent) / 100);
  }

  const totalDeductions = pf + tds + esi + pt + lwf + nps;
  const netSalary = Math.max(0, Math.round(grossSalary - totalDeductions));

  // ── Employer-side cost lines ────────────────────────────────────────────
  // These don't reduce the employee's net — they're surfaced for true CTC
  // accounting. Each is pro-rated by the same factor used for earnings so a
  // half-month employee shows half the monthly accrual.

  // Employer PF: 12% of the same PF base used for the employee deduction.
  // Skipped when PF is disabled at the org level.
  let employerPf = 0;
  if (st.pfEnabled) {
    const pfBase = st.pfCapEnabled ? Math.min(earnedBasic, st.pfCapAmount) : earnedBasic;
    employerPf = Math.floor((pfBase * (st.employerPfPercent ?? st.pfPercent)) / 100);
  }
  // Employer ESI: 3.25% of earned gross when the employee is eligible.
  let employerEsi = 0;
  if (st.esiEnabled && monthlyGross <= st.esiThreshold) {
    employerEsi = Math.floor((grossSalary * st.esiEmployerPercent) / 100);
  }
  // Gratuity: 4.81% of (Basic+DA) accrued monthly. Pre-pro-rated via
  // earnedBasic + earnedDa so part-month employees accrue less.
  const stAny = st as any;
  const gratuityEnabled = Boolean(stAny.gratuityEnabled);
  const gratuityPct = Number(stAny.gratuityPercent ?? 4.81);
  const gratuityAccrual = gratuityEnabled
    ? Math.round(((earnedBasic + earnedDa) * gratuityPct) / 100)
    : 0;

  // ── Bonus accruals ──────────────────────────────────────────────────────
  // Smoothed monthly cost view. Statutory eligibility is checked on the
  // FULL-MONTH (Basic+DA) so an employee doesn't lose statutory bonus just
  // because they had LOP days. Frequency-based bonuses are amortised across
  // their period so admins see steady-state cost.
  const bonus = formulas.bonus;
  const bonusAccrual = {
    statutory: 0,
    performance: 0,
    festival: 0,
    joining: 0,
    retention: 0,
    total: 0,
  };
  if (bonus) {
    if (
      bonus.statutoryBonusEnabled &&
      monthlyBasic + monthlyDa <= (bonus.statutoryBonusSalaryCeiling ?? 21000)
    ) {
      const base = Math.min(
        monthlyBasic + monthlyDa,
        bonus.statutoryBonusCalcCeiling ?? 7000,
      );
      // Pro-rate so LOP months accrue less. (You could argue statutory bonus
      // shouldn't pro-rate on LOP — the Bonus Act is silent on this — but
      // matching the rest of payroll's pro-ration is the consistent default.)
      bonusAccrual.statutory = Math.round(
        base * ((bonus.statutoryBonusPercent ?? 8.33) / 100) * proRationFactor,
      );
    }
    if (bonus.performanceBonusEnabled) {
      const annual = baseSalary * 12 * ((bonus.performanceBonusPercent ?? 0) / 100);
      bonusAccrual.performance = Math.round((annual / 12) * proRationFactor);
    }
    if (bonus.festivalBonusEnabled) {
      // Annualised so the CTC view shows steady-state cost. The actual
      // disbursement happens in the festival month (handled outside this
      // calculator).
      bonusAccrual.festival = Math.round(
        ((bonus.festivalBonusAmount ?? 0) / 12) * proRationFactor,
      );
    }
    if (bonus.joiningBonusEnabled && (bonus.joiningBonusClawbackMonths ?? 0) > 0) {
      // Amortise the joining bonus over the clawback period — that's the
      // honest monthly cost until the clawback expires.
      bonusAccrual.joining = Math.round(
        ((bonus.joiningBonusAmount ?? 0) / (bonus.joiningBonusClawbackMonths ?? 12)) *
          proRationFactor,
      );
    }
    if (bonus.retentionBonusEnabled) {
      // Monthly pays the full amount every month (no smoothing). All other
      // frequencies smooth across their period so the CTC view reflects
      // steady-state cost; the actual payout still hits a single payslip
      // in those months but the breakdown shows the per-month accrual.
      const months =
        bonus.retentionBonusFrequency === 'monthly'
          ? 1
          : bonus.retentionBonusFrequency === 'half-yearly'
            ? 6
            : bonus.retentionBonusFrequency === 'annual'
              ? 12
              : 24; // one-time
      bonusAccrual.retention = Math.round(
        ((bonus.retentionBonusAmount ?? 0) / months) * proRationFactor,
      );
    }
    bonusAccrual.total =
      bonusAccrual.statutory +
      bonusAccrual.performance +
      bonusAccrual.festival +
      bonusAccrual.joining +
      bonusAccrual.retention;
  }

  // True monthly employer cost. The component groupings mirror what HR /
  // finance use in CTC letters.
  const totalCtcCost = Math.round(
    grossSalary + employerPf + employerEsi + gratuityAccrual + bonusAccrual.total,
  );

  return {
    perDay,
    hourlyRate,
    proRationFactor,
    monthlyGross,
    earnings: {
      basic: Math.round(earnedBasic),
      hra: Math.round(earnedHra),
      da: Math.round(earnedDa),
      conveyance: Math.round(earnedConv),
      medical: Math.round(earnedMed),
      lta: Math.round(earnedLta),
      food: Math.round(earnedFood),
      telephone: Math.round(earnedPhone),
      education: Math.round(earnedEdu),
      fuel: Math.round(earnedFuel),
      books: Math.round(earnedBooks),
      uniform: Math.round(earnedUniform),
      specialAllowance: Math.round(earnedSpecial),
      overtime: Math.round(overtimePay),
      employeeBonus: Math.round(earnedEmployeeBonus),
    },
    grossSalary: Math.round(grossSalary),
    deductionsDetail: { pf, esi, pt, tds, lwf, nps },
    totalDeductions,
    netSalary,
    cappedOtHours: Math.round(cappedOtHours * 10) / 10,
    bonusAccrual,
    gratuityAccrual,
    employerPfContribution: employerPf,
    employerEsiContribution: employerEsi,
    totalCtcCost,
  };
}

// ---- per-employee calculator ----------------------------------------------

interface DayClassification {
  // Non-overlapping classification — exactly one of these contributes the
  // day's payable fraction. The rest stay 0. Keeps the breakdown auditable.
  present: number;
  half: number;
  paidLeave: number;
  unpaidLeaveLOP: number; // amount of pay LOST today (e.g. 0.5 for 50% deduction)
  unpaidLeaveDays: number; // raw days marked as unpaid leave (for breakdown)
  holiday: number;
  weeklyOff: number;
  absent: number;
  outOfService: number;
  leaveTypeName?: string; // for grouping in breakdown
  hours: number; // attendance hours that landed today
}

function classifyDay(
  dateStr: string,
  weekday: number,
  policy: PayrollPolicy,
  employee: SampleEmployee,
  holidaySet: Set<string>,
  attendanceByDate: Map<string, SampleAttendance>,
  leaveByDate: Map<string, { leave: SampleLeave; rule: ResolvedLeaveRule }>,
): DayClassification {
  const z: DayClassification = {
    present: 0,
    half: 0,
    paidLeave: 0,
    unpaidLeaveLOP: 0,
    unpaidLeaveDays: 0,
    holiday: 0,
    weeklyOff: 0,
    absent: 0,
    outOfService: 0,
    hours: 0,
  };

  // Out-of-service trumps everything else: a day before joining or after
  // leaving is silently dropped — neither paid nor counted as LOP.
  if (employee.dateOfJoining && dateStr < employee.dateOfJoining) {
    z.outOfService = 1;
    return z;
  }
  if (employee.dateOfLeaving && dateStr > employee.dateOfLeaving) {
    z.outOfService = 1;
    return z;
  }

  // Holiday wins over weekend — a public holiday on a Sunday is still a
  // holiday for breakdown purposes; payable contribution is the same (1).
  const isHoliday = holidaySet.has(dateStr);
  const isWeeklyOff = policy.weeklyOffDays.includes(weekday);

  // Check-in beats leave: if the employee actually showed up, that's the
  // truth of the day, regardless of any approved leave on file. But ONLY
  // if there's a real check-in signal — an empty / phantom row mustn't
  // be counted as attended.
  const att = attendanceByDate.get(dateStr);
  if (att) {
    const hasIn = !!(att.checkInTime || att.checkInAt);
    const hasOut = !!(att.checkOutTime || att.checkOutAt);
    if (hasIn || hasOut) {
      const hours = workedHoursFromAttendance(att);
      z.hours = hours;
      // Forgot-to-checkout: assume a full day so the user isn't penalised
      // for an admin / scheduler oversight. The auto-checkout job (when
      // configured) overwrites this later anyway.
      if (hasIn && !hasOut) {
        z.present = 1;
        if (hours <= 0) z.hours = DEFAULT_DAY_HOURS;
      } else if (hours <= 0) {
        // Both timestamps but zero/negative diff — almost certainly a
        // mis-punch or duplicate within the same minute. Treat as a
        // half-day so the employee isn't paid for zero work but the row
        // still acknowledges they attempted to clock in.
        z.half = 0.5;
      } else if (hours < HALF_DAY_MIN_HOURS) {
        z.half = 0.5;
      } else if (hours < STANDARD_HOURS_PER_DAY * 0.85) {
        // 4–6.8h logged → still half-day to discourage gaming the clock.
        z.half = 0.5;
      } else {
        z.present = 1;
      }
      return z;
    }
    // Row exists but has no usable timestamps on either side. Fall
    // through to the leave / weekly-off / absent classification below.
  }

  // No check-in. Holiday and weekly-off are paid by company policy.
  if (isHoliday) {
    z.holiday = 1;
    return z;
  }
  if (isWeeklyOff) {
    z.weeklyOff = 1;
    return z;
  }

  // Approved leave applies next.
  const leaveHit = leaveByDate.get(dateStr);
  if (leaveHit) {
    const { leave, rule } = leaveHit;
    z.leaveTypeName = rule.name;
    const halfDay = leave.isHalfDay || rule.category === 'HALF_DAY';
    const dayValue = halfDay ? 0.5 : 1;

    if (rule.isPaid) {
      z.paidLeave = dayValue;
      // The other half of a half-day paid leave still has to be classified —
      // but the only honest answer without check-in data is "absent". We mark
      // half a day as LOP so the math stays balanced.
      if (halfDay) {
        z.unpaidLeaveLOP = 0.5;
        z.unpaidLeaveDays = 0.5;
        z.leaveTypeName = rule.name;
      }
    } else {
      const ded = Math.min(100, Math.max(0, rule.deductionPercentage)) / 100;
      z.unpaidLeaveLOP = dayValue * ded;
      z.unpaidLeaveDays = dayValue;
      // For partial-deduction (e.g. 50%) leaves the remainder is paid time:
      z.paidLeave = dayValue - z.unpaidLeaveLOP;
      if (halfDay) {
        // The other half-day with no attendance is pure absence → LOP.
        z.unpaidLeaveLOP += 0.5;
        z.absent = 0.5;
      }
    }
    return z;
  }

  // Nothing on file — straight LOP for a working day.
  z.absent = 1;
  return z;
}

function calculateForEmployee(
  employee: SampleEmployee,
  attendance: SampleAttendance[],
  employeeLeaves: SampleLeave[],
  holidays: SampleHoliday[],
  rules: Map<string, ResolvedLeaveRule>,
  policy: PayrollPolicy,
  formulas: PayrollFormulas,
  month: string,
  profileMeta?: { profileId: string | null; profileName: string | null; source: string },
  baseSalaryOverride?: number | null,
): PayrollCalculation {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr);
  const monthIndex = Number(mStr) - 1;
  const days = eachDayOfMonth(year, monthIndex);
  const daysInMonth = days.length;

  // Pre-index attendance and approved leaves by date for O(1) day lookups.
  const attByDate = new Map<string, SampleAttendance>();
  for (const a of attendance) attByDate.set(a.date, a);

  const leaveByDate = new Map<string, { leave: SampleLeave; rule: ResolvedLeaveRule }>();
  for (const l of employeeLeaves) {
    const rule = resolveLeaveRule(l.leaveType, rules);
    // Walk the inclusive range, clip to the requested month.
    const rangeStart = l.startDate > `${month}-01` ? l.startDate : `${month}-01`;
    const lastOfMonth = `${month}-${String(daysInMonth).padStart(2, '0')}`;
    const rangeEnd = l.endDate < lastOfMonth ? l.endDate : lastOfMonth;
    const startDate = new Date(`${rangeStart}T00:00:00`);
    const endDate = new Date(`${rangeEnd}T00:00:00`);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = ymd(d);
      // First-write wins. If two leaves overlap a day, we honour the earlier
      // submitted one (whichever this loop hits first); changing this to
      // "most paid wins" would game the system.
      if (!leaveByDate.has(key)) leaveByDate.set(key, { leave: l, rule });
    }
  }

  const holidaySet = new Set(holidays.map((h) => h.date));

  const breakdown: PayrollCalculation['breakdown'] = {
    daysInMonth,
    payableDays: 0,
    presentDays: 0,
    halfDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    holidayDays: 0,
    weeklyOffDays: 0,
    absentDays: 0,
    outOfServiceDays: 0,
    leaveByType: {},
  };
  let totalLOP = 0; // pay-equivalent days lost
  let totalHours = 0;
  // Overtime accumulator. Hours past `weekdayThresholdHours` on any working
  // day count as OT. Weekends and holidays use higher multipliers (per
  // overtimeConfig). All hours on a holiday/weekly-off with attendance count
  // as OT (the threshold is treated as 0 for those days).
  const ot = formulas.overtime;
  let weekdayOtHours = 0;
  let weekendOtHours = 0;
  let holidayOtHours = 0;

  for (const dateStr of days) {
    const weekday = new Date(`${dateStr}T00:00:00`).getDay();
    const c = classifyDay(
      dateStr,
      weekday,
      policy,
      employee,
      holidaySet,
      attByDate,
      leaveByDate,
    );
    breakdown.presentDays += c.present;
    breakdown.halfDays += c.half;
    breakdown.paidLeaveDays += c.paidLeave;
    breakdown.unpaidLeaveDays += c.unpaidLeaveDays;
    breakdown.holidayDays += c.holiday;
    breakdown.weeklyOffDays += c.weeklyOff;
    breakdown.absentDays += c.absent;
    breakdown.outOfServiceDays += c.outOfService;
    if (c.leaveTypeName) {
      breakdown.leaveByType[c.leaveTypeName] =
        (breakdown.leaveByType[c.leaveTypeName] ?? 0) + (c.paidLeave + c.unpaidLeaveDays);
    }
    totalLOP += c.unpaidLeaveLOP + c.absent;
    totalHours += c.hours;

    if (ot.enabled && c.hours > 0) {
      const isHoliday = holidaySet.has(dateStr);
      const isWeeklyOff = policy.weeklyOffDays.includes(weekday);
      if (isHoliday) {
        holidayOtHours += c.hours;
      } else if (isWeeklyOff) {
        weekendOtHours += c.hours;
      } else {
        const excess = c.hours - ot.weekdayThresholdHours;
        if (excess > 0) weekdayOtHours += excess;
      }
    }
  }

  // Days that count toward the salary. Each present day = 1, each half-day
  // contributes 0.5, paid leave/holiday/weekly off contribute their face
  // value. Out-of-service days are excluded entirely (pro-rata for joiners).
  breakdown.payableDays =
    breakdown.presentDays +
    breakdown.halfDays * 0.5 +
    breakdown.paidLeaveDays +
    breakdown.holidayDays +
    breakdown.weeklyOffDays;

  // Profile-level base salary override wins over the employee record's own
  // salary — that's the point of per-employee profile selection (e.g. moving
  // someone into a "Senior" profile that fixes CTC at a higher band).
  // Employee.totalSalary is the fallback.
  const baseSalary =
    typeof baseSalaryOverride === 'number' && baseSalaryOverride > 0
      ? baseSalaryOverride
      : employee.totalSalary;
  const result = computePayrollFromInputs(
    {
      baseSalary,
      payableDays: breakdown.payableDays,
      daysInMonth,
      overtimeHours: { weekday: weekdayOtHours, weekend: weekendOtHours, holiday: holidayOtHours },
      // Per-employee bonus from Employee Master flows through unchanged —
      // the engine pro-rates it by payable days and emits it as a separate
      // earnings line.
      employeeBonus: employee.bonusAmount ?? 0,
    },
    policy,
    formulas,
  );

  const {
    earnings, deductionsDetail, grossSalary, netSalary, hourlyRate, cappedOtHours,
    bonusAccrual, gratuityAccrual, employerPfContribution, employerEsiContribution,
    totalCtcCost,
  } = result;
  // Map labelled deductions onto the legacy 4-slot shape so older UI surfaces
  // (and the saved DB column) keep working without a schema change.
  const insurance = deductionsDetail.esi;
  const other = deductionsDetail.pt + deductionsDetail.lwf + deductionsDetail.nps;

  return {
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    email: employee.email,
    totalSalary: baseSalary,
    workingDays: Math.round(breakdown.payableDays * 10) / 10,
    workingHours: Math.round(totalHours * 10) / 10,
    overtimeHours: cappedOtHours,
    baseSalary,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    grossSalary,
    deductions: { pf: deductionsDetail.pf, tax: deductionsDetail.tds, insurance, other },
    earnings,
    deductionsDetail,
    netSalary,
    bonusAccrual,
    gratuityAccrual,
    employerPfContribution,
    employerEsiContribution,
    totalCtcCost,
    status: breakdown.payableDays > 0 ? 'processed' : 'pending',
    month,
    designation: employee.designation,
    department: employee.department,
    generatedAt: new Date().toISOString(),
    breakdown,
    payrollProfileId: profileMeta?.profileId ?? null,
    payrollProfileName: profileMeta?.profileName ?? null,
    payrollProfileSource: profileMeta?.source ?? null,
  };
}

export async function calculatePayroll(
  organizationId: string,
  month: string,
): Promise<PayrollCalculation[]> {
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  // Run all the IO concurrently — each fetcher is independent. The leave-rule
  // lookup is global so it doesn't need an org filter.
  // `profileCtx` carries the per-employee profile map and the global fallback;
  // it replaces the old single getPayrollFormulas call so each employee can
  // resolve their own pay rules without re-querying inside the hot loop.
  const [employees, attendance, leaves, holidays, policy, profileCtx, rules] = await Promise.all([
    getEmployeesFromDB(organizationId),
    getAttendanceFromDB(organizationId, targetMonth),
    getLeavesFromDB(organizationId, targetMonth),
    getHolidaysFromDB(organizationId, targetMonth),
    getPayrollPolicy(organizationId),
    // targetMonth here makes effectiveFrom scheduling work: an assignment
    // dated next month won't apply to this month's run.
    getOrgProfilesContext(organizationId, targetMonth),
    loadLeaveRules(),
  ]);

  // Index attendance and leaves by the same matchKey scheme employees expose,
  // so the per-employee join is a quick lookup instead of a full scan.
  const attByKey = new Map<string, SampleAttendance[]>();
  for (const a of attendance) {
    if (!attByKey.has(a.matchKey)) attByKey.set(a.matchKey, []);
    attByKey.get(a.matchKey)!.push(a);
  }
  const leaveByKey = new Map<string, SampleLeave[]>();
  for (const l of leaves) {
    if (!leaveByKey.has(l.matchKey)) leaveByKey.set(l.matchKey, []);
    leaveByKey.get(l.matchKey)!.push(l);
  }

  return employees.map((emp) => {
    const empAtt: SampleAttendance[] = [];
    const seenAttDates = new Set<string>();
    const empLeaves: SampleLeave[] = [];
    const seenLeaveIds = new Set<SampleLeave>();

    for (const key of emp.matchKeys) {
      const aList = attByKey.get(key);
      if (aList) {
        for (const a of aList) {
          if (seenAttDates.has(a.date)) continue;
          seenAttDates.add(a.date);
          empAtt.push(a);
        }
      }
      const lList = leaveByKey.get(key);
      if (lList) {
        for (const l of lList) {
          if (seenLeaveIds.has(l)) continue;
          seenLeaveIds.add(l);
          empLeaves.push(l);
        }
      }
    }

    const resolution = resolveEmployeeFormulas(profileCtx, emp.employeeId);
    return calculateForEmployee(
      emp,
      empAtt,
      empLeaves,
      holidays,
      rules,
      policy,
      resolution.formulas,
      targetMonth,
      {
        profileId: resolution.profileId,
        profileName: resolution.profileName,
        source: resolution.source,
      },
      resolution.baseSalaryOverride,
    );
  });
}

interface DailyAttendance {
  employeeName: string;
  email: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string;
  location: string;
  workingHours: number;
}

interface DailyPayroll {
  employeeId: string;
  employeeName: string;
  email: string;
  date: string;
  workingHours: number;
  dailyRate: number;
  grossSalary: number;
  deductions: { pf: number; tax: number; insurance: number; other: number };
  netSalary: number;
  status: 'pending' | 'processed';
}

export function parseApiResponse(apiData: any): DailyAttendance[] {
  const records: DailyAttendance[] = [];
  const dailyMap = new Map<string, any>();

  if (apiData?.grouped) {
    const checkIns = apiData.grouped['Check-In'] || [];
    const checkOuts = apiData.grouped['Check-Out'] || [];

    checkIns.forEach((r: any) => {
      const key = `${r.submittedBy?.email}_${r.date}`;
      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          employeeName: r.submittedBy?.name,
          email: r.submittedBy?.email,
          date: r.date,
          checkInTime: r.checkInTime,
          location: r.location,
        });
      }
    });

    checkOuts.forEach((r: any) => {
      const key = `${r.submittedBy?.email}_${r.date}`;
      if (dailyMap.has(key)) dailyMap.get(key).checkOutTime = r.checkOutTime;
    });
  }

  dailyMap.forEach((entry) => {
    entry.workingHours = calculateWorkingHours(entry.checkInTime, entry.checkOutTime);
    records.push(entry);
  });

  return records;
}

export function calculateDailyPayroll(
  dailyAttendance: DailyAttendance[],
  employeeProfile?: { totalSalary?: number },
): DailyPayroll[] {
  const STANDARD_WORKING_DAYS = 22;
  return dailyAttendance.map((a) => {
    const monthlyBase = employeeProfile?.totalSalary || 33333;
    const hourlyRate = monthlyBase / (STANDARD_WORKING_DAYS * STANDARD_HOURS_PER_DAY);
    const dailyRate = monthlyBase / STANDARD_WORKING_DAYS;
    const dailyGross = hourlyRate * a.workingHours;
    const pf = Math.floor((dailyGross * PF_PERCENT) / 100);
    const tax = Math.floor(((dailyGross - pf) * TAX_PERCENT) / 100);
    const insurance = Math.floor(INSURANCE_FIXED / STANDARD_WORKING_DAYS);
    const other = 0;
    const totalDed = pf + tax + insurance + other;
    return {
      employeeId: a.email.split('@')[0] || 'EMP001',
      employeeName: a.employeeName,
      email: a.email,
      date: a.date,
      workingHours: a.workingHours,
      dailyRate: Math.round(dailyRate),
      grossSalary: Math.round(dailyGross),
      deductions: { pf, tax, insurance, other },
      netSalary: Math.max(0, Math.round(dailyGross - totalDed)),
      status: 'processed',
    };
  });
}

export function generatePayslip(payroll: PayrollCalculation): string {
  const total =
    payroll.deductions.pf +
    payroll.deductions.tax +
    payroll.deductions.insurance +
    payroll.deductions.other;

  return `
PAYSLIP - ${new Date().toLocaleDateString()}
=====================================
Employee: ${payroll.employeeName}
Email: ${payroll.email}
Payable Days: ${payroll.workingDays} of ${payroll.breakdown.daysInMonth}
Working Hours: ${payroll.workingHours}

ATTENDANCE BREAKDOWN:
Present: ${payroll.breakdown.presentDays}
Half-day: ${payroll.breakdown.halfDays}
Paid Leave: ${payroll.breakdown.paidLeaveDays}
Unpaid Leave (LOP): ${payroll.breakdown.unpaidLeaveDays}
Holidays: ${payroll.breakdown.holidayDays}
Weekly Off: ${payroll.breakdown.weeklyOffDays}
Absent (LOP): ${payroll.breakdown.absentDays}

EARNINGS:
Basic Salary: Rs.${payroll.baseSalary}
Gross Salary: Rs.${payroll.grossSalary}

DEDUCTIONS:
PF: Rs.${payroll.deductions.pf}
Tax: Rs.${payroll.deductions.tax}
Insurance: Rs.${payroll.deductions.insurance}
Other: Rs.${payroll.deductions.other}
Total Deductions: Rs.${total}

NET SALARY: Rs.${payroll.netSalary}
  `;
}
