-- ============================================================================
-- JSONB expression indexes for form_records_15
-- ----------------------------------------------------------------------------
-- form_records_15 holds ALL application users (as record_data JSON). Several
-- hot paths filter it by a JSON key with NO supporting index, which forces a
-- full sequential scan of the entire users table:
--
--   * Auth/login  — getUserByEmail / getUserRecords:  (record_data::jsonb)->>'email' = $1
--   * deleteRole  — role-in-use check:                (record_data::jsonb)->>'roleId' = $1
--
-- These btree EXPRESSION indexes must match the query expression EXACTLY
-- (note the `::jsonb` cast — the app queries use it), otherwise the planner
-- won't use them. The GIN index backs containment / key-existence queries
-- (e.g. the nested {type:'email', value:…} shape and ad-hoc record_data filters).
--
-- Idempotent — safe to run repeatedly. Apply against the app database:
--   psql "$DATABASE_URL" -f scripts/sql/jsonb_indexes_form_records_15.sql
--
-- Note: CREATE INDEX takes a brief lock. On a large live table prefer the
-- CONCURRENTLY variants (commented below), which can't run inside a txn block.
-- ============================================================================

-- Top-level email equality (primary login fast-path).
CREATE INDEX IF NOT EXISTS idx_form_records_15_email
  ON form_records_15 (((record_data::jsonb) ->> 'email'));

-- Role-assignment lookup (deleteRole in-use check).
CREATE INDEX IF NOT EXISTS idx_form_records_15_role_id
  ON form_records_15 (((record_data::jsonb) ->> 'roleId'));

-- General JSONB containment / key existence. jsonb_path_ops is smaller and
-- faster for the `@>` containment operator than the default jsonb_ops.
CREATE INDEX IF NOT EXISTS idx_form_records_15_record_data_gin
  ON form_records_15 USING gin (((record_data)::jsonb) jsonb_path_ops);

-- Refresh planner statistics so the new indexes are considered immediately.
ANALYZE form_records_15;

-- ── Zero-downtime variant for a large, busy table ──────────────────────────
-- Run these OUTSIDE a transaction (one statement at a time) instead of the
-- locking CREATE INDEX above:
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_form_records_15_email
--   ON form_records_15 (((record_data::jsonb) ->> 'email'));
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_form_records_15_role_id
--   ON form_records_15 (((record_data::jsonb) ->> 'roleId'));
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_form_records_15_record_data_gin
--   ON form_records_15 USING gin (((record_data)::jsonb) jsonb_path_ops);
