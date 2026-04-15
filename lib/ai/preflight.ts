/**
 * Preflight checks for the AI subsystem.
 *
 * 1. Prisma client delegate exists → else "run prisma generate"
 * 2. ensureAISchema() runs on first request — creates missing tables AND
 *    repairs column-level drift from older/partial schemas
 *
 * Once setup succeeds, the result is cached in-process so we don't re-run
 * on every request. ensureAISchema itself is internally cached too.
 */

import { prisma } from "@/lib/prisma";
import { ensureAISchema, resetEnsureSchemaCache } from "./ensure-schema";

export type PreflightError = {
  status: number;
  code: "client_stale" | "tables_missing" | "secret_missing" | "other";
  message: string;
};

let cachedOk = false;

export async function preflight(_opts?: {
  requireSecret?: boolean;
}): Promise<PreflightError | null> {
  // AI_KEYS_SECRET is auto-provisioned by lib/ai/crypto.ts — no gating needed.
  if (cachedOk) return null;

  const anyPrisma = prisma as unknown as {
    aIProvider?: { findFirst?: unknown };
    aIProviderKey?: { findFirst?: unknown };
    chatConversation?: { findFirst?: unknown };
    chatMessage?: { findFirst?: unknown };
  };
  if (
    !anyPrisma.aIProvider ||
    typeof anyPrisma.aIProvider.findFirst !== "function" ||
    !anyPrisma.aIProviderKey ||
    typeof anyPrisma.aIProviderKey.findFirst !== "function" ||
    !anyPrisma.chatConversation ||
    typeof anyPrisma.chatConversation.findFirst !== "function" ||
    !anyPrisma.chatMessage ||
    typeof anyPrisma.chatMessage.findFirst !== "function"
  ) {
    return {
      status: 500,
      code: "client_stale",
      message:
        "Prisma client is out of date — it does not know about AIProvider / AIProviderKey / ChatConversation / ChatMessage. Stop the dev server, close VSCode TS server, then run: npx prisma generate",
    };
  }

  // Always run ensureAISchema on first call. It handles:
  //   - Fresh installs (CREATE TABLE IF NOT EXISTS)
  //   - Drift repair (ALTER TABLE ADD COLUMN IF NOT EXISTS for every column)
  //   - Missing indexes / foreign keys
  try {
    await ensureAISchema();
  } catch (err) {
    const emsg = (err as Error).message ?? "";
    if (/permission denied|must be owner|not authorized/i.test(emsg)) {
      return {
        status: 500,
        code: "tables_missing",
        message: `AI schema setup lacks DB permissions (${emsg}). Run manually: npx prisma migrate dev --name add_ai_chatbot`,
      };
    }
    return {
      status: 500,
      code: "tables_missing",
      message: `AI schema setup failed: ${emsg}. Run manually: npx prisma migrate dev --name add_ai_chatbot`,
    };
  }

  cachedOk = true;
  return null;
}

export function resetPreflightCache() {
  cachedOk = false;
  resetEnsureSchemaCache();
}
