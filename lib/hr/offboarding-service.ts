/**
 * Offboarding service — exit-checklist materialiser + completion handler.
 *
 * Entry points:
 * 1. `materializeExitChecklist(opts)` — called when Employee.resignationLetterDate
 *    is set. Idempotent (one ExitChecklist per (org, employee)).
 * 2. `recomputeExitChecklistProgress(checklistId)` — invoked from the task
 *    PUT handler. Flips checklist to COMPLETED when every task is done and
 *    deactivates the Employee + user account.
 *
 * Notifications are best-effort.
 */

import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push/server";

export type ExitTaskSeed = {
  title: string;
  description?: string;
  category?: "ASSETS" | "HANDOVER" | "ACCESS" | "FINANCE" | "INTERVIEW" | "OTHER";
  offsetDays?: number;
};

const FALLBACK_TASKS: ExitTaskSeed[] = [
  { title: "Collect laptop & access card", category: "ASSETS", offsetDays: 1 },
  { title: "Return company SIM / phone", category: "ASSETS", offsetDays: 1 },
  { title: "Handover ongoing work to successor", category: "HANDOVER", offsetDays: 5 },
  { title: "Knowledge-transfer session", category: "HANDOVER", offsetDays: 5 },
  { title: "Revoke system access (email, ERP, repos)", category: "ACCESS", offsetDays: 0 },
  { title: "Conduct exit interview", category: "INTERVIEW", offsetDays: 3 },
  { title: "Process final settlement", category: "FINANCE", offsetDays: 7 },
  { title: "Issue relieving letter", category: "FINANCE", offsetDays: 10 },
];

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

type MaterialiseOpts = {
  organizationId: string;
  employeeId: string;
  initiatedAt?: Date;
  lastWorkingDate?: Date | null;
  reason?: string | null;
  createdById?: string | null;
};

type MaterialiseResult =
  | { id: string; alreadyExisted: boolean }
  | { error: string };

export async function materializeExitChecklist(
  opts: MaterialiseOpts,
): Promise<MaterialiseResult> {
  try {
    const initiatedAt = opts.initiatedAt ?? new Date();

    const existing = await (prisma as any).exitChecklist.findFirst({
      where: {
        organizationId: opts.organizationId,
        employeeId: opts.employeeId,
      },
      select: { id: true },
    });
    if (existing) return { id: existing.id, alreadyExisted: true };

    const seeds = FALLBACK_TASKS;
    const baseDate = opts.lastWorkingDate ?? initiatedAt;

    const checklist = await (prisma as any).exitChecklist.create({
      data: {
        organizationId: opts.organizationId,
        employeeId: opts.employeeId,
        initiatedAt,
        lastWorkingDate: opts.lastWorkingDate ?? null,
        status: "INITIATED",
        finalSettlementStatus: "PENDING",
        reason: opts.reason ?? null,
        createdById: opts.createdById ?? null,
        tasks: {
          create: seeds.map((s, i) => ({
            title: s.title,
            description: s.description ?? null,
            category: s.category ?? "OTHER",
            sortOrder: i,
            dueDate: addDays(baseDate, s.offsetDays ?? i),
            status: "PENDING",
          })),
        },
      },
      include: { tasks: true },
    });

    void notifyExitInitiated(opts.organizationId, checklist).catch((err) =>
      console.error("[offboarding] notifyExitInitiated:", err),
    );

    return { id: checklist.id, alreadyExisted: false };
  } catch (err: any) {
    console.error("[offboarding] materializeExitChecklist:", err);
    return { error: err?.message || "Failed to create exit checklist" };
  }
}

