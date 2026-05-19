import { prisma } from '@/lib/prisma';

// =============================================================================
// MULTI-TENANCY CONTRACT
// =============================================================================
// Every exported async function takes `organizationId` as a REQUIRED first
// parameter. All DB lookups are constrained by this org so the payroll
// surface cannot leak data across tenants.
//
// Scoping strategy:
//   - PayrollConfiguration:   filter by `organizationId`.
//   - Form lookups:           filter by `module.organizationId`.
//   - FormRecord reads:       always go through a form whose org we have
//                             already verified, so records inherit scoping
//                             via `formId` (sharded form_records_X tables
//                             don't have an organizationId column).
//   - In-memory record cache: keyed by `${orgId}|${month}` so cached
//                             calculations from one org never serve another.
// =============================================================================

export interface SampleEmployee {
  employeeId: string;
  employeeName: string;
  email: string;
  designation: string;
  department: string;
  totalSalary: number;
  // Per-employee monthly bonus carried over from Employee Master (the
  // "Bonus amount" field on the Compensation section). Distinct from the
  // profile-level bonuses (statutory / performance / festival / joining /
  // retention) — those are configured per pay-rule profile and apply to
  // everyone on that profile, whereas this is a fixed extra paid only to
  // this specific employee. Pro-rated by payable days like every other
  // earning, surfaced on the payslip as a "Bonus" line.
  bonusAmount: number;
  // Per-employee override for the Pay Rule's overtime block. When explicitly
  // `false`, the engine skips OT for this employee regardless of what the
  // assigned profile says. Null/undefined/true defers to the profile.
  isOvertimeApplicable?: boolean | null;
  // Per-employee OT hourly rate from Employee Master ("Overtime Rate" field).
  // When > 0, overrides the calculated `perDay / 8` base rate for OT pay.
  // Multipliers from the Pay Rule still apply on top.
  overtimeRate?: number | null;
  matchKeys: string[];
  dateOfJoining: string | null;
  dateOfLeaving: string | null;
}

export interface SampleAttendance {
  email: string;
  matchKey: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
  // Authoritative ISO datetimes from the Attendance table (when available).
  // The HH:mm strings above are derivative — they lose seconds and AM/PM
  // context, so for precise worked-time math we prefer these. Form-based
  // sources won't have them and leave both null.
  checkInAt?: string | null;
  checkOutAt?: string | null;
  /** OT minutes already computed (and capped) by the punch service for
   *  this row. Authoritative for opt-in orgs — the payroll calculator uses
   *  this value directly instead of re-deriving from worked hours. */
  overtimeMinutes?: number;
  /** True when the employee actually toggled OT on for this row. Lets the
   *  payroll calculator distinguish "did real OT" from "long workday". */
  overtimeOptedIn?: boolean;
}

export interface SampleLeave {
  matchKey: string;
  email: string;
  leaveType: string; // raw string from the form, matched against LeaveRule.name
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  isHalfDay: boolean;
  days: number | null; // optional override; ignored when start/end are present
  status: 'approved' | 'pending' | 'rejected' | 'unknown';
}

export interface SampleHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

export interface PayrollPolicy {
  weeklyOffDays: number[]; // 0=Sun … 6=Sat
  payableBasis: 'monthDays' | 'fixed26' | 'fixed30';
  /** Monthly free allowances configured in Attendance Configuration. The
   *  payroll engine forgives half-day pay deductions up to
   *  `monthlyHalfDayQuota` per employee/month, and treats short-deficit
   *  days within `shortLeaveHours` as short leaves rather than half-days
   *  until `monthlyShortLeaveQuota` is exhausted. */
  monthlyHalfDayQuota?: number;
  monthlyShortLeaveQuota?: number;
  shortLeaveHours?: number;
  /** Full-day threshold (hours) mirrored from AttendanceConfiguration so
   *  the engine can detect short-leave days uniformly even when the
   *  classifier's internal constants drift. */
  fullDayMinHours?: number;
  /** When true, OT minutes count only on rows the employee toggled OT on. */
  overtimeRequiresOptIn?: boolean;
  /** Labour-law daily cap (hours) the payroll engine clamps OT to. 0 / unset
   *  disables the cap and matches the legacy behaviour. */
  overtimeMaxHoursPerDay?: number;
}

const DEFAULT_POLICY: PayrollPolicy = {
  weeklyOffDays: [0],
  payableBasis: 'monthDays',
  monthlyHalfDayQuota: 0,
  monthlyShortLeaveQuota: 0,
  shortLeaveHours: 2,
  fullDayMinHours: 8,
  overtimeRequiresOptIn: true,
  overtimeMaxHoursPerDay: 4,
};

// Salary structure + statutory config persisted via the configure wizard.
// Mirrors the shapes in components/payroll/payroll-enterprise-config.tsx.
// The engine reads these to compute Basic/HRA/PF/ESI/PT/TDS instead of the
// legacy flat 12%/5%/₹500 constants.
//
// Every optional component carries an `*Enabled` boolean. Disabled rows
// contribute zero even if the amount is non-zero — admins can pre-stage a
// value then flip the toggle later without re-entering it. Legacy configs
// (pre-toggle) come through with the flag undefined; the engine treats that
// as "inferred from value > 0" so old data behaves the same as before.
export interface PayrollSalaryStructure {
  basicPercent: number;
  hraPercent: number;
  // Existing optional allowances ─────────────────────────────────────────
  daEnabled?: boolean;
  daPercent: number;
  specialAllowanceMode: 'auto' | 'manual';
  specialAllowanceAmount: number;
  conveyanceEnabled?: boolean;
  conveyanceAllowance: number;
  medicalEnabled?: boolean;
  medicalAllowance: number;
  ltaEnabled?: boolean;
  lta: number;
  ltaMonthly: boolean;
  // Top-company allowances (food cards, telephone reimbursement, fuel,
  // children's education, books, uniform). All default off; the engine
  // honors `*Enabled` to decide inclusion.
  foodEnabled?: boolean;
  foodAllowance?: number;
  telephoneEnabled?: boolean;
  telephoneAllowance?: number;
  educationEnabled?: boolean;
  educationAllowance?: number;
  fuelEnabled?: boolean;
  fuelAllowance?: number;
  booksEnabled?: boolean;
  booksAllowance?: number;
  uniformEnabled?: boolean;
  uniformAllowance?: number;
}

export interface PayrollStatutory {
  pfEnabled: boolean;
  pfPercent: number;
  pfCapEnabled: boolean;
  pfCapAmount: number;
  employerPfPercent: number;
  esiEnabled: boolean;
  esiEmployeePercent: number;
  esiEmployerPercent: number;
  esiThreshold: number;
  ptEnabled: boolean;
  ptAmount: number;
  ptThreshold: number;
  ptState?: string; // for state-preset round-trip in the UI; not used by engine
  tdsEnabled: boolean;
  tdsMode: 'flat' | 'slab';
  tdsFlatPercent: number;
  taxRegime: 'old' | 'new';
  // Optional Indian deductions on top of the core 4. Off by default.
  lwfEnabled: boolean;
  lwfAmount: number; // monthly flat amount (state-dependent)
  npsEnabled: boolean;
  npsEmployeePercent: number; // % of basic — typical voluntary range 5–10%
  // Gratuity — Payment of Gratuity Act, 1972. Employer-side accrual; paid
  // out only on exit ≥ 5 years. Engine surfaces it as a CTC line so admins
  // can see true employer cost without affecting employee net.
  gratuityEnabled?: boolean;
  gratuityPercent?: number; // typically 4.81% of (Basic + DA)
}

// Bonus / variable-pay rules. Each block is independently toggleable; the
// engine reports MONTHLY ACCRUALS so admins see true CTC cost. Disbursement
// (whether actually paid this month) is a separate concern handled by the
// run-payroll workflow, not by this pure calculator.
export interface PayrollBonus {
  // Statutory bonus — Payment of Bonus Act, 1965. Mandatory for employees
  // earning ≤ statutoryBonusSalaryCeiling (Basic+DA, default ₹21k). Bonus is
  // computed on min(Basic+DA, statutoryBonusCalcCeiling) (default ₹7k).
  statutoryBonusEnabled?: boolean;
  statutoryBonusPercent?: number; // 8.33 - 20
  statutoryBonusSalaryCeiling?: number;
  statutoryBonusCalcCeiling?: number;
  // Performance bonus — annual variable pay as % of annual CTC.
  performanceBonusEnabled?: boolean;
  performanceBonusPercent?: number;
  performanceBonusFrequency?: 'annual' | 'half-yearly' | 'quarterly';
  // Festival bonus — flat once-a-year amount.
  festivalBonusEnabled?: boolean;
  festivalBonusAmount?: number;
  // Joining / sign-on bonus — one-time, amortised over the clawback period
  // for CTC accounting.
  joiningBonusEnabled?: boolean;
  joiningBonusAmount?: number;
  joiningBonusClawbackMonths?: number;
  // Retention bonus — periodic.
  retentionBonusEnabled?: boolean;
  retentionBonusAmount?: number;
  retentionBonusFrequency?: 'monthly' | 'annual' | 'half-yearly' | 'one-time';
}

