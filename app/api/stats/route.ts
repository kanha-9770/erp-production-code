export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;

export async function GET() {
  try {
    // Fetch payroll and attendance data
    const [payrollRes, attendanceRes] = await Promise.all([
      fetch(`${baseUrl}/api/payroll`),
      fetch(`${baseUrl}/api/forms/testing`),
    ]);

    const payrollData = (await payrollRes.json()) || { payrolls: [] };
    const attendanceData = (await attendanceRes.json()) || { data: [] };

    const payrolls = payrollData.payrolls || [];
    const totalEmployees = new Set(payrolls.map((p: any) => p.email)).size;
    const totalPayrollExpense = payrolls.reduce((sum: number, p: any) => sum + p.netSalary, 0);
    const averageSalary = totalEmployees > 0 ? totalPayrollExpense / totalEmployees : 0;

    return NextResponse.json({
      stats: {
        totalEmployees,
        totalPayrollExpense,
        averageSalary,
        processedPayrolls: payrolls.length,
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({
      stats: {
        totalEmployees: 0,
        totalPayrollExpense: 0,
        averageSalary: 0,
        processedPayrolls: 0,
      },
    });
  }
}
