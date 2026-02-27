import { execSync } from "child_process"

async function regeneratePrisma() {
  try {
    console.log("🔄 Regenerating Prisma client...")

    // Generate the Prisma client
    execSync("npx prisma generate", { stdio: "inherit" })

    console.log("✅ Prisma client regenerated successfully!")
    console.log("📝 You can now use the hierarchical module features.")
  } catch (error) {
    console.error("❌ Error regenerating Prisma client:", error)
    process.exit(1)
  }
}

regeneratePrisma()
