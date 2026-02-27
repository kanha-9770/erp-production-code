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
      const response = await fetch('http://localhost:3000/api/forms/testing');
      console.log('Fetching attendance data for stats calculation',response);
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched attendance data for stats calculation',data);
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

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Error calculating stats:', error);
    return NextResponse.json(
      { error: 'Failed to calculate statistics' },
      { status: 500 }
    );
  }
}