export interface PayrollOvertime {
  enabled: boolean;
  rateMultiplier: number;
  weekdayThresholdHours: number;
  weekendMultiplier: number;
  holidayMultiplier: number;
  maxOvertimeHoursPerMonth: number;
}

export interface PayrollFormulas {
  salaryStructure: PayrollSalaryStructure;
  statutory: PayrollStatutory;
  overtime: PayrollOvertime;
  bonus?: PayrollBonus;
}

export const DEFAULT_FORMULAS: PayrollFormulas = {
  salaryStructure: {
    basicPercent: 50,
    hraPercent: 50,
    daEnabled: false,
    daPercent: 0,
    specialAllowanceMode: 'auto',
    specialAllowanceAmount: 0,
    conveyanceEnabled: true,
    conveyanceAllowance: 1600,
    medicalEnabled: true,
    medicalAllowance: 1250,
    ltaEnabled: false,
    lta: 0,
    ltaMonthly: true,
    foodEnabled: false,
    foodAllowance: 2200,
    telephoneEnabled: false,
    telephoneAllowance: 1500,
    educationEnabled: false,
    educationAllowance: 200,
    fuelEnabled: false,
    fuelAllowance: 0,
    booksEnabled: false,
    booksAllowance: 0,
    uniformEnabled: false,
    uniformAllowance: 0,
  },
  statutory: {
    pfEnabled: true,
    pfPercent: 12,
    pfCapEnabled: true,
    pfCapAmount: 15000,
    employerPfPercent: 12,
    esiEnabled: false,
    esiEmployeePercent: 0.75,
    esiEmployerPercent: 3.25,
    esiThreshold: 21000,
    ptEnabled: true,
    ptAmount: 200,
    ptThreshold: 15000,
    ptState: 'maharashtra',
    tdsEnabled: true,
    tdsMode: 'flat',
    tdsFlatPercent: 5,
    taxRegime: 'new',
    lwfEnabled: false,
    lwfAmount: 25,
    npsEnabled: false,
    npsEmployeePercent: 10,
    gratuityEnabled: false,
    gratuityPercent: 4.81,
  },
  overtime: {
    enabled: false,
    rateMultiplier: 1.5,
    weekdayThresholdHours: 8,
    weekendMultiplier: 2,
    holidayMultiplier: 2,
    maxOvertimeHoursPerMonth: 50,
  },
  bonus: {
    statutoryBonusEnabled: false,
    statutoryBonusPercent: 8.33,
    statutoryBonusSalaryCeiling: 21000,
    statutoryBonusCalcCeiling: 7000,
    performanceBonusEnabled: false,
    performanceBonusPercent: 10,
    performanceBonusFrequency: 'annual',
    festivalBonusEnabled: false,
    festivalBonusAmount: 0,
    joiningBonusEnabled: false,
    joiningBonusAmount: 0,
    joiningBonusClawbackMonths: 12,
    retentionBonusEnabled: false,
    retentionBonusAmount: 0,
    retentionBonusFrequency: 'annual',
  },
};

// Per-component earnings breakdown emitted by the engine. All values are the
// PRO-RATED monthly amounts (i.e. already scaled by payableDays/divisor) so
// summing them equals grossSalary minus overtimePay.
export interface PayrollEarnings {
  basic: number;
  hra: number;
  da: number;
  conveyance: number;
  medical: number;
  lta: number;
  food: number;
  telephone: number;
  education: number;
  fuel: number;
  books: number;
  uniform: number;
  specialAllowance: number;
  overtime: number;
  // Per-employee bonus from Employee Master (Employee.bonusAmount). Lives
  // separately from profile-level bonusAccrual because this one is paid in
  // the take-home gross every month, not smoothed as an employer accrual.
  employeeBonus: number;
}

// Bonus accruals emitted alongside the payslip. These are MONTHLY ACCRUAL
// figures for CTC accounting (smoothed across the bonus period); the engine
// does NOT add them to net salary. Real disbursement is a separate run.
export interface PayrollBonusAccrual {
  statutory: number;
  performance: number;
  festival: number;
  joining: number;
  retention: number;
  total: number;
}

// Per-component deduction breakdown. Distinct from the legacy 4-slot
// `deductions` object so the payslip can show ESI/PT/LWF/NPS as separate
// labelled lines instead of cramming them into 'insurance' / 'other'.
export interface PayrollDeductionsDetail {
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  lwf: number;
  nps: number;
}

