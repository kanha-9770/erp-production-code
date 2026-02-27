// Comprehensive payroll calculation engine with advanced features

interface DailyAttendance {
  employeeName: string;
  email: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string;
  location: string;
  workingHours: number;
}

interface EmployeeProfile {
  employeeName: string;
  email: string;
  totalSalary: number;
  shiftType: string;
  inTime: string;
  outTime: string;
}

interface DailyPayroll {
  employeeId: string;
  employeeName: string;
  email: string;
  date: string;
  workingHours: number;
  dailyRate: number;
  grossSalary: number;
  deductions: {
    pf: number;
    tax: number;
    insurance: number;
    other: number;
  };
  netSalary: number;
  status: 'pending' | 'processed';
}

interface PayrollCalculation {
  employeeId: string;
  employeeName: string;
  email: string;
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
}

const DEFAULT_HOURLY_RATE = 500; // ₹500/hour as default

export function calculateWorkingHours(checkInTime: string, checkOutTime?: string): number {
  if (!checkOutTime) return 0;

  const [inH, inM] = checkInTime.split(':').map(Number);
  const [outH, outM] = checkOutTime.split(':').map(Number);

  const inMinutes = inH * 60 + inM;
  const outMinutes = outH * 60 + outM;

  let diffMinutes = outMinutes - inMinutes;
  if (diffMinutes < 0) diffMinutes += 24 * 60; // Handle next day checkout

  return Math.max(0, (diffMinutes - 60) / 60); // Subtract 1 hour lunch break
}

export function parseApiResponse(apiData: any): DailyAttendance[] {
  const attendanceRecords: DailyAttendance[] = [];
  const dailyMap = new Map<string, any>();

  // Group check-ins and check-outs by employee and date
  if (apiData.grouped) {
    const checkIns = apiData.grouped['Check-In'] || [];
    const checkOuts = apiData.grouped['Check-Out'] || [];

    checkIns.forEach((record: any) => {
      const key = `${record.submittedBy.email}_${record.date}`;
      if (!dailyMap.has(key)) {
        dailyMap.set(key, {
          employeeName: record.submittedBy.name,
          email: record.submittedBy.email,
          date: record.date,
          checkInTime: record.checkInTime,
          location: record.location,
        });
      }
    });

    checkOuts.forEach((record: any) => {
      const key = `${record.submittedBy.email}_${record.date}`;
      if (dailyMap.has(key)) {
        const entry = dailyMap.get(key);
        entry.checkOutTime = record.checkOutTime;
      }
    });
  }

  // Convert map to array with calculated working hours
  dailyMap.forEach((entry) => {
    entry.workingHours = calculateWorkingHours(entry.checkInTime, entry.checkOutTime);
    attendanceRecords.push(entry);
  });

  return attendanceRecords;
}

export function calculateDailyPayroll(
  dailyAttendance: DailyAttendance[],
  employeeProfile?: EmployeeProfile
): DailyPayroll[] {
  const dailyPayrolls: DailyPayroll[] = [];

  dailyAttendance.forEach((attendance) => {
    const monthlyBaseSalary = employeeProfile?.totalSalary || 33333; // From API response
    const hourlyRate = monthlyBaseSalary / (22 * 8); // Monthly salary / (22 working days * 8 hours)
    const dailyRate = monthlyBaseSalary / 22; // Daily rate for full day

    // Calculate daily gross based on working hours
    const workingHours = attendance.workingHours;
    const dailyGross = (hourlyRate * workingHours);

    // Calculate deductions
    const pf = Math.floor((dailyGross * 0.12) / 100); // 12% PF on daily gross
    const taxableIncome = dailyGross - pf;
    const tax = Math.floor((taxableIncome * 0.05) / 100); // 5% tax on taxable income
    const insurance = Math.floor(500 / 22); // Daily insurance (500/month)
    const other = 0;

    const totalDeductions = pf + tax + insurance + other;
    const netSalary = Math.max(0, Math.round(dailyGross - totalDeductions));

    dailyPayrolls.push({
      employeeId: attendance.email.split('@')[0] || 'EMP001',
      employeeName: attendance.employeeName,
      email: attendance.email,
      date: attendance.date,
      workingHours,
      dailyRate: Math.round(dailyRate),
      grossSalary: Math.round(dailyGross),
      deductions: {
        pf,
        tax,
        insurance,
        other,
      },
      netSalary,
      status: 'processed',
    });
  });

  return dailyPayrolls;
}

