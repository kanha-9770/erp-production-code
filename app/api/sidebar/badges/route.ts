/**
 * Sidebar badge counts — "pending / needs-action" numbers shown next to
 * sidebar items (e.g. how many leave requests await approval).
 *
 *   GET /api/sidebar/badges  → { success, badges: { [path]: count } }
 *
 * Keys are the exact STATIC_PAGES paths the sidebar renders, so the client can
 * look up a leaf's count by its route. Only entries with count > 0 are
 * returned. Every count is computed defensively (a failure in one feature
 * yields 0 for that feature, never a 500), and is scoped to what the current
 * user may actually act on (admin → org-wide; otherwise their hierarchy).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, isUserAdmin } from "@/lib/api-helpers";
import { canApproveLeave } from "@/lib/hr/leave-service";
import { canApproveAttendance } from "@/lib/hr/attendance-permissions";
import { getVisibleUserIdsForHierarchy } from "@/lib/database/roles";

export const dynamic = "force-dynamic";

const db = prisma as any;

async function safeCount(fn: () => Promise<number>): Promise<number> {
  try {
    const n = await fn();
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }
  const orgId = authUser.organizationId;
  if (!orgId) {
    return NextResponse.json({ success: true, badges: {} }, { headers: { "Cache-Control": "no-store" } });
  }
  const userId = authUser.id;

  const isAdmin = await isUserAdmin(userId, orgId);

  // For non-admins, restrict approval counts to people they oversee (their
  // hierarchy), excluding themselves (you don't approve your own requests).
  let approverUserIds: string[] | null = null; // null = org-wide (admin)
  if (!isAdmin) {
    const visible = await getVisibleUserIdsForHierarchy(userId, orgId).catch(() => null);
    approverUserIds = (visible ?? [userId]).filter((id) => id !== userId);
  }

  const [canLeave, canReg] = await Promise.all([
    canApproveLeave(userId, orgId).catch(() => false),
    canApproveAttendance(userId, orgId).catch(() => false),
  ]);

  // Build counts in parallel. Each is independently guarded.
  const [
    leaveApprovals,
    regularizations,
    compliance,
    jobApplications,
    onboarding,
  ] = await Promise.all([
    // Pending leave requests this user can approve.
    safeCount(async () => {
      if (!canLeave) return 0;
      if (!isAdmin && approverUserIds && approverUserIds.length === 0) return 0;
      return db.leaveRequest.count({
        where: {
          organizationId: orgId,
          status: "PENDING",
          ...(isAdmin ? {} : { userId: { in: approverUserIds } }),
        },
      });
    }),

    // Pending attendance regularizations this user can approve.
    safeCount(async () => {
      if (!canReg) return 0;
      if (!isAdmin && approverUserIds && approverUserIds.length === 0) return 0;
      return db.attendanceRegularization.count({
        where: {
          organizationId: orgId,
          status: "PENDING",
          ...(isAdmin ? {} : { userId: { in: approverUserIds } }),
        },
      });
    }),

    // Real-estate compliance docs awaiting verification (admin queue).
    safeCount(async () => {
      if (!isAdmin) return 0;
      return db.complianceDocument.count({
        where: { organizationId: orgId, status: "PENDING" },
      });
    }),

    // New job applications to review (admin/recruiter queue).
    safeCount(async () => {
      if (!isAdmin) return 0;
      return db.jobApplication.count({
        where: { organizationId: orgId, status: "NEW" },
      });
    }),

    // Onboarding checklists not yet started (admin queue).
    safeCount(async () => {
      if (!isAdmin) return 0;
      return db.onboardingChecklist.count({
        where: { organizationId: orgId, status: "PENDING" },
      });
    }),
  ]);

  // Map counts onto the exact sidebar paths (see lib/static-pages.ts).
  const raw: Record<string, number> = {
    "/leave/approvals": leaveApprovals,
    "/attendance/regularizations": regularizations,
    "/real-estate/admin/compliance": compliance,
    "/hr/recruitment/job-application": jobApplications,
    "/hr/onboarding": onboarding,
  };

  const badges: Record<string, number> = {};
  for (const [path, count] of Object.entries(raw)) {
    if (count > 0) badges[path] = count;
  }

  return NextResponse.json(
    { success: true, badges },
    { headers: { "Cache-Control": "no-store" } },
  );
}
