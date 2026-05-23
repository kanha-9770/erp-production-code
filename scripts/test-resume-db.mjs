// Round-trip test: write a fake parsed-resume payload to JobApplication and
// read it back, confirming the new columns exist and Prisma can persist them.
//
//   pnpm exec node scripts/test-resume-db.mjs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) throw new Error("No organization in DB to test against");

  const created = await prisma.jobApplication.create({
    data: {
      applicantName: "_TEST_ Resume Round-trip",
      applicantEmail: "rt-test@example.com",
      applicantMobile: "+0000000000",
      organizationId: org.id,
      resumeParsedText: "raw resume text here",
      resumeSkills: "React, TypeScript, Node.js",
      resumeTotalExperience: "6 years",
      resumeEducation: "B.E. CS, IIT Madras, 2019",
      resumeSummary: "Senior engineer with 6 years building web apps.",
      resumeData: {
        fullName: "John Doe",
        skills: ["React", "TypeScript"],
        experience: [{ company: "Acme", role: "SE", duration: "2y" }],
      },
      resumeParsedAt: new Date(),
    },
  });

  console.log("Created:", created.id);
  console.log("resumeData stored:", JSON.stringify(created.resumeData));
  console.log("resumeSkills stored:", created.resumeSkills);
  console.log("resumeTotalExperience stored:", created.resumeTotalExperience);
  console.log("resumeParsedAt stored:", created.resumeParsedAt);

  await prisma.jobApplication.delete({ where: { id: created.id } });
  console.log("Cleaned up test row.");
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
