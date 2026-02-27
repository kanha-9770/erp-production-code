import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth";

const prisma = new PrismaClient();

async function createDefaultOrganization() {
  try {
    // Hash a temporary password
    const hashedPassword = await hashPassword("securepassword123");

    // Create a temporary admin user and default organization
    const tempUser = await prisma.user.create({
      data: {
        email: "admin@default.org",
        first_name: "Default Admin",
        password: hashedPassword,
        email_verified: true,
        status: "ACTIVE",
        organization: {
          create: {
            name: "Default Organization",
            owner: {
              connect: { email: "admin@default.org" },
            },
          },
        },
      },
    });

    console.log(
      "Default organization created with ID:",
      tempUser.organizationId
    );
    console.log("Temporary admin user created with ID:", tempUser.id);
  } catch (error) {
    console.error("Error creating default organization:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createDefaultOrganization();
