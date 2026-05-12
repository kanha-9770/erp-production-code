import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function buildClient() {
  const rawUrl = process.env.DATABASE_URL ?? "";
  // Supabase session-mode pool is capped at pool_size=15 connections for the
  // whole project. Cap Prisma's own pool at 3 so a single Next.js server
  // never exhausts it, even under bursts of concurrent server-side renders.
  // pool_timeout=15 makes a queued request wait up to 15 s before throwing,
  // which is safer than the default 10 s for heavier analytics queries.
  const url =
    rawUrl && !rawUrl.includes("connection_limit")
      ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}connection_limit=3&pool_timeout=15`
      : rawUrl;
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: url ? { db: { url } } : undefined,
  });
}

// Always pin the singleton — without this, Next.js dev hot-reloads (and
// any code path that re-imports this module) can leak PrismaClient
// instances, each opening its own pool of PG connections and exhausting
// the Supabase pooler (EMAXCONNSESSION).
export const prisma = globalForPrisma.prisma ?? buildClient();
globalForPrisma.prisma = prisma;

export { PrismaClient }
