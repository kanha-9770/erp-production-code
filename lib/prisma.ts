import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

// Always pin the singleton — without this, Next.js dev hot-reloads (and
// any code path that re-imports this module) can leak PrismaClient
// instances, each opening its own pool of PG connections and exhausting
// the Supabase pooler (EMAXCONNSESSION).
globalForPrisma.prisma = prisma

export { PrismaClient }
