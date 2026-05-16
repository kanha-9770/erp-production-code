import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { invalidatePayrollCache } from '@/lib/utils/payroll-live';

export const dynamic = 'force-dynamic';

// Bumping the meta key would orphan any v2 config and silently revert tenants
// to the empty setup, so we keep the v2 key and treat the new leave/holiday/
// policy blocks as optional additive sections. extractSetup merges with the
// EMPTY defaults so a v2-saved record still loads cleanly.
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
      dateOfJoining: string | null;
      dateOfLeaving: string | null;
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
  leave: {
    formId: string | null;
    fields: {
      email: string | null;
      employeeId: string | null;
      leaveType: string | null;
      startDate: string | null;
      endDate: string | null;
      days: string | null;
      halfDay: string | null;
      status: string | null;
    };
  };
  holiday: {
    formId: string | null;
    fields: {
      date: string | null;
      name: string | null;
    };
  };
  salaryStructure?: {
    basicPercent: number;
    hraPercent: number;
    // All optional — preserves backwards compatibility with v2 configs
    // saved before the SIM/bonus/allowance expansion landed. extractSetup
    // merges with the EMPTY_SETUP defaults below.
    daEnabled?: boolean;
    daPercent: number;
    specialAllowanceMode: 'auto' | 'manual';
    specialAllowanceAmount: number;
    conveyanceEnabled?: boolean;
    conveyanceAllowance: number;
    medicalEnabled?: boolean;
    medicalAllowance: number;
    ltaEnabled?: boolean;
    lta: number;
    ltaMonthly: boolean;
    foodEnabled?: boolean;
    foodAllowance?: number;
    telephoneEnabled?: boolean;
    telephoneAllowance?: number;
    educationEnabled?: boolean;
    educationAllowance?: number;
    fuelEnabled?: boolean;
    fuelAllowance?: number;
    booksEnabled?: boolean;
    booksAllowance?: number;
    uniformEnabled?: boolean;
    uniformAllowance?: number;
  };
  statutory?: {
    pfEnabled: boolean;
    pfPercent: number;
    pfCapEnabled: boolean;
    pfCapAmount: number;
    employerPfPercent: number;
    esiEnabled: boolean;
    esiEmployeePercent: number;
    esiEmployerPercent: number;
    esiThreshold: number;
    ptEnabled: boolean;
    ptAmount: number;
    ptThreshold: number;
    ptState?: string;
    tdsEnabled: boolean;
    tdsMode: 'flat' | 'slab';
    tdsFlatPercent: number;
    taxRegime: 'old' | 'new';
    lwfEnabled: boolean;
    lwfAmount: number;
    npsEnabled: boolean;
    npsEmployeePercent: number;
    gratuityEnabled?: boolean;
    gratuityPercent?: number;
  };
  overtime?: {
    enabled: boolean;
    rateMultiplier: number;
    weekdayThresholdHours: number;
    weekendMultiplier: number;
    holidayMultiplier: number;
    maxOvertimeHoursPerMonth: number;
  };
  // Bonus block — all sub-fields optional so a v2 record that predates the
  // bonus rollout loads cleanly through the EMPTY_SETUP merge in extractSetup.
  bonus?: {
    statutoryBonusEnabled?: boolean;
    statutoryBonusPercent?: number;
    statutoryBonusSalaryCeiling?: number;
    statutoryBonusCalcCeiling?: number;
    performanceBonusEnabled?: boolean;
    performanceBonusPercent?: number;
    performanceBonusFrequency?: 'annual' | 'half-yearly' | 'quarterly';
    festivalBonusEnabled?: boolean;
    festivalBonusAmount?: number;
    joiningBonusEnabled?: boolean;
    joiningBonusAmount?: number;
    joiningBonusClawbackMonths?: number;
    retentionBonusEnabled?: boolean;
    retentionBonusAmount?: number;
    retentionBonusFrequency?: 'monthly' | 'annual' | 'half-yearly' | 'one-time';
  };
  policy: {
    weeklyOffDays: number[];
    payableBasis: 'monthDays' | 'fixed26' | 'fixed30';
  };
}

