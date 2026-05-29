import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { invalidatePayrollCache } from '@/lib/utils/payroll-live';

export const dynamic = 'force-dynamic';

async function loadProfileOwnedBy(profileId: string, organizationId: string) {
  return (prisma as any).payrollProfile.findFirst({
    where: { id: profileId, organizationId },
  });
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authUser = await getAuthenticatedUser(request);
  if (!authUser?.organizationId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const profile = await loadProfileOwnedBy(params.id, authUser.organizationId);
  if (!profile) {
    return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, profile });
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authUser = await getAuthenticatedUser(request);
  if (!authUser?.organizationId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const existing = await loadProfileOwnedBy(params.id, authUser.organizationId);
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));

  // Only one default profile per org. Demote the current default before
  // promoting this one.
  if (body?.isDefault && !existing.isDefault) {
    await (prisma as any).payrollProfile.updateMany({
      where: { organizationId: authUser.organizationId, isDefault: true },
      data: { isDefault: false },
    });
  }

  try {
    const profile = await (prisma as any).payrollProfile.update({
      where: { id: params.id },
      data: {
        name: body?.name ?? existing.name,
        description: body?.description ?? existing.description,
        isDefault: typeof body?.isDefault === 'boolean' ? body.isDefault : existing.isDefault,
        baseSalary: body?.baseSalary ?? existing.baseSalary,
        salaryStructure: body?.salaryStructure ?? existing.salaryStructure,
        statutory: body?.statutory ?? existing.statutory,
        bonus: body?.bonus ?? existing.bonus,
        overtime: body?.overtime ?? existing.overtime,
        policy: body?.policy ?? existing.policy,
      },
    });
    invalidatePayrollCache(authUser.organizationId);
    return NextResponse.json({ success: true, profile });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'A profile with that name already exists' },
        { status: 409 },
      );
    }
    console.error('[payroll-profiles] update error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update profile' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const authUser = await getAuthenticatedUser(request);
  if (!authUser?.organizationId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const existing = await loadProfileOwnedBy(params.id, authUser.organizationId);
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
  }

  // Cascade clears assignments (onDelete: Cascade in schema), so employees
  // that referenced this profile silently fall back to the org's default,
  // or — if no default exists — to the global setup config. There's no
  // longer a hard requirement to keep at least one profile around: the
  // engine resolves cleanly with zero profiles.
  await (prisma as any).payrollProfile.delete({ where: { id: params.id } });

  invalidatePayrollCache(authUser.organizationId);
  return NextResponse.json({ success: true });
}
