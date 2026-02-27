import { calculatePayroll } from '@/lib/payroll-utils';
import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for demo (replace with database)
let payrollRecords: any[] = [];

export async function GET() {
  return NextResponse.json({ payrolls: payrollRecords });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payrolls = await calculatePayroll(body.month);
    payrollRecords = payrolls;
    return NextResponse.json({ payrolls });
  } catch (error) {
    console.error('Error processing payroll:', error);
    return NextResponse.json(
      { error: 'Failed to process payroll' },
      { status: 500 }
    );
  }
}
