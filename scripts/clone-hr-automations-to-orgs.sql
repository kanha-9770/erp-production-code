-- =============================================================================
-- HR AUTOMATIONS - CLONE INTO ADDITIONAL ORGANIZATIONS
-- =============================================================================
-- Replicates the HR automation layer (CRM functions + workflow rules + function
-- bindings) from the existing source org into one or more target orgs.
--
-- Companion to scripts/clone-hr-to-orgs.sql — run THAT first so each target
-- org has its modules/forms/sections/fields with the correct _<pfx> suffix.
--
-- Three IDs need rewriting inside content (not just FK columns):
--   1. crm_functions.script         — JS code references fld_*, fn_hr_*, sec_*
--   2. workflow_rules.conditions    — JSONB array, "field":"fld_*"
--   3. workflow_rules.instant_actions — JSONB array, "targetFieldId":"fld_*"
--                                                   "functionId":"fn_hr_*"
--
-- We use a single regex helper (suffix_hr_ids) on the textual JSONB form, then
-- cast back. The regex matches HR-specific id prefixes only and leaves
-- field labels / module names / option values untouched.
-- =============================================================================

BEGIN;

-- ---- helper: regex-suffix HR-scoped ids inside text/JSONB content ----------
-- Same body as the one in clone-hr-to-orgs.sql; redefined here so this script
-- can run independently after a session restart.
DROP FUNCTION IF EXISTS pg_temp.suffix_hr_ids(TEXT, TEXT);
CREATE FUNCTION pg_temp.suffix_hr_ids(p_text TEXT, p_pfx TEXT)
RETURNS TEXT AS $$
DECLARE
    s TEXT := p_text;
BEGIN
    IF s IS NULL THEN RETURN NULL; END IF;
    s := regexp_replace(s, '\m(fld_[a-z][a-z0-9_]*)\M',      '\1' || p_pfx, 'g');
    s := regexp_replace(s, '\m(fn_hr_[a-z][a-z0-9_]*)\M',    '\1' || p_pfx, 'g');
    s := regexp_replace(s, '\m(form_hr_[a-z][a-z0-9_]*)\M',  '\1' || p_pfx, 'g');
    s := regexp_replace(s, '\m(mod_hr[a-z0-9_]*)\M',         '\1' || p_pfx, 'g');
    s := regexp_replace(s, '\m(sec_[a-z][a-z0-9_]*)\M',      '\1' || p_pfx, 'g');
    RETURN s;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    -- Targets — keep in sync with clone-hr-to-orgs.sql
    v_targets JSONB := '[
        {"orgId":"cmomgdbvn0007fveo93ccyr0d","userId":"cmomgccnh0002fveopw8s44i8","label":"Org 1"},
        {"orgId":"cmomgjvns000nvd7w9bpdm2ip","userId":"cmomgj16o000ivd7wobcwxcvb","label":"Org 2"},
        {"orgId":"cmomgkz8q0005pmbwhi868mtj","userId":"cmomghvnp0000pmbwewpz5vd7","label":"Org 3"}
    ]'::jsonb;

    v_src_org_id TEXT;
    t            JSONB;
    v_org_id     TEXT;
    v_user_id    TEXT;
    v_pfx        TEXT;
    v_count      INT;