const EMPTY_SETUP: PayrollSetup = {
  defaultBaseSalary: null,
  employee: {
    formId: null,
    fields: {
      email: null,
      employeeId: null,
      name: null,
      salary: null,
      designation: null,
      department: null,
      dateOfJoining: null,
      dateOfLeaving: null,
    },
  },
  checkIn: { formId: null, fields: { email: null, employeeId: null, date: null, checkInTime: null } },
  checkOut: { formId: null, fields: { email: null, employeeId: null, date: null, checkOutTime: null } },
  leave: {
    formId: null,
    fields: {
      email: null,
      employeeId: null,
      leaveType: null,
      startDate: null,
      endDate: null,
      days: null,
      halfDay: null,
      status: null,
    },
  },
  holiday: { formId: null, fields: { date: null, name: null } },
  salaryStructure: {
    basicPercent: 50, hraPercent: 50,
    daEnabled: false, daPercent: 0,
    specialAllowanceMode: 'auto', specialAllowanceAmount: 0,
    conveyanceEnabled: true, conveyanceAllowance: 1600,
    medicalEnabled: true, medicalAllowance: 1250,
    ltaEnabled: false, lta: 0, ltaMonthly: true,
    foodEnabled: false, foodAllowance: 2200,
    telephoneEnabled: false, telephoneAllowance: 1500,
    educationEnabled: false, educationAllowance: 200,
    fuelEnabled: false, fuelAllowance: 0,
    booksEnabled: false, booksAllowance: 0,
    uniformEnabled: false, uniformAllowance: 0,
  },
  statutory: {
    pfEnabled: true, pfPercent: 12, pfCapEnabled: true, pfCapAmount: 15000,
    employerPfPercent: 12, esiEnabled: false, esiEmployeePercent: 0.75,
    esiEmployerPercent: 3.25, esiThreshold: 21000, ptEnabled: true,
    ptAmount: 200, ptThreshold: 10000, ptState: 'maharashtra',
    tdsEnabled: true, tdsMode: 'flat', tdsFlatPercent: 5,
    taxRegime: 'new', lwfEnabled: false, lwfAmount: 25,
    npsEnabled: false, npsEmployeePercent: 10,
    gratuityEnabled: false, gratuityPercent: 4.81,
  },
  overtime: {
    enabled: false, rateMultiplier: 1.5, weekdayThresholdHours: 8,
    weekendMultiplier: 2, holidayMultiplier: 2, maxOvertimeHoursPerMonth: 50,
  },
  bonus: {
    statutoryBonusEnabled: false,
    statutoryBonusPercent: 8.33,
    statutoryBonusSalaryCeiling: 21000,
    statutoryBonusCalcCeiling: 7000,
    performanceBonusEnabled: false,
    performanceBonusPercent: 10,
    performanceBonusFrequency: 'annual',
    festivalBonusEnabled: false,
    festivalBonusAmount: 0,
    joiningBonusEnabled: false,
    joiningBonusAmount: 0,
    joiningBonusClawbackMonths: 12,
    retentionBonusEnabled: false,
    retentionBonusAmount: 0,
    retentionBonusFrequency: 'annual',
  },
  policy: { weeklyOffDays: [0], payableBasis: 'monthDays' },
};

function extractSetup(mappings: any): PayrollSetup {
  if (mappings && typeof mappings === 'object' && mappings._meta === META_KEY) {
    const policyRaw = mappings.policy ?? {};
    const weeklyOffDays = Array.isArray(policyRaw.weeklyOffDays)
      ? policyRaw.weeklyOffDays
          .map((n: any) => Number(n))
          .filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)
      : EMPTY_SETUP.policy.weeklyOffDays;
    const payableBasis: PayrollSetup['policy']['payableBasis'] =
      policyRaw.payableBasis === 'fixed26' || policyRaw.payableBasis === 'fixed30'
        ? policyRaw.payableBasis
        : 'monthDays';

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
      leave: {
        formId: mappings.leave?.formId ?? null,
        fields: { ...EMPTY_SETUP.leave.fields, ...(mappings.leave?.fields || {}) },
      },
      holiday: {
        formId: mappings.holiday?.formId ?? null,
        fields: { ...EMPTY_SETUP.holiday.fields, ...(mappings.holiday?.fields || {}) },
      },
      salaryStructure: migrateSalaryStructure(mappings.salaryStructure),
      statutory: { ...EMPTY_SETUP.statutory!, ...(mappings.statutory || {}) },
      overtime: { ...EMPTY_SETUP.overtime!, ...(mappings.overtime || {}) },
      bonus: { ...EMPTY_SETUP.bonus!, ...(mappings.bonus || {}) },
      policy: { weeklyOffDays, payableBasis },
    };
  }
  return EMPTY_SETUP;
}

