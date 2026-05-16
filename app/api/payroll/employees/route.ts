import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getEmployeesFromDB } from '@/lib/utils/payroll-store';

export const dynamic = 'force-dynamic';

// GET /api/payroll/employees
// Lightweight list of every payroll-visible employee in the caller's org,
// each annotated with their current PayrollProfileAssignment (if any).
// Powers the "Assign employees" picker on /payroll/profiles.
//
// Deliberately not paginated — the payroll engine already iterates over the
// whole employee list to compute monthly payroll, so it's the same size of
// data the rest of /payroll/* tolerates. If org sizes grow past a few
// thousand this should switch to a server-side filtered query.
export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser?.organizationId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const [employees, assignments] = await Promise.all([
    getEmployeesFromDB(authUser.organizationId),
    (prisma as any).payrollProfileAssignment
      .findMany({ where: { organizationId: authUser.organizationId } })
      .catch(() => []),
  ]);

  const assignmentByKey = new Map<string, { profileId: string; effectiveFrom: string }>();
  for (const a of assignments) {
    assignmentByKey.set(a.employeeKey, {
      profileId: a.profileId,
      effectiveFrom: typeof a.effectiveFrom === 'string' ? a.effectiveFrom : '',
    });
  }

  return NextResponse.json({
    success: true,
    employees: employees.map((e) => {
      const a = assignmentByKey.get(e.employeeId);
      return {
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        email: e.email,
        department: e.department || null,
        designation: e.designation || null,
        currentProfileId: a?.profileId ?? null,
        effectiveFrom: a?.effectiveFrom ?? null,
      };
    }),
  });
}

