import {
  getAttendanceFromDB,
  getEmployeesFromDB,
  PayrollRecord,
  SampleAttendance,
  SampleEmployee,
} from './payroll-store';

interface PayrollCalculation extends PayrollRecord {}

const STANDARD_WORKING_DAYS = 22;
const STANDARD_HOURS_PER_DAY = 8;
const PF_PERCENT = 12;
const TAX_PERCENT = 5;
const INSURANCE_FIXED = 500;
const LUNCH_BREAK_HOURS = 1;

const DEFAULT_DAY_HOURS = 8;

export function calculateWorkingHours(checkInTime: string, checkOutTime?: string): number {
  if (!checkInTime && !checkOutTime) return 0;
  if (!checkOutTime) return DEFAULT_DAY_HOURS;
  if (!checkInTime) return DEFAULT_DAY_HOURS;
  const [inH, inM] = checkInTime.split(':').map(Number);
  const [outH, outM] = checkOutTime.split(':').map(Number);
  const inMinutes = inH * 60 + inM;
  const outMinutes = outH * 60 + outM;
  let diffMinutes = outMinutes - inMinutes;
  if (diffMinutes < 0) diffMinutes += 24 * 60;
  return Math.max(0, diffMinutes / 60 - LUNCH_BREAK_HOURS);
}

function calculateForEmployee(
  employee: SampleEmployee,
  attendance: SampleAttendance[],
  month: string,
): PayrollCalculation {
  const baseSalary = employee.totalSalary;
  const workingDays = attendance.length;
  const totalWorkingHours = attendance.reduce(
    (sum, a) => sum + calculateWorkingHours(a.checkInTime, a.checkOutTime),
    0,
  );

  const hourlyRate = baseSalary / (STANDARD_WORKING_DAYS * STANDARD_HOURS_PER_DAY);
  const grossSalary = hourlyRate * totalWorkingHours;

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
    workingDays,
    workingHours: Math.round(totalWorkingHours * 10) / 10,
    baseSalary,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    grossSalary: Math.round(grossSalary),
    deductions: { pf, tax, insurance, other },
    netSalary,
    status: workingDays > 0 ? 'processed' : 'pending',
    month,
    designation: employee.designation,
    department: employee.department,
    generatedAt: new Date().toISOString(),
  };
}

export async function calculatePayroll(
  organizationId: string,
  month: string,
): Promise<PayrollCalculation[]> {
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const [employees, attendance] = await Promise.all([
    getEmployeesFromDB(organizationId),
    getAttendanceFromDB(organizationId, targetMonth),
  ]);

  const byKey = new Map<string, SampleAttendance[]>();
  attendance.forEach((a) => {
    if (!byKey.has(a.matchKey)) byKey.set(a.matchKey, []);
    byKey.get(a.matchKey)!.push(a);
  });

  return employees.map((emp) => {
    const merged: SampleAttendance[] = [];
    const seenDates = new Set<string>();
    for (const key of emp.matchKeys) {
      const list = byKey.get(key);
      if (!list) continue;
      for (const a of list) {
        if (seenDates.has(a.date)) continue;
        seenDates.add(a.date);
        merged.push(a);
      }
    }
    return calculateForEmployee(emp, merged, targetMonth);
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
Working Days: ${payroll.workingDays}
Working Hours: ${payroll.workingHours}

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
