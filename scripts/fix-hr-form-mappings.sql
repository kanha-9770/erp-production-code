-- =============================================================================
-- HR — fix form -> storage-table mappings
-- =============================================================================
-- The initial seed mapped these 5 HR forms to the unified `form_records` table,
-- but the submit route (app/api/forms/[formId]/submit/route.ts) only knows how
-- to write to sharded tables form_records_1..15. The unified table is a
-- dual-write target, not a primary target. That's why submit fails with:
--     {"error":"Failed to submit form","details":"Unsupported table: form_records"}
--
-- This patch remaps the 5 affected forms to sharded tables:
--     form_hr_payroll_record      -> form_records_1
--     form_hr_salary_slip         -> form_records_2
--     form_hr_checkin             -> form_records_3
--     form_hr_checkout            -> form_records_4
--     form_hr_leave_application   -> form_records_5
--
-- Employee Master already lives on form_records_14 and is left untouched.
-- Safe to re-run.
-- =============================================================================

BEGIN;

UPDATE form_table_mappings SET storage_table = 'form_records_1', updated_at = NOW()
 WHERE id = 'ftm_hr_payroll_record';

UPDATE form_table_mappings SET storage_table = 'form_records_2', updated_at = NOW()
 WHERE id = 'ftm_hr_salary_slip';

UPDATE form_table_mappings SET storage_table = 'form_records_3', updated_at = NOW()
 WHERE id = 'ftm_hr_checkin';

UPDATE form_table_mappings SET storage_table = 'form_records_4', updated_at = NOW()
 WHERE id = 'ftm_hr_checkout';

UPDATE form_table_mappings SET storage_table = 'form_records_5', updated_at = NOW()
 WHERE id = 'ftm_hr_leave_application';

-- =============================================================================
-- Verify
-- =============================================================================
DO $$
DECLARE r RECORD;
BEGIN
    RAISE NOTICE '--- HR form storage mappings after patch ---';
    FOR r IN
        SELECT id, form_id, storage_table
          FROM form_table_mappings
         WHERE id LIKE 'ftm_hr_%'
         ORDER BY id
    LOOP
        RAISE NOTICE '  %  ->  %  (%)', r.form_id, r.storage_table, r.id;
    END LOOP;
END $$;

COMMIT;
