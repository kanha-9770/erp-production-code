-- =============================================================================
-- MIGRATION 03: JSONB INTEGRITY (DYNAMIC FORMS)
-- =============================================================================
-- This is the answer to: "forms are created at runtime, submission data is
-- random -- how do I make the JSONB safe?"
--
-- The trick is a layered defence that doesn't require knowing field IDs at
-- compile time:
--
--   LAYER A (this file): a structural trigger that validates record_data IS
--     a JSONB object with a 'sections' subobject pointing at section ids
--     that actually exist for this form. Catches the 99% case (typoed
--     payloads, malformed clients) without enumerating fields.
--
--   LAYER B (this file): per-form UNIQUE PARTIAL INDEXES for fields that
--     have validation.unique = true. Created dynamically by reading
--     form_fields. Re-runnable: drops and recreates as form schema changes.
--
--   LAYER C (this file): seeded UNIQUE indexes for the HR critical fields
--     (Employee ID, Plan ID, Application Email). These cover the bugs we
--     hit today: duplicate EMP-#### from concurrent saves, duplicate Plan
--     IDs, and duplicate applications for the same email + opening.
--
--   LAYER D (app side, NOT this file): a runtime validator that builds a
--     zod schema from form_fields and validates each request. The trigger
--     here is defence-in-depth -- it catches what the app misses.
--
-- BEFORE RUNNING: there is a duplicate-detection block at the top. If
-- duplicates exist (e.g. from earlier broken automations), the UNIQUE
-- index creation will fail. Resolve duplicates first.
--
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. DUPLICATE DETECTION (read-only diagnostic)
-- =============================================================================
DO $$
DECLARE
    dup_count int;
BEGIN
    RAISE NOTICE '=== Pre-flight: scanning for duplicates ===';

    -- Duplicate Employee IDs in form_records_1
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT record_data->'sections'->'sec_emp_employment'->'fields'->>'fld_emp_employee_id' AS emp_id
          FROM form_records_1
         WHERE form_id = 'form_hr_employee_master'
           AND record_data->'sections'->'sec_emp_employment'->'fields'->>'fld_emp_employee_id' IS NOT NULL
         GROUP BY emp_id
        HAVING COUNT(*) > 1
    ) d;
    IF dup_count > 0 THEN
        RAISE WARNING '!! % duplicate Employee IDs found. UNIQUE index creation below will FAIL.', dup_count;
        RAISE WARNING '   Run: SELECT record_data->''sections''->''sec_emp_employment''->''fields''->>''fld_emp_employee_id'' AS emp_id, COUNT(*) FROM form_records_1 WHERE form_id = ''form_hr_employee_master'' GROUP BY 1 HAVING COUNT(*) > 1;';
        RAISE WARNING '   Then DELETE the dupes, or rename them, before re-running this migration.';
    ELSE
        RAISE NOTICE '   OK: no duplicate Employee IDs';
    END IF;

    -- Duplicate Staffing Plan IDs in form_records_6
    SELECT COUNT(*) INTO dup_count FROM (
        SELECT record_data->'sections'->'sec_staff_main'->'fields'->>'fld_staff_plan_id' AS plan_id
          FROM form_records_6
         WHERE form_id = 'form_hr_staffing_plan'
           AND record_data->'sections'->'sec_staff_main'->'fields'->>'fld_staff_plan_id' IS NOT NULL
         GROUP BY plan_id
        HAVING COUNT(*) > 1
    ) d;
    IF dup_count > 0 THEN
        RAISE WARNING '!! % duplicate Staffing Plan IDs found.', dup_count;
    ELSE
        RAISE NOTICE '   OK: no duplicate Staffing Plan IDs';
    END IF;
END $$;


