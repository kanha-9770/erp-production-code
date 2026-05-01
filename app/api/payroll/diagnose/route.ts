import { NextRequest, NextResponse } from 'next/server';
import { diagnose, getEmployeeFormsStatus } from '@/lib/utils/payroll-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const [report, formsStatus] = await Promise.all([diagnose(month), getEmployeeFormsStatus()]);
    return NextResponse.json({ success: true, month, formsStatus, report });
  } catch (error) {
    console.error('[payroll] diagnose error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Diagnose failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
