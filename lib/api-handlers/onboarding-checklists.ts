/**
 * Onboarding Checklist + Task handlers.
 *
 * Checklists are usually auto-created by the AppointmentLetter SIGNED
 * trigger; this handler exposes the read/admin/manual-create surface plus
 * the task PUT used to mark items complete.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-helpers";
import { moveToTrash } from "@/lib/trash";
import {
  materializeChecklistForEmployee,
  recomputeChecklistProgress,
} from "@/lib/hr/onboarding-service";

const CHECKLIST_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED"] as const;
const TASK_CATEGORIES = [
  "DOCS", "IT", "INDUCTION", "POLICY", "FINANCE", "OTHER",
] as const;

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
    console.error(`[OnboardingChecklistHandlers] ${label}:`, e?.message);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export const OnboardingChecklistHandlers = {
  // GET /api/onboarding/checklists?status=PENDING&employeeId=...
  async list(request: NextRequest): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const employeeId = url.searchParams.get("employeeId");

      const items = await (prisma as any).onboardingChecklist.findMany({
        where: {
          organizationId: authUser.organizationId,
          ...(status ? { status } : {}),
          ...(employeeId ? { employeeId } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          tasks: { orderBy: { sortOrder: "asc" } },
          template: { select: { id: true, name: true } },
        },
      });

      // Surface employee names alongside the checklist so the list page
      // doesn't need a second round-trip per row.
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
        },
      });
      const empById = new Map(employees.map((e) => [e.id, e]));
      const enriched = items.map((i: any) => ({
        ...i,
        employee: empById.get(i.employeeId) ?? null,
      }));

      return NextResponse.json({ success: true, items: enriched });
    }, "list");
  },

  // POST /api/onboarding/checklists  { employeeId, templateId? }
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

      // Confirm the employee belongs to this org (Employee.organizationId
      // is via User — check the join).
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

      const result = await materializeChecklistForEmployee({
        organizationId: authUser.organizationId!,
        employeeId,
        appointmentLetterId: body?.appointmentLetterId ?? null,
        startDate: body?.startDate ? new Date(body.startDate) : undefined,
        createdById: authUser.id,
      });
      if ("error" in result)
        return NextResponse.json({ error: result.error }, { status: 500 });

      const item = await (prisma as any).onboardingChecklist.findUnique({
        where: { id: result.id },
        include: { tasks: { orderBy: { sortOrder: "asc" } } },
      });
      return NextResponse.json(
        { success: true, item, alreadyExisted: result.alreadyExisted },
        { status: result.alreadyExisted ? 200 : 201 },
      );
    }, "create");
  },

  // GET /api/onboarding/checklists/[id]
  async get(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const item = await (prisma as any).onboardingChecklist.findFirst({
        where: { id, organizationId: authUser.organizationId },
        include: {
          tasks: { orderBy: { sortOrder: "asc" } },
          template: { select: { id: true, name: true } },
        },
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
        },
      });
      return NextResponse.json({ success: true, item: { ...item, employee } });
    }, "get");
  },

  // PUT /api/onboarding/checklists/[id]  — body { status?, notes?, lastWorkingDate? }
  async update(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).onboardingChecklist.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const body = await request.json();
      const data: Record<string, any> = {};
      if ("status" in body) {
        const v = String(body.status || "").toUpperCase();
        if ((CHECKLIST_STATUSES as readonly string[]).includes(v))
          data.status = v;
      }
      if ("notes" in body) {
        const v = body.notes;
        data.notes =
          v === null || v === undefined || String(v).trim() === ""
            ? null
            : String(v);
      }

      const item = await (prisma as any).onboardingChecklist.update({
        where: { id },
        data,
      });
      return NextResponse.json({ success: true, item });
    }, "update");
  },

  // DELETE /api/onboarding/checklists/[id]
  async remove(request: NextRequest, id: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const existing = await (prisma as any).onboardingChecklist.findFirst({
        where: { id, organizationId: authUser.organizationId },
        select: { id: true },
      });
      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      await moveToTrash("OnboardingChecklist", id, {
        userId: authUser.id,
        userName: authUser.email,
        organizationId: authUser.organizationId,
      });
      return NextResponse.json({ success: true });
    }, "remove");
  },

  // PUT /api/onboarding/tasks/[id]
  async updateTask(request: NextRequest, taskId: string): Promise<NextResponse> {
    return handle(async () => {
      const authUser = await requireAuth(request);
      const task = await (prisma as any).onboardingTask.findFirst({
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
            // Reopened — clear completion stamp.
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

      const updated = await (prisma as any).onboardingTask.update({
        where: { id: taskId },
        data,
      });

      // Recompute parent checklist progress + (optionally) flip to
      // COMPLETED — also handles the Employee.status side-effect.
      const progress = await recomputeChecklistProgress(task.checklistId);

      return NextResponse.json({ success: true, item: updated, progress });
    }, "updateTask");
  },
};