export interface PayrollRecord {
  employeeId: string;
  employeeName: string;
  email: string;
  totalSalary: number;
  workingDays: number;
  workingHours: number;
  overtimeHours: number; // OT hours actually worked (above weekday threshold)
  baseSalary: number;
  hourlyRate: number;
  grossSalary: number;
  // Legacy 4-slot deductions, preserved for backward compatibility:
  //   pf → PF, tax → TDS, insurance → ESI, other → PT+LWF+NPS combined.
  // New code should prefer `deductionsDetail` for labelled values.
  deductions: {
    pf: number;
    tax: number;
    insurance: number;
    other: number;
  };
  earnings: PayrollEarnings;
  deductionsDetail: PayrollDeductionsDetail;
  netSalary: number;
  // Employer-side cost lines (above net). These don't reduce the employee's
  // take-home — they're surfaced so admins can see true CTC per employee.
  // Bonus accrual is the smoothed monthly cost of all enabled bonuses;
  // gratuity is the Payment-of-Gratuity-Act accrual; employer PF is the
  // company contribution shown separately from the employee deduction.
  bonusAccrual?: PayrollBonusAccrual;
  gratuityAccrual?: number;
  employerPfContribution?: number;
  employerEsiContribution?: number;
  // Total employer cost = gross + employer PF + employer ESI + bonus
  // accruals + gratuity accrual. Useful for budget reports.
  totalCtcCost?: number;
  status: 'pending' | 'processed';
  month: string;
  designation?: string;
  department?: string;
  generatedAt?: string;
  // Identifies which pay-rule profile produced this record. `source` exposes
  // whether the engine used an explicit assignment, the org default, the
  // global setup config, or the built-in defaults — useful for the detail
  // panel UI ("Using: Senior profile" vs "Using: org default").
  payrollProfileId?: string | null;
  payrollProfileName?: string | null;
  payrollProfileSource?: string | null;
  // Day-level breakdown produced by the per-day classifier. Filled even when
  // leave/holiday forms are not configured so the UI can render zeros instead
  // of `undefined` everywhere.
  breakdown: {
    daysInMonth: number;
    payableDays: number; // present + paid leave + holiday + weekly off
    presentDays: number; // days with check-in (full days)
    halfDays: number; // half-day attendance (4–6h) AND half-day leaves
    paidLeaveDays: number;
    unpaidLeaveDays: number; // LOP after applying deduction%
    holidayDays: number;
    weeklyOffDays: number;
    absentDays: number; // unmarked absence — straight LOP
    outOfServiceDays: number; // before joining or after leaving
    leaveByType: Record<string, number>; // sum of days per LeaveRule.name (or "Unmatched")
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __payrollStore: {
    records: Map<string, PayrollRecord[]>;
  } | undefined;
}

const store = globalThis.__payrollStore ?? { records: new Map<string, PayrollRecord[]>() };
if (!globalThis.__payrollStore) globalThis.__payrollStore = store;

// In-memory cache key: never just the month — always (org, month) so a
// calculation cached for Org A is invisible to Org B.
const cacheKey = (organizationId: string, month: string) => `${organizationId}|${month}`;

const EMPLOYEE_FORM_NAMES = ['Employee Master', 'Employee Profile', 'Employee Profiles', 'Employees', 'Employee'];
const CHECK_IN_FORM_NAMES = ['Check In', 'Check-In', 'CheckIn', 'Attendance Check-In', 'Check-in'];
const CHECK_OUT_FORM_NAMES = ['Check Out', 'Check-Out', 'CheckOut', 'Attendance Check-Out', 'Check-out'];
const LEAVE_FORM_NAMES = [
  'Leave Application',
  'Leave Request',
  'Leave Requests',
  'Leave Form',
  'Leaves',
  'Apply Leave',
];
const HOLIDAY_FORM_NAMES = [
  'Holiday Calendar',
  'Holidays',
  'Holiday List',
  'Public Holidays',
  'Company Holidays',
];

// =============================================================================
// FIELD-LOOKUP FALLBACK NAMES
// =============================================================================
// Used when the user hasn't explicitly mapped a field on /payroll/configure.
// These cover both:
//   - the API-style camelCase keys the seed script writes at top level
//     (`email`, `employeeId`, `salary`, …)
//   - the human labels the HR module assigns to its form fields
//     (`Company Email`, `Employee ID`, `In Date`, `In Time`, …)
//
// `flattenRecordData` is now label-aware: it emits values keyed by both the
// fieldId AND the field's label. Combined with these fallback lists, manually
// submitted records (which only have nested sections.<sid>.fields.<fid>) and
// seeded records (which carry top-level convenience keys) both resolve.
// =============================================================================
const EMAIL_FALLBACKS = [
  'email',
  'Email',
  'emailId',
  'employeeEmail',
  'Company Email',
  'Personal Email',
  'Work Email',
  'Email Address',
  'Applicant Email ID',
];
const EMP_ID_FALLBACKS = [
  'employeeId',
  'employee_id',
  'empId',
  'EmployeeID',
  'Employee ID',
  'Emp ID',
];
const FULL_NAME_FALLBACKS = [
  'employeeName',
  'name',
  'fullName',
  'employee_name',
  'Name',
  'Employee Name',
  'Applicant Name',
  'Candidate Name',
];
const FIRST_NAME_FALLBACKS = [
  'firstName',
  'first_name',
  'First Name',
  'fld_emp_first_name',
];
const LAST_NAME_FALLBACKS = [
  'lastName',
  'last_name',
  'Last Name',
  'fld_emp_last_name',
];
const SALARY_FALLBACKS = [
  'totalSalary',
  'salary',
  'CTC',
  'monthlySalary',
  'givenSalary',
  'baseSalary',
  'Salary Amount',
  'Total Salary',
  'Monthly Salary',
  'Base Salary',
];
const DESIGNATION_FALLBACKS = [
  'designation',
  'jobTitle',
  'role',
  'position',
  'Designation',
  'Job Title',
  'Title',
];
const DEPARTMENT_FALLBACKS = [
  'department',
  'dept',
  'team',
  'Department',
];
const CHECKIN_DATE_FALLBACKS = [
  'date',
  'attendanceDate',
  'Date',
  'In Date',
  'Check-In Date',
  'Check In Date',
  'Attendance Date',
];
const CHECKOUT_DATE_FALLBACKS = [
  'date',
  'attendanceDate',
  'Date',
  'Out Date',
  'Check-Out Date',
  'Check Out Date',
  'Attendance Date',
];
const CHECKIN_TIME_FALLBACKS = [
  'checkInTime',
  'checkIn',
  'inTime',
  'check_in_time',
  'In Time',
  'Check-In Time',
  'Check In Time',
  'Time',
  'Time In',
];
const CHECKOUT_TIME_FALLBACKS = [
  'checkOutTime',
  'checkOut',
  'outTime',
  'check_out_time',
  'Out Time',
  'Check-Out Time',
  'Check Out Time',
  'Time',
  'Time Out',
];
const DOJ_FALLBACKS = [
  'dateOfJoining',
  'date_of_joining',
  'doj',
  'Date of Joining',
  'Joining Date',
  'DOJ',
];
const DOL_FALLBACKS = [
  'dateOfLeaving',
  'date_of_leaving',
  'dol',
  'Date of Leaving',
  'Leaving Date',
  'Last Working Day',
  'DOL',
];
const LEAVE_TYPE_FALLBACKS = [
  'leaveType',
  'leave_type',
  'type',
  'Leave Type',
  'Type of Leave',
  'Leave Category',
  'Leave Reason',
];
const LEAVE_START_FALLBACKS = [
  'startDate',
  'start_date',
  'fromDate',
  'from_date',
  'From Date',
  'Start Date',
  'From',
  'Leave From',
];
const LEAVE_END_FALLBACKS = [
  'endDate',
  'end_date',
  'toDate',
  'to_date',
  'To Date',
  'End Date',
  'To',
  'Leave To',
];
const LEAVE_DAYS_FALLBACKS = [
  'days',
  'numberOfDays',
  'no_of_days',
  'duration',
  'Days',
  'No of Days',
  'Number of Days',
  'Duration',
];
const LEAVE_HALF_DAY_FALLBACKS = [
  'halfDay',
  'half_day',
  'isHalfDay',
  'Half Day',
  'Half-Day',
];
const LEAVE_STATUS_FALLBACKS = [
  'status',
  'approvalStatus',
  'approval_status',
  'state',
  'Status',
  'Approval Status',
  'Approved',
];
const HOLIDAY_DATE_FALLBACKS = [
  'date',
  'holidayDate',
  'holiday_date',
  'Date',
  'Holiday Date',
];
const HOLIDAY_NAME_FALLBACKS = [
  'name',
  'holidayName',
  'description',
  'Name',
  'Holiday',
  'Holiday Name',
  'Description',
];

const SETUP_META_KEY = 'payroll-v2';

interface PayrollSetupShape {
  defaultBaseSalary?: number | null;
  employee: { formId: string | null; fields: Record<string, string | null> };
  checkIn: { formId: string | null; fields: Record<string, string | null> };
  checkOut: { formId: string | null; fields: Record<string, string | null> };
  leave: { formId: string | null; fields: Record<string, string | null> };
  holiday: { formId: string | null; fields: Record<string, string | null> };
  policy: PayrollPolicy;
}

async function loadSetup(organizationId: string): Promise<PayrollSetupShape | null> {
  try {
    const config = await prisma.payrollConfiguration.findFirst({
      where: { isActive: true, organizationId },
      orderBy: { createdAt: 'desc' },
    });
    const m: any = config?.attendanceFieldMappings;
    if (m && typeof m === 'object' && m._meta === SETUP_META_KEY) {
      const policyRaw = m.policy ?? {};
      const weeklyOffDays = Array.isArray(policyRaw.weeklyOffDays)
        ? policyRaw.weeklyOffDays
            .map((n: any) => Number(n))
            .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)
        : DEFAULT_POLICY.weeklyOffDays;
      const payableBasis: PayrollPolicy['payableBasis'] =
        policyRaw.payableBasis === 'fixed26' || policyRaw.payableBasis === 'fixed30'
          ? policyRaw.payableBasis
          : 'monthDays';
      return {
        defaultBaseSalary: typeof m.defaultBaseSalary === 'number' ? m.defaultBaseSalary : null,
        employee: m.employee ?? { formId: null, fields: {} },
        checkIn: m.checkIn ?? { formId: null, fields: {} },
        checkOut: m.checkOut ?? { formId: null, fields: {} },
        leave: m.leave ?? { formId: null, fields: {} },
        holiday: m.holiday ?? { formId: null, fields: {} },
        policy: { weeklyOffDays, payableBasis },
      };
    }
    return null;
  } catch (err) {
    console.warn('[payroll] failed to load setup:', err);
    return null;
  }
}

export async function getPayrollFormulas(organizationId: string): Promise<PayrollFormulas> {
  // Reads the salary-structure / statutory / overtime config saved by the
  // /payroll/configure wizard. Falls back to DEFAULT_FORMULAS when no config
  // row exists for the org — the legacy hardcoded behaviour was 12% PF on
  // gross + 5% flat tax + ₹500 insurance, which is closer to a placeholder
  // than reality, so the defaults are the saner starting point.
  try {
    const config = await prisma.payrollConfiguration.findFirst({
      where: { isActive: true, organizationId },
      orderBy: { createdAt: 'desc' },
    });
    const m: any = config?.attendanceFieldMappings;
    if (m && typeof m === 'object' && m._meta === SETUP_META_KEY) {
      return {
        salaryStructure: { ...DEFAULT_FORMULAS.salaryStructure, ...(m.salaryStructure || {}) },
        statutory: { ...DEFAULT_FORMULAS.statutory, ...(m.statutory || {}) },
        overtime: { ...DEFAULT_FORMULAS.overtime, ...(m.overtime || {}) },
        bonus: { ...(DEFAULT_FORMULAS.bonus ?? {}), ...(m.bonus || {}) },
      };
    }
  } catch (err) {
    console.warn('[payroll] failed to load formulas:', err);
  }
  return DEFAULT_FORMULAS;
}

