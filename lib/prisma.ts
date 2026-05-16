import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Connection strategy (Supabase):
 *  - DATABASE_URL must point at the TRANSACTION pooler (port 6543).
 *    In transaction mode a DB connection is only held for the duration
 *    of a query/transaction, so a small pool serves high concurrency.
 *  - pgbouncer=true is REQUIRED in transaction mode (disables Prisma
 *    prepared statements, which Supavisor transaction mode rejects).
 *  - Migrations use DIRECT_URL (port 5432) via schema.prisma's directUrl.
 *
 * connection_limit here is the client->pooler limit, NOT held PG
 * connections — 10 is safe for a single long-running container. Use 1
 * only for true serverless. Override per env if you run many instances.
 */
function buildClient() {
  const rawUrl = process.env.DATABASE_URL ?? ""
  if (!rawUrl) return new PrismaClient({ log: ["error"] })

  const sep = rawUrl.includes("?") ? "&" : "?"
  const params: string[] = []
  if (!rawUrl.includes("pgbouncer=")) params.push("pgbouncer=true")
  if (!rawUrl.includes("connection_limit=")) params.push("connection_limit=10")
  if (!rawUrl.includes("pool_timeout=")) params.push("pool_timeout=20")

  const url = params.length ? `${rawUrl}${sep}${params.join("&")}` : rawUrl

  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
    datasources: { db: { url } },
  })
}

// Pin the singleton so dev hot-reloads / module re-imports never leak
// PrismaClient instances (each would open its own pool).
export const prisma = globalForPrisma.prisma ?? buildClient()
globalForPrisma.prisma = prisma

export { PrismaClient }