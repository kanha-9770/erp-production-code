import { prisma } from '@/lib/prisma';

export interface SampleEmployee {
  employeeId: string;
  employeeName: string;
  email: string;
  designation: string;
  department: string;
  totalSalary: number;
  matchKeys: string[];
}

export interface SampleAttendance {
  email: string;
  matchKey: string;
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
  defaultBaseSalary?: number | null;
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
        defaultBaseSalary: typeof m.defaultBaseSalary === 'number' ? m.defaultBaseSalary : null,
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

function flattenRecordData(recordData: any): Record<string, any> {
  if (!recordData || typeof recordData !== 'object') return {};
  const plain: Record<string, any> = {};

  if (recordData.sections && typeof recordData.sections === 'object') {
    for (const section of Object.values(recordData.sections) as any[]) {
      const fields = section?.fields;
      if (fields && typeof fields === 'object') {
        for (const [fieldId, val] of Object.entries(fields)) {
          plain[fieldId] = val && typeof val === 'object' && 'value' in val ? (val as any).value : val;
        }
      }
    }
  }

  if (recordData.subforms && typeof recordData.subforms === 'object') {
    for (const subform of Object.values(recordData.subforms) as any[]) {
      const fields = subform?.fields;
      if (fields && typeof fields === 'object') {
        for (const [fieldId, val] of Object.entries(fields)) {
          plain[fieldId] = val && typeof val === 'object' && 'value' in val ? (val as any).value : val;
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

export async function diagnose(month: string): Promise<any> {
  const setup = await loadSetup();
  const employeeForm = await resolveFromConfigOrName(setup?.employee ?? null, EMPLOYEE_FORM_NAMES);
  const checkInForm = await resolveFromConfigOrName(setup?.checkIn ?? null, CHECK_IN_FORM_NAMES);
  const checkOutForm = await resolveFromConfigOrName(setup?.checkOut ?? null, CHECK_OUT_FORM_NAMES);

  const result: any = {
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
      const data = flattenRecordData(row.recordData);
      const email =
        pickWithMapping(data, fields.email, employeeForm.labels, ['email', 'Email', 'employeeEmail']) ||
        row.user?.email;
      const empId = pickWithMapping(data, fields.employeeId, employeeForm.labels, [
        'employeeId',
        'employee_id',
        'empId',
      ]);
      const mappedSalary = toNumber(
        pickWithMapping(data, fields.salary, employeeForm.labels, [
          'totalSalary',
          'salary',
          'CTC',
          'givenSalary',
        ]),
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
      const data = flattenRecordData(row.recordData);
      const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;
      const email =
        pickWithMapping(data, fields.email, formInfo.labels, ['email', 'Email', 'employeeEmail']) ||
        userEmail;
      const empId = pickWithMapping(data, fields.employeeId, formInfo.labels, [
        'employeeId',
        'employee_id',
        'empId',
      ]);
      const dateValue =
        pickWithMapping(data, fields.date, formInfo.labels, ['date', 'attendanceDate']) ?? row.date;
      const time = pickWithMapping(
        data,
        fields[timeKey] ?? null,
        formInfo.labels,
        timeKey === 'checkInTime'
          ? ['checkInTime', 'checkIn', 'inTime']
          : ['checkOutTime', 'checkOut', 'outTime'],
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

async function findFormByNames(names: string[]): Promise<{ id: string; storageTable: string | null } | null> {
  const form = await prisma.form.findFirst({
    where: { name: { in: names, mode: 'insensitive' } },
    include: { tableMapping: true },
  });
  if (!form) return null;
  return { id: form.id, storageTable: form.tableMapping?.storageTable ?? null };
}

async function readRecords(
  formInfo: { id: string; storageTable: string | null },
  where: any = {},
): Promise<any[]> {
  const baseWhere = { formId: formInfo.id, ...where };

  if (formInfo.storageTable) {
    const num = formInfo.storageTable.match(/\d+$/)?.[0];
    if (num) {
      const key = `formRecord${num}` as keyof typeof prisma;
      if (key in prisma) {
        try {
          let rows = await (prisma[key] as any).findMany({ where: baseWhere });
          if (rows.length === 0 && Object.keys(where).length > 0) {
            rows = await (prisma[key] as any).findMany({ where: { formId: formInfo.id } });
          }
          if (rows.length > 0) return rows;
        } catch (err) {
          console.warn(`[payroll] Failed reading ${String(key)}:`, err);
        }
      }
    }
  }

  try {
    let rows = await prisma.formRecord.findMany({
      where: baseWhere,
      include: { user: { select: { email: true, username: true } } },
    });
    if (rows.length === 0 && Object.keys(where).length > 0) {
      rows = await prisma.formRecord.findMany({
        where: { formId: formInfo.id },
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
  const fallbackSalary = setup?.defaultBaseSalary ?? 0;
  const rows = await readRecords(formInfo);
  const employees: SampleEmployee[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const data = flattenRecordData(row.recordData);
    const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;

    const rawEmail = pickWithMapping(data, fields.email, formInfo.labels, [
      'email',
      'Email',
      'emailId',
      'employeeEmail',
    ]);
    const rawEmpId = pickWithMapping(data, fields.employeeId, formInfo.labels, [
      'employeeId',
      'employee_id',
      'empId',
      'EmployeeID',
    ]);

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

    const firstName = pickWithMapping(data, null, formInfo.labels, [
      'firstName',
      'First Name',
      'fld_emp_first_name',
    ]);
    const lastName = pickWithMapping(data, null, formInfo.labels, [
      'lastName',
      'Last Name',
      'fld_emp_last_name',
    ]);
    const composedName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const employeeName =
      pickWithMapping(data, fields.name, formInfo.labels, [
        'employeeName',
        'name',
        'fullName',
        'employee_name',
        'Name',
      ]) ||
      composedName ||
      row.user?.username ||
      (email ? email.split('@')[0] : String(employeeId));

    const mappedSalary = toNumber(
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
    const totalSalary = mappedSalary > 0 ? mappedSalary : fallbackSalary;

    const designation =
      pickWithMapping(data, fields.designation, formInfo.labels, [
        'designation',
        'jobTitle',
        'role',
        'position',
      ]) || '';
    const department =
      pickWithMapping(data, fields.department, formInfo.labels, ['department', 'dept', 'team']) || '';

    employees.push({
      employeeId: String(employeeId),
      employeeName: String(employeeName),
      email: email || '',
      designation: String(designation || ''),
      department: String(department || ''),
      totalSalary,
      matchKeys,
    });
  }

  return employees;
}

export async function getAttendanceFromDB(month: string): Promise<SampleAttendance[]> {
  const setup = await loadSetup();
  const checkInForm = await resolveFromConfigOrName(setup?.checkIn ?? null, CHECK_IN_FORM_NAMES);
  const checkOutForm = await resolveFromConfigOrName(setup?.checkOut ?? null, CHECK_OUT_FORM_NAMES);

  if (!checkInForm) return [];

  const checkInFields = setup?.checkIn.fields ?? {};
  const checkOutFields = setup?.checkOut.fields ?? {};

  const checkInRows = await readRecords(checkInForm);
  const checkOutRows = checkOutForm ? await readRecords(checkOutForm) : [];

  const dailyMap = new Map<string, SampleAttendance>();

  const buildMatchKey = (
    data: any,
    fields: Record<string, string | null>,
    formLabels: Record<string, string>,
    userEmail: string | null,
  ): { matchKey: string; email: string } | null => {
    const rawEmail = pickWithMapping(data, fields.email, formLabels, ['email', 'Email', 'employeeEmail']);
    const rawEmpId = pickWithMapping(data, fields.employeeId, formLabels, [
      'employeeId',
      'employee_id',
      'empId',
    ]);
    const email = rawEmail ? String(rawEmail).toLowerCase() : userEmail;
    const empId = rawEmpId ? String(rawEmpId).toLowerCase() : null;
    if (email) return { matchKey: `email:${email}`, email };
    if (empId) return { matchKey: `empId:${empId}`, email: '' };
    if (userEmail) return { matchKey: `email:${userEmail}`, email: userEmail };
    return null;
  };

  for (const row of checkInRows) {
    const data = flattenRecordData(row.recordData);
    const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;
    const id = buildMatchKey(data, checkInFields, checkInForm.labels, userEmail);

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

  if (checkOutForm) {
    for (const row of checkOutRows) {
      const data = flattenRecordData(row.recordData);
      const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;
      const id = buildMatchKey(data, checkOutFields, checkOutForm.labels, userEmail);

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

  for (const row of checkInRows) {
    const data = flattenRecordData(row.recordData);
    const userEmail = row.user?.email ? String(row.user.email).toLowerCase() : null;
    const id = buildMatchKey(data, checkInFields, checkInForm.labels, userEmail);
    const dateValue =
      pickWithMapping(data, checkInFields.date, checkInForm.labels, ['date', 'attendanceDate', 'Date']) ??
      row.date;
    const checkOutTime = pickValue(data, ['checkOutTime', 'checkOut', 'outTime']);
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

  return Array.from(dailyMap.values()).filter((r) => r.checkInTime || r.checkOutTime);
}

export async function getEmployeeFormsStatus(): Promise<{
  hasEmployeeForm: boolean;
  hasCheckInForm: boolean;
  hasCheckOutForm: boolean;
  hasSavedSetup: boolean;
  employeeFormName?: string;
  checkInFormName?: string;
  checkOutFormName?: string;
}> {
  const setup = await loadSetup();

  const lookupName = async (formId: string | null | undefined) => {
    if (!formId) return null;
    const f = await prisma.form.findUnique({ where: { id: formId }, select: { name: true } });
    return f?.name ?? null;
  };

  const [empByName, ciByName, coByName, empConfigName, ciConfigName, coConfigName] = await Promise.all([
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
