/**
 * Attendance ↔ Payroll integration bindings.
 *
 * Source of truth for which Forms feed holiday / leave / employee /
 * check-in / check-out into BOTH the attendance widget AND the payroll
 * engine is `PayrollConfiguration.attendanceFieldMappings` (the v2 setup
 * the payroll wizard already writes to).
 *
 * This endpoint exposes a lightweight read/write of just the form-id
 * bindings so admins can configure the attendance side without going
 * through the full payroll wizard. Field mappings, policy, and default
 * base salary are preserved as-is when only form ids change here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, isUserAdmin } from '@/lib/api-helpers';
import {
  getHolidaysFromDB,
  getLeavesFromDB,
} from '@/lib/utils/payroll-store';
import { todayKey } from '@/lib/hr/attendance-service';

export const dynamic = 'force-dynamic';

const META_KEY = 'payroll-v2';

const NAME_HINTS = {
  employee: [
    'employee master',
    'employee profile',
    'employee profiles',
    'employees',
    'employee',
  ],
  checkIn: ['check in', 'check-in', 'checkin', 'attendance check-in'],
  checkOut: ['check out', 'check-out', 'checkout', 'attendance check-out'],
  leave: [
    'leave application',
    'leave request',
    'leave requests',
    'leave form',
    'leaves',
    'apply leave',
    'leave management',
  ],
  holiday: [
    'holiday calendar',
    'holidays',
    'holiday list',
    'public holidays',
    'company holidays',
  ],
} as const;

type Slot = keyof typeof NAME_HINTS;

interface FormSummary {
  id: string;
  name: string;
  moduleId: string | null;
  moduleName: string | null;
  isPublished: boolean;
}

interface BindingsShape {
  employee: string | null;
  checkIn: string | null;
  checkOut: string | null;
  leave: string | null;
  holiday: string | null;
}

interface SetupV2 {
  _meta: typeof META_KEY;
  defaultBaseSalary?: number | null;
  employee: { formId: string | null; fields: Record<string, string | null> };
  checkIn: { formId: string | null; fields: Record<string, string | null> };
  checkOut: { formId: string | null; fields: Record<string, string | null> };
  leave: { formId: string | null; fields: Record<string, string | null> };
  holiday: { formId: string | null; fields: Record<string, string | null> };
  policy: { weeklyOffDays: number[]; payableBasis: 'monthDays' | 'fixed26' | 'fixed30' };
}

const EMPTY_SETUP: SetupV2 = {
  _meta: META_KEY,
  defaultBaseSalary: null,
  employee: { formId: null, fields: {} },
  checkIn: { formId: null, fields: {} },
  checkOut: { formId: null, fields: {} },
  leave: { formId: null, fields: {} },
  holiday: { formId: null, fields: {} },
  policy: { weeklyOffDays: [0], payableBasis: 'monthDays' },
};

function readSetup(raw: unknown): SetupV2 {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SETUP };
  const obj = raw as any;
  if (obj._meta !== META_KEY) return { ...EMPTY_SETUP };
  // Spread defaults so missing v1 sub-objects don't crash the merge.
  return {
    _meta: META_KEY,
    defaultBaseSalary:
      typeof obj.defaultBaseSalary === 'number' ? obj.defaultBaseSalary : null,
    employee: obj.employee ?? { formId: null, fields: {} },
    checkIn: obj.checkIn ?? { formId: null, fields: {} },
    checkOut: obj.checkOut ?? { formId: null, fields: {} },
    leave: obj.leave ?? { formId: null, fields: {} },
    holiday: obj.holiday ?? { formId: null, fields: {} },
    policy: obj.policy ?? { weeklyOffDays: [0], payableBasis: 'monthDays' },
  };
}

async function listOrgForms(organizationId: string): Promise<FormSummary[]> {
  const rows = await prisma.form.findMany({
    where: { module: { organizationId } },
    select: {
      id: true,
      name: true,
      isPublished: true,
      module: { select: { id: true, name: true } },
    },
    orderBy: [{ name: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    moduleId: r.module?.id ?? null,
    moduleName: r.module?.name ?? null,
    isPublished: r.isPublished,
  }));
}

function suggest(forms: FormSummary[], slot: Slot): string | null {
  const hints = NAME_HINTS[slot];
  for (const hint of hints) {
    const match = forms.find((f) => f.name.trim().toLowerCase() === hint);
    if (match) return match.id;
  }
  // Fuzzy contains-match as a fallback.
  for (const hint of hints) {
    const match = forms.find((f) => f.name.toLowerCase().includes(hint));
    if (match) return match.id;
  }
  return null;
}

// ---- GET ------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403 },
    );
  }

  const config = await prisma.payrollConfiguration.findFirst({
    where: { organizationId: authUser.organizationId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  const setup = readSetup(config?.attendanceFieldMappings);

  const forms = await listOrgForms(authUser.organizationId);

  // Verify each bound form still belongs to this org. A form deleted or
  // moved out from under us produces a "broken" binding the UI surfaces.
  const ownedIds = new Set(forms.map((f) => f.id));
  const enforce = (id: string | null) => (id && ownedIds.has(id) ? id : null);

  const bindings: BindingsShape = {
    employee: enforce(setup.employee.formId),
    checkIn: enforce(setup.checkIn.formId),
    checkOut: enforce(setup.checkOut.formId),
    leave: enforce(setup.leave.formId),
    holiday: enforce(setup.holiday.formId),
  };

  const broken: BindingsShape = {
    employee: setup.employee.formId && !bindings.employee ? setup.employee.formId : null,
    checkIn: setup.checkIn.formId && !bindings.checkIn ? setup.checkIn.formId : null,
    checkOut: setup.checkOut.formId && !bindings.checkOut ? setup.checkOut.formId : null,
    leave: setup.leave.formId && !bindings.leave ? setup.leave.formId : null,
    holiday: setup.holiday.formId && !bindings.holiday ? setup.holiday.formId : null,
  };

  const suggestions: BindingsShape = {
    employee: bindings.employee ?? suggest(forms, 'employee'),
    checkIn: bindings.checkIn ?? suggest(forms, 'checkIn'),
    checkOut: bindings.checkOut ?? suggest(forms, 'checkOut'),
    leave: bindings.leave ?? suggest(forms, 'leave'),
    holiday: bindings.holiday ?? suggest(forms, 'holiday'),
  };

  // Live diagnostic counts — what payroll/widget WILL see this month with
  // the current bindings. Both readers are tolerant when forms aren't set
  // (they return []), so this safely answers "is the link working?".
  const month = todayKey().slice(0, 7);
  const [holidays, leaves] = await Promise.all([
    bindings.holiday
      ? getHolidaysFromDB(authUser.organizationId, month).catch(() => [])
      : Promise.resolve([] as Awaited<ReturnType<typeof getHolidaysFromDB>>),
    bindings.leave
      ? getLeavesFromDB(authUser.organizationId, month).catch(() => [])
      : Promise.resolve([] as Awaited<ReturnType<typeof getLeavesFromDB>>),
  ]);

  return NextResponse.json({
    success: true,
    bindings,
    suggestions,
    broken,
    forms,
    diagnostics: {
      month,
      holidaysThisMonth: holidays.length,
      leavesThisMonth: leaves.length,
      hasPayrollConfig: !!config,
    },
  });
}

// ---- PUT ------------------------------------------------------------------

interface PutBody {
  employeeFormId?: string | null;
  checkInFormId?: string | null;
  checkOutFormId?: string | null;
  leaveFormId?: string | null;
  holidayFormId?: string | null;
}

export async function PUT(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }
  if (!authUser.organizationId) {
    return NextResponse.json(
      { success: false, error: 'No organization' },
      { status: 403 },
    );
  }
  const admin = await isUserAdmin(authUser.id, authUser.organizationId);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: 'Admin access required' },
      { status: 403 },
    );
  }

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  // Cross-tenant guard: every supplied form id must belong to this org.
  const submittedIds = [
    body.employeeFormId,
    body.checkInFormId,
    body.checkOutFormId,
    body.leaveFormId,
    body.holidayFormId,
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);

  if (submittedIds.length > 0) {
    const owned = await prisma.form.count({
      where: {
        id: { in: submittedIds },
        module: { organizationId: authUser.organizationId },
      },
    });
    if (owned !== submittedIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'One or more selected forms do not belong to your organization',
        },
        { status: 403 },
      );
    }
  }

  const existing = await prisma.payrollConfiguration.findFirst({
    where: { organizationId: authUser.organizationId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  const setup = readSetup(existing?.attendanceFieldMappings);

  // Apply ONLY the slots the caller named. Unset (key absent) keeps the
  // previous value; null clears it; a string sets it. Field mappings,
  // policy, defaultBaseSalary all pass through untouched — so the existing
  // payroll wizard stays compatible.
  const apply = (slot: Slot, raw: unknown) => {
    if (raw === undefined) return;
    if (raw === null) {
      setup[slot] = { ...setup[slot], formId: null };
      return;
    }
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    setup[slot] = { ...setup[slot], formId: trimmed.length > 0 ? trimmed : null };
  };
  apply('employee', body.employeeFormId);
  apply('checkIn', body.checkInFormId);
  apply('checkOut', body.checkOutFormId);
  apply('leave', body.leaveFormId);
  apply('holiday', body.holidayFormId);

  const attendanceFormIds = [
    setup.employee.formId,
    setup.checkIn.formId,
    setup.checkOut.formId,
    setup.holiday.formId,
  ].filter((x): x is string => Boolean(x));
  const leaveFormIds = [setup.leave.formId].filter((x): x is string => Boolean(x));

  if (existing) {
    await prisma.payrollConfiguration.update({
      where: { id: existing.id },
      data: {
        attendanceFormIds,
        leaveFormIds,
        attendanceFieldMappings: setup as any,
      },
    });
  } else {
    // No prior config — create a minimal active one. Existing payroll
    // wizard at /payroll/configure can layer on the field mappings later.
    await prisma.payrollConfiguration.create({
      data: {
        organizationId: authUser.organizationId,
        isActive: true,
        attendanceFormIds,
        leaveFormIds,
        attendanceFieldMappings: setup as any,
        leaveFieldMappings: {},
      },
    });
  }

  return NextResponse.json({ success: true });
}