// Legacy configs predate per-allowance enable toggles. For each component
// that used to be unconditionally paid, infer the new `*Enabled` flag from
// the legacy amount so a freshly-migrated config keeps paying what it used
// to. Once the admin saves once, the flags are explicit and this inference
// becomes a no-op.
function migrateSalaryStructure(raw: any) {
  const merged: any = {
    ...EMPTY_SETUP.salaryStructure!,
    ...(raw || {}),
  };
  if (raw && typeof raw === 'object') {
    const inferEnabled = (legacyKey: string, sourceValue: number) =>
      raw[legacyKey] === undefined ? sourceValue > 0 : Boolean(raw[legacyKey]);
    merged.daEnabled = inferEnabled('daEnabled', Number(merged.daPercent ?? 0));
    merged.conveyanceEnabled = inferEnabled(
      'conveyanceEnabled',
      Number(merged.conveyanceAllowance ?? 0),
    );
    merged.medicalEnabled = inferEnabled(
      'medicalEnabled',
      Number(merged.medicalAllowance ?? 0),
    );
    merged.ltaEnabled = inferEnabled('ltaEnabled', Number(merged.lta ?? 0));
  }
  return merged;
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

    // Stale-formId scrub: any formId saved in the config but no longer owned
    // by the caller's org gets nulled out before the client sees it. This
    // happens when an admin's org membership changes, when forms get deleted,
    // or when configs were copied across tenants. Without this, the configure
    // page hits 404 on every fetchFields call and Save returns 403 because
    // the POST validator rejects unknown formIds.
    const referencedFormIds = [
      setup.employee.formId,
      setup.checkIn.formId,
      setup.checkOut.formId,
      setup.leave.formId,
      setup.holiday.formId,
    ].filter((x): x is string => Boolean(x));

    const droppedFormIds: string[] = [];
    if (referencedFormIds.length > 0) {
      const owned = await prisma.form.findMany({
        where: {
          id: { in: referencedFormIds },
          module: { organizationId: authUser.organizationId },
        },
        select: { id: true },
      });
      const ownedSet = new Set(owned.map((f) => f.id));
      const stale = (id: string | null) => (id && !ownedSet.has(id) ? id : null);

      const e = stale(setup.employee.formId);
      if (e) { droppedFormIds.push(e); setup.employee.formId = null; setup.employee.fields = { ...EMPTY_SETUP.employee.fields }; }
      const ci = stale(setup.checkIn.formId);
      if (ci) { droppedFormIds.push(ci); setup.checkIn.formId = null; setup.checkIn.fields = { ...EMPTY_SETUP.checkIn.fields }; }
      const co = stale(setup.checkOut.formId);
      if (co) { droppedFormIds.push(co); setup.checkOut.formId = null; setup.checkOut.fields = { ...EMPTY_SETUP.checkOut.fields }; }
      const lv = stale(setup.leave.formId);
      if (lv) { droppedFormIds.push(lv); setup.leave.formId = null; setup.leave.fields = { ...EMPTY_SETUP.leave.fields }; }
      const ho = stale(setup.holiday.formId);
      if (ho) { droppedFormIds.push(ho); setup.holiday.formId = null; setup.holiday.fields = { ...EMPTY_SETUP.holiday.fields }; }
    }

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

    return NextResponse.json({
      success: true,
      setup,
      hasConfig: !!config,
      anchorModuleId,
      droppedFormIds,
    });
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

    // Form-mapping requirements (employee profile, check-in, leave, holiday)
    // are managed at /settings/attendance-config and have engine-side fallbacks
    // (User table for employees, native Attendance table for punches). The
    // Payroll Configuration page now only edits Pay Rules, so the only check
    // here is that a salary source exists — either a mapped field on the
    // employee form OR a Default Base Salary the pay rules can be applied to.
    const errors: string[] = [];
    if (!setup.employee.fields.salary && !setup.defaultBaseSalary) {
      errors.push('Map a Salary field OR set a Default Base Salary');
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors.join('. ') }, { status: 400 });
    }

    // Defence-in-depth: every form referenced in the setup must belong to the
    // caller's org. Stops a malicious or stale client from binding the org's
    // config to forms owned by a different tenant.
    const attendanceFormIds = [
      setup.employee.formId,
      setup.checkIn.formId,
      setup.checkOut.formId,
      setup.holiday.formId,
    ].filter((x): x is string => Boolean(x));
    const leaveFormIds = [setup.leave.formId].filter((x): x is string => Boolean(x));
    const allFormIds = [...attendanceFormIds, ...leaveFormIds];
    if (allFormIds.length > 0) {
      const ownedCount = await prisma.form.count({
        where: { id: { in: allFormIds }, module: { organizationId: authUser.organizationId } },
      });
      if (ownedCount !== allFormIds.length) {
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
        // attendanceFormIds carries everything *except* the leave-application
        // form so a quick column scan still reveals the full set of forms the
        // engine touches. leaveFormIds is the dedicated home for the leave
        // form. Both are denormalised — the source of truth is `mappings`.
        attendanceFormIds,
        leaveFormIds,
        attendanceFieldMappings: mappings as any,
        leaveFieldMappings: {},
        // Pin to the SESSION'S org. The previous version trusted body.organizationId
        // which a malicious client could spoof to write into another tenant.
        organizationId: authUser.organizationId,
        isActive: true,
      },
    });

    // Changing field mappings or the attendance/leave/holiday forms
    // changes which rows the engine reads. Drop any cached payroll for
    // the org so the next read recomputes against the new mapping.
    invalidatePayrollCache(authUser.organizationId);

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('[payroll] setup POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save setup' }, { status: 500 });
  }
}
