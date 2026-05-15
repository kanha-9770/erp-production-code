import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { invalidatePayrollCache } from '@/lib/utils/payroll-live';
import { getEmployeesFromDB } from '@/lib/utils/payroll-store';

export const dynamic = 'force-dynamic';

// POST /api/payroll/profiles/assign
// Body shapes accepted (use whichever fits the call site):
//   { employeeKey: string,     profileId: string | null }   single assign / clear
//   { employeeKeys: string[],  profileId: string | null }   bulk assign / clear
//   { applyToAll: true,        profileId: string }          assign to every employee in the org
//
// Pass profileId: null to clear (employee falls back to the org's default
// profile). applyToAll only makes sense with a concrete profileId — clearing
// every assignment in one shot is intentionally not supported via this flag
// to avoid foot-guns.
export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser?.organizationId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const profileId: string | null = body?.profileId ?? null;
  const applyToAll = Boolean(body?.applyToAll);

  // Validate effectiveFrom ("YYYY-MM" or omitted). Omitting it defaults to
  // the current month — the most common case ("apply this profile now").
  // Future months are allowed (admin schedules a change); past months are
  // also allowed (admin backfills a correction).
  const rawEff = typeof body?.effectiveFrom === 'string' ? body.effectiveFrom.trim() : '';
  let effectiveFrom = rawEff;
  if (!effectiveFrom) {
    effectiveFrom = new Date().toISOString().slice(0, 7);
  } else if (!/^\d{4}-\d{2}$/.test(effectiveFrom)) {
    return NextResponse.json(
      { success: false, error: 'effectiveFrom must be in YYYY-MM format' },
      { status: 400 },
    );
  }

  // Validate the profile belongs to this org so a malicious caller can't
  // bind an employee to another tenant's profile.
  if (profileId !== null) {
    const profile = await (prisma as any).payrollProfile.findFirst({
      where: { id: profileId, organizationId: authUser.organizationId },
    });
    if (!profile) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }
  }

  // Build the target employeeKeys list. Three input modes converge here:
  let employeeKeys: string[] = [];
  if (applyToAll) {
    if (profileId === null) {
      return NextResponse.json(
        { success: false, error: 'applyToAll requires a profileId' },
        { status: 400 },
      );
    }
    const employees = await getEmployeesFromDB(authUser.organizationId);
    employeeKeys = employees.map((e) => e.employeeId).filter(Boolean);
  } else if (Array.isArray(body?.employeeKeys)) {
    employeeKeys = body.employeeKeys
      .map((k: any) => String(k ?? '').trim())
      .filter((k: string) => k.length > 0);
  } else if (typeof body?.employeeKey === 'string' && body.employeeKey.trim()) {
    employeeKeys = [body.employeeKey.trim()];
  }

  if (employeeKeys.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No employees specified' },
      { status: 400 },
    );
  }

  // Clear path: delete in one shot.
  if (profileId === null) {
    const result = await (prisma as any).payrollProfileAssignment.deleteMany({
      where: {
        organizationId: authUser.organizationId,
        employeeKey: { in: employeeKeys },
      },
    });
    invalidatePayrollCache(authUser.organizationId);
    return NextResponse.json({
      success: true,
      cleared: true,
      count: result.count ?? employeeKeys.length,
    });
  }

  // Assign path: upserts one row per key. Done sequentially because Prisma
  // doesn't expose a multi-row upsert and a transaction array would tank
  // when the list grows to hundreds of employees (we'd hit the connection
  // limit). Per-row failure is logged but doesn't abort the batch — the
  // admin gets back a partial-success count.
  let success = 0;
  let failed = 0;
  for (const key of employeeKeys) {
    try {
      await (prisma as any).payrollProfileAssignment.upsert({
        where: {
          organizationId_employeeKey: {
            organizationId: authUser.organizationId,
            employeeKey: key,
          },
        },
        update: { profileId, effectiveFrom },
        create: {
          organizationId: authUser.organizationId,
          employeeKey: key,
          profileId,
          effectiveFrom,
        },
      });
      success++;
    } catch (err) {
      failed++;
      console.warn(`[payroll-profile-assign] failed for ${key}:`, err);
    }
  }

  invalidatePayrollCache(authUser.organizationId);
  return NextResponse.json({
    success: true,
    assigned: success,
    failed,
    total: employeeKeys.length,
    effectiveFrom,
  });
}
