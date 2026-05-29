/**
 * Onboarding service — materializes checklists from templates and fires
 * the related notifications.
 *
 * Two entry points:
 * 1. `materializeChecklistForEmployee(employeeId, opts)` — called from the
 *    AppointmentLetter SIGNED trigger so HR doesn't have to manually start
 *    onboarding for every new hire. Idempotent: re-running on the same
 *    employee+letter returns the existing checklist instead of duplicating.
 * 2. `markChecklistComplete(checklistId, ctx)` — called when the last task
 *    flips to COMPLETED; flips the parent checklist to COMPLETED, sets
 *    Employee.status to ACTIVE if it isn't already, and notifies HR.
 *
 * Notifications are best-effort — wrapped in try/catch so a notification
 * outage never blocks the underlying state transition.
 */

import { prisma } from "@/lib/prisma";

export type OnboardingTaskSeed = {
  title: string;
  description?: string;
  category?: "DOCS" | "IT" | "INDUCTION" | "POLICY" | "FINANCE" | "OTHER";
  offsetDays?: number; // due-date offset from checklist startDate
  assigneeRoleId?: string; // optional — assigned to first user holding this role
};

// Default seed tasks used when an org has no OnboardingTemplate yet. Keep
// this list short and universal — orgs can override by creating their own
// default template (isDefault=true) and marking these as starters.
const FALLBACK_TASKS: OnboardingTaskSeed[] = [
  { title: "Collect signed offer letter copy", category: "DOCS", offsetDays: 1 },
  { title: "Verify identity & address proofs", category: "DOCS", offsetDays: 2 },
  { title: "Provision email + system accounts", category: "IT", offsetDays: 1 },
  { title: "Issue laptop & access card", category: "IT", offsetDays: 1 },
  { title: "HR induction session", category: "INDUCTION", offsetDays: 3 },
  { title: "Sign employee handbook & code of conduct", category: "POLICY", offsetDays: 5 },
  { title: "Capture bank details for payroll", category: "FINANCE", offsetDays: 3 },
  { title: "Buddy/manager introduction meeting", category: "INDUCTION", offsetDays: 2 },
];

function isValidCategory(v: any): v is OnboardingTaskSeed["category"] {
  return ["DOCS", "IT", "INDUCTION", "POLICY", "FINANCE", "OTHER"].includes(v);
}