// ── Per-employee pay-rule profiles ────────────────────────────────────────
// Resolution order:
//   1. Profile explicitly assigned to the employee (PayrollProfileAssignment)
//   2. Org's default profile (PayrollProfile.isDefault = true)
//   3. Global setup config (PayrollConfiguration.attendanceFieldMappings)
//   4. DEFAULT_FORMULAS
//
// `getOrgProfilesContext` is called ONCE per org per calculation run and
// returns everything the per-employee resolver needs — a Map of profile-id →
// formulas, the default profile-id, the global fallback formulas, and a
// Map of employeeKey → profileId.
export interface ProfileResolution {
  formulas: PayrollFormulas;
  baseSalaryOverride: number | null;
  source: 'profile' | 'default-profile' | 'global-setup' | 'defaults';
  profileId: string | null;
  profileName: string | null;
}

export interface OrgProfilesContext {
  globalFallback: PayrollFormulas;
  profilesById: Map<
    string,
    { formulas: PayrollFormulas; baseSalary: number | null; name: string; isDefault: boolean }
  >;
  defaultProfileId: string | null;
  assignments: Map<string, string>; // employeeKey → profileId
}

function mergeFormulas(raw: any): PayrollFormulas {
  return {
    salaryStructure: { ...DEFAULT_FORMULAS.salaryStructure, ...(raw?.salaryStructure || {}) },
    statutory: { ...DEFAULT_FORMULAS.statutory, ...(raw?.statutory || {}) },
    overtime: { ...DEFAULT_FORMULAS.overtime, ...(raw?.overtime || {}) },
    bonus: { ...(DEFAULT_FORMULAS.bonus ?? {}), ...(raw?.bonus || {}) },
  };
}

export async function getOrgProfilesContext(
  organizationId: string,
  targetMonth?: string,
): Promise<OrgProfilesContext> {
  const globalFallback = await getPayrollFormulas(organizationId);
  const profilesById = new Map<
    string,
    { formulas: PayrollFormulas; baseSalary: number | null; name: string; isDefault: boolean }
  >();
  const assignments = new Map<string, string>();
  let defaultProfileId: string | null = null;

  // Normalise the target month to "YYYY-MM" so the string comparison below
  // is lexicographically correct.
  const monthKey = (targetMonth || new Date().toISOString().slice(0, 7)).slice(0, 7);

  try {
    const [profiles, assignmentRows] = await Promise.all([
      (prisma as any).payrollProfile.findMany({ where: { organizationId } }),
      (prisma as any).payrollProfileAssignment.findMany({ where: { organizationId } }),
    ]);
    for (const p of profiles) {
      profilesById.set(p.id, {
        formulas: mergeFormulas(p),
        baseSalary:
          p.baseSalary != null
            ? Number((p.baseSalary as any).toString?.() ?? p.baseSalary)
            : null,
        name: p.name,
        isDefault: !!p.isDefault,
      });
      if (p.isDefault) defaultProfileId = p.id;
    }
    for (const a of assignmentRows) {
      // Honour effective-from scheduling: an assignment with effectiveFrom
      // in the future is silently ignored — the employee falls back to the
      // default profile (or global setup) until that month arrives. Empty
      // string is treated as "always effective" so rows written before the
      // column existed keep applying.
      const eff: string = typeof a.effectiveFrom === 'string' ? a.effectiveFrom : '';
      if (eff && eff > monthKey) continue;
      assignments.set(a.employeeKey, a.profileId);
    }
  } catch (err) {
    // Profile tables may not exist yet on a freshly cloned checkout that
    // hasn't migrated. Silent fall-through — engine continues with the
    // global setup as the only formula source.
    console.warn('[payroll] profile context load failed:', err);
  }

  return { globalFallback, profilesById, defaultProfileId, assignments };
}

export function resolveEmployeeFormulas(
  ctx: OrgProfilesContext,
  employeeKey: string,
): ProfileResolution {
  const assignedId = ctx.assignments.get(employeeKey);
  if (assignedId) {
    const p = ctx.profilesById.get(assignedId);
    if (p) {
      return {
        formulas: p.formulas,
        baseSalaryOverride: p.baseSalary,
        source: 'profile',
        profileId: assignedId,
        profileName: p.name,
      };
    }
  }
  if (ctx.defaultProfileId) {
    const p = ctx.profilesById.get(ctx.defaultProfileId);
    if (p) {
      return {
        formulas: p.formulas,
        baseSalaryOverride: p.baseSalary,
        source: 'default-profile',
        profileId: ctx.defaultProfileId,
        profileName: p.name,
      };
    }
  }
  return {
    formulas: ctx.globalFallback,
    baseSalaryOverride: null,
    source: ctx.globalFallback === DEFAULT_FORMULAS ? 'defaults' : 'global-setup',
    profileId: null,
    profileName: null,
  };
}

export async function getPayrollPolicy(organizationId: string): Promise<PayrollPolicy> {
  // Preferred source: explicit policy saved via the payroll setup wizard
  // (PayrollConfiguration.attendanceFieldMappings._meta = "payroll-v2").
  const setup = await loadSetup(organizationId);
  if (setup?.policy) return setup.policy;

  // Fallback source: the new AttendanceConfiguration. This is the same
  // table the punch widget reads, so attendance and payroll always agree
  // about weekly-offs and pay-day basis even when the setup wizard hasn't
  // been touched.
  try {
    const cfg = await (prisma as any).attendanceConfiguration.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (cfg) {
      const weeklyOffDays = Array.isArray(cfg.weeklyOffDays)
        ? cfg.weeklyOffDays
            .map((n: any) => Number(n))
            .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)
        : DEFAULT_POLICY.weeklyOffDays;
      const payableBasis: PayrollPolicy['payableBasis'] =
        cfg.payableBasis === 'fixed26' || cfg.payableBasis === 'fixed30'
          ? cfg.payableBasis
          : 'monthDays';
      return {
        weeklyOffDays,
        payableBasis,
        monthlyHalfDayQuota: Number.isFinite(cfg.monthlyHalfDayQuota)
          ? Math.max(0, Math.floor(Number(cfg.monthlyHalfDayQuota)))
          : 0,
        monthlyShortLeaveQuota: Number.isFinite(cfg.monthlyShortLeaveQuota)
          ? Math.max(0, Math.floor(Number(cfg.monthlyShortLeaveQuota)))
          : 0,
        shortLeaveHours: Number.isFinite(cfg.shortLeaveHours)
          ? Math.max(0, Number(cfg.shortLeaveHours))
          : 2,
        fullDayMinHours: Number.isFinite(cfg.fullDayMinHours)
          ? Math.max(0, Number(cfg.fullDayMinHours))
          : 8,
        overtimeRequiresOptIn:
          cfg.overtimeRequiresOptIn === undefined
            ? true
            : !!cfg.overtimeRequiresOptIn,
        overtimeMaxHoursPerDay: Number.isFinite(cfg.overtimeMaxHoursPerDay)
          ? Math.max(0, Number(cfg.overtimeMaxHoursPerDay))
          : 4,
      };
    }
  } catch (err) {
    // AttendanceConfiguration table may not exist yet on a freshly cloned
    // checkout that hasn't migrated. Silently fall through to defaults.
    console.warn('[payroll] attendance-config lookup failed:', err);
  }

  return DEFAULT_POLICY;
}

// Reads the new typed Attendance table for this org's users in the given
// month and returns the same SampleAttendance shape getAttendanceFromDB
// produces from forms. The merger in getAttendanceFromDB calls this and
// lets native records override form-based ones for the same (user, date) —
// native rows have authoritative server timestamps, so they win.
async function getNativeAttendanceForMonth(
  organizationId: string,
  month: string,
): Promise<SampleAttendance[]> {
  try {
    const [yStr, mStr] = month.split('-');
    const yearN = Number(yStr);
    const monthN = Number(mStr);
    if (!Number.isInteger(yearN) || !Number.isInteger(monthN)) return [];
    const lastDay = new Date(yearN, monthN, 0).getDate();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

    const rows = await prisma.attendance.findMany({
      where: {
        date: { gte: monthStart, lte: monthEnd },
        user: { organizationId },
      },
      include: {
        user: { select: { id: true, email: true, username: true } },
      },
    });

    // Emit one entry per (user, day) under EVERY matchKey that could plausibly
    // identify this user — userId, login email, employee.id (if linked).
    // The per-employee join in payroll-utils.ts dedupes by date, so emitting
    // the same row under multiple keys is safe; it just means whichever key
    // the employee record happens to expose, the join hits.
    //
    // This is what unblocks the case where the Employee Profile form has a
    // wrong / missing email field but the user IS the same person who punched.
    // Joining via userId works regardless of how clean the form data is.
    const out: SampleAttendance[] = [];
    for (const row of rows) {
      const email = row.user?.email
        ? String(row.user.email).toLowerCase()
        : '';
      const userId = row.user?.id ?? row.userId ?? null;
      const checkInAt = (row as any).checkInAt as Date | null | undefined;
      const checkOutAt = (row as any).checkOutAt as Date | null | undefined;
      const inTime = row.checkInTime ?? '';
      const outTime = row.checkOutTime ?? '';
      // Skip rows with no real punch data on either side. Without this,
      // a phantom row (e.g. a half-written record with checkedIn=false
      // and all timestamps null) fed the day classifier as if the user
      // had attended, and the classifier — receiving hours=0 — happily
      // counted it as a full present day. That's why every employee was
      // showing "5 days, 0.0 hours". Drop it at the source.
      if (!inTime && !outTime && !checkInAt && !checkOutAt) continue;
      if (!userId && !email) continue;
      const baseRow = {
        email,
        date: row.date,
        checkInTime: inTime,
        checkOutTime: outTime,
        checkInAt: checkInAt ? checkInAt.toISOString() : null,
        checkOutAt: checkOutAt ? checkOutAt.toISOString() : null,
        // Authoritative OT minutes already capped + opt-in-gated by the
        // punch service at check-out time. Payroll uses these directly so
        // we don't double-count OT from raw worked hours.
        overtimeMinutes: Number.isFinite((row as any).overtimeMinutes)
          ? Number((row as any).overtimeMinutes)
          : 0,
        overtimeOptedIn: !!(row as any).overtimeOptedIn,
      };
      // Primary key: userId (always reliable — Attendance.userId is a FK).
      if (userId) {
        out.push({ ...baseRow, matchKey: `userId:${String(userId).toLowerCase()}` });
      }
      // Secondary key: login email (legacy join path).
      if (email) {
        out.push({ ...baseRow, matchKey: `email:${email}` });
      }
    }
    return out;
  } catch (err) {
    console.warn('[payroll] native attendance lookup failed:', err);
    return [];
  }
}

