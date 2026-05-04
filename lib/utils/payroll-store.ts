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
}

const DEFAULT_POLICY: PayrollPolicy = {
  weeklyOffDays: [0],
  payableBasis: 'monthDays',
};

export interface PayrollRecord {
  employeeId: string;
  employeeName: string;
  email: string;
  totalSalary: number;
  workingDays: number;
  workingHours: number;
  baseSalary: number;
  hourlyRate: number;
  grossSalary: number;
  deductions: {
    pf: number;
    tax: number;
    insurance: number;
    other: number;
  };
  netSalary: number;
  status: 'pending' | 'processed';
  month: string;
  designation?: string;
  department?: string;
  generatedAt?: string;
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
      return { weeklyOffDays, payableBasis };
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

    const out: SampleAttendance[] = [];
    for (const row of rows) {
      const email = row.user?.email
        ? String(row.user.email).toLowerCase()
        : null;
      if (!email) continue;
      out.push({
        email,
        matchKey: `email:${email}`,
        date: row.date,
        checkInTime: row.checkInTime ?? '',
        checkOutTime: row.checkOutTime ?? '',
      });
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
          let rows = await (prisma[key] as any).findMany({ where: sharedWhere });
          if (rows.length === 0 && Object.keys(where).length > 0) {
            const fallbackWhere =
              num === '14'
                ? { formId: formInfo.id, organizationId: formInfo.organizationId }
                : { formId: formInfo.id };
            rows = await (prisma[key] as any).findMany({ where: fallbackWhere });
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
    let rows = await prisma.formRecord.findMany({
      where: { ...baseWhere, organizationId: formInfo.organizationId },
      include: { user: { select: { email: true, username: true } } },
    });
    if (rows.length === 0 && Object.keys(where).length > 0) {
      rows = await prisma.formRecord.findMany({
        where: { formId: formInfo.id, organizationId: formInfo.organizationId },
        include: { user: { select: { email: true, username: true } } },
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
  if (!formInfo) return [];

  const fields = setup?.employee.fields ?? {};
  const fallbackSalary = setup?.defaultBaseSalary ?? 0;
  const rows = await readRecords(formInfo);
  const employees: SampleEmployee[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const data = flattenRecordData(row.recordData, formInfo.labels);
    const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;

    const rawEmail = pickWithMapping(data, fields.email, formInfo.labels, EMAIL_FALLBACKS);
    const rawEmpId = pickWithMapping(data, fields.employeeId, formInfo.labels, EMP_ID_FALLBACKS);

    const email = rawEmail ? String(rawEmail).toLowerCase() : userEmail;
    const employeeId =
      (rawEmpId ? String(rawEmpId) : null) ||
      row.employee_id ||
      (email ? email.split('@')[0].toUpperCase() : `EMP-${row.id.slice(0, 6)}`);

    const matchKeys: string[] = [];
    if (email) matchKeys.push(`email:${email}`);
    if (employeeId) matchKeys.push(`empId:${String(employeeId).toLowerCase()}`);
    if (userEmail && (!email || userEmail !== email)) matchKeys.push(`email:${userEmail}`);
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

    employees.push({
      employeeId: String(employeeId),
      employeeName: String(employeeName),
      email: email || '',
      designation: String(designation || ''),
      department: String(department || ''),
      totalSalary,
      matchKeys,
      dateOfJoining,
      dateOfLeaving,
    });
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

export async function getLeavesFromDB(
  organizationId: string,
  month: string,
): Promise<SampleLeave[]> {
  const setup = await loadSetup(organizationId);
  // Leave form is optional; loadSetup() returns the form info inside `leave`.
  // Without a configured form, we silently return [] so existing tenants keep
  // working — the calculator will fall back to "no approved leaves".
  const formInfo = await resolveFromConfigOrName(
    organizationId,
    setup?.leave ?? null,
    LEAVE_FORM_NAMES,
  );
  if (!formInfo) return [];

  const fields = setup?.leave.fields ?? {};
  const rows = await readRecords(formInfo);
  const leaves: SampleLeave[] = [];

  // Build the inclusive month window so we can clip leaves that span multiple
  // months — only the in-month portion participates in this run's payroll.
  const [yStr, mStr] = month.split('-');
  const yearN = Number(yStr);
  const monthN = Number(mStr);
  const monthStart = `${month}-01`;
  const lastDay = new Date(yearN, monthN, 0).getDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

  for (const row of rows) {
    const data = flattenRecordData(row.recordData, formInfo.labels);
    const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;

    const rawEmail = pickWithMapping(data, fields.email, formInfo.labels, EMAIL_FALLBACKS);
    const rawEmpId = pickWithMapping(data, fields.employeeId, formInfo.labels, EMP_ID_FALLBACKS);
    const email = rawEmail ? String(rawEmail).toLowerCase() : userEmail;
    const empId = rawEmpId ? String(rawEmpId).toLowerCase() : null;
    const matchKey = email
      ? `email:${email}`
      : empId
        ? `empId:${empId}`
        : userEmail
          ? `email:${userEmail}`
          : null;
    if (!matchKey) continue;

    const startRaw = pickWithMapping(data, fields.startDate, formInfo.labels, LEAVE_START_FALLBACKS);
    const endRaw = pickWithMapping(data, fields.endDate, formInfo.labels, LEAVE_END_FALLBACKS);
    const start = toDateStr(startRaw);
    if (!start) continue;
    const end = toDateStr(endRaw) ?? start;

    // Cheap month overlap test before doing any further work — most rows will
    // belong to other months, so bail early.
    if (end < monthStart || start > monthEnd) continue;

    const leaveTypeRaw = pickWithMapping(data, fields.leaveType, formInfo.labels, LEAVE_TYPE_FALLBACKS);
    const leaveType = leaveTypeRaw ? String(leaveTypeRaw).trim() : '';

    // If the admin DID map a status field, we filter strictly. If they DIDN'T
    // map one, we trust the form workflow's existing gate (e.g. only approved
    // leaves get submitted) and treat every row as approved. This matches how
    // the rest of the payroll engine treats unmapped optional fields.
    const statusFieldMapped = !!fields.status;
    const status = statusFieldMapped
      ? normaliseStatus(pickWithMapping(data, fields.status, formInfo.labels, LEAVE_STATUS_FALLBACKS))
      : 'approved';
    if (statusFieldMapped && status !== 'approved') continue;

    const halfDayRaw = pickWithMapping(data, fields.halfDay, formInfo.labels, LEAVE_HALF_DAY_FALLBACKS);
    const isHalfDay = isTruthyHalfDay(halfDayRaw);

    const daysRaw = pickWithMapping(data, fields.days, formInfo.labels, LEAVE_DAYS_FALLBACKS);
    const days = daysRaw === undefined || daysRaw === null || daysRaw === ''
      ? null
      : toNumber(daysRaw, NaN);

    leaves.push({
      matchKey,
      email: email ?? '',
      leaveType,
      startDate: start,
      endDate: end,
      isHalfDay,
      days: Number.isFinite(days as number) ? (days as number) : null,
      status,
    });
  }

  return leaves;
}

export async function getHolidaysFromDB(
  organizationId: string,
  month: string,
): Promise<SampleHoliday[]> {
  const setup = await loadSetup(organizationId);
  const formInfo = await resolveFromConfigOrName(
    organizationId,
    setup?.holiday ?? null,
    HOLIDAY_FORM_NAMES,
  );
  if (!formInfo) return [];

  const fields = setup?.holiday.fields ?? {};
  const rows = await readRecords(formInfo);
  const holidays: SampleHoliday[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const data = flattenRecordData(row.recordData, formInfo.labels);
    const dateValue = pickWithMapping(data, fields.date, formInfo.labels, HOLIDAY_DATE_FALLBACKS) ?? row.date;
    const dateStr = toDateStr(dateValue);
    if (!dateStr) continue;
    if (!inMonth(dateStr, month)) continue;
    if (seen.has(dateStr)) continue; // de-dupe duplicate rows for the same date
    seen.add(dateStr);

    const nameRaw = pickWithMapping(data, fields.name, formInfo.labels, HOLIDAY_NAME_FALLBACKS);
    holidays.push({
      date: dateStr,
      name: nameRaw ? String(nameRaw) : '',
    });
  }

  return holidays;
}

export async function getAttendanceFromDB(organizationId: string, month: string): Promise<SampleAttendance[]> {
  const setup = await loadSetup(organizationId);
  const checkInForm = await resolveFromConfigOrName(organizationId, setup?.checkIn ?? null, CHECK_IN_FORM_NAMES);
  const checkOutForm = await resolveFromConfigOrName(organizationId, setup?.checkOut ?? null, CHECK_OUT_FORM_NAMES);

  // Removed the historical "no check-in form configured → return []" early
  // exit. The native Attendance table is now a valid source on its own, so
  // even orgs without an attendance form get their widget punches into payroll.
  const checkInFields = setup?.checkIn.fields ?? {};
  const checkOutFields = setup?.checkOut.fields ?? {};

  const checkInRows = checkInForm ? await readRecords(checkInForm) : [];
  const checkOutRows = checkOutForm ? await readRecords(checkOutForm) : [];

  const dailyMap = new Map<string, SampleAttendance>();

  const buildMatchKey = (
    data: any,
    fields: Record<string, string | null>,
    formLabels: Record<string, string>,
    userEmail: string | null,
  ): { matchKey: string; email: string } | null => {
    const rawEmail = pickWithMapping(data, fields.email, formLabels, EMAIL_FALLBACKS);
    const rawEmpId = pickWithMapping(data, fields.employeeId, formLabels, EMP_ID_FALLBACKS);
    const email = rawEmail ? String(rawEmail).toLowerCase() : userEmail;
    const empId = rawEmpId ? String(rawEmpId).toLowerCase() : null;
    if (email) return { matchKey: `email:${email}`, email };
    if (empId) return { matchKey: `empId:${empId}`, email: '' };
    if (userEmail) return { matchKey: `email:${userEmail}`, email: userEmail };
    return null;
  };

  if (checkInForm) {
    for (const row of checkInRows) {
      const data = flattenRecordData(row.recordData, checkInForm.labels);
      const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;
      const id = buildMatchKey(data, checkInFields, checkInForm.labels, userEmail);

      const dateValue =
        pickWithMapping(
          data,
          checkInFields.date,
          checkInForm.labels,
          CHECKIN_DATE_FALLBACKS,
        ) ?? row.date;
      const checkInTime = pickWithMapping(
        data,
        checkInFields.checkInTime,
        checkInForm.labels,
        CHECKIN_TIME_FALLBACKS,
      );

      const dateStr = toDateStr(dateValue);
      const inTime = toTimeStr(checkInTime);

      if (!id || !dateStr || !inTime) continue;
      if (!inMonth(dateStr, month)) continue;

      const key = `${id.matchKey}_${dateStr}`;
      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          email: id.email,
          matchKey: id.matchKey,
          date: dateStr,
          checkInTime: inTime,
          checkOutTime: '',
        });
      }
    }
  }

  if (checkOutForm) {
    for (const row of checkOutRows) {
      const data = flattenRecordData(row.recordData, checkOutForm.labels);
      const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;
      const id = buildMatchKey(data, checkOutFields, checkOutForm.labels, userEmail);

      const dateValue =
        pickWithMapping(
          data,
          checkOutFields.date,
          checkOutForm.labels,
          CHECKOUT_DATE_FALLBACKS,
        ) ?? row.date;
      const checkOutTime = pickWithMapping(
        data,
        checkOutFields.checkOutTime,
        checkOutForm.labels,
        CHECKOUT_TIME_FALLBACKS,
      );

      const dateStr = toDateStr(dateValue);
      const outTime = toTimeStr(checkOutTime);

      if (!id || !dateStr || !outTime) continue;
      if (!inMonth(dateStr, month)) continue;

      const key = `${id.matchKey}_${dateStr}`;
      const existing = dailyMap.get(key);
      if (existing) {
        existing.checkOutTime = outTime;
      } else {
        dailyMap.set(key, {
          email: id.email,
          matchKey: id.matchKey,
          date: dateStr,
          checkInTime: '09:00',
          checkOutTime: outTime,
        });
      }
    }
  }

  if (checkInForm) for (const row of checkInRows) {
    const data = flattenRecordData(row.recordData, checkInForm.labels);
    const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;
    const id = buildMatchKey(data, checkInFields, checkInForm.labels, userEmail);
    const dateValue =
      pickWithMapping(
        data,
        checkInFields.date,
        checkInForm.labels,
        CHECKIN_DATE_FALLBACKS,
      ) ?? row.date;
    const checkOutTime = pickValue(data, CHECKOUT_TIME_FALLBACKS);
    const dateStr = toDateStr(dateValue);
    const outTime = toTimeStr(checkOutTime);

    if (!id || !dateStr || !outTime) continue;
    if (!inMonth(dateStr, month)) continue;

    const key = `${id.matchKey}_${dateStr}`;
    const existing = dailyMap.get(key);
    if (existing && !existing.checkOutTime) {
      existing.checkOutTime = outTime;
    }
  }

  // Merge in native Attendance table rows. The widget at /api/attendance/punch
  // writes here. We let native rows OVERRIDE form-based rows for the same
  // (user, date) because native has real server-stamped timestamps while the
  // form path often has hand-typed strings.
  const nativeRows = await getNativeAttendanceForMonth(organizationId, month);
  for (const n of nativeRows) {
    const key = `${n.matchKey}_${n.date}`;
    const prior = dailyMap.get(key);
    if (!prior) {
      dailyMap.set(key, n);
      continue;
    }
    // Prefer non-empty native fields; fall back to whatever the form had.
    dailyMap.set(key, {
      email: n.email || prior.email,
      matchKey: n.matchKey,
      date: n.date,
      checkInTime: n.checkInTime || prior.checkInTime,
      checkOutTime: n.checkOutTime || prior.checkOutTime,
    });
  }

  return Array.from(dailyMap.values()).filter((r) => r.checkInTime || r.checkOutTime);
}

export async function getEmployeeFormsStatus(organizationId: string): Promise<{
  hasEmployeeForm: boolean;
  hasCheckInForm: boolean;
  hasCheckOutForm: boolean;
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

  const [empByName, ciByName, coByName, empConfigName, ciConfigName, coConfigName] = await Promise.all([
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
  ]);

  const employeeFormName = empConfigName ?? empByName?.name;
  const checkInFormName = ciConfigName ?? ciByName?.name;
  const checkOutFormName = coConfigName ?? coByName?.name;

  return {
    hasEmployeeForm: !!employeeFormName,
    hasCheckInForm: !!checkInFormName,
    hasCheckOutForm: !!checkOutFormName,
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