export async function calculatePayroll(month: string): Promise<PayrollCalculation[]> {
  try {
    const response = await fetch('http://localhost:3000/api/forms/testing');
    const data = await response.json();
      console.log('Fetching attendance data for stats calculation',response);

    // Parse daily attendance
    const dailyAttendance = parseApiResponse(data);

    // Get employee profiles
    const employeeProfiles = new Map<string, EmployeeProfile>();
    if (data.grouped?.['Employee Profile']) {
      data.grouped['Employee Profile'].forEach((profile: any) => {
        employeeProfiles.set(profile.submittedBy.email, {
          employeeName: profile.employeeName,
          email: profile.submittedBy.email,
          totalSalary: parseInt(profile.totalSalary) || 33333,
          shiftType: profile.shiftType,
          inTime: profile.inTime,
          outTime: profile.outTime,
        });
      });
    }

    // Group by employee for monthly summary
    const employeeMonthlyMap = new Map<string, DailyAttendance[]>();
    dailyAttendance.forEach((attendance) => {
      if (!employeeMonthlyMap.has(attendance.email)) {
        employeeMonthlyMap.set(attendance.email, []);
      }
      employeeMonthlyMap.get(attendance.email)?.push(attendance);
    });

    // Calculate monthly payroll summary
    const payrolls: PayrollCalculation[] = [];
    employeeMonthlyMap.forEach((records, email) => {
      const profile = employeeProfiles.get(email);
      const baseSalary = profile?.totalSalary || 33333;

      const totalWorkingHours = records.reduce((sum, r) => sum + r.workingHours, 0);
      const workingDays = records.length;
      const hourlyRate = baseSalary / (22 * 8);
      const monthlyGross = (hourlyRate * totalWorkingHours);

      const pfDeduction = Math.floor((monthlyGross * 12) / 100);
      const taxableIncome = monthlyGross - pfDeduction;
      const taxDeduction = Math.floor((taxableIncome * 5) / 100);
      const insuranceDeduction = 500;
      const otherDeductions = 0;

      const totalDeductions = pfDeduction + taxDeduction + insuranceDeduction + otherDeductions;
      const netSalary = Math.max(0, Math.round(monthlyGross - totalDeductions));

      payrolls.push({
        employeeId: email.split('@')[0] || 'EMP001',
        employeeName: records[0]?.employeeName || profile?.employeeName || 'Unknown',
        email,
        workingDays,
        workingHours: Math.round(totalWorkingHours * 10) / 10,
        baseSalary,
        hourlyRate: Math.round(hourlyRate * 100) / 100,
        grossSalary: Math.round(monthlyGross),
        deductions: {
          pf: pfDeduction,
          tax: taxDeduction,
          insurance: insuranceDeduction,
          other: otherDeductions,
        },
        netSalary,
        status: 'processed',
      });
    });

    return payrolls;
  } catch (error) {
    console.error('Error calculating payroll:', error);
    return [];
  }
}

export function generatePayslip(payroll: PayrollCalculation): string {
  return `
PAYSLIP - ${new Date().toLocaleDateString()}
=====================================
Employee: ${payroll.employeeName}
Email: ${payroll.email}
Working Days: ${payroll.workingDays}
Working Hours: ${payroll.workingHours}

EARNINGS:
Basic Salary: ₹${payroll.baseSalary}
Gross Salary: ₹${payroll.grossSalary}

DEDUCTIONS:
PF: ₹${payroll.deductions.pf}
Tax: ₹${payroll.deductions.tax}
Insurance: ₹${payroll.deductions.insurance}
Other: ₹${payroll.deductions.other}
Total Deductions: ₹${payroll.deductions.pf + payroll.deductions.tax + payroll.deductions.insurance + payroll.deductions.other}

NET SALARY: ₹${payroll.netSalary}
  `;
}
