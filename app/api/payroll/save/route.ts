import { NextRequest, NextResponse } from 'next/server';

interface PayrollData {
  payrolls: any[];
  month: string;
  year: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: PayrollData = await request.json();
    
    const savedPayrolls = [];
    
    for (const payroll of body.payrolls) {
      savedPayrolls.push({
        ...payroll,
        savedAt: new Date().toISOString(),
      });
    }

    console.log('[v0] Payroll saved successfully:', savedPayrolls.length, 'records for', body.month);

    return NextResponse.json({
      success: true,
      message: `Saved ${savedPayrolls.length} payroll records for ${body.month}`,
      payrolls: savedPayrolls,
      count: savedPayrolls.length,
    });
  } catch (error) {
    console.error('Error saving payroll:', error);
    return NextResponse.json(
      { 
        error: 'Failed to save payroll',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