async function getFieldLabelMap(formId: string, organizationId: string): Promise<Record<string, string>> {
  try {
    const form = await prisma.form.findFirst({
      where: { id: formId, module: { organizationId } },
      include: { sections: { include: { fields: true } } },
    });
    if (!form) return {};
    const map: Record<string, string> = {};
    for (const sec of form.sections) {
      for (const f of sec.fields) {
        if (f.label) map[f.id] = f.label;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Flatten a stored record_data into a plain { key: value } map.
 *
 * Why labels matter:
 *   The seed script writes attendance/employee records with top-level convenience
 *   keys like { email, employeeId, ... }, which makes name-based lookup easy.
 *   The form submission UI does NOT — it stores values strictly under
 *   sections.<sectionId>.fields.<fieldId>, where fieldId is something like
 *   `fld_ci_in_date`. The fallback lookup `pickValue(data, ['date', 'In Date'])`
 *   then can't find the date because no key in `data` matches.
 *
 * Solution: accept the form's fieldId→label map and emit values under BOTH
 *   plain[fieldId] AND plain[label]. So a manual submission whose field is
 *   labeled "In Date" becomes findable via either `fld_ci_in_date` (mapped
 *   path) or `In Date` (label-fallback path).
 */
function flattenRecordData(
  recordData: any,
  labels?: Record<string, string>,
): Record<string, any> {
  if (!recordData || typeof recordData !== 'object') return {};
  const plain: Record<string, any> = {};

  const setBoth = (fieldId: string, value: any) => {
    plain[fieldId] = value;
    if (labels) {
      const label = labels[fieldId];
      // Don't clobber a previously-set label key (a later field with the
      // same label would otherwise overwrite an earlier one).
      if (label && plain[label] === undefined) {
        plain[label] = value;
      }
    }
  };

  if (recordData.sections && typeof recordData.sections === 'object') {
    for (const section of Object.values(recordData.sections) as any[]) {
      const fields = section?.fields;
      if (fields && typeof fields === 'object') {
        for (const [fieldId, val] of Object.entries(fields)) {
          const v = val && typeof val === 'object' && 'value' in val ? (val as any).value : val;
          setBoth(fieldId, v);
        }
      }
    }
  }

  if (recordData.subforms && typeof recordData.subforms === 'object') {
    for (const subform of Object.values(recordData.subforms) as any[]) {
      const fields = subform?.fields;
      if (fields && typeof fields === 'object') {
        for (const [fieldId, val] of Object.entries(fields)) {
          const v = val && typeof val === 'object' && 'value' in val ? (val as any).value : val;
          setBoth(fieldId, v);
        }
      }
    }
  }

  const structuredKeys = new Set(['formId', 'formName', 'sections', 'subforms', 'metadata']);
  for (const [key, entry] of Object.entries(recordData)) {
    if (structuredKeys.has(key)) continue;
    if (plain[key] !== undefined) continue;
    plain[key] = entry && typeof entry === 'object' && 'value' in (entry as any)
      ? (entry as any).value
      : entry;
  }

  return plain;
}

function pickValue(recordData: any, candidates: string[]): any {
  if (!recordData || typeof recordData !== 'object') return undefined;
  for (const key of candidates) {
    const direct = recordData[key];
    if (direct !== undefined && direct !== null) {
      if (typeof direct === 'object' && 'value' in direct) {
        if (direct.value !== null && direct.value !== undefined) return direct.value;
      } else {
        return direct;
      }
    }
  }
  const keys = Object.keys(recordData);
  for (const candidate of candidates) {
    const target = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = keys.find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === target);
    if (match) {
      const v = recordData[match];
      if (v && typeof v === 'object' && 'value' in v) return v.value;
      return v;
    }
  }
  return undefined;
}

function toNumber(v: any, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ₹]/g, ''));
  return isNaN(n) ? fallback : n;
}

