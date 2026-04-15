/**
 * Builds a compact context summary for the chatbot's system prompt.
 *
 * Injected into every chat request so the LLM knows who the user is, what
 * org they belong to, whether they're an admin, and how many modules they
 * can see. The LLM can call tools to drill deeper.
 *
 * Cached in-process with a 60s TTL keyed by userId+orgId — the big win here
 * is eliminating 4 DB round-trips on every follow-up message in a
 * conversation. Stale context is low-risk because every tool still runs its
 * own permission checks per-call.
 */

import { prisma } from "@/lib/prisma";
import { isUserAdmin } from "@/lib/api-helpers";

export interface UserContext {
  userId: string;
  email: string;
  organizationId: string;
  organizationName: string | null;
  displayName: string;
  isAdmin: boolean;
  roles: string[];
  moduleCount: number;
}

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes — user/org/role data rarely changes
const cache = new Map<string, { ctx: UserContext; expires: number }>();

export function invalidateUserContext(userId: string, organizationId?: string) {
  if (organizationId) {
    cache.delete(`${userId}:${organizationId}`);
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

export async function buildUserContext(
  userId: string,
  organizationId: string
): Promise<UserContext | null> {
  const cacheKey = `${userId}:${organizationId}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.ctx;
  }

  // All three queries run in parallel — the old version waited for user+admin
  // before starting the module count.
  const [user, isAdmin, moduleCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        username: true,
        organization: { select: { id: true, name: true } },
        unitAssignments: {
          where: {
            role: { isActive: true },
            unit: { isActive: true },
          },
          select: {
            role: { select: { name: true, isAdmin: true } },
          },
        },
      },
    }),
    isUserAdmin(userId, organizationId),
    prisma.formModule.count({ where: { organizationId } }),
  ]);

  if (!user) return null;

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    user.email;

  const roles = Array.from(
    new Set(user.unitAssignments.map((a) => a.role.name).filter(Boolean))
  );

  const ctx: UserContext = {
    userId: user.id,
    email: user.email,
    organizationId,
    organizationName: user.organization?.name ?? null,
    displayName,
    isAdmin,
    roles,
    moduleCount,
  };

  cache.set(cacheKey, { ctx, expires: now + CACHE_TTL_MS });
  return ctx;
}

export function renderContextForSystemPrompt(ctx: UserContext): string {
  const lines: string[] = [
    "## Current user context",
    `- Name: ${ctx.displayName}`,
    `- Email: ${ctx.email}`,
    `- Organization: ${ctx.organizationName ?? "(none)"}`,
    `- Role: ${ctx.isAdmin ? "Administrator" : "Standard user"}`,
  ];
  if (ctx.roles.length > 0) {
    lines.push(`- Assigned roles: ${ctx.roles.join(", ")}`);
  }
  lines.push(`- Accessible modules in this org: ${ctx.moduleCount}`);
  lines.push(`- Current date: ${new Date().toISOString().split("T")[0]}`);
  lines.push("");
  lines.push(
    "Use the available tools to answer questions about ERP data. Always scope queries to the current organization."
  );
  return lines.join("\n");
}
