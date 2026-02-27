import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding lookup sources...")

  await prisma.lookupSource.upsert({
    where: { name: "Users" },
    update: {},
    create: {
      name: "Users",
      description: "List of system users",
      type: "prisma-model",
      config: {
        model: "User",
      },
      isActive: true,
    },
  })

  console.log("Lookup sources seeded successfully.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
