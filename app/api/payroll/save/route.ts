import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/api-helpers';

interface PayrollData {
  payrolls: any[];
  month: string;
  year: number;
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: 'User is not a member of any organization' },
        { status: 403 },
      );
    }

    const body: PayrollData = await request.json();

    const savedPayrolls = [];

    for (const payroll of body.payrolls) {
      savedPayrolls.push({
        ...payroll,
        organizationId: authUser.organizationId,
        savedAt: new Date().toISOString(),
      });
    }

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
        success: false,
        error: 'Failed to save payroll',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
