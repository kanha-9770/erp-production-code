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
    update: {},
    create: {
      id: "sick-leave-rule",
      leaveTypeId: fullDayLeave.id,
      name: "Sick Leave",
      description: "Paid sick leave with medical certificate",
      deductionPercentage: 0,
      requiresApproval: true,
      isPaid: true,
      affectsAttendance: true,
    },
  });

  await prisma.leaveRule.upsert({
    where: { id: "casual-leave-rule" },
    update: {},
    create: {
      id: "casual-leave-rule",
      leaveTypeId: fullDayLeave.id,
      name: "Casual Leave",
      description: "Unpaid casual leave",
      deductionPercentage: 100,
      requiresApproval: true,
      isPaid: false,
      affectsAttendance: true,
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
}

seedLeaveTypes()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
