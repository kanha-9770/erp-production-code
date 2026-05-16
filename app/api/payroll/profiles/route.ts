import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { invalidatePayrollCache } from '@/lib/utils/payroll-live';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

  const profiles = await (prisma as any).payrollProfile.findMany({
    where: { organizationId: authUser.organizationId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  const assignments = await (prisma as any).payrollProfileAssignment.findMany({
    where: { organizationId: authUser.organizationId },
  });

  // Surface the assignment count next to each profile so the manager UI can
  // warn before deleting a profile that's in active use.
  const usage = new Map<string, number>();
  for (const a of assignments) {
    usage.set(a.profileId, (usage.get(a.profileId) ?? 0) + 1);
  }

  return NextResponse.json({
    success: true,
    profiles: profiles.map((p: any) => ({
      ...p,
      assignedCount: usage.get(p.id) ?? 0,
    })),
    assignments,
  });
}

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const name = (body?.name ?? '').toString().trim();
  if (!name) {
    return NextResponse.json({ success: false, error: 'Profile name is required' }, { status: 400 });
  }

  // Default is opt-in only. A new profile is NEVER auto-defaulted — that
  // caused real confusion: admins who created a single profile + assigned a
  // handful of employees were surprised to see the profile applied to every
  // unassigned employee too. Default == "fallback for unassigned employees",
  // which has to be an explicit choice. When no profile is default, the
  // engine falls back to the global setup config instead.
  const shouldBeDefault = Boolean(body?.isDefault);

  if (shouldBeDefault) {
    await (prisma as any).payrollProfile.updateMany({
      where: { organizationId: authUser.organizationId, isDefault: true },
      data: { isDefault: false },
    });
  }

  try {
    const profile = await (prisma as any).payrollProfile.create({
      data: {
        organizationId: authUser.organizationId,
        name,
        description: body?.description ?? null,
        isDefault: shouldBeDefault,
        baseSalary: body?.baseSalary ?? null,
        salaryStructure: body?.salaryStructure ?? {},
        statutory: body?.statutory ?? {},
        bonus: body?.bonus ?? {},
        overtime: body?.overtime ?? {},
        policy: body?.policy ?? {},
      },
    });
    invalidatePayrollCache(authUser.organizationId);
    return NextResponse.json({ success: true, profile });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: `A profile named "${name}" already exists` },
        { status: 409 },
      );
    }
    console.error('[payroll-profiles] create error:', err);
    return NextResponse.json({ success: false, error: 'Failed to create profile' }, { status: 500 });
  }
}
