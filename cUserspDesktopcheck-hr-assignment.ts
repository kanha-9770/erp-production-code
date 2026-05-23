import { prisma } from "@/lib/prisma";

async function checkHRAssignment() {
  const hrRoleId = "cmpdzj5fy001cqk0jv9fq0hu3";
  
  const assignments = await prisma.userUnitAssignment.findMany({
    where: { roleId: hrRoleId },
    select: {
      userId: true,
      user: { select: { id: true, email: true, first_name: true, last_name: true } }
    }
  });

  console.log(`Found ${assignments.length} users with HR role (${hrRoleId}):`);
  assignments.forEach(a => {
    console.log(`  - ${a.user.email} (${a.user.first_name} ${a.user.last_name})`);
  });
}

checkHRAssignment().catch(console.error);