async function notifyExitInitiated(organizationId: string, checklist: any) {
  const adminRoles = await prisma.role.findMany({
    where: { organizationId, isAdmin: true },
    select: { id: true },
  });
  if (adminRoles.length === 0) return;
  const assignments = await prisma.userUnitAssignment.findMany({
    where: { roleId: { in: adminRoles.map((r) => r.id) } },
    select: { userId: true },
  });
  const recipientIds = Array.from(new Set(assignments.map((a) => a.userId)));
  if (recipientIds.length === 0) return;

  const employee = await prisma.employee.findUnique({
    where: { id: checklist.employeeId },
    select: { employeeName: true },
  });
  const empName = employee?.employeeName ?? "Employee";

  await prisma.notification.createMany({
    data: recipientIds.map((rid) => ({
      recipientId: rid,
      organizationId,
      title: `Offboarding initiated: ${empName}`,
      body: `${checklist.tasks?.length ?? 0} exit tasks created. Assign owners.`,
      moduleName: "Offboarding",
      recordId: checklist.id,
      link: `/hr/offboarding/${checklist.id}`,
    })),
  });

  void sendPushToUsers(recipientIds, {
    title: `Offboarding initiated: ${empName}`,
    body: `${checklist.tasks?.length ?? 0} exit tasks created. Assign owners.`,
    url: `/hr/offboarding/${checklist.id}`,
    tag: `offboarding:${checklist.id}`,
  }).catch(() => {});
}

export async function recomputeExitChecklistProgress(
  checklistId: string,
): Promise<{ percent: number; status: string; justCompleted: boolean }> {
  const tasks = await (prisma as any).exitTask.findMany({
    where: { checklistId },
    select: { status: true },
  });
  if (tasks.length === 0)
    return { percent: 0, status: "INITIATED", justCompleted: false };

  const done = tasks.filter(
    (t: any) => t.status === "COMPLETED" || t.status === "SKIPPED",
  ).length;
  const percent = Math.round((done / tasks.length) * 100);

  const allDone = done === tasks.length;
  const inProgress = !allDone && done > 0;
  const newStatus = allDone ? "COMPLETED" : inProgress ? "IN_PROGRESS" : "INITIATED";

  const current = await (prisma as any).exitChecklist.findUnique({
    where: { id: checklistId },
    select: {
      id: true,
      status: true,
      employeeId: true,
      organizationId: true,
      lastWorkingDate: true,
    },
  });
  if (!current)
    return { percent, status: newStatus, justCompleted: false };

  const justCompleted = allDone && current.status !== "COMPLETED";

  await (prisma as any).exitChecklist.update({
    where: { id: checklistId },
    data: {
      status: newStatus,
      completedAt: justCompleted ? new Date() : undefined,
      finalSettlementStatus: justCompleted ? "SETTLED" : undefined,
    },
  });

  if (justCompleted) {
    // Deactivate the Employee + their user account. Future payroll runs
    // and attendance punches will skip them based on these flags.
    const emp = await prisma.employee.update({
      where: { id: current.employeeId },
      data: {
        status: "INACTIVE",
        dateOfLeaving: current.lastWorkingDate ?? new Date(),
      },
      select: { userId: true, employeeName: true },
    });
    if (emp.userId) {
      await prisma.user.update({
        where: { id: emp.userId },
        data: { status: "INACTIVE" },
      });
    }

    void notifyExitCompleted(current.organizationId, current.id, emp.employeeName)
      .catch((err) => console.error("[offboarding] notifyExitCompleted:", err));
  }

  return { percent, status: newStatus, justCompleted };
}

async function notifyExitCompleted(
  organizationId: string,
  checklistId: string,
  empName: string,
) {
  const adminRoles = await prisma.role.findMany({
    where: { organizationId, isAdmin: true },
    select: { id: true },
  });
  if (adminRoles.length === 0) return;
  const assignments = await prisma.userUnitAssignment.findMany({
    where: { roleId: { in: adminRoles.map((r) => r.id) } },
    select: { userId: true },
  });
  const recipientIds = Array.from(new Set(assignments.map((a) => a.userId)));
  if (recipientIds.length === 0) return;

  await prisma.notification.createMany({
    data: recipientIds.map((rid) => ({
      recipientId: rid,
      organizationId,
      title: `Offboarding complete: ${empName}`,
      body: `All exit tasks done. Employee deactivated and final settlement marked SETTLED.`,
      moduleName: "Offboarding",
      recordId: checklistId,
      link: `/hr/offboarding/${checklistId}`,
    })),
  });

  void sendPushToUsers(recipientIds, {
    title: `Offboarding complete: ${empName}`,
    body: `All exit tasks done. Employee deactivated and final settlement marked SETTLED.`,
    url: `/hr/offboarding/${checklistId}`,
    tag: `offboarding:${checklistId}`,
  }).catch(() => {});
}