function toDateStr(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function toTimeStr(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const hhmm = v.match(/(\d{1,2}):(\d{2})/);
    if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
  }
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function diagnose(organizationId: string, month: string): Promise<any> {
  const setup = await loadSetup(organizationId);
  const employeeForm = await resolveFromConfigOrName(organizationId, setup?.employee ?? null, EMPLOYEE_FORM_NAMES);
  const checkInForm = await resolveFromConfigOrName(organizationId, setup?.checkIn ?? null, CHECK_IN_FORM_NAMES);
  const checkOutForm = await resolveFromConfigOrName(organizationId, setup?.checkOut ?? null, CHECK_OUT_FORM_NAMES);

  const result: any = {
    organizationId,
    hasSavedSetup: !!setup,
    month,
    employee: { found: !!employeeForm, formId: employeeForm?.id, rawCount: 0, parsedCount: 0, sample: [], reasons: {} },
    checkIn: { found: !!checkInForm, formId: checkInForm?.id, rawCount: 0, parsedInMonth: 0, sample: [], reasons: {} },
    checkOut: { found: !!checkOutForm, formId: checkOutForm?.id, rawCount: 0, parsedInMonth: 0, sample: [], reasons: {} },
  };

  if (employeeForm) {
    const rows = await readRecords(employeeForm);
    result.employee.rawCount = rows.length;
    const reasons: Record<string, number> = {
      noIdentity: 0,
      noSalaryNoDefault: 0,
      ok: 0,
    };
    const fields = setup?.employee.fields ?? {};
    const fallbackSalary = setup?.defaultBaseSalary ?? 0;
    for (const row of rows.slice(0, 100)) {
      const data = flattenRecordData(row.recordData, employeeForm.labels);
      const email =
        pickWithMapping(data, fields.email, employeeForm.labels, EMAIL_FALLBACKS) ||
        row.user?.email;
      const empId = pickWithMapping(data, fields.employeeId, employeeForm.labels, EMP_ID_FALLBACKS);
      const mappedSalary = toNumber(
        pickWithMapping(data, fields.salary, employeeForm.labels, SALARY_FALLBACKS),
        0,
      );
      const salary = mappedSalary > 0 ? mappedSalary : fallbackSalary;

      if (!email && !empId) reasons.noIdentity++;
      else if (salary <= 0) reasons.noSalaryNoDefault++;
      else reasons.ok++;

      if (result.employee.sample.length < 3) {
        result.employee.sample.push({
          recordId: row.id,
          email: email ?? null,
          employeeId: empId ?? null,
          mappedSalary,
          fallbackSalary,
          effectiveSalary: salary,
          dataKeys: Object.keys(data).slice(0, 25),
        });
      }
    }
    result.employee.parsedCount = reasons.ok;
    result.employee.reasons = reasons;
  }

  const fillAttendance = async (
    target: 'checkIn' | 'checkOut',
    formInfo: typeof checkInForm,
    fields: Record<string, string | null>,
    timeKey: 'checkInTime' | 'checkOutTime',
  ) => {
    if (!formInfo) return;
    const rows = await readRecords(formInfo);
    result[target].rawCount = rows.length;
    const reasons: Record<string, number> = {
      missingDate: 0,
      missingTime: 0,
      outOfMonth: 0,
      noIdentity: 0,
      ok: 0,
    };
    for (const row of rows.slice(0, 200)) {
      const data = flattenRecordData(row.recordData, formInfo.labels);
      const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;
      const email =
        pickWithMapping(data, fields.email, formInfo.labels, EMAIL_FALLBACKS) ||
        userEmail;
      const empId = pickWithMapping(data, fields.employeeId, formInfo.labels, EMP_ID_FALLBACKS);
      const dateValue =
        pickWithMapping(
          data,
          fields.date,
          formInfo.labels,
          target === 'checkOut' ? CHECKOUT_DATE_FALLBACKS : CHECKIN_DATE_FALLBACKS,
        ) ?? row.date;
      const time = pickWithMapping(
        data,
        fields[timeKey] ?? null,
        formInfo.labels,
        timeKey === 'checkInTime' ? CHECKIN_TIME_FALLBACKS : CHECKOUT_TIME_FALLBACKS,
      );
      const dateStr = toDateStr(dateValue);
      const timeStr = toTimeStr(time);
      if (!dateStr) reasons.missingDate++;
      else if (!timeStr) reasons.missingTime++;
      else if (!email && !empId) reasons.noIdentity++;
      else if (dateStr.slice(0, 7) !== month) reasons.outOfMonth++;
      else reasons.ok++;
      if (result[target].sample.length < 3) {
        result[target].sample.push({
          recordId: row.id,
          email: email ?? null,
          employeeId: empId ?? null,
          parsedDate: dateStr,
          parsedTime: timeStr,
          rawDateColumn: row.date,
          submittedByUserEmail: userEmail,
          dataKeys: Object.keys(data).slice(0, 25),
        });
      }
    }
    result[target].parsedInMonth = reasons.ok;
    result[target].reasons = reasons;
  };

  await fillAttendance('checkIn', checkInForm, setup?.checkIn.fields ?? {}, 'checkInTime');
  await fillAttendance('checkOut', checkOutForm, setup?.checkOut.fields ?? {}, 'checkOutTime');

  return result;
}

async function findFormByNames(
  organizationId: string,
  names: string[],
): Promise<{ id: string; storageTable: string | null; organizationId: string } | null> {
  // Filter through module.organizationId so two orgs that share a form name
  // ("Employee Master", "Check In", …) don't see each other's forms.
  const form = await prisma.form.findFirst({
    where: {
      name: { in: names, mode: 'insensitive' },
      module: { organizationId },
    },
    include: { tableMapping: true },
  });
  if (!form) return null;
  return {
    id: form.id,
    storageTable: form.tableMapping?.storageTable ?? null,
    organizationId,
  };
}

async function readRecords(
  formInfo: { id: string; storageTable: string | null; organizationId: string },
  where: any = {},
): Promise<any[]> {
  // Two-layer scoping:
  //   1. formId must match the form we already verified belongs to org.
  //   2. As defence-in-depth, on tables that carry an organization_id column
  //      (the unified form_records and form_records_14), we *also* filter
  //      explicitly. That way, even if a stray record were ever written with
  //      the wrong formId / org pairing, this function refuses to return it.
  const baseWhere = { formId: formInfo.id, ...where };

  if (formInfo.storageTable) {
    const num = formInfo.storageTable.match(/\d+$/)?.[0];
    if (num) {
      const key = `formRecord${num}` as keyof typeof prisma;
      if (key in prisma) {
        try {
          // Only form_records_14 carries an organization_id column on the
          // sharded side. The other shards rely on formId scoping.
          const sharedWhere =
            num === '14' ? { ...baseWhere, organizationId: formInfo.organizationId } : baseWhere;
          // Always include the submittedBy user — payroll uses
          // `row.user.email` and `row.user.id` to build matchKeys, so
          // missing this would silently break the cross-source join
          // (employee profile ⇄ native attendance) for sharded forms.
          const findArgs = {
            where: sharedWhere,
            include: { user: { select: { id: true, email: true, username: true } } },
          };
          let rows = await (prisma[key] as any).findMany(findArgs);
          if (rows.length === 0 && Object.keys(where).length > 0) {
            const fallbackWhere =
              num === '14'
                ? { formId: formInfo.id, organizationId: formInfo.organizationId }
                : { formId: formInfo.id };
            rows = await (prisma[key] as any).findMany({
              where: fallbackWhere,
              include: { user: { select: { id: true, email: true, username: true } } },
            });
          }
          if (rows.length > 0) return rows;
        } catch (err) {
          console.warn(`[payroll] Failed reading ${String(key)}:`, err);
        }
      }
    }
  }

  try {
    // The unified form_records table HAS an organization_id column — use it.
    // Including user.id (in addition to email/username) so the payroll
    // engine can build a userId-based matchKey when the form's email
    // field is missing or wrong.
    let rows = await prisma.formRecord.findMany({
      where: { ...baseWhere, organizationId: formInfo.organizationId },
      include: { user: { select: { id: true, email: true, username: true } } },
    });
    if (rows.length === 0 && Object.keys(where).length > 0) {
      rows = await prisma.formRecord.findMany({
        where: { formId: formInfo.id, organizationId: formInfo.organizationId },
        include: { user: { select: { id: true, email: true, username: true } } },
      });
    }
    return rows;
  } catch (err) {
    console.warn('[payroll] Failed reading unified formRecord:', err);
    return [];
  }
}

function inMonth(dateStr: string | null, month: string): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 7) === month;
}

async function resolveFromConfigOrName(
  organizationId: string,
  configured: { formId: string | null } | null,
  fallbackNames: string[],
): Promise<{ id: string; storageTable: string | null; organizationId: string; labels: Record<string, string> } | null> {
  if (configured?.formId) {
    // Verify the configured formId belongs to THIS org, not someone else's
    // (defends against a stale config saved before tenant scoping landed).
    const form = await prisma.form.findFirst({
      where: { id: configured.formId, module: { organizationId } },
      include: { tableMapping: true },
    });
    if (form) {
      const labels = await getFieldLabelMap(form.id, organizationId);
      return {
        id: form.id,
        storageTable: form.tableMapping?.storageTable ?? null,
        organizationId,
        labels,
      };
    }
    // Configured form doesn't belong to this org → fall through to name-based discovery
  }
  const found = await findFormByNames(organizationId, fallbackNames);
  if (!found) return null;
  const labels = await getFieldLabelMap(found.id, organizationId);
  return { ...found, labels };
}

function pickWithMapping(
  data: any,
  mappedFieldId: string | null | undefined,
  labels: Record<string, string>,
  fallbackNames: string[],
): any {
  if (mappedFieldId) {
    const direct = data?.[mappedFieldId];
    if (direct !== undefined && direct !== null) {
      if (typeof direct === 'object' && 'value' in direct) {
        if (direct.value !== null && direct.value !== undefined) return direct.value;
      } else {
        return direct;
      }
    }
    const label = labels[mappedFieldId];
    if (label) {
      const byLabel = pickValue(data, [label]);
      if (byLabel !== undefined) return byLabel;
    }
  }
  return pickValue(data, fallbackNames);
}