BEGIN
    -- Locate the source org by looking up the canonical 'fn_hr_lookup_employee'
    -- crm_function id (created by scripts/create-hr-automations.sql).
    SELECT organization_id INTO v_src_org_id
      FROM crm_functions
     WHERE id = 'fn_hr_lookup_employee'
     LIMIT 1;

    IF v_src_org_id IS NULL THEN
        RAISE EXCEPTION 'No HR automations template found. Run scripts/create-hr-automations.sql first to bootstrap a source org.';
    END IF;

    -- Confirm the source org also has the modules cloned (sanity check)
    IF NOT EXISTS (
        SELECT 1 FROM form_modules
         WHERE id = 'mod_hr_root' AND organization_id = v_src_org_id
    ) THEN
        RAISE EXCEPTION 'Source org % has automations but no HR module — run scripts/create-hr-module.sql first.', v_src_org_id;
    END IF;

    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Cloning HR automations into additional organizations';
    RAISE NOTICE '  Source template org: %', v_src_org_id;
    RAISE NOTICE '  Targets:             % orgs', jsonb_array_length(v_targets);
    RAISE NOTICE '====================================================';

    FOR t IN SELECT * FROM jsonb_array_elements(v_targets) LOOP
        v_org_id  := t->>'orgId';
        v_user_id := t->>'userId';
        v_pfx     := '_' || lower(substring(v_org_id FROM GREATEST(1, length(v_org_id) - 7)));

        IF v_org_id = v_src_org_id THEN
            RAISE NOTICE '';
            RAISE NOTICE '── % (% — source template, skipping)', t->>'label', v_org_id;
            CONTINUE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id) THEN
            RAISE EXCEPTION 'Target org % (%) does not exist', v_org_id, t->>'label';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
            RAISE EXCEPTION 'Target user % (%) does not exist', v_user_id, t->>'label';
        END IF;

        -- Make sure clone-hr-to-orgs.sql has been run for this target,
        -- otherwise the FK on form_id / field_id / module_id will fail.
        IF NOT EXISTS (
            SELECT 1 FROM form_modules
             WHERE id = 'mod_hr_root' || v_pfx
               AND organization_id = v_org_id
        ) THEN
            RAISE EXCEPTION 'Target org % (%) does not have its HR modules cloned yet — run scripts/clone-hr-to-orgs.sql first.', v_org_id, t->>'label';
        END IF;

        RAISE NOTICE '';
        RAISE NOTICE '── % (org=%, user=%, pfx=%)',
                     t->>'label', v_org_id, v_user_id, v_pfx;

        ---------------------------------------------------------------------
        -- 1. CRM FUNCTIONS — script body has fld_* / fn_hr_* references
        --                    that must be rewritten to the suffixed ids.
        ---------------------------------------------------------------------
        INSERT INTO crm_functions (
            id, name, display_name, category, language, description,
            associated, rest_api, script,
            organization_id, created_by_id, created_at, updated_at
        )
        SELECT
            cf.id || v_pfx,
            cf.name,                           -- crm_functions.name is not @unique; safe to share verbatim across orgs
            cf.display_name,
            cf.category, cf.language, cf.description,
            cf.associated, cf.rest_api,
            pg_temp.suffix_hr_ids(cf.script, v_pfx),
            v_org_id, v_user_id, NOW(), NOW()
          FROM crm_functions cf
         WHERE cf.organization_id = v_src_org_id
           AND cf.id LIKE 'fn_hr_%'
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            display_name = EXCLUDED.display_name,
            category = EXCLUDED.category, language = EXCLUDED.language,
            description = EXCLUDED.description,
            associated = EXCLUDED.associated, rest_api = EXCLUDED.rest_api,
            script = EXCLUDED.script,
            organization_id = EXCLUDED.organization_id,
            created_by_id = EXCLUDED.created_by_id,
            updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  CRM functions:       %', v_count;

        ---------------------------------------------------------------------
        -- 2. WORKFLOW RULES — conditions/instant_actions JSONB references
        --                    fld_* and fn_hr_* ids; rewrite via text round-trip.
        ---------------------------------------------------------------------
        INSERT INTO workflow_rules (
            id, name, description, module_name,
            execute_based_on, record_action, date_field,
            condition_type, conditions, instant_actions,
            scheduled_execute, scheduled_unit,
            active, organization_id, created_by_id,
            created_at, updated_at
        )
        SELECT
            wr.id || v_pfx,
            wr.name, wr.description, wr.module_name,
            wr.execute_based_on, wr.record_action, wr.date_field,
            wr.condition_type,
            CASE WHEN wr.conditions IS NULL THEN NULL
                 ELSE pg_temp.suffix_hr_ids(wr.conditions::text, v_pfx)::jsonb END,
            CASE WHEN wr.instant_actions IS NULL THEN NULL
                 ELSE pg_temp.suffix_hr_ids(wr.instant_actions::text, v_pfx)::jsonb END,
            wr.scheduled_execute, wr.scheduled_unit,
            wr.active, v_org_id, v_user_id,
            NOW(), NOW()
          FROM workflow_rules wr
         WHERE wr.organization_id = v_src_org_id
           AND wr.id LIKE 'wfr_hr_%'
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, description = EXCLUDED.description,
            module_name = EXCLUDED.module_name,
            execute_based_on = EXCLUDED.execute_based_on,
            record_action = EXCLUDED.record_action,
            date_field = EXCLUDED.date_field,
            condition_type = EXCLUDED.condition_type,
            conditions = EXCLUDED.conditions,
            instant_actions = EXCLUDED.instant_actions,
            scheduled_execute = EXCLUDED.scheduled_execute,
            scheduled_unit = EXCLUDED.scheduled_unit,
            active = EXCLUDED.active,
            organization_id = EXCLUDED.organization_id,
            created_by_id = EXCLUDED.created_by_id,
            updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Workflow rules:      %', v_count;

        ---------------------------------------------------------------------
        -- 3. FUNCTION BINDINGS — FK columns (function_id, form_id, field_id,
        --                       module_id) all suffixed; mappings are
        --                       typically empty {} but we suffix any ids in
        --                       them just in case.
        ---------------------------------------------------------------------
        INSERT INTO function_bindings (
            id, function_id, form_id, field_id, module_id,
            event, input_mapping, output_mapping, condition,
            active, "order", organization_id, created_at, updated_at
        )
        SELECT
            fb.id || v_pfx,
            fb.function_id || v_pfx,
            CASE WHEN fb.form_id   IS NULL THEN NULL ELSE fb.form_id   || v_pfx END,
            CASE WHEN fb.field_id  IS NULL THEN NULL ELSE fb.field_id  || v_pfx END,
            CASE WHEN fb.module_id IS NULL THEN NULL ELSE fb.module_id || v_pfx END,
            fb.event,
            CASE WHEN fb.input_mapping  IS NULL THEN '{}'::jsonb
                 ELSE pg_temp.suffix_hr_ids(fb.input_mapping::text, v_pfx)::jsonb END,
            CASE WHEN fb.output_mapping IS NULL THEN '{}'::jsonb
                 ELSE pg_temp.suffix_hr_ids(fb.output_mapping::text, v_pfx)::jsonb END,
            CASE WHEN fb.condition IS NULL THEN NULL
                 ELSE pg_temp.suffix_hr_ids(fb.condition::text, v_pfx)::jsonb END,
            fb.active, fb."order", v_org_id, NOW(), NOW()
          FROM function_bindings fb
         WHERE fb.organization_id = v_src_org_id
           AND fb.id LIKE 'fb_hr_%'
        ON CONFLICT (id) DO UPDATE SET
            function_id = EXCLUDED.function_id,
            form_id = EXCLUDED.form_id, field_id = EXCLUDED.field_id,
            module_id = EXCLUDED.module_id,
            event = EXCLUDED.event,
            input_mapping = EXCLUDED.input_mapping,
            output_mapping = EXCLUDED.output_mapping,
            condition = EXCLUDED.condition,
            active = EXCLUDED.active, "order" = EXCLUDED."order",
            organization_id = EXCLUDED.organization_id,
            updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Function bindings:   %', v_count;

    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'HR automations clone complete.';
    RAISE NOTICE '====================================================';
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- All HR functions per org:
--   SELECT organization_id, COUNT(*) AS fns
--     FROM crm_functions
--    WHERE name LIKE 'hr_%'
--    GROUP BY organization_id
--    ORDER BY organization_id;
--
-- Sample condition rewrite check (should reference fld_*_<pfx> ids):
--   SELECT id, name, conditions, instant_actions
--     FROM workflow_rules
--    WHERE organization_id = 'cmomgdbvn0007fveo93ccyr0d'
--      AND module_name = 'Employee Master'
--    LIMIT 5;
--
-- Function binding sanity check (form_id and field_id should both end in _pfx):
--   SELECT fb.id, fb.event, f.name AS form, fld.label AS field
--     FROM function_bindings fb
--     LEFT JOIN forms f       ON f.id  = fb.form_id
--     LEFT JOIN form_fields fld ON fld.id = fb.field_id
--    WHERE fb.organization_id = 'cmomgdbvn0007fveo93ccyr0d'
--    ORDER BY f.name, fld.label;