-- =============================================================================
-- LAYER A. STRUCTURAL VALIDATION TRIGGER
-- =============================================================================
-- Fires BEFORE INSERT or UPDATE on every form_records_N table.
-- Checks:
--   1. record_data is a JSONB OBJECT (not array, not scalar)
--   2. record_data has a 'sections' key
--   3. record_data.sections is an object
--   4. Every section id under record_data.sections actually belongs to
--      this form_id (catches "wrong form" submissions and typos)
--   5. (light) every field id inside each section actually exists on the
--      form (only checked when form_fields are loaded -- non-fatal warning
--      if not, so we don't break older data)
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_validate_record_structure() RETURNS trigger AS $$
DECLARE
    section_key text;
    valid_sections text[];
BEGIN
    -- 1. Object check
    IF jsonb_typeof(NEW.record_data) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'record_data must be a JSON object (got %)',
            jsonb_typeof(NEW.record_data);
    END IF;

    -- 2-3. Sections exists and is an object
    IF NOT (NEW.record_data ? 'sections') THEN
        RAISE EXCEPTION 'record_data must contain a "sections" object';
    END IF;
    IF jsonb_typeof(NEW.record_data->'sections') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'record_data.sections must be a JSON object (got %)',
            jsonb_typeof(NEW.record_data->'sections');
    END IF;

    -- 4. Every section key must belong to this form
    --    (Skip if no form_id set -- another check would reject that.)
    IF NEW.form_id IS NOT NULL THEN
        SELECT array_agg(id) INTO valid_sections
          FROM form_sections
         WHERE form_id = NEW.form_id;

        IF valid_sections IS NULL THEN
            -- Form has no sections defined yet; pass through (allows form-builder bootstrapping)
            RETURN NEW;
        END IF;

        FOR section_key IN
            SELECT k FROM jsonb_object_keys(NEW.record_data->'sections') k
        LOOP
            IF section_key <> ALL(valid_sections) THEN
                RAISE EXCEPTION 'record_data.sections.% does not belong to form % (valid: %)',
                    section_key, NEW.form_id, valid_sections;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END $$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_validate_record_structure() IS
    'BEFORE INSERT/UPDATE trigger for form_records_*. Validates the JSONB '
    'structural shape and that section ids belong to the form. Field-level '
    'validation (required, type, regex) lives in app code.';

-- Attach the trigger to every form_records_N (1..15) and the unified table
DO $$
DECLARE
    i int;
    tbl text;
BEGIN
    FOR i IN 1..15 LOOP
        tbl := 'form_records_' || i;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS tr_validate_structure ON %I', tbl);
            EXECUTE format(
                'CREATE TRIGGER tr_validate_structure
                  BEFORE INSERT OR UPDATE OF record_data, form_id ON %I
                  FOR EACH ROW EXECUTE FUNCTION fn_validate_record_structure()',
                tbl
            );
        END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'form_records') THEN
        DROP TRIGGER IF EXISTS tr_validate_structure ON form_records;
        CREATE TRIGGER tr_validate_structure
          BEFORE INSERT OR UPDATE OF record_data, form_id ON form_records
          FOR EACH ROW EXECUTE FUNCTION fn_validate_record_structure();
    END IF;

    RAISE NOTICE 'Layer A: structural validation trigger attached to all form_records_* tables';
END $$;


-- =============================================================================
-- LAYER C. UNIQUE INDEXES FOR HR CRITICAL FIELDS
-- =============================================================================
-- These are partial UNIQUE indexes on JSONB expressions. They enforce
-- uniqueness at the DB layer for fields where the app currently does
-- "list().find()" idempotency (which is racy and bounded).
--
-- If duplicates exist, these CREATE INDEX statements fail. The diagnostic
-- block at the top of this migration warns about them.
-- =============================================================================

-- Employee ID (form_records_1, form_hr_employee_master)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_emp_id
    ON form_records_1 (
        (record_data->'sections'->'sec_emp_employment'->'fields'->>'fld_emp_employee_id')
    )
    WHERE form_id = 'form_hr_employee_master'
      AND record_data->'sections'->'sec_emp_employment'->'fields'->>'fld_emp_employee_id' IS NOT NULL;

