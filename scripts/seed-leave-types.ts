import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedLeaveTypes() {
  console.log("Seeding leave types and rules...");

  // Create leave types
  const fullDayLeave = await prisma.leaveType.upsert({
    where: { code: "FULL_DAY_LEAVE" },
    update: {},
    create: {
      name: "Full Day Leave",
      code: "FULL_DAY_LEAVE",
      category: "FULL_DAY",
      description: "Standard full day leave",
      color: "#ef4444",
      icon: "Calendar",
      sortOrder: 1,
    },
  });

  const halfDayLeave = await prisma.leaveType.upsert({
    where: { code: "HALF_DAY_LEAVE" },
    update: {},
    create: {
      name: "Half Day Leave",
      code: "HALF_DAY_LEAVE",
      category: "HALF_DAY",
      description: "Half day leave (4 hours)",
      color: "#f59e0b",
      icon: "Clock",
      sortOrder: 2,
    },
  });

  const shortLeave = await prisma.leaveType.upsert({
    where: { code: "SHORT_LEAVE" },
    update: {},
    create: {
      name: "Short Leave",
      code: "SHORT_LEAVE",
      category: "SHORT_LEAVE",
      description: "Short leave (1-2 hours)",
      color: "#3b82f6",
      icon: "Clock",
      sortOrder: 3,
    },
  });

  // Create leave rules
  await prisma.leaveRule.upsert({
    where: { id: "sick-leave-rule" },
    update: {
      name: "Paid leave",
      description: "Paid leave with prior notice",
      minNoticeDays: 2,
      maxConsecutiveDays: 5,
    },
    create: {
      id: "sick-leave-rule",
      leaveTypeId: fullDayLeave.id,
      name: "Paid leave",
      description: "Paid leave with prior notice",
      deductionPercentage: 0,
      requiresApproval: true,
      isPaid: true,
      affectsAttendance: true,
      minNoticeDays: 2,
      maxConsecutiveDays: 5,
    },
  });

  await prisma.leaveRule.upsert({
    where: { id: "casual-leave-rule" },
    update: {
      minNoticeDays: 1,
      maxConsecutiveDays: 3,
    },
    create: {
      id: "casual-leave-rule",
      leaveTypeId: fullDayLeave.id,
      name: "Casual Leave",
      description: "Unpaid casual leave",
      deductionPercentage: 100,
      requiresApproval: true,
      isPaid: false,
      affectsAttendance: true,
      minNoticeDays: 1,
      maxConsecutiveDays: 3,
    },
  });

  await prisma.leaveRule.upsert({
    where: { id: "half-day-rule" },
    update: {},
    create: {
      id: "half-day-rule",
      leaveTypeId: halfDayLeave.id,
      name: "Half Day Leave",
      description: "Half day leave with 50% deduction",
      deductionPercentage: 100,
      hoursEquivalent: 4,
      requiresApproval: true,
      isPaid: false,
      affectsAttendance: true,
    },
  });

  await prisma.leaveRule.upsert({
    where: { id: "short-leave-rule" },
    update: {},
    create: {
      id: "short-leave-rule",
      leaveTypeId: shortLeave.id,
      name: "Short Leave",
      description: "Short leave (1-2 hours) with hourly deduction",
      deductionPercentage: 100,
      hoursEquivalent: 2,
      requiresApproval: false,
      isPaid: false,
      affectsAttendance: false,
    },
  });

  console.log("Leave types and rules seeded successfully!");

  // Default per-employee balances for the current calendar year. Without
  // these the Apply Leave form shows the type in the dropdown but every
  // submission fails balance validation. Tweak the numbers below to match
  // your HR policy.
  const DEFAULTS_BY_CODE: Record<string, number> = {
    FULL_DAY_LEAVE: 12,
    HALF_DAY_LEAVE: 6,
    SHORT_LEAVE: 12,
  };

  const year = new Date().getFullYear();
  console.log(`Allocating default balances for ${year}…`);

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, organizationId: true },
  });

  const typesByCode = new Map<string, string>([
    ["FULL_DAY_LEAVE", fullDayLeave.id],
    ["HALF_DAY_LEAVE", halfDayLeave.id],
    ["SHORT_LEAVE", shortLeave.id],
  ]);

  let created = 0;
  let skipped = 0;
  for (const u of users) {
    if (!u.organizationId) continue;
    for (const [code, days] of Object.entries(DEFAULTS_BY_CODE)) {
      const leaveTypeId = typesByCode.get(code);
      if (!leaveTypeId) continue;
      const existing = await prisma.leaveBalance.findUnique({
        where: {
          userId_leaveTypeId_year: { userId: u.id, leaveTypeId, year },
        },
      });
      if (existing) {
        // Never overwrite an existing balance — it may have used / pending
        // values an admin tuned by hand. Re-runs are idempotent and safe.
        skipped += 1;
        continue;
      }
      await prisma.leaveBalance.create({
        data: {
          organizationId: u.organizationId,
          userId: u.id,
          leaveTypeId,
          year,
          allocated: days,
          carriedForward: 0,
          used: 0,
          pending: 0,
        },
      });
      created += 1;
    }
  }
  console.log(
    `Default balances done — ${created} created, ${skipped} already existed.`,
  );
}

seedLeaveTypes()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
