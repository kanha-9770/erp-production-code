-- =============================================================================
-- HR EMPLOYEE LOOKUP - DIAGNOSTIC REPORT
-- =============================================================================
-- Read-only. Safe to run any time.
--
-- When the auto-fill (type Employee ID -> First/Last/Department populate)
-- isn't working, run this and read the NOTICEs from top to bottom. The first
-- check that prints "MISSING" / "0 rows" is your problem.
--
-- Pipeline this verifies (in order):
--   1. Module / form / fields exist            (create-hr-module.sql)
--   2. Lookup function fn_hr_lookup_employee   (create-hr-automations.sql)
--   3. 10 onFieldChange bindings (one per HR form using auto-fill)
--   4. 10 workflow-rule safety nets
--   5. Employee Master has rows in its storage table
--   6. The Employee IDs actually present (so you can see what to type)
--   7. Field-label sanity: the lookup returns "First Name" / "Last Name" /
--      "Department" - those labels MUST exist on every auto-fill form for
--      auto-output mode to populate them.
-- =============================================================================

DO $$
DECLARE
    v_org_id          TEXT := 'cmo9uk3440005u7ngdg652eoq';
    v_form_id         TEXT := 'form_hr_employee_master';
    v_storage_table   TEXT;
    v_emp_count       INTEGER;
    v_fn_exists       BOOLEAN;
    v_binding_count   INTEGER;
    v_rule_count      INTEGER;
    v_label_misses    INTEGER;
    r                 RECORD;
    r_id              TEXT;
    sql_text          TEXT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=========================================================';
    RAISE NOTICE 'HR EMPLOYEE LOOKUP DIAGNOSTIC';
    RAISE NOTICE '  Organization: %', v_org_id;
    RAISE NOTICE '=========================================================';

    -- -----------------------------------------------------------------------
    -- 0. ORG SANITY
    -- -----------------------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id) THEN
        RAISE NOTICE '[FAIL] Organization % does not exist.', v_org_id;
        RAISE NOTICE '       Edit v_org_id at the top of this script.';
        RETURN;
    END IF;
    RAISE NOTICE '[OK]   Organization exists.';

    -- -----------------------------------------------------------------------
    -- 1. EMPLOYEE MASTER FORM EXISTS (scoped via form_modules.organization_id)
    -- -----------------------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1
          FROM forms f
          JOIN form_modules m ON m.id = f.module_id
         WHERE f.id = v_form_id
           AND m.organization_id = v_org_id
    ) THEN
        RAISE NOTICE '[FAIL] Form "%" not found in this org. Run create-hr-module.sql first.', v_form_id;
        RETURN;
    END IF;
    RAISE NOTICE '[OK]   Form "form_hr_employee_master" exists.';

    -- -----------------------------------------------------------------------
    -- 2. LOOKUP FUNCTION SEEDED
    -- -----------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM crm_functions
         WHERE id = 'fn_hr_lookup_employee'
           AND organization_id = v_org_id
    ) INTO v_fn_exists;

    IF NOT v_fn_exists THEN
        RAISE NOTICE '[FAIL] Function fn_hr_lookup_employee is MISSING.';
        RAISE NOTICE '       Run scripts/create-hr-automations.sql.';
    ELSE
        RAISE NOTICE '[OK]   Function fn_hr_lookup_employee is seeded.';
    END IF;

    -- -----------------------------------------------------------------------
    -- 3. FUNCTION BINDINGS (onFieldChange auto-fill)
    -- -----------------------------------------------------------------------
    SELECT COUNT(*) INTO v_binding_count
      FROM function_bindings
     WHERE organization_id = v_org_id
       AND function_id     = 'fn_hr_lookup_employee'
       AND event           = 'onFieldChange'
       AND active          = TRUE;

    RAISE NOTICE '[%]   Active onFieldChange bindings using lookup: % (expected 10)',
        CASE WHEN v_binding_count = 10 THEN 'OK ' ELSE 'WARN' END,
        v_binding_count;

    IF v_binding_count > 0 THEN
        RAISE NOTICE '       Per-form bindings:';
        FOR r IN
            SELECT fb.id, f.name AS form_name, fld.label AS field_label, fb.active
              FROM function_bindings fb
              LEFT JOIN forms f         ON f.id   = fb.form_id
              LEFT JOIN form_fields fld ON fld.id = fb.field_id
             WHERE fb.organization_id = v_org_id
               AND fb.function_id     = 'fn_hr_lookup_employee'
               AND fb.event           = 'onFieldChange'
             ORDER BY f.name
        LOOP
            RAISE NOTICE '         % -> % / % (active=%)',
                r.id,
                COALESCE(r.form_name,  '(no form)'),
                COALESCE(r.field_label,'(no field)'),
                r.active;
        END LOOP;
    END IF;

    -- -----------------------------------------------------------------------
    -- 4. WORKFLOW-RULE SAFETY NETS
    -- -----------------------------------------------------------------------
    SELECT COUNT(*) INTO v_rule_count
      FROM workflow_rules
     WHERE organization_id = v_org_id
       AND id LIKE 'wfr_hr_autofill_%'
       AND active = TRUE;

    RAISE NOTICE '[%]   Server-side autofill safety-net rules: % (expected 10)',
        CASE WHEN v_rule_count = 10 THEN 'OK ' ELSE 'WARN' END,
        v_rule_count;

    -- -----------------------------------------------------------------------
    -- 5. RESOLVE EMPLOYEE MASTER STORAGE TABLE
    -- -----------------------------------------------------------------------
    SELECT storage_table
      INTO v_storage_table
      FROM form_table_mappings
     WHERE form_id = v_form_id
     LIMIT 1;

    IF v_storage_table IS NULL THEN
        RAISE NOTICE '[FAIL] Employee Master has NO form_table_mappings row.';
        RAISE NOTICE '       The form will throw on submit AND on ctx.records.list("Employee Master").';
        RETURN;
    END IF;
    RAISE NOTICE '[OK]   Employee Master storage table = %', v_storage_table;

    -- -----------------------------------------------------------------------
    -- 6. COUNT EMPLOYEE MASTER RECORDS
    -- -----------------------------------------------------------------------
    sql_text := format(
        'SELECT COUNT(*) FROM %I WHERE form_id = %L',
        v_storage_table, v_form_id
    );
    EXECUTE sql_text INTO v_emp_count;

    IF v_emp_count = 0 THEN
        RAISE NOTICE '[FAIL] Employee Master is EMPTY (0 records).';
        RAISE NOTICE '       Lookup has nothing to match against.';
        RAISE NOTICE '       -> Open the Employee Master form, create at least one';
        RAISE NOTICE '          employee with a known Employee ID (e.g. EMP-0001).';
    ELSE
        RAISE NOTICE '[OK]   Employee Master record count: %', v_emp_count;
    END IF;

    -- -----------------------------------------------------------------------
    -- 7. DUMP ACTUAL EMPLOYEE IDs (so you know what to type)
    -- -----------------------------------------------------------------------
    IF v_emp_count > 0 THEN
        RAISE NOTICE '       Employee IDs currently in DB (first 20):';

        sql_text := format($f$
            SELECT
                COALESCE(
                    (record_data #>> '{sections,sec_emp_employment,fields,fld_emp_employee_id,value}'),
                    (record_data #>> '{sections,sec_emp_employment,fields,fld_emp_employee_id}')
                ) AS emp_id,
                COALESCE(
                    (record_data #>> '{sections,sec_emp_personal,fields,fld_emp_first_name,value}'),
                    (record_data #>> '{sections,sec_emp_personal,fields,fld_emp_first_name}')
                ) AS first_name,
                COALESCE(
                    (record_data #>> '{sections,sec_emp_personal,fields,fld_emp_last_name,value}'),
                    (record_data #>> '{sections,sec_emp_personal,fields,fld_emp_last_name}')
                ) AS last_name,
                id AS record_id
              FROM %I
             WHERE form_id = %L
             ORDER BY created_at DESC
             LIMIT 20
        $f$, v_storage_table, v_form_id);

        FOR r IN EXECUTE sql_text LOOP
            RAISE NOTICE '         "%"  ->  % %  (record %)',
                COALESCE(r.emp_id,    '(no Employee ID stored!)'),
                COALESCE(r.first_name,''),
                COALESCE(r.last_name, ''),
                r.record_id;
        END LOOP;
    END IF;

    -- -----------------------------------------------------------------------
    -- 8. AUTO-FILL TARGET-LABEL SANITY
    -- The lookup returns keys "First Name" / "Last Name" / "Department" /
    -- "Middle Name". For autoOutput mode to write them, every auto-fill
    -- form needs fields with EXACTLY those labels (case-sensitive).
    -- -----------------------------------------------------------------------
    RAISE NOTICE '';
    RAISE NOTICE '       Auto-fill target labels per form:';

    v_label_misses := 0;
    FOR r IN
        SELECT
            fid AS form_id,
            f.name AS form_name,
            BOOL_OR(fld.label = 'First Name') AS has_first,
            BOOL_OR(fld.label = 'Last Name')  AS has_last,
            BOOL_OR(fld.label = 'Department') AS has_dept
          FROM (VALUES
            ('form_hr_checkin'),
            ('form_hr_leave_application'),
            ('form_hr_employee_referral'),
            ('form_hr_self_target'),
            ('form_hr_self_initiative'),
            ('form_hr_problem_registration'),
            ('form_hr_kaizen'),
            ('form_hr_employee_suggestion'),
            ('form_hr_asset_management'),
            ('form_hr_sim_management')
          ) AS t(fid)
          LEFT JOIN forms        f   ON f.id = t.fid
          LEFT JOIN form_sections sec ON sec.form_id = t.fid
          LEFT JOIN form_fields  fld ON fld.section_id = sec.id
         GROUP BY fid, f.name
         ORDER BY f.name
    LOOP
        IF r.form_name IS NULL THEN
            RAISE NOTICE '         [MISS] form % does not exist!', r.form_id;
            v_label_misses := v_label_misses + 1;
        ELSE
            RAISE NOTICE '         %  First Name=%  Last Name=%  Department=%',
                RPAD(r.form_name, 24),
                CASE WHEN r.has_first THEN 'Y' ELSE 'N' END,
                CASE WHEN r.has_last  THEN 'Y' ELSE 'N' END,
                CASE WHEN r.has_dept  THEN 'Y' ELSE 'N' END;
            IF NOT (r.has_first AND r.has_last AND r.has_dept) THEN
                v_label_misses := v_label_misses + 1;
            END IF;
        END IF;
    END LOOP;

    IF v_label_misses > 0 THEN
        RAISE NOTICE '[WARN] % form(s) are missing one or more target labels.', v_label_misses;
        RAISE NOTICE '       Auto-output uses LABEL match - any "N" above means that field';
        RAISE NOTICE '       will not auto-populate on that form.';
    ELSE
        RAISE NOTICE '[OK]   Every auto-fill form has First Name / Last Name / Department.';
    END IF;

    -- -----------------------------------------------------------------------
    -- 9. EMPLOYEE MASTER LABEL SANITY (other side of the lookup)
    -- -----------------------------------------------------------------------
    RAISE NOTICE '';
    RAISE NOTICE '       Employee Master source labels (the lookup reads these):';
    FOR r IN
        SELECT fld.label, fld.id
          FROM form_fields fld
          JOIN form_sections sec ON sec.id = fld.section_id
         WHERE sec.form_id = v_form_id
           AND fld.label IN ('Employee ID','First Name','Last Name','Middle Name','Department')
         ORDER BY fld.label
    LOOP
        RAISE NOTICE '         %  ->  %', RPAD(r.label, 14), r.id;
    END LOOP;

    -- -----------------------------------------------------------------------
    -- 10. PER-HR-FORM SECTIONS / FIELDS COUNT
    -- The Lookup-field configuration dialog calls /api/lookup/fields, which
    -- collects field labels by walking forms -> sections -> fields. If a form
    -- has 0 sections OR a section has 0 fields, the dialog shows
    -- "No Items Found - This module/form has no fields or master dropdowns".
    -- -----------------------------------------------------------------------
    RAISE NOTICE '';
    RAISE NOTICE '       Per-form section/field counts (any form with 0 fields = "No Items Found"):';
    FOR r IN
        SELECT
            f.id AS form_id,
            f.name AS form_name,
            COUNT(DISTINCT sec.id) AS section_count,
            COUNT(fld.id)          AS field_count
          FROM forms f
          JOIN form_modules m ON m.id = f.module_id
          LEFT JOIN form_sections sec ON sec.form_id = f.id
          LEFT JOIN form_fields  fld ON fld.section_id = sec.id
         WHERE f.id LIKE 'form_hr_%'
           AND m.organization_id = v_org_id
         GROUP BY f.id, f.name
         ORDER BY f.name
    LOOP
        RAISE NOTICE '         %  sections=%  fields=%   %',
            RPAD(r.form_name, 26),
            LPAD(r.section_count::text, 2),
            LPAD(r.field_count::text,   3),
            CASE WHEN r.field_count = 0 THEN '<-- EMPTY (will show No Items Found)' ELSE '' END;
    END LOOP;

    -- -----------------------------------------------------------------------
    -- 11. PER-HR-MODULE: HOW MANY DIRECT-CHILD FORMS?
    -- The dialog shows "No Items Found" when you select a parent module that
    -- only contains sub-modules (no direct forms of its own).
    -- -----------------------------------------------------------------------
    RAISE NOTICE '';
    RAISE NOTICE '       HR modules and their direct-child form counts:';
    FOR r IN
        SELECT
            m.id   AS module_id,
            m.name AS module_name,
            m.parent_id,
            COUNT(f.id) AS direct_form_count,
            (SELECT COUNT(*) FROM form_modules child WHERE child.parent_id = m.id) AS submodule_count
          FROM form_modules m
          LEFT JOIN forms f ON f.module_id = m.id
         WHERE m.id LIKE 'mod_hr%'
           AND m.organization_id = v_org_id
         GROUP BY m.id, m.name, m.parent_id
         ORDER BY m.name
    LOOP
        RAISE NOTICE '         %  forms=%  submodules=%  parent=%',
            RPAD(r.module_name, 22),
            LPAD(r.direct_form_count::text, 2),
            LPAD(r.submodule_count::text,   2),
            COALESCE(r.parent_id, '(root)');
    END LOOP;
    RAISE NOTICE '       -> A row with forms=0 means selecting that module shows "No Items Found".';
    RAISE NOTICE '          Click into one of its submodules / forms instead.';

    -- -----------------------------------------------------------------------
    -- SUMMARY
    -- -----------------------------------------------------------------------
    RAISE NOTICE '';
    RAISE NOTICE '=========================================================';
    RAISE NOTICE 'SUMMARY';
    RAISE NOTICE '  Function seeded:        %', CASE WHEN v_fn_exists THEN 'yes' ELSE 'NO - run create-hr-automations.sql' END;
    RAISE NOTICE '  Bindings active:        % / 10', v_binding_count;
    RAISE NOTICE '  Safety-net rules:       % / 10', v_rule_count;
    RAISE NOTICE '  Employee Master rows:   %', v_emp_count;
    RAISE NOTICE '  Storage table:          %', v_storage_table;
    RAISE NOTICE '  Target-label issues:    %', v_label_misses;
    RAISE NOTICE '=========================================================';

    IF v_emp_count = 0 THEN
        RAISE NOTICE '*** Most likely cause: NO EMPLOYEES EXIST. Create one first. ***';
    ELSIF v_binding_count < 10 THEN
        RAISE NOTICE '*** Most likely cause: bindings missing. Re-run create-hr-automations.sql. ***';
    ELSIF v_label_misses > 0 THEN
        RAISE NOTICE '*** Most likely cause: form labels do not match what the function returns. ***';
    ELSE
        RAISE NOTICE 'All checks pass. If lookup STILL fails:';
        RAISE NOTICE '  1. Hard refresh the form page (Ctrl+Shift+R) to pick up new bindings.';
        RAISE NOTICE '  2. Wait 30s for the server-side bindingCache / fieldCache to expire.';
        RAISE NOTICE '  3. In the browser DevTools -> Network, watch for POST /api/forms/.../functions/run';
        RAISE NOTICE '     and inspect the response: result.error tells you why no fields came back.';
    END IF;
END $$;
