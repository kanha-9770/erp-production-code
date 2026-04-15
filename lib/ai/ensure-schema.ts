/**
 * Auto-provisions AND repairs the AI subsystem tables.
 *
 * Three-phase idempotent setup:
 *   1. CREATE TABLE IF NOT EXISTS     — creates tables on fresh installs
 *   2. ALTER TABLE ADD COLUMN IF NOT EXISTS — repairs drift when tables exist
 *                                             from an older/partial schema
 *   3. CREATE INDEX IF NOT EXISTS     — ensures all indexes exist
 *   4. DO blocks for foreign keys     — adds FKs only if missing
 *
 * Drift repair uses NULLABLE columns for the NOT-NULL text fields because
 * Postgres can't add a NOT NULL TEXT column to a table with existing rows
 * without a default. Prisma will always provide values on write, so orphan
 * NULLs (from pre-drift rows) only affect legacy rows that nobody should
 * be reading anyway.
 *
 * Safe to run on every cold start — idempotent, no data loss.
 */

import { prisma } from "@/lib/prisma";

// ── CREATE TABLE statements (used for fresh installs) ────────────────────
const CREATE_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS "ai_providers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "default_model" TEXT NOT NULL,
    "available_models" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "temperature" DOUBLE PRECISION DEFAULT 0.7,
    "max_tokens" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE TABLE IF NOT EXISTS "ai_provider_keys" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "key_preview" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "cooldown_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_provider_keys_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE TABLE IF NOT EXISTS "chat_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "provider_id" TEXT,
    "model" TEXT,
    "system_prompt" TEXT,
    "temperature" DOUBLE PRECISION,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provider_name" TEXT,
    "model" TEXT,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
  );`,
];

// ── ALTER TABLE ADD COLUMN IF NOT EXISTS (drift repair) ──────────────────
// Columns that land on existing rows need either a DEFAULT or to be nullable.
// We use nullable for TEXT columns Prisma treats as required, because Postgres
// rejects "ALTER TABLE ... ADD COLUMN ... NOT NULL" on a non-empty table.
const ADD_COLUMNS: string[] = [
  // ai_providers
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "name" TEXT;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "display_name" TEXT;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "base_url" TEXT;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "default_model" TEXT;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "available_models" JSONB NOT NULL DEFAULT '[]';`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "temperature" DOUBLE PRECISION DEFAULT 0.7;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "max_tokens" INTEGER;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
  `ALTER TABLE "ai_providers" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  // ai_provider_keys
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "provider_id" TEXT;`,
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;`,
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "label" TEXT;`,
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "encrypted_key" TEXT;`,
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "key_preview" TEXT;`,
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;`,
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMP(3);`,
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "failure_count" INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "cooldown_until" TIMESTAMP(3);`,
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
  `ALTER TABLE "ai_provider_keys" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  // chat_conversations
  `ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "user_id" TEXT;`,
  `ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;`,
  `ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'New chat';`,
  `ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "provider_id" TEXT;`,
  `ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "model" TEXT;`,
  `ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "system_prompt" TEXT;`,
  `ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "temperature" DOUBLE PRECISION;`,
  `ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "is_pinned" BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
  `ALTER TABLE "chat_conversations" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,

  // chat_messages
  `ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "conversation_id" TEXT;`,
  `ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "role" TEXT;`,
  `ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "content" TEXT;`,
  `ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "provider_name" TEXT;`,
  `ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "model" TEXT;`,
  `ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "tokens_in" INTEGER;`,
  `ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "tokens_out" INTEGER;`,
  `ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;`,
];

