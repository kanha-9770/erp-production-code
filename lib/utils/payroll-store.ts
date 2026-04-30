import { prisma } from '@/lib/prisma';

export interface SampleEmployee {
  employeeId: string;
  employeeName: string;
  email: string;
  designation: string;
  department: string;
  totalSalary: number;
}

export interface SampleAttendance {
  email: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
}

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
}

declare global {
  // eslint-disable-next-line no-var
  var __payrollStore: {
    records: Map<string, PayrollRecord[]>;
  } | undefined;
}

const store = globalThis.__payrollStore ?? { records: new Map<string, PayrollRecord[]>() };
if (!globalThis.__payrollStore) globalThis.__payrollStore = store;

const EMPLOYEE_FORM_NAMES = ['Employee Profile', 'Employee Profiles', 'Employees', 'Employee'];
const CHECK_IN_FORM_NAMES = ['Check-In', 'Check In', 'CheckIn', 'Attendance Check-In', 'Check-in'];
const CHECK_OUT_FORM_NAMES = ['Check-Out', 'Check Out', 'CheckOut', 'Attendance Check-Out', 'Check-out'];

const SETUP_META_KEY = 'payroll-v2';

interface PayrollSetupShape {
  employee: { formId: string | null; fields: Record<string, string | null> };
  checkIn: { formId: string | null; fields: Record<string, string | null> };
  checkOut: { formId: string | null; fields: Record<string, string | null> };
}

async function loadSetup(): Promise<PayrollSetupShape | null> {
  try {
    const config = await prisma.payrollConfiguration.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    const m: any = config?.attendanceFieldMappings;
    if (m && typeof m === 'object' && m._meta === SETUP_META_KEY) {
      return {
        employee: m.employee ?? { formId: null, fields: {} },
        checkIn: m.checkIn ?? { formId: null, fields: {} },
        checkOut: m.checkOut ?? { formId: null, fields: {} },
      };
    }
    return null;
  } catch (err) {
    console.warn('[payroll] failed to load setup:', err);
    return null;
  }
}

