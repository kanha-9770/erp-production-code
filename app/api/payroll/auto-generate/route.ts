import { NextRequest, NextResponse } from 'next/server';

interface PayrollRecord {
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
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { month = new Date().toISOString().slice(0, 7) } = body;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'production' ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const recordsResponse = await fetch(`${baseUrl}/api/forms/testing`, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!recordsResponse.ok) {
      console.error('[v0] Failed to fetch records:', recordsResponse.status, recordsResponse.statusText);
      const errorText = await recordsResponse.text();
      console.error('[v0] Error details:', errorText);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch employee records', details: `API endpoint returned ${recordsResponse.status}` },
        { status: 400 }
      );
    }

    const apiData = await recordsResponse.json();

    const employeeProfiles = new Map<string, any>();
    if (apiData.grouped?.['Employee Profile']) {
      apiData.grouped['Employee Profile'].forEach((profile: any) => {
        const email = profile.submittedBy?.email || profile.email;
        employeeProfiles.set(email, {
          employeeId: profile.employeeId || 'EMP001',
          employeeName: profile.employeeName || profile.submittedBy?.name || 'Unknown',
          totalSalary: parseInt(profile.totalSalary) || 33333,
          email: email,
          designation: profile.designation,
          department: profile.department,
        });
      });
    }

    const dailyAttendance = new Map<string, any>();

    if (apiData.grouped?.['Check-In']) {
      apiData.grouped['Check-In'].forEach((record: any) => {
        const email = record.submittedBy?.email;
        const date = record.date;
        const key = `${email}_${date}`;
        
        if (!dailyAttendance.has(key)) {
          dailyAttendance.set(key, {
            email: email,
            date: date,
            checkInTime: record.checkInTime,
          });
        }
      });
    }

    if (apiData.grouped?.['Check-Out']) {
      apiData.grouped['Check-Out'].forEach((record: any) => {
        const email = record.submittedBy?.email;
        const date = record.date;
        const key = `${email}_${date}`;
        
        if (dailyAttendance.has(key)) {
          const entry = dailyAttendance.get(key);
          entry.checkOutTime = record.checkOutTime;
        }
      });
    }

    const employeeMonthlyData = new Map<string, any[]>();

    dailyAttendance.forEach((record) => {
      const recordMonth = record.date?.slice(0, 7);
      if (recordMonth === month) {
        if (!employeeMonthlyData.has(record.email)) {
          employeeMonthlyData.set(record.email, []);
        }
        
        const workingHours = calculateWorkingHours(record.checkInTime, record.checkOutTime);
        employeeMonthlyData.get(record.email)?.push({
          date: record.date,
          workingHours,
        });
      }
    });

    const payrolls: PayrollRecord[] = [];

    employeeMonthlyData.forEach((attendanceData, email) => {
      const profile = employeeProfiles.get(email);

      if (!profile) {
        return;
      }

      const baseSalary = profile.totalSalary;
      const workingDays = attendanceData.length;
      const totalWorkingHours = attendanceData.reduce((sum: number, a: any) => sum + a.workingHours, 0);
      
      const hourlyRate = baseSalary / (22 * 8);
      
      const monthlyGross = hourlyRate * totalWorkingHours;

      const pfDeduction = Math.floor((monthlyGross * 12) / 100); // 12% PF
      const taxableIncome = monthlyGross - pfDeduction;
      const taxDeduction = Math.floor((taxableIncome * 5) / 100); // 5% tax
      const insuranceDeduction = 500; // Fixed monthly insurance
      const otherDeductions = 0;

      const totalDeductions = pfDeduction + taxDeduction + insuranceDeduction + otherDeductions;
      const netSalary = Math.max(0, Math.round(monthlyGross - totalDeductions));

      payrolls.push({
        employeeId: profile.employeeId,
        employeeName: profile.employeeName,
        email: profile.email,
        totalSalary: baseSalary,
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
        month,
      });
    });

    if (payrolls.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No payroll data could be generated. Check if employees have attendance records for the selected month.',
        payrolls: [],
      }, { status: 200 });
    }

    const saveResponse = await fetch(`${baseUrl}/api/payroll/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payrolls,
        month,
        year: new Date(month + '-01').getFullYear(),
      }),
    });

    if (!saveResponse.ok) {
      console.error('[v0] Failed to save payroll');
      return NextResponse.json(
        { success: false, error: 'Failed to save payroll to database' },
        { status: 500 }
      );
    }

    const saveResult = await saveResponse.json();

    return NextResponse.json({
      success: true,
      message: `Auto-generated and saved payroll for ${payrolls.length} employees`,
      payrolls,
      savedResult: saveResult,
    });

  } catch (error) {
    console.error('[v0] Error in auto-generate payroll:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to auto-generate payroll',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function calculateWorkingHours(checkInTime: string, checkOutTime?: string): number {
  if (!checkOutTime) return 0;

  try {
    const [inH, inM] = checkInTime.split(':').map(Number);
    const [outH, outM] = checkOutTime.split(':').map(Number);

    const inMinutes = inH * 60 + inM;
    const outMinutes = outH * 60 + outM;

    let diffMinutes = outMinutes - inMinutes;
    if (diffMinutes < 0) diffMinutes += 24 * 60; // Handle next-day checkout

    // Subtract 1 hour lunch break
    return Math.max(0, (diffMinutes - 60) / 60);
  } catch (error) {
    return 0;
  }
}