// ── Indexes (idempotent) ──────────────────────────────────────────────────
const CREATE_INDEXES: string[] = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "ai_providers_organization_id_name_key" ON "ai_providers"("organization_id", "name");`,
  `CREATE INDEX IF NOT EXISTS "ai_providers_organization_id_idx" ON "ai_providers"("organization_id");`,
  `CREATE INDEX IF NOT EXISTS "ai_providers_is_active_idx" ON "ai_providers"("is_active");`,
  `CREATE INDEX IF NOT EXISTS "ai_providers_is_default_idx" ON "ai_providers"("is_default");`,
  `CREATE INDEX IF NOT EXISTS "ai_provider_keys_provider_id_idx" ON "ai_provider_keys"("provider_id");`,
  `CREATE INDEX IF NOT EXISTS "ai_provider_keys_organization_id_idx" ON "ai_provider_keys"("organization_id");`,
  `CREATE INDEX IF NOT EXISTS "ai_provider_keys_is_active_idx" ON "ai_provider_keys"("is_active");`,
  `CREATE INDEX IF NOT EXISTS "chat_conversations_user_id_idx" ON "chat_conversations"("user_id");`,
  `CREATE INDEX IF NOT EXISTS "chat_conversations_organization_id_idx" ON "chat_conversations"("organization_id");`,
  `CREATE INDEX IF NOT EXISTS "chat_conversations_updated_at_idx" ON "chat_conversations"("updated_at");`,
  `CREATE INDEX IF NOT EXISTS "chat_messages_conversation_id_idx" ON "chat_messages"("conversation_id");`,
  `CREATE INDEX IF NOT EXISTS "chat_messages_created_at_idx" ON "chat_messages"("created_at");`,
];

// ── Drop NOT NULL from any orphan columns (drift repair) ─────────────────
// When an older schema had extra NOT NULL columns that aren't in the current
// Prisma model (e.g. a legacy `sender` column on chat_messages from the
// deleted old chatbot), Prisma's INSERT fails because it doesn't know to
// provide values. We can't drop the columns (might lose data) but we CAN
// drop the NOT NULL constraint so new rows get NULL and inserts succeed.
const DROP_ORPHAN_NOT_NULL: string[] = [
  `DO $$
  DECLARE r RECORD;
  BEGIN
    FOR r IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ai_providers'
        AND is_nullable = 'NO'
        AND column_name NOT IN (
          'id','organization_id','name','display_name','base_url','default_model',
          'available_models','is_active','is_default','priority','created_at','updated_at'
        )
    LOOP
      EXECUTE format('ALTER TABLE "ai_providers" ALTER COLUMN %I DROP NOT NULL', r.column_name);
    END LOOP;
  END $$;`,
  `DO $$
  DECLARE r RECORD;
  BEGIN
    FOR r IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ai_provider_keys'
        AND is_nullable = 'NO'
        AND column_name NOT IN (
          'id','provider_id','organization_id','label','encrypted_key','key_preview',
          'is_active','failure_count','created_at','updated_at'
        )
    LOOP
      EXECUTE format('ALTER TABLE "ai_provider_keys" ALTER COLUMN %I DROP NOT NULL', r.column_name);
    END LOOP;
  END $$;`,
  `DO $$
  DECLARE r RECORD;
  BEGIN
    FOR r IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'chat_conversations'
        AND is_nullable = 'NO'
        AND column_name NOT IN (
          'id','user_id','organization_id','title','is_pinned','created_at','updated_at'
        )
    LOOP
      EXECUTE format('ALTER TABLE "chat_conversations" ALTER COLUMN %I DROP NOT NULL', r.column_name);
    END LOOP;
  END $$;`,
  `DO $$
  DECLARE r RECORD;
  BEGIN
    FOR r IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'chat_messages'
        AND is_nullable = 'NO'
        AND column_name NOT IN (
          'id','conversation_id','role','content','created_at'
        )
    LOOP
      EXECUTE format('ALTER TABLE "chat_messages" ALTER COLUMN %I DROP NOT NULL', r.column_name);
    END LOOP;
  END $$;`,
];

// ── Foreign keys (wrapped in DO blocks for idempotency) ───────────────────
const ADD_FOREIGN_KEYS: string[] = [
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'ai_provider_keys_provider_id_fkey'
        AND table_name = 'ai_provider_keys'
    ) THEN
      ALTER TABLE "ai_provider_keys"
        ADD CONSTRAINT "ai_provider_keys_provider_id_fkey"
        FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'chat_messages_conversation_id_fkey'
        AND table_name = 'chat_messages'
    ) THEN
      ALTER TABLE "chat_messages"
        ADD CONSTRAINT "chat_messages_conversation_id_fkey"
        FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;`,
];

let ensuring: Promise<void> | null = null;
let ensured = false;

export async function ensureAISchema(): Promise<void> {
  if (ensured) return;
  if (ensuring) return ensuring;

  ensuring = (async () => {
    console.log("[ensure-schema] Reconciling AI subsystem tables…");

    // Phase 1 — fresh-install table creation
    for (const stmt of CREATE_TABLES) {
      await runStatement(stmt, "CREATE TABLE");
    }
    // Phase 2 — drift repair (adds any columns missing from older schemas)
    for (const stmt of ADD_COLUMNS) {
      await runStatement(stmt, "ADD COLUMN");
    }
    // Phase 3 — drop NOT NULL from orphan columns (legacy drift repair)
    for (const stmt of DROP_ORPHAN_NOT_NULL) {
      await runStatement(stmt, "DROP ORPHAN NOT NULL");
    }
    // Phase 4 — indexes
    for (const stmt of CREATE_INDEXES) {
      await runStatement(stmt, "CREATE INDEX");
    }
    // Phase 5 — foreign keys
    for (const stmt of ADD_FOREIGN_KEYS) {
      await runStatement(stmt, "ADD CONSTRAINT");
    }

    console.log("[ensure-schema] Done.");
    ensured = true;
  })();

  try {
    await ensuring;
  } finally {
    ensuring = null;
  }
}

async function runStatement(stmt: string, phase: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(stmt);
  } catch (err) {
    const preview = stmt.replace(/\s+/g, " ").slice(0, 100);
    console.error(`[ensure-schema] ${phase} failed: ${preview}…`, err);
    throw err;
  }
}

export function resetEnsureSchemaCache() {
  ensured = false;
  ensuring = null;
}
