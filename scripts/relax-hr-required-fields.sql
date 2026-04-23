-- =============================================================================
-- HR — relax over-strict required-field validations
-- =============================================================================
-- The initial seed (create-hr-module.sql) marked several fields as required
-- that block everyday form submission:
--   • Check In / Check Out "Selfie"   — requires a device camera
--   • Check In / Check Out "Timestamp"— expected to auto-populate, not typed
--   • Check In / Check Out "Time"     — same
--   • Employee Master "Date of Joining" — fine for HR setup, but noisy for tests
-- Keeping these `required: true` means every submit hits validation before the
-- workflows / function bindings ever run — giving the false impression that
-- submission, functions and workflows are "all broken".
--
-- This patch clears just the `required` flag on those fields (keeps everything
-- else — accept, pattern, maxSize, etc.). Re-apply whenever you want to relax
-- or tighten from the form builder UI instead.
--
-- Safe to re-run. Non-destructive outside these specific fieldIds.
-- =============================================================================

BEGIN;

UPDATE form_fields
   SET validation = (validation::jsonb - 'required')::jsonb,
       updated_at = NOW()
 WHERE id IN (
    -- Check In: make camera/time fields optional for normal submission
    'fld_ci_selfie',
    'fld_ci_timestamp',
    'fld_ci_time',
    'fld_ci_status',

    -- Check Out: same
    'fld_co_selfie',
    'fld_co_timestamp',
    'fld_co_time',
    'fld_co_hr_status',

    -- Employee Master: drop required on the address/attachment-heavy fields
    -- that block quick record creation. Keep Employee ID, Name, Department,
    -- Email 1, and Status required — those are genuinely needed.
    'fld_emp_dob',
    'fld_emp_permanent_addr',
    'fld_emp_current_addr',
    'fld_emp_personal_contact',
    'fld_emp_date_joining',

    -- Leave: drop required on reason + from/to so a draft can be saved
    'fld_leave_from',
    'fld_leave_to',
    'fld_leave_reason',
    'fld_leave_status'
 );

-- =============================================================================
-- Report what we changed so you see it in the CLI output.
-- =============================================================================
DO $$
DECLARE v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
      FROM form_fields
     WHERE id IN (
        'fld_ci_selfie','fld_ci_timestamp','fld_ci_time','fld_ci_status',
        'fld_co_selfie','fld_co_timestamp','fld_co_time','fld_co_hr_status',
        'fld_emp_dob','fld_emp_permanent_addr','fld_emp_current_addr',
        'fld_emp_personal_contact','fld_emp_date_joining',
        'fld_leave_from','fld_leave_to','fld_leave_reason','fld_leave_status'
     );
    RAISE NOTICE 'Relaxed required validation on % fields.', v_count;
END $$;

COMMIT;

-- =============================================================================
-- Verify which HR fields are still required (after this patch)
-- =============================================================================
-- SELECT f.id, f.label, ff.label AS field, ff.validation
--   FROM form_fields ff
--   JOIN form_sections s ON s.id = ff.section_id
--   JOIN forms f         ON f.id = s.form_id
--   JOIN form_modules m  ON m.id = f.module_id
--  WHERE m.organization_id = 'cmo9uk3440005u7ngdg652eoq'
--    AND (ff.validation->>'required')::boolean = TRUE
--  ORDER BY f.name, ff."order";
