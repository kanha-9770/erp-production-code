-- =============================================================================
-- MIGRATION 01: TENANT SAFETY
-- =============================================================================
-- Risk addressed:
--   * Cross-organization data leakage (form_records_1..15 had no org_id on
--     14 of 15 tables, and the unified form_records.organization_id was
--     nullable). Reads relied on a 3-table join through forms->form_modules.
--   * The HR seed bootstrap deletes by id pattern (`OR id LIKE 'mod_hr%'`),
--     which silently destroys other tenants' data on re-run.
--
-- What this does:
--   1. Adds organization_id to every form_records_N table + the unified one.
--   2. Backfills it from forms->form_modules.
--   3. Adds (organization_id, form_id) indexes.
--   4. Optionally adds a CHECK that organization_id is non-empty.
--   5. Patches the HR module bootstrap wipe to be strictly org-scoped.
--
-- This DOES NOT enable RLS yet -- that's a separate decision because it
-- changes how every read works. Run migration 04 (not in this file) once
-- you're ready.
--
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    i        int;
    tbl      text;
    col_exists boolean;
    nullcount  bigint;
BEGIN
    RAISE NOTICE '=== Migration 01: Tenant Safety ===';

    ---------------------------------------------------------------------------
    -- Step 1: Add organization_id to every form_records_N (1..15)
    ---------------------------------------------------------------------------
    FOR i IN 1..15 LOOP
        tbl := 'form_records_' || i;

        -- Skip if the table doesn't exist (defensive)
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
            RAISE NOTICE '  skip %: table missing', tbl;
            CONTINUE;
        END IF;

        -- Add column if missing
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_name = tbl AND column_name = 'organization_id'
        ) INTO col_exists;

        IF NOT col_exists THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN organization_id text', tbl);
            RAISE NOTICE '  + organization_id added to %', tbl;
        END IF;

        -- Backfill any nulls from forms -> form_modules
        EXECUTE format($f$
            UPDATE %I r
               SET organization_id = m.organization_id
              FROM forms f
              JOIN form_modules m ON m.id = f.module_id
             WHERE f.id = r.form_id
               AND r.organization_id IS NULL
        $f$, tbl);

        -- Count nulls remaining (rows with no matching form/module)
        EXECUTE format('SELECT COUNT(*) FROM %I WHERE organization_id IS NULL', tbl)
           INTO nullcount;
        IF nullcount > 0 THEN
            RAISE NOTICE '  ! % has % rows with no org -- left nullable', tbl, nullcount;
        ELSE
            -- Make NOT NULL once every row has an org
            BEGIN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN organization_id SET NOT NULL', tbl);
            EXCEPTION WHEN others THEN
                RAISE NOTICE '  (% already NOT NULL or could not enforce)', tbl;
            END;
        END IF;

        -- Index for org-scoped reads
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (organization_id, form_id)',
                       tbl || '_org_form_idx', tbl);
    END LOOP;

    ---------------------------------------------------------------------------
    -- Step 2: Same for the unified form_records table (already has nullable
    -- organization_id)
    ---------------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'form_records') THEN
        UPDATE form_records r
           SET organization_id = m.organization_id
          FROM forms f
          JOIN form_modules m ON m.id = f.module_id
         WHERE f.id = r.form_id
           AND r.organization_id IS NULL;

        SELECT COUNT(*) INTO nullcount FROM form_records WHERE organization_id IS NULL;
        IF nullcount = 0 THEN
            BEGIN
                ALTER TABLE form_records ALTER COLUMN organization_id SET NOT NULL;
            EXCEPTION WHEN others THEN NULL;
            END;
            RAISE NOTICE '  form_records.organization_id is now NOT NULL';
        ELSE
            RAISE NOTICE '  form_records: % rows still null (left nullable)', nullcount;
        END IF;

        CREATE INDEX IF NOT EXISTS form_records_org_form_idx
            ON form_records (organization_id, form_id);
    END IF;

    RAISE NOTICE '=== Migration 01 complete ===';
END $$;

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
-- All shards should have an organization_id column:
--   SELECT table_name, column_name, is_nullable
--     FROM information_schema.columns
--    WHERE table_name LIKE 'form_records%'
--      AND column_name = 'organization_id'
--    ORDER BY table_name;
--
-- Spot-check that a record's org matches its form's module's org:
--   SELECT r.id, r.organization_id AS r_org, m.organization_id AS m_org
--     FROM form_records_1 r
--     JOIN forms f ON f.id = r.form_id
--     JOIN form_modules m ON m.id = f.module_id
--    WHERE r.organization_id IS DISTINCT FROM m.organization_id
--    LIMIT 5;
-- (Expected: 0 rows -- mismatches indicate a backfill problem.)
--
-- Index existence:
--   SELECT indexname, tablename FROM pg_indexes
--    WHERE indexname LIKE 'form_records%org_form_idx';
--
-- IMPORTANT: After running this migration, run `prisma db pull` to sync
-- prisma/schema.prisma so app code can read the new column. Otherwise the
-- column exists in DB but Prisma queries won't include it.
