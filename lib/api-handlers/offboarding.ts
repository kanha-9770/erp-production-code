/**
 * Offboarding Exit Checklist + Task handlers.
 *
 * Checklists are usually auto-created when an Employee's resignation date
 * is set. This handler exposes read/admin + manual-create plus task PUT.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { moveToTrash } from "@/lib/trash";
import {
  materializeExitChecklist,
  recomputeExitChecklistProgress,
} from "@/lib/hr/offboarding-service";

const CHECKLIST_STATUSES = [
  "INITIATED", "IN_PROGRESS", "COMPLETED", "CANCELLED",
] as const;
const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED"] as const;
const TASK_CATEGORIES = [
  "ASSETS", "HANDOVER", "ACCESS", "FINANCE", "INTERVIEW", "OTHER",
] as const;
const SETTLEMENT_STATUSES = ["PENDING", "IN_PROGRESS", "SETTLED"] as const;

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

async function handle(fn: () => Promise<NextResponse>, label: string) {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;
    console.error(`[ExitChecklistHandlers] ${label}:`, e?.message);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export const ExitChecklistHandlers = {
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const employeeId = url.searchParams.get("employeeId");

      const items = await (prisma as any).exitChecklist.findMany({
        where: {
          organizationId: authUser.organizationId,
          ...(status ? { status } : {}),
          ...(employeeId ? { employeeId } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      });

      const employeeIds = Array.from(
        new Set(items.map((i: any) => i.employeeId).filter(Boolean)),
      );
      const employees = await prisma.employee.findMany({
        where: { id: { in: employeeIds as string[] } },
        select: {
          id: true,
          employeeName: true,
          department: true,
          designation: true,
          emailAddress1: true,
          dateOfJoining: true,
        },
      });
      const empById = new Map(employees.map((e) => [e.id, e]));
      const enriched = items.map((i: any) => ({
        ...i,
        employee: empById.get(i.employeeId) ?? null,
        // Surface a derived progress percent for the dashboard so the row
        // can render a progress bar without computing it client-side.
        completionPercent:
          i.tasks.length === 0
            ? 0
            : Math.round(
                (i.tasks.filter(
                  (t: any) => t.status === "COMPLETED" || t.status === "SKIPPED",
                ).length /
                  i.tasks.length) *
                  100,
              ),
      }));

      return NextResponse.json({ success: true, items: enriched });
    }, "list");
  },

  async create(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const body = await request.json();
      const employeeId = String(body?.employeeId ?? "").trim();
      if (!employeeId)
        return NextResponse.json(
          { error: "employeeId is required" },
          { status: 400 },
        );

      const emp = await prisma.employee.findFirst({
        where: {
          id: employeeId,
          user: { organizationId: authUser.organizationId },
        },
        select: { id: true },
      });
      if (!emp)
        return NextResponse.json(
          { error: "Employee not found in this organization" },
          { status: 404 },
        );

      const result = await materializeExitChecklist({
        organizationId: authUser.organizationId!,
        employeeId,
        initiatedAt: body?.initiatedAt ? new Date(body.initiatedAt) : undefined,
        lastWorkingDate: body?.lastWorkingDate ? new Date(body.lastWorkingDate) : null,
        reason: body?.reason ?? null,
        createdById: authUser.id,
      });
      if ("error" in result)
        return NextResponse.json({ error: result.error }, { status: 500 });

      const item = await (prisma as any).exitChecklist.findUnique({
        where: { id: result.id },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      });
      return NextResponse.json(
        { success: true, item, alreadyExisted: result.alreadyExisted },
        { status: result.alreadyExisted ? 200 : 201 },
      );
    }, "create");
  },

  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const item = await (prisma as any).exitChecklist.findFirst({
        where: { id, organizationId: authUser.organizationId },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      });
      if (!item)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      const employee = await prisma.employee.findUnique({
        where: { id: item.employeeId },
        select: {
          id: true,
          employeeName: true,
          department: true,
          designation: true,
          emailAddress1: true,
          dateOfJoining: true,
          resignationLetterDate: true,
        },
      });
      return NextResponse.json({ success: true, item: { ...item, employee } });
    }, "get");
  },

  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).exitChecklist.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const data: Record<string, any> = {};

      if ("status" in body) {
        const v = String(body.status || "").toUpperCase();
        if ((CHECKLIST_STATUSES as readonly string[]).includes(v)) data.status = v;
      }
      if ("lastWorkingDate" in body) {
        const v = body.lastWorkingDate;
        if (!v) data.lastWorkingDate = null;
        else {
          const d = new Date(v);
          data.lastWorkingDate = Number.isNaN(d.getTime()) ? null : d;
        }
      }
      if ("reason" in body) {
        const v = body.reason;
        data.reason =
          v === null || v === undefined || String(v).trim() === ""
            ? null
            : String(v);
      }
      if ("finalSettlementStatus" in body) {
        const v = String(body.finalSettlementStatus || "").toUpperCase();
        if ((SETTLEMENT_STATUSES as readonly string[]).includes(v))
          data.finalSettlementStatus = v;
      }
      if ("exitInterview" in body) {
        data.exitInterview = body.exitInterview ?? null;
      }

      const item = await (prisma as any).exitChecklist.update({
        where: { id },
        data,
      });
      return NextResponse.json({ success: true, item });
    }, "update");
  },

  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).exitChecklist.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      await moveToTrash("ExitChecklist", id, {
        userId: authUser.id,
        userName: authUser.email,
        organizationId: authUser.organizationId,
      });
      return NextResponse.json({ success: true });
    }, "remove");
  },

  async updateTask(request: NextRequest, taskId: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const task = await (prisma as any).exitTask.findFirst({
        where: {
          id: taskId,
          checklist: { organizationId: authUser.organizationId },
        },
        select: { id: true, checklistId: true, status: true },
      });
      if (!task)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const data: Record<string, any> = {};
      if ("status" in body) {
        const v = String(body.status || "").toUpperCase();
        if ((TASK_STATUSES as readonly string[]).includes(v)) {
          data.status = v;
          if (v === "COMPLETED") {
            data.completedAt = new Date();
            data.completedById = authUser.id;
          } else if (task.status === "COMPLETED") {
            data.completedAt = null;
            data.completedById = null;
          }
        }
      }
      if ("title" in body) {
        const v = String(body.title ?? "").trim();
        if (v) data.title = v;
      }
      if ("description" in body) {
        const v = body.description;
        data.description =
          v === null || v === undefined || String(v).trim() === ""
            ? null
            : String(v);
      }
      if ("category" in body) {
        const v = String(body.category || "").toUpperCase();
        if ((TASK_CATEGORIES as readonly string[]).includes(v)) data.category = v;
      }
      if ("assigneeUserId" in body) {
        const v = body.assigneeUserId;
        data.assigneeUserId =
          v === null || v === undefined || String(v).trim() === ""
            ? null
            : String(v);
      }
      if ("dueDate" in body) {
        const v = body.dueDate;
        if (!v) data.dueDate = null;
        else {
          const d = new Date(v);
          data.dueDate = Number.isNaN(d.getTime()) ? null : d;
        }
      }
      if ("completionNote" in body) {
        const v = body.completionNote;
        data.completionNote =
          v === null || v === undefined || String(v).trim() === ""
            ? null
            : String(v);
      }

      const updated = await (prisma as any).exitTask.update({
        where: { id: taskId },
        data,
      });
      const progress = await recomputeExitChecklistProgress(task.checklistId);
      return NextResponse.json({ success: true, item: updated, progress });
    }, "updateTask");
  },
};