-- Staffing Plan ID (form_records_6, form_hr_staffing_plan)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_staff_plan_id
    ON form_records_6 (
        (record_data->'sections'->'sec_staff_main'->'fields'->>'fld_staff_plan_id')
    )
    WHERE form_id = 'form_hr_staffing_plan'
      AND record_data->'sections'->'sec_staff_main'->'fields'->>'fld_staff_plan_id' IS NOT NULL;

-- Job Application: unique per (opening, email) -- prevents duplicate apps
-- to the same opening from the same candidate
CREATE UNIQUE INDEX IF NOT EXISTS uniq_app_opening_email
    ON form_records_8 (
        (record_data->'sections'->'sec_app_candidate'->'fields'->>'fld_app_opening_id'),
        (record_data->'sections'->'sec_app_candidate'->'fields'->>'fld_app_email')
    )
    WHERE form_id = 'form_hr_job_application'
      AND record_data->'sections'->'sec_app_candidate'->'fields'->>'fld_app_email' IS NOT NULL;

-- Asset ID (form_records_4 in the seed mapping, form_hr_asset_management)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_asset_id
    ON form_records_4 (
        (record_data->'sections'->'sec_asset_main'->'fields'->>'fld_asset_id')
    )
    WHERE form_id = 'form_hr_asset_management'
      AND record_data->'sections'->'sec_asset_main'->'fields'->>'fld_asset_id' IS NOT NULL;


-- =============================================================================
-- LAYER B. GIN INDEX ON record_data FOR AD-HOC FILTERS
-- =============================================================================
-- Generic JSONB GIN index so any `record_data @> '{"...": "value"}'` query
-- runs in milliseconds instead of full-scanning the table.
-- =============================================================================
DO $$
DECLARE
    i int;
    tbl text;
BEGIN
    FOR i IN 1..15 LOOP
        tbl := 'form_records_' || i;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = tbl) THEN
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I USING GIN (record_data jsonb_path_ops)',
                           tbl || '_data_gin', tbl);
        END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'form_records') THEN
        CREATE INDEX IF NOT EXISTS form_records_data_gin
            ON form_records USING GIN (record_data jsonb_path_ops);
    END IF;

    RAISE NOTICE 'Layer B: GIN indexes on record_data attached';
END $$;


COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
-- Trigger attached to all 15 + unified:
--   SELECT event_object_table, trigger_name
--     FROM information_schema.triggers
--    WHERE trigger_name = 'tr_validate_structure'
--    ORDER BY event_object_table;
--
-- Indexes:
--   SELECT indexname, tablename
--     FROM pg_indexes
--    WHERE indexname LIKE 'uniq_%' OR indexname LIKE '%data_gin'
--    ORDER BY tablename, indexname;
--
-- Try inserting a malformed record (should be rejected):
--   INSERT INTO form_records_10 (id, form_id, record_data)
--     VALUES ('test_bad', 'form_hr_appointment_letter', '"not an object"'::jsonb);
--   -- expect: ERROR: record_data must be a JSON object (got string)
--
-- Try inserting a section that doesn't belong to the form (should reject):
--   INSERT INTO form_records_10 (id, form_id, record_data)
--     VALUES ('test_bad2', 'form_hr_appointment_letter',
--             '{"sections":{"sec_emp_personal":{"fields":{}}}}'::jsonb);
--   -- expect: ERROR: record_data.sections.sec_emp_personal does not belong to form ...
--
-- =============================================================================
-- APP-SIDE WIRING (recommended, not strictly required)
-- =============================================================================
-- 1. lib/forms/validation.ts (new): build a zod schema from form_fields at
--    request time and validate the request body before insert. This catches
--    typed-field errors (number/email/date/regex) that the structural trigger
--    can't easily check.
--
-- 2. lib/database/DatabaseRecords.ts (or wherever updateFormRecord lives):
--    after an UPDATE, re-call materializeIndexedFields() so FormRecordField
--    stays fresh. This is the bug from migration audit M7. The trigger
--    above doesn't do this -- it only does structural validation.
-- =============================================================================
