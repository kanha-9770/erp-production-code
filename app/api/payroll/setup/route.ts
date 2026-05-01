import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

const META_KEY = 'payroll-v2';

export interface PayrollSetup {
  defaultBaseSalary?: number | null;
  employee: {
    formId: string | null;
    fields: {
      email: string | null;
      employeeId: string | null;
      name: string | null;
      salary: string | null;
      designation: string | null;
      department: string | null;
    };
  };
  checkIn: {
    formId: string | null;
    fields: {
      email: string | null;
      employeeId: string | null;
      date: string | null;
      checkInTime: string | null;
    };
  };
  checkOut: {
    formId: string | null;
    fields: {
      email: string | null;
      employeeId: string | null;
      date: string | null;
      checkOutTime: string | null;
    };
  };
}

const EMPTY_SETUP: PayrollSetup = {
  defaultBaseSalary: null,
  employee: {
    formId: null,
    fields: { email: null, employeeId: null, name: null, salary: null, designation: null, department: null },
  },
  checkIn: { formId: null, fields: { email: null, employeeId: null, date: null, checkInTime: null } },
  checkOut: { formId: null, fields: { email: null, employeeId: null, date: null, checkOutTime: null } },
};

function extractSetup(mappings: any): PayrollSetup {
  if (mappings && typeof mappings === 'object' && mappings._meta === META_KEY) {
    return {
      defaultBaseSalary:
        typeof mappings.defaultBaseSalary === 'number' ? mappings.defaultBaseSalary : null,
      employee: {
        formId: mappings.employee?.formId ?? null,
        fields: { ...EMPTY_SETUP.employee.fields, ...(mappings.employee?.fields || {}) },
      },
      checkIn: {
        formId: mappings.checkIn?.formId ?? null,
        fields: { ...EMPTY_SETUP.checkIn.fields, ...(mappings.checkIn?.fields || {}) },
      },
      checkOut: {
        formId: mappings.checkOut?.formId ?? null,
        fields: { ...EMPTY_SETUP.checkOut.fields, ...(mappings.checkOut?.fields || {}) },
      },
    };
  }
  return EMPTY_SETUP;
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const config = await prisma.payrollConfiguration.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const setup = extractSetup(config?.attendanceFieldMappings);
    return NextResponse.json({ success: true, setup, hasConfig: !!config });
  } catch (error) {
    console.error('[payroll] setup GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load setup' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json()) as { setup?: PayrollSetup; organizationId?: string };
    const setup = body.setup;

    if (!setup) {
      return NextResponse.json({ success: false, error: 'Setup payload missing' }, { status: 400 });
    }

    const errors: string[] = [];
    if (!setup.employee.formId) errors.push('Select an Employee Profile form');
    if (!setup.employee.fields.email && !setup.employee.fields.employeeId) {
      errors.push('Map at least Employee Email or Employee ID on the Employee Profile form');
    }
    if (!setup.employee.fields.salary && !setup.defaultBaseSalary) {
      errors.push('Map a Salary field OR set a Default Base Salary');
    }
    if (!setup.checkIn.formId) errors.push('Select a Check-In form');
    if (!setup.checkIn.fields.checkInTime) errors.push('Map the Check-In Time field');
    if (!setup.checkIn.fields.date) errors.push('Map the Date field on the Check-In form');

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors.join('. ') }, { status: 400 });
    }

    const formIds = [setup.employee.formId, setup.checkIn.formId, setup.checkOut.formId].filter(
      (x): x is string => Boolean(x),
    );

    const mappings = { _meta: META_KEY, ...setup };

    await prisma.payrollConfiguration.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const config = await prisma.payrollConfiguration.create({
      data: {
        attendanceFormIds: formIds,
        leaveFormIds: [],
        attendanceFieldMappings: mappings as any,
        leaveFieldMappings: {},
        organizationId: body.organizationId ?? null,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('[payroll] setup POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save setup' }, { status: 500 });
  }
}