export async function getEmployeesFromDB(organizationId: string): Promise<SampleEmployee[]> {
  const setup = await loadSetup(organizationId);
  const formInfo = await resolveFromConfigOrName(organizationId, setup?.employee ?? null, EMPLOYEE_FORM_NAMES);

  const fields = setup?.employee.fields ?? {};
  const fallbackSalary = setup?.defaultBaseSalary ?? 0;
  // formInfo may be null if the org hasn't bound an Employee Profile form
  // yet. We don't return [] anymore — we fall through to the native-user
  // synthesis below so users who have only the static /attendance widget
  // (and no profile form) still appear in payroll.
  const employees: SampleEmployee[] = [];
  const seen = new Set<string>();

  if (formInfo) {
    const rows = await readRecords(formInfo);
    for (const row of rows) {
      const data = flattenRecordData(row.recordData, formInfo.labels);
    const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;
    const userId = row.user?.id ? String(row.user.id) : null;

    const rawEmail = pickWithMapping(data, fields.email, formInfo.labels, EMAIL_FALLBACKS);
    const rawEmpId = pickWithMapping(data, fields.employeeId, formInfo.labels, EMP_ID_FALLBACKS);

    const email = rawEmail ? String(rawEmail).toLowerCase() : userEmail;
    const employeeId =
      (rawEmpId ? String(rawEmpId) : null) ||
      row.employee_id ||
      (email ? email.split('@')[0].toUpperCase() : `EMP-${row.id.slice(0, 6)}`);

    // Build match keys from EVERY identity we can prove for this row.
    // Order matters: the first non-empty key is used as the dedup key
    // for this employee, and we want the most reliable signal first.
    //   1. userId — Attendance.userId is a hard FK, so this is the
    //      ground-truth join. Any record with a known submittedBy user
    //      gets matched to that user's punches even if the form's
    //      email field is wrong/missing.
    //   2. email — handles legacy form records that pre-date submittedBy.
    //   3. empId — final fallback for hand-typed employee IDs.
    const matchKeys: string[] = [];
    if (userId) matchKeys.push(`userId:${userId.toLowerCase()}`);
    if (email) matchKeys.push(`email:${email}`);
    if (userEmail && (!email || userEmail !== email)) matchKeys.push(`email:${userEmail}`);
    if (employeeId) matchKeys.push(`empId:${String(employeeId).toLowerCase()}`);
    if (matchKeys.length === 0) continue;

    const dedupKey = matchKeys[0];
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const firstName = pickWithMapping(data, null, formInfo.labels, FIRST_NAME_FALLBACKS);
    const lastName = pickWithMapping(data, null, formInfo.labels, LAST_NAME_FALLBACKS);
    const composedName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const employeeName =
      pickWithMapping(data, fields.name, formInfo.labels, FULL_NAME_FALLBACKS) ||
      composedName ||
      row.user?.username ||
      (email ? email.split('@')[0] : String(employeeId));

    const mappedSalary = toNumber(
      pickWithMapping(data, fields.salary, formInfo.labels, SALARY_FALLBACKS),
      0,
    );
    const totalSalary = mappedSalary > 0 ? mappedSalary : fallbackSalary;

    const designation =
      pickWithMapping(data, fields.designation, formInfo.labels, DESIGNATION_FALLBACKS) || '';
    const department =
      pickWithMapping(data, fields.department, formInfo.labels, DEPARTMENT_FALLBACKS) || '';
    const dateOfJoining = toDateStr(
      pickWithMapping(data, fields.dateOfJoining, formInfo.labels, DOJ_FALLBACKS),
    );
    const dateOfLeaving = toDateStr(
      pickWithMapping(data, fields.dateOfLeaving, formInfo.labels, DOL_FALLBACKS),
    );

    // Form-path doesn't map bonusAmount yet — only the native-user loop
    // below sees Employee.bonusAmount directly. Default to 0 so the engine
    // is happy; an admin who wants per-employee bonus on form-loaded
    // employees should switch to the native Employee table path.
    employees.push({
      employeeId: String(employeeId),
      employeeName: String(employeeName),
      email: email || '',
      designation: String(designation || ''),
      department: String(department || ''),
      totalSalary,
      bonusAmount: 0,
      matchKeys,
      dateOfJoining,
      dateOfLeaving,
    });
    }
  }

  // ---------------------------------------------------------------------------
  // Native-user fallback synthesis
  // ---------------------------------------------------------------------------
  // The form-driven loop above only sees people who exist in the Employee
  // Profile form. Anyone who punches in via the static /attendance widget
  // without a corresponding form record is invisible to payroll — we saw
  // that in production: a user named "app3" had three days of clean check-
  // ins but never showed up in the payroll list because their profile
  // form was never filled.
  //
  // Fix: union in every active User in the org. If a user is already
  // covered by a form-derived employee (via userId, email, OR linked
  // employee.id), we skip — the form record stays authoritative for
  // salary and dates. Otherwise we synthesise an employee from User +
  // optional Employee row + the configured defaultBaseSalary.
  try {
    const orgUsers = await prisma.user.findMany({
      where: {
        organizationId,
        status: { in: ['ACTIVE', 'PENDING'] as any },
      },
      select: {
        id: true,
        email: true,
        username: true,
        first_name: true,
        last_name: true,
        department: true,
        joinDate: true,
        employee: {
          select: {
            id: true,
            employeeName: true,
            department: true,
            designation: true,
            totalSalary: true,
            givenSalary: true,
            bonusAmount: true,
            isOvertimeApplicable: true,
            overTime: true,
            dateOfJoining: true,
            dateOfLeaving: true,
          },
        },
      },
    });
    for (const u of orgUsers) {
      const userId = String(u.id);
      const userIdKey = `userId:${userId.toLowerCase()}`;
      const emailKey = u.email ? `email:${u.email.toLowerCase()}` : null;
      const empIdKey = u.employee?.id
        ? `empId:${String(u.employee.id).toLowerCase()}`
        : null;

      // If any of this user's identity keys already mapped to a
      // form-derived employee, skip — the form is the source of truth.
      if (seen.has(userIdKey)) continue;
      if (emailKey && seen.has(emailKey)) continue;
      if (empIdKey && seen.has(empIdKey)) continue;

      seen.add(userIdKey);
      if (emailKey) seen.add(emailKey);
      if (empIdKey) seen.add(empIdKey);

      const composedName =
        [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
        u.employee?.employeeName ||
        u.username ||
        (u.email ? u.email.split('@')[0] : userId);

      // Salary preference: explicit Employee row → form's defaultBaseSalary.
      // We deliberately don't fall back to 0 silently — a 0 here means
      // the row will produce ₹0 gross which is exactly what the admin
      // should see until they bind a salary somewhere.
      const empSalary =
        u.employee?.totalSalary != null
          ? Number((u.employee.totalSalary as any).toString?.() ?? u.employee.totalSalary)
          : u.employee?.givenSalary != null
            ? Number((u.employee.givenSalary as any).toString?.() ?? u.employee.givenSalary)
            : 0;
      const totalSalary = empSalary > 0 ? empSalary : fallbackSalary;
      // Per-employee bonus from the Compensation section of Employee Master.
      // null / undefined / negative collapse to 0 so we never accidentally
      // pay a negative bonus.
      const empBonusRaw = u.employee?.bonusAmount;
      const empBonus =
        empBonusRaw != null
          ? Math.max(0, Number((empBonusRaw as any).toString?.() ?? empBonusRaw))
          : 0;
      const empOtRateRaw = (u.employee as any)?.overTime;
      const empOtRate =
        empOtRateRaw != null
          ? Math.max(0, Number((empOtRateRaw as any).toString?.() ?? empOtRateRaw))
          : 0;

      const matchKeys: string[] = [userIdKey];
      if (emailKey) matchKeys.push(emailKey);
      if (empIdKey) matchKeys.push(empIdKey);

      employees.push({
        employeeId: u.employee?.id ? String(u.employee.id) : userId,
        employeeName: String(composedName),
        email: u.email ? u.email.toLowerCase() : '',
        designation: u.employee?.designation ?? '',
        department: u.employee?.department ?? u.department ?? '',
        totalSalary,
        bonusAmount: empBonus,
        // Per-employee OT toggle from Employee Master. Null means the field
        // wasn't set on this employee yet — the engine defaults that to "OT
        // applies per pay rule" so older rows aren't accidentally disabled.
        isOvertimeApplicable: u.employee?.isOvertimeApplicable ?? null,
        overtimeRate: empOtRate,
        matchKeys,
        dateOfJoining: u.employee?.dateOfJoining
          ? new Date(u.employee.dateOfJoining).toISOString().slice(0, 10)
          : u.joinDate
            ? new Date(u.joinDate).toISOString().slice(0, 10)
            : null,
        dateOfLeaving: u.employee?.dateOfLeaving
          ? new Date(u.employee.dateOfLeaving).toISOString().slice(0, 10)
          : null,
      });
    }
  } catch (err) {
    console.warn('[payroll] native-user synthesis failed:', err);
  }

  return employees;
}

// ---- leave / holiday fetchers ---------------------------------------------

function normaliseStatus(raw: any): SampleLeave['status'] {
  if (raw === undefined || raw === null || raw === '') return 'unknown';
  if (typeof raw === 'boolean') return raw ? 'approved' : 'rejected';
  const s = String(raw).trim().toLowerCase();
  if (['approved', 'approve', 'yes', 'true', '1', 'accepted', 'sanctioned', 'ok'].includes(s)) {
    return 'approved';
  }
  if (['rejected', 'reject', 'declined', 'no', 'false', '0', 'denied', 'cancelled', 'canceled'].includes(s)) {
    return 'rejected';
  }
  if (['pending', 'open', 'submitted', 'in review', 'in_review', 'awaiting'].includes(s)) {
    return 'pending';
  }
  return 'unknown';
}

function isTruthyHalfDay(raw: any): boolean {
  if (raw === undefined || raw === null || raw === '') return false;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  return ['true', 'yes', '1', 'half', 'half-day', 'half day', 'on'].includes(s);
}

/**
 * Reads APPROVED leaves overlapping `month` from the schema-backed
 * LeaveRequest table (the new source of truth introduced with the leave-
 * management module). Joins users to produce the email-keyed matchKey the
 * rest of the engine expects. Returns [] if the table is empty for the
 * window, letting `getLeavesFromDB` fall back to the form-based reader so
 * tenants that still use a form-builder leave form keep working.
 */
async function readApprovedLeavesFromTable(
  organizationId: string,
  month: string,
): Promise<SampleLeave[]> {
  const [yStr, mStr] = month.split('-');
  const yearN = Number(yStr);
  const monthN = Number(mStr);
  const monthStart = `${month}-01`;
  const lastDay = new Date(yearN, monthN, 0).getDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

  let rows: any[];
  try {
    rows = await (prisma as any).leaveRequest.findMany({
      where: {
        organizationId,
        status: 'APPROVED',
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
    });
  } catch {
    // Table may not exist yet (migration not run). Treat as "no rows".
    return [];
  }
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const typeIds = Array.from(new Set(rows.map((r) => r.leaveTypeId)));
  const [users, types] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, employee: { select: { id: true } } },
    }),
    (prisma as any).leaveType.findMany({
      where: { id: { in: typeIds } },
      select: { id: true, name: true },
    }),
  ]);
  const userById = new Map(users.map((u: any) => [u.id, u]));
  const typeById = new Map((types as any[]).map((t) => [t.id, t]));

  const leaves: SampleLeave[] = [];
  for (const r of rows) {
    const u: any = userById.get(r.userId);
    const t: any = typeById.get(r.leaveTypeId);
    const email: string | null = u?.email ? String(u.email).toLowerCase() : null;
    const empId: string | null = u?.employee?.id ? String(u.employee.id).toLowerCase() : null;
    const matchKey = email ? `email:${email}` : empId ? `empId:${empId}` : null;
    if (!matchKey) continue;

    const isHalfDay = r.duration !== 'FULL_DAY';
    const totalDays = r.totalDays != null ? Number(r.totalDays.toString?.() ?? r.totalDays) : null;

    leaves.push({
      matchKey,
      email: email ?? '',
      leaveType: t?.name ?? '',
      startDate: r.startDate,
      endDate: r.endDate,
      isHalfDay,
      days: Number.isFinite(totalDays as number) ? (totalDays as number) : null,
      status: 'approved',
    });
  }
  return leaves;
}

