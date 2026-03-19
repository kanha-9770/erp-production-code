export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
export async function GET(request: NextRequest) {
  try {
    // Calculate statistics from attendance data
    const stats = {
      totalEmployees: 0,
      totalPayrollExpense: 0,
      averageSalary: 0,
      processedPayrolls: 0,
    };

    // Fetch attendance data
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/forms/testing`);
      if (response.ok) {
        const data = await response.json();
        // Parse and calculate stats
        const emails = new Set();
        if (data.grouped?.['Check-In']) {
          data.grouped['Check-In'].forEach((record: any) => {
            emails.add(record.submittedBy.email);
          });
        }

        stats.totalEmployees = emails.size;
        stats.totalPayrollExpense = emails.size * 33333; // Base salary
        stats.averageSalary = 33333;
        stats.processedPayrolls = 0;
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('Error calculating stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate statistics' },
      { status: 500 }
    );
  }
}
