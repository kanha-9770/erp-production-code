/**
 * Build the recordData payload used by workflow rules attached to the
 * "Leave" / "Leave Management" / "Leave Approval" static modules. Keys here
 * MUST match the `coreKey`s exposed in lib/static-page-fields.ts for the
 * Leave entry so workflow template placeholders ({{applicantEmail}},
 * {{leaveTypeName}}, etc.) resolve correctly.
 *
 * Called fire-and-forget from every leave route that mutates a request:
 *   POST /api/leaves                        (Create)
 *   POST /api/leaves/[id]/decide            (Edit)
 *   POST /api/leaves/[id]/cancel            (Edit)
 *   POST /api/leaves/[id]/shorten           (Edit — shortenStatus PENDING)
 *   POST /api/leaves/[id]/shorten/decide    (Edit — shorten APPROVED / REJECTED)
 *
 * The two cheap joins (user + leave type) happen behind a try/catch so a
 * deleted user or leave type can never crash the workflow fire — we just
 * return whatever we have.
 */

import { prisma } from "@/lib/prisma";
import type { LeaveRequestRow } from "./leave-service";

export async function buildLeaveRecordData(
  req: LeaveRequestRow,
): Promise<Record<string, any>> {
  let user: any = null;
  let type: any = null;
  try {
    [user, type] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          email: true,
          first_name: true,
          last_name: true,
          employee: { select: { department: true, designation: true } },
        },
      }),
      (prisma as any).leaveType.findUnique({
        where: { id: req.leaveTypeId },
        select: { name: true, code: true },
      }),
    ]);
  } catch (err) {
    console.error("[leave-workflow] buildLeaveRecordData lookup failed:", err);
  }

  const applicantName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
    null;

  return {
    // Identity (from User + Employee join)
    applicantName,
    applicantEmail: user?.email ?? null,
    applicantDepartment: user?.employee?.department ?? null,
    applicantDesignation: user?.employee?.designation ?? null,
    // Leave-type denormalisation
    leaveTypeName: type?.name ?? null,
    leaveTypeCode: type?.code ?? null,
    // Everything already on the LeaveRequest row
    ...req,
  };
}