async function getFieldLabelMap(formId: string): Promise<Record<string, string>> {
  try {
    const form = await prisma.form.findUnique({
      where: { id: formId },
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

async function findFormByNames(names: string[]): Promise<{ id: string; storageTable: string | null } | null> {
  const form = await prisma.form.findFirst({
    where: { name: { in: names, mode: 'insensitive' } },
    include: { tableMapping: true },
  });
  if (!form) return null;
  return { id: form.id, storageTable: form.tableMapping?.storageTable ?? null };
}

async function readRecords(formInfo: { id: string; storageTable: string | null }, where: any = {}): Promise<any[]> {
  const baseWhere = { formId: formInfo.id, ...where };

  if (formInfo.storageTable) {
    const num = formInfo.storageTable.match(/\d+$/)?.[0];
    if (num) {
      const key = `formRecord${num}` as keyof typeof prisma;
      if (key in prisma) {
        try {
          const rows = await (prisma[key] as any).findMany({ where: baseWhere });
          if (rows.length > 0) return rows;
        } catch (err) {
          console.warn(`[payroll] Failed reading ${String(key)}:`, err);
        }
      }
    }
  }

  try {
    const rows = await prisma.formRecord.findMany({
      where: baseWhere,
      include: { user: { select: { email: true, username: true } } },
    });
    return rows;
  } catch (err) {
    console.warn('[payroll] Failed reading unified formRecord:', err);
    return [];
  }
}

async function resolveFromConfigOrName(
  configured: { formId: string | null } | null,
  fallbackNames: string[],
): Promise<{ id: string; storageTable: string | null; labels: Record<string, string> } | null> {
  if (configured?.formId) {
    const form = await prisma.form.findUnique({
      where: { id: configured.formId },
      include: { tableMapping: true },
    });
    if (form) {
      const labels = await getFieldLabelMap(form.id);
      return { id: form.id, storageTable: form.tableMapping?.storageTable ?? null, labels };
    }
  }
  const found = await findFormByNames(fallbackNames);
  if (!found) return null;
  const labels = await getFieldLabelMap(found.id);
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

export async function getEmployeesFromDB(): Promise<SampleEmployee[]> {
  const setup = await loadSetup();
  const formInfo = await resolveFromConfigOrName(setup?.employee ?? null, EMPLOYEE_FORM_NAMES);
  if (!formInfo) return [];

  const fields = setup?.employee.fields ?? {};
  const rows = await readRecords(formInfo);
  const employees: SampleEmployee[] = [];

  for (const row of rows) {
    const data = row.recordData ?? {};
    const userEmail = row.user?.email;

    const email =
      pickWithMapping(data, fields.email, formInfo.labels, ['email', 'Email', 'emailId', 'employeeEmail']) ||
      userEmail;
    if (!email) continue;

    const employeeId =
      pickWithMapping(data, fields.employeeId, formInfo.labels, [
        'employeeId',
        'employee_id',
        'empId',
        'EmployeeID',
      ]) ||
      row.employee_id ||
      String(email).split('@')[0].toUpperCase();

    const employeeName =
      pickWithMapping(data, fields.name, formInfo.labels, [
        'employeeName',
        'name',
        'fullName',
        'employee_name',
        'Name',
      ]) ||
      row.user?.username ||
      String(email).split('@')[0];

    const totalSalary = toNumber(
      pickWithMapping(data, fields.salary, formInfo.labels, [
        'totalSalary',
        'salary',
        'CTC',
        'monthlySalary',
        'givenSalary',
        'baseSalary',
      ]),
      0,
    );

    if (totalSalary <= 0) continue;

    const designation =
      pickWithMapping(data, fields.designation, formInfo.labels, ['designation', 'jobTitle', 'role', 'position']) ||
      '';
    const department =
      pickWithMapping(data, fields.department, formInfo.labels, ['department', 'dept', 'team']) || '';

    employees.push({
      employeeId: String(employeeId),
      employeeName: String(employeeName),
      email: String(email).toLowerCase(),
      designation: String(designation || ''),
      department: String(department || ''),
      totalSalary,
    });
  }

  const seen = new Set<string>();
  return employees.filter((e) => {
    if (seen.has(e.email)) return false;
    seen.add(e.email);
    return true;
  });
}

export async function getAttendanceFromDB(month: string): Promise<SampleAttendance[]> {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  const start = new Date(year, monthIdx, 1);
  const end = new Date(year, monthIdx + 1, 0, 23, 59, 59);

  const setup = await loadSetup();
  const checkInForm = await resolveFromConfigOrName(setup?.checkIn ?? null, CHECK_IN_FORM_NAMES);
  const checkOutForm = await resolveFromConfigOrName(setup?.checkOut ?? null, CHECK_OUT_FORM_NAMES);

  if (!checkInForm) return [];

  const checkInFields = setup?.checkIn.fields ?? {};
  const checkOutFields = setup?.checkOut.fields ?? {};

  const checkInRows = await readRecords(checkInForm, { date: { gte: start, lte: end } });
  const checkOutRows = checkOutForm
    ? await readRecords(checkOutForm, { date: { gte: start, lte: end } })
    : [];

  const dailyMap = new Map<string, SampleAttendance>();

  for (const row of checkInRows) {
    const data = row.recordData ?? {};
    const userEmail = row.user?.email;
    const email =
      pickWithMapping(data, checkInFields.email, checkInForm.labels, [
        'email',
        'Email',
        'employeeEmail',
      ]) ||
      userEmail ||
      pickValue(data, ['employeeId', 'employee_id']);
    const dateValue =
      pickWithMapping(data, checkInFields.date, checkInForm.labels, ['date', 'attendanceDate', 'Date']) ??
      row.date;
    const checkInTime = pickWithMapping(data, checkInFields.checkInTime, checkInForm.labels, [
      'checkInTime',
      'checkIn',
      'inTime',
      'check_in_time',
    ]);

    const dateStr = toDateStr(dateValue);
    const inTime = toTimeStr(checkInTime);

    if (!email || !dateStr || !inTime) continue;

    const key = `${String(email).toLowerCase()}_${dateStr}`;
    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        email: String(email).toLowerCase(),
        date: dateStr,
        checkInTime: inTime,
        checkOutTime: '',
      });
    }
  }

  if (checkOutForm) {
    for (const row of checkOutRows) {
      const data = row.recordData ?? {};
      const userEmail = row.user?.email;
      const email =
        pickWithMapping(data, checkOutFields.email, checkOutForm.labels, [
          'email',
          'Email',
          'employeeEmail',
        ]) ||
        userEmail ||
        pickValue(data, ['employeeId', 'employee_id']);
      const dateValue =
        pickWithMapping(data, checkOutFields.date, checkOutForm.labels, ['date', 'attendanceDate', 'Date']) ??
        row.date;
      const checkOutTime = pickWithMapping(data, checkOutFields.checkOutTime, checkOutForm.labels, [
        'checkOutTime',
        'checkOut',
        'outTime',
        'check_out_time',
      ]);

      const dateStr = toDateStr(dateValue);
      const outTime = toTimeStr(checkOutTime);

      if (!email || !dateStr || !outTime) continue;

      const key = `${String(email).toLowerCase()}_${dateStr}`;
      const existing = dailyMap.get(key);
      if (existing) {
        existing.checkOutTime = outTime;
      } else {
        dailyMap.set(key, {
          email: String(email).toLowerCase(),
          date: dateStr,
          checkInTime: '09:00',
          checkOutTime: outTime,
        });
      }
    }
  }

  for (const row of checkInRows) {
    const data = row.recordData ?? {};
    const userEmail = row.user?.email;
    const email =
      pickWithMapping(data, checkInFields.email, checkInForm.labels, [
        'email',
        'Email',
        'employeeEmail',
      ]) ||
      userEmail ||
      pickValue(data, ['employeeId', 'employee_id']);
    const dateValue =
      pickWithMapping(data, checkInFields.date, checkInForm.labels, ['date', 'attendanceDate', 'Date']) ??
      row.date;
    const checkOutTime = pickValue(data, ['checkOutTime', 'checkOut', 'outTime']);
    const dateStr = toDateStr(dateValue);
    const outTime = toTimeStr(checkOutTime);

    if (!email || !dateStr || !outTime) continue;

    const key = `${String(email).toLowerCase()}_${dateStr}`;
    const existing = dailyMap.get(key);
    if (existing && !existing.checkOutTime) {
      existing.checkOutTime = outTime;
    }
  }

  return Array.from(dailyMap.values()).filter((r) => r.checkInTime && r.checkOutTime);
}

export async function getEmployeeFormsStatus(): Promise<{
  hasEmployeeForm: boolean;
  hasCheckInForm: boolean;
  hasCheckOutForm: boolean;
  employeeFormName?: string;
  checkInFormName?: string;
  checkOutFormName?: string;
}> {
  const [emp, ci, co] = await Promise.all([
    prisma.form.findFirst({
      where: { name: { in: EMPLOYEE_FORM_NAMES, mode: 'insensitive' } },
      select: { name: true },
    }),
    prisma.form.findFirst({
      where: { name: { in: CHECK_IN_FORM_NAMES, mode: 'insensitive' } },
      select: { name: true },
    }),
    prisma.form.findFirst({
      where: { name: { in: CHECK_OUT_FORM_NAMES, mode: 'insensitive' } },
      select: { name: true },
    }),
  ]);
  return {
    hasEmployeeForm: !!emp,
    hasCheckInForm: !!ci,
    hasCheckOutForm: !!co,
    employeeFormName: emp?.name,
    checkInFormName: ci?.name,
    checkOutFormName: co?.name,
  };
}

export function setPayrollRecords(month: string, records: PayrollRecord[]): void {
  store.records.set(month, records);
}

export function getPayrollRecords(month?: string): PayrollRecord[] {
  if (month) return store.records.get(month) ?? [];
  const all: PayrollRecord[] = [];
  store.records.forEach((list) => all.push(...list));
  return all;
}

export function clearPayrollRecords(month?: string): void {
  if (month) store.records.delete(month);
  else store.records.clear();
}

export function getStoredMonths(): string[] {
  return Array.from(store.records.keys()).sort().reverse();
}

export function getSampleEmployees(): SampleEmployee[] {
  return [];
}

export function getSampleAttendanceForMonth(_month: string): SampleAttendance[] {
  return [];
}