export async function getLeavesFromDB(
  organizationId: string,
  month: string,
): Promise<SampleLeave[]> {
  // Source of truth: the schema-backed LeaveRequest table populated by the
  // /leave flow. The old form-record fallback has been removed — admins no
  // longer link a leave form on the Attendance Configuration page, so the
  // table is the only place approved leaves can live.
  return readApprovedLeavesFromTable(organizationId, month);
}

/**
 * Reads holidays from the schema-backed Holiday table for the given month.
 * Returns [] when the table has no rows for the window so getHolidaysFromDB
 * can fall back to the form-based reader.
 */
async function readHolidaysFromTable(
  organizationId: string,
  month: string,
): Promise<SampleHoliday[]> {
  const [yStr, mStr] = month.split('-');
  const yearN = Number(yStr);
  const monthN = Number(mStr);
  const monthStart = `${month}-01`;
  const lastDay = new Date(yearN, monthN, 0).getDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

  let rows: any[];
  try {
    rows = await (prisma as any).holiday.findMany({
      where: {
        organizationId,
        date: { gte: monthStart, lte: monthEnd },
        isOptional: false,
      },
      orderBy: { date: 'asc' },
    });
  } catch {
    return [];
  }
  return rows.map((r) => ({ date: r.date, name: r.name ?? '' }));
}

export async function getHolidaysFromDB(
  organizationId: string,
  month: string,
): Promise<SampleHoliday[]> {
  // Source of truth: the Holiday table managed by the static Holiday admin
  // page. The form-record fallback has been removed along with the linked-
  // forms section on /settings/attendance-config.
  return readHolidaysFromTable(organizationId, month);
}

export async function getAttendanceFromDB(organizationId: string, month: string): Promise<SampleAttendance[]> {
  // Source of truth: the Attendance table populated by the /attendance widget
  // (via POST /api/attendance/punch). The previous form-record path has been
  // removed along with the linked-forms section on /settings/attendance-config
  // — every tenant goes through the native widget now.
  const nativeRows = await getNativeAttendanceForMonth(organizationId, month);
  return nativeRows.filter((r) => r.checkInTime || r.checkOutTime);
}

export async function getEmployeeFormsStatus(organizationId: string): Promise<{
  hasEmployeeForm: boolean;
  hasCheckInForm: boolean;
  hasCheckOutForm: boolean;
  /** Native attendance source — `Attendance` table populated by the static
   *  /attendance widget. When true, payroll can run without a check-in form
   *  (the widget rows are the source of truth). */
  hasNativeAttendance: boolean;
  /** True when payroll has a usable check-in source — either a bound form OR
   *  native widget rows. Use this for gating, not hasCheckInForm directly. */
  hasAnyCheckInSource: boolean;
  nativeAttendanceCount: number;
  hasSavedSetup: boolean;
  employeeFormName?: string;
  checkInFormName?: string;
  checkOutFormName?: string;
}> {
  const setup = await loadSetup(organizationId);

  const lookupName = async (formId: string | null | undefined) => {
    if (!formId) return null;
    // Verify the form belongs to this org before disclosing its name.
    const f = await prisma.form.findFirst({
      where: { id: formId, module: { organizationId } },
      select: { name: true },
    });
    return f?.name ?? null;
  };

  const [
    empByName,
    ciByName,
    coByName,
    empConfigName,
    ciConfigName,
    coConfigName,
    nativeAttendanceCount,
  ] = await Promise.all([
    prisma.form.findFirst({
      where: {
        name: { in: EMPLOYEE_FORM_NAMES, mode: 'insensitive' },
        module: { organizationId },
      },
      select: { name: true },
    }),
    prisma.form.findFirst({
      where: {
        name: { in: CHECK_IN_FORM_NAMES, mode: 'insensitive' },
        module: { organizationId },
      },
      select: { name: true },
    }),
    prisma.form.findFirst({
      where: {
        name: { in: CHECK_OUT_FORM_NAMES, mode: 'insensitive' },
        module: { organizationId },
      },
      select: { name: true },
    }),
    lookupName(setup?.employee.formId),
    lookupName(setup?.checkIn.formId),
    lookupName(setup?.checkOut.formId),
    // Native attendance presence — any row from this org's users counts. We
    // count instead of just findFirst so the diagnostics screen can show "47
    // punches recorded" alongside the boolean.
    prisma.attendance.count({
      where: { user: { organizationId }, checkedIn: true },
    }).catch(() => 0),
  ]);

  const employeeFormName = empConfigName ?? empByName?.name;
  const checkInFormName = ciConfigName ?? ciByName?.name;
  const checkOutFormName = coConfigName ?? coByName?.name;
  const hasCheckInForm = !!checkInFormName;
  const hasNativeAttendance = nativeAttendanceCount > 0;

  return {
    hasEmployeeForm: !!employeeFormName,
    hasCheckInForm,
    hasCheckOutForm: !!checkOutFormName,
    hasNativeAttendance,
    hasAnyCheckInSource: hasCheckInForm || hasNativeAttendance,
    nativeAttendanceCount,
    hasSavedSetup: !!setup,
    employeeFormName,
    checkInFormName,
    checkOutFormName,
  };
}

// ---- in-memory record cache (per-org, per-month) ---------------------------

export function setPayrollRecords(organizationId: string, month: string, records: PayrollRecord[]): void {
  store.records.set(cacheKey(organizationId, month), records);
}

export function getPayrollRecords(organizationId: string, month?: string): PayrollRecord[] {
  if (month) return store.records.get(cacheKey(organizationId, month)) ?? [];
  // No month: return everything cached for THIS org only — never spill rows
  // belonging to a different org.
  const prefix = `${organizationId}|`;
  const all: PayrollRecord[] = [];
  store.records.forEach((list, key) => {
    if (key.startsWith(prefix)) all.push(...list);
  });
  return all;
}

export function clearPayrollRecords(organizationId: string, month?: string): void {
  if (month) {
    store.records.delete(cacheKey(organizationId, month));
    return;
  }
  const prefix = `${organizationId}|`;
  for (const key of Array.from(store.records.keys())) {
    if (key.startsWith(prefix)) store.records.delete(key);
  }
}

export function getStoredMonths(organizationId: string): string[] {
  const prefix = `${organizationId}|`;
  return Array.from(store.records.keys())
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length))
    .sort()
    .reverse();
}

export function getSampleEmployees(): SampleEmployee[] {
  return [];
}

export function getSampleAttendanceForMonth(_month: string): SampleAttendance[] {
  return [];
}
