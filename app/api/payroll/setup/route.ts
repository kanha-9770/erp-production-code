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
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: 'User is not a member of any organization' },
        { status: 403 },
      );
    }

    // Always scope to the caller's org so a user from Org A can never read
    // Org B's payroll setup.
    const config = await prisma.payrollConfiguration.findFirst({
      where: { isActive: true, organizationId: authUser.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    const setup = extractSetup(config?.attendanceFieldMappings);

    // The sidebar uses anchorModuleId to nest the Payroll route under the
    // module that owns the configured Employee form. We walk from the form's
    // direct module up to the top-level (level-0) ancestor, so Payroll
    // appears as a peer of "HR Core" / "Recruitment" / etc. rather than
    // buried under "Employee Master".
    let anchorModuleId: string | null = null;
    if (setup.employee.formId) {
      const form = await prisma.form.findFirst({
        where: {
          id: setup.employee.formId,
          module: { organizationId: authUser.organizationId },
        },
        select: { module: { select: { id: true, parentId: true } } },
      });
      let cursor = form?.module ?? null;
      // Cap at 6 hops to prevent runaway loops on malformed data.
      for (let i = 0; cursor?.parentId && i < 6; i++) {
        const parent = await prisma.formModule.findFirst({
          where: { id: cursor.parentId, organizationId: authUser.organizationId },
          select: { id: true, parentId: true },
        });
        if (!parent) break;
        cursor = parent;
      }
      anchorModuleId = cursor?.id ?? null;
    }

    return NextResponse.json({ success: true, setup, hasConfig: !!config, anchorModuleId });
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
    if (!authUser.organizationId) {
      return NextResponse.json(
        { success: false, error: 'User is not a member of any organization' },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { setup?: PayrollSetup };
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

    // Defence-in-depth: every form referenced in the setup must belong to the
    // caller's org. Stops a malicious or stale client from binding the org's
    // config to forms owned by a different tenant.
    const formIds = [setup.employee.formId, setup.checkIn.formId, setup.checkOut.formId].filter(
      (x): x is string => Boolean(x),
    );
    if (formIds.length > 0) {
      const ownedCount = await prisma.form.count({
        where: { id: { in: formIds }, module: { organizationId: authUser.organizationId } },
      });
      if (ownedCount !== formIds.length) {
        return NextResponse.json(
          { success: false, error: 'One or more selected forms do not belong to your organization' },
          { status: 403 },
        );
      }
    }

    const mappings = { _meta: META_KEY, ...setup };

    // Deactivate ONLY this org's previous active configs. Without the
    // organizationId filter this updateMany used to clobber every other
    // tenant's config, which is what produced the "my configuration is
    // showing on others' pages" symptom.
    await prisma.payrollConfiguration.updateMany({
      where: { isActive: true, organizationId: authUser.organizationId },
      data: { isActive: false },
    });

    const config = await prisma.payrollConfiguration.create({
      data: {
        attendanceFormIds: formIds,
        leaveFormIds: [],
        attendanceFieldMappings: mappings as any,
        leaveFieldMappings: {},
        // Pin to the SESSION'S org. The previous version trusted body.organizationId
        // which a malicious client could spoof to write into another tenant.
        organizationId: authUser.organizationId,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('[payroll] setup POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save setup' }, { status: 500 });
  }
}
