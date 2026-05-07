import {
  getAttendanceFromDB,
  getEmployeesFromDB,
  getHolidaysFromDB,
  getLeavesFromDB,
  getPayrollPolicy,
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
const PF_PERCENT = 12;
const TAX_PERCENT = 5;
const INSURANCE_FIXED = 500;

const DEFAULT_DAY_HOURS = 8;

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
  month: string,
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

  const baseSalary = employee.totalSalary;
  const divisor = payableDivisor(policy, daysInMonth);
  const perDay = divisor > 0 ? baseSalary / divisor : 0;
  const hourlyRate = perDay / STANDARD_HOURS_PER_DAY;
  // Gross is the value of payable time. We DON'T multiply by hours — that
  // would double-count overtime/undertime, which is a separate concern.
  const grossSalary = perDay * breakdown.payableDays;

  const pf = Math.floor((grossSalary * PF_PERCENT) / 100);
  const taxableIncome = grossSalary - pf;
  const tax = Math.floor((taxableIncome * TAX_PERCENT) / 100);
  const insurance = INSURANCE_FIXED;
  const other = 0;

  const totalDeductions = pf + tax + insurance + other;
  const netSalary = Math.max(0, Math.round(grossSalary - totalDeductions));

  return {
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    email: employee.email,
    totalSalary: baseSalary,
    workingDays: Math.round(breakdown.payableDays * 10) / 10,
    workingHours: Math.round(totalHours * 10) / 10,
    baseSalary,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    grossSalary: Math.round(grossSalary),
    deductions: { pf, tax, insurance, other },
    netSalary,
    status: breakdown.payableDays > 0 ? 'processed' : 'pending',
    month,
    designation: employee.designation,
    department: employee.department,
    generatedAt: new Date().toISOString(),
    breakdown,
  };
}

export async function calculatePayroll(
  organizationId: string,
  month: string,
): Promise<PayrollCalculation[]> {
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  // Run all the IO concurrently — each fetcher is independent. The leave-rule
  // lookup is global so it doesn't need an org filter.
  const [employees, attendance, leaves, holidays, policy, rules] = await Promise.all([
    getEmployeesFromDB(organizationId),
    getAttendanceFromDB(organizationId, targetMonth),
    getLeavesFromDB(organizationId, targetMonth),
    getHolidaysFromDB(organizationId, targetMonth),
    getPayrollPolicy(organizationId),
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

    return calculateForEmployee(emp, empAtt, empLeaves, holidays, rules, policy, targetMonth);
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
    const pf = Math.floor((dailyGross * PF_PERCENT) / 100 / 100);
    const tax = Math.floor(((dailyGross - pf) * TAX_PERCENT) / 100 / 100);
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