function normaliseTaskSeeds(raw: any): OnboardingTaskSeed[] {
  if (!Array.isArray(raw) || raw.length === 0) return FALLBACK_TASKS;
  return raw
    .map((t: any, i: number) => ({
      title: String(t?.title ?? "").trim(),
      description: t?.description ? String(t.description) : undefined,
      category: isValidCategory(t?.category) ? t.category : "OTHER",
      offsetDays: Number.isFinite(Number(t?.offsetDays)) ? Number(t.offsetDays) : i + 1,
    }))
    .filter((t) => t.title.length > 0);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

type MaterialiseOpts = {
  organizationId: string;
  employeeId: string;
  appointmentLetterId?: string | null;
  startDate?: Date;
  createdById?: string | null;
};

type MaterialiseResult =
  | { id: string; alreadyExisted: boolean }
  | { error: string };

export async function materializeChecklistForEmployee(
  opts: MaterialiseOpts,
): Promise<MaterialiseResult> {
  try {
    const startDate = opts.startDate ?? new Date();

    // Idempotency: if a checklist already exists for this (employee, letter)
    // combo, return it. The unique index on (organizationId, employeeId,
    // appointmentLetterId) backstops a race between two concurrent triggers.
    const existing = await (prisma as any).onboardingChecklist.findFirst({
      where: {
        organizationId: opts.organizationId,
        employeeId: opts.employeeId,
        appointmentLetterId: opts.appointmentLetterId ?? null,
      },
      select: { id: true },
    });
    if (existing) return { id: existing.id, alreadyExisted: true };

    // Pick the active default template; fall back to FALLBACK_TASKS when
    // the org hasn't set one up yet.
    const template = await (prisma as any).onboardingTemplate.findFirst({
      where: { organizationId: opts.organizationId, isDefault: true },
    });
    const seeds = template
      ? normaliseTaskSeeds(template.defaultTasks)
      : FALLBACK_TASKS;

    const checklist = await (prisma as any).onboardingChecklist.create({
      data: {
        organizationId: opts.organizationId,
        employeeId: opts.employeeId,
        appointmentLetterId: opts.appointmentLetterId ?? null,
        templateId: template?.id ?? null,
        status: "PENDING",
        startDate,
        completionPercent: 0,
        createdById: opts.createdById ?? null,
        tasks: {
          create: seeds.map((s, i) => ({
            title: s.title,
            description: s.description ?? null,
            category: s.category ?? "OTHER",
            sortOrder: i,
            dueDate: addDays(startDate, s.offsetDays ?? i + 1),
            status: "PENDING",
          })),
        },
      },
      include: { tasks: true },
    });

    // Fire-and-forget notification — HR-side users in the org get a
    // heads-up so they can assign tasks. Doesn't block the create.
    void notifyChecklistCreated(opts.organizationId, checklist).catch((err) =>
      console.error("[onboarding] notifyChecklistCreated:", err),
    );

    return { id: checklist.id, alreadyExisted: false };
  } catch (err: any) {
    console.error("[onboarding] materializeChecklistForEmployee:", err);
    return { error: err?.message || "Failed to create onboarding checklist" };
  }
}

async function notifyChecklistCreated(organizationId: string, checklist: any) {
  // Find org admins to notify. We deliberately keep this simple — any
  // active user with isAdmin role gets pinged. A future revision can
  // narrow by permission key once the RBAC seed adds an "onboarding"
  // module.
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
  const empName = employee?.employeeName ?? "New hire";

  await prisma.notification.createMany({
    data: recipientIds.map((rid) => ({
      recipientId: rid,
      organizationId,
      title: `Onboarding started: ${empName}`,
      body: `${checklist.tasks?.length ?? 0} tasks created. Review and assign owners.`,
      moduleName: "Onboarding",
      recordId: checklist.id,
      link: `/hr/onboarding/${checklist.id}`,
    })),
  });
}

// Called from task PUT handler after a task transitions to COMPLETED. If
// every task is done, the parent checklist flips to COMPLETED and the
// Employee.status moves to ACTIVE (it usually already is, but we ensure
// it). Returns the updated completion percent and final status.
export async function recomputeChecklistProgress(
  checklistId: string,
): Promise<{ percent: number; status: string; justCompleted: boolean }> {
  const tasks = await (prisma as any).onboardingTask.findMany({
    where: { checklistId },
    select: { status: true },
  });
  if (tasks.length === 0)
    return { percent: 0, status: "PENDING", justCompleted: false };

  const done = tasks.filter((t: any) => t.status === "COMPLETED" || t.status === "SKIPPED").length;
  const percent = Math.round((done / tasks.length) * 100);

  const allDone = done === tasks.length;
  const inProgress = !allDone && done > 0;
  const newStatus = allDone ? "COMPLETED" : inProgress ? "IN_PROGRESS" : "PENDING";

  const current = await (prisma as any).onboardingChecklist.findUnique({
    where: { id: checklistId },
    select: { id: true, status: true, employeeId: true, organizationId: true },
  });
  if (!current)
    return { percent, status: newStatus, justCompleted: false };

  const justCompleted = allDone && current.status !== "COMPLETED";

  await (prisma as any).onboardingChecklist.update({
    where: { id: checklistId },
    data: {
      status: newStatus,
      completionPercent: percent,
      completedAt: justCompleted ? new Date() : undefined,
    },
  });

  if (justCompleted) {
    // Ensure the employee is ACTIVE — typically already true since the
    // AppointmentLetter trigger sets it on create, but a manual checklist
    // for an existing employee may move them off ON_LEAVE/INACTIVE.
    await prisma.employee.update({
      where: { id: current.employeeId },
      data: { status: "ACTIVE" },
    });

    void notifyChecklistCompleted(current.organizationId, current.id, current.employeeId)
      .catch((err) => console.error("[onboarding] notifyChecklistCompleted:", err));
  }

  return { percent, status: newStatus, justCompleted };
}

async function notifyChecklistCompleted(
  organizationId: string,
  checklistId: string,
  employeeId: string,
) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { employeeName: true, userId: true },
  });
  if (!employee) return;
  const empName = employee.employeeName ?? "New hire";

  // Notify the employee themselves if they have a user account.
  if (employee.userId) {
    await prisma.notification.create({
      data: {
        recipientId: employee.userId,
        organizationId,
        title: "Onboarding complete",
        body: "Welcome aboard — your onboarding checklist is done.",
        moduleName: "Onboarding",
        recordId: checklistId,
        link: `/hr/onboarding/${checklistId}`,
      },
    });
  }

  // Notify org admins.
  const adminRoles = await prisma.role.findMany({
    where: { organizationId, isAdmin: true },
    select: { id: true },
  });
  if (adminRoles.length > 0) {
    const assignments = await prisma.userUnitAssignment.findMany({
      where: { roleId: { in: adminRoles.map((r) => r.id) } },
      select: { userId: true },
    });
    const recipientIds = Array.from(new Set(assignments.map((a) => a.userId)));
    if (recipientIds.length > 0) {
      await prisma.notification.createMany({
        data: recipientIds.map((rid) => ({
          recipientId: rid,
          organizationId,
          title: `Onboarding complete: ${empName}`,
          body: `All tasks done. Employee is now ACTIVE.`,
          moduleName: "Onboarding",
          recordId: checklistId,
          link: `/hr/onboarding/${checklistId}`,
        })),
      });
    }
  }
}
