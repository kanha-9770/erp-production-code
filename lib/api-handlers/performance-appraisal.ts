/**
 * Performance Appraisal API Handlers
 *
 * Backs /app/performance/appraisal. One row = one (employee, cycle, year)
 * review. Notifications fire when an appraisal moves to IN_REVIEW (assigns
 * the reviewer) or COMPLETED (notifies the subject).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { moveToTrash } from "@/lib/trash";

const STATUSES = ["PENDING", "IN_REVIEW", "COMPLETED", "ACKNOWLEDGED"] as const;
const CYCLES = ["Q1", "Q2", "Q3", "Q4", "MID_YEAR", "ANNUAL"] as const;

async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user)
    throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId)
    throw NextResponse.json(
      { error: "User is not associated with any organization" },
      { status: 403 },
    );
  return user;
}

async function handle(
  fn: () => Promise<NextResponse>,
  label: string,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[AppraisalHandlers] ${label}:`, e?.message);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

function sanitize(body: Record<string, any>, opts: { partial?: boolean } = {}) {
  const data: Record<string, any> = {};
  const partial = opts.partial ?? false;

  const str = (key: string, required = false) => {
    if (!(key in body)) {
      if (required && !partial)
        throw NextResponse.json(
          { error: `${key} is required` },
          { status: 400 },
        );
      return;
    }
    const v = body[key];
    if (v === null || v === undefined || String(v).trim() === "") {
      if (required)
        throw NextResponse.json(
          { error: `${key} is required` },
          { status: 400 },
        );
      data[key] = null;
      return;
    }
    data[key] = String(v).trim();
  };

  str("employeeId");
  str("employeeName", !partial);
  str("firstName");
  str("middleName");
  str("lastName");
  str("department");
  str("employeeEngagementTeamName");
  str("reviewerId");
  str("reviewerName", !partial);
  str("strengths");
  str("improvements");
  str("comments");

  if ("rating" in body) {
    const n = Number(body.rating);
    data.rating = Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 0;
  }
  if ("year" in body) {
    const n = Math.round(Number(body.year));
    data.year = Number.isFinite(n) ? n : new Date().getFullYear();
  } else if (!partial) {
    data.year = new Date().getFullYear();
  }

  if ("cycle" in body) {
    const v = String(body.cycle || "").toUpperCase();
    data.cycle = (CYCLES as readonly string[]).includes(v) ? v : "ANNUAL";
  } else if (!partial) {
    data.cycle = "ANNUAL";
  }

  if ("status" in body) {
    const v = String(body.status || "").toUpperCase();
    data.status = (STATUSES as readonly string[]).includes(v) ? v : "PENDING";
  } else if (!partial) {
    data.status = "PENDING";
  }

  if ("submittedAt" in body) {
    const v = body.submittedAt;
    if (!v) data.submittedAt = null;
    else {
      const d = new Date(v);
      data.submittedAt = Number.isNaN(d.getTime()) ? null : d;
    }
  }

  return data;
}

async function nextDisplayId(organizationId: string): Promise<string> {
  const count = await (prisma as any).appraisal.count({
    where: { organizationId },
  });
  return `APR-${String(count + 1).padStart(4, "0")}`;
}

// Fire a notification when the appraisal transitions into a state that
// requires action. Best-effort — never throws so the main write succeeds.
async function maybeNotifyOnStatusChange(args: {
  organizationId: string;
  appraisal: any;
  previousStatus: string | null;
}) {
  const { organizationId, appraisal, previousStatus } = args;
  if (previousStatus === appraisal.status) return;
  try {
    if (
      appraisal.status === "IN_REVIEW" &&
      appraisal.reviewerId &&
      appraisal.reviewerId !== previousStatus
    ) {
      await prisma.notification.create({
        data: {
          recipientId: appraisal.reviewerId,
          organizationId,
          title: `Appraisal assigned: ${appraisal.employeeName}`,
          body: `${appraisal.cycle} ${appraisal.year} cycle is ready for your review.`,
          moduleName: "Performance Appraisal",
          recordId: appraisal.id,
          link: `/performance/appraisal/${appraisal.id}`,
        },
      });
    }
    if (appraisal.status === "COMPLETED" && appraisal.employeeId) {
      // Look up the employee's user to notify the subject.
      const emp = await prisma.employee.findUnique({
        where: { id: appraisal.employeeId },
        select: { userId: true },
      });
      if (emp?.userId) {
        await prisma.notification.create({
          data: {
            recipientId: emp.userId,
            organizationId,
            title: `Your appraisal is ready`,
            body: `${appraisal.cycle} ${appraisal.year} review by ${appraisal.reviewerName} is complete.`,
            moduleName: "Performance Appraisal",
            recordId: appraisal.id,
            link: `/performance/appraisal/${appraisal.id}`,
          },
        });
      }
    }
  } catch (err) {
    // Logging only — notification failures must not roll back the write.
    console.error("[AppraisalHandlers] notify failed:", err);
  }
}

export const AppraisalHandlers = {
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const url = new URL(request.url);
      const employeeIdFilter = url.searchParams.get("employeeId");

      const items = await (prisma as any).appraisal.findMany({
        where: {
          organizationId: authUser.organizationId,
          ...(employeeIdFilter ? { employeeId: employeeIdFilter } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ success: true, items });
    }, "list");
  },

  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();
      const data = sanitize(body);
      const displayId = await nextDisplayId(authUser.organizationId!);

      const item = await (prisma as any).appraisal.create({
        data: {
          ...data,
          organizationId: authUser.organizationId,
          displayId,
          createdById: authUser.id,
        },
      });

      await maybeNotifyOnStatusChange({
        organizationId: authUser.organizationId!,
        appraisal: item,
        previousStatus: null,
      });

      return NextResponse.json({ success: true, item }, { status: 201 });
    }, "create");
  },

  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const item = await (prisma as any).appraisal.findFirst({
        where: { id, organizationId: authUser.organizationId },
      });
      if (!item)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ success: true, item });
    }, "get");
  },

  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).appraisal.findFirst({
        where: { id, organizationId: authUser.organizationId },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const data = sanitize(await request.json(), { partial: true });
      const item = await (prisma as any).appraisal.update({
        where: { id },
        data,
      });

      await maybeNotifyOnStatusChange({
        organizationId: authUser.organizationId!,
        appraisal: item,
        previousStatus: existing.status,
      });

      return NextResponse.json({ success: true, item });
    }, "update");
  },

  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).appraisal.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      await moveToTrash("Appraisal", id, {
        userId: authUser.id,
        userName: authUser.email,
        organizationId: authUser.organizationId,
      });
      return NextResponse.json({ success: true });
    }, "remove");
  },
};
