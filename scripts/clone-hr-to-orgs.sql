-- =============================================================================
-- HR MODULE - CLONE INTO ADDITIONAL ORGANIZATIONS
-- =============================================================================
-- Re-creates the full HR module/forms/sections/fields/permissions/roles set
-- from an existing "source" org (the one bootstrapped by create-hr-module.sql)
-- into one or more new target organizations.
--
-- Why a clone instead of a re-run?
--   create-hr-module.sql uses GLOBAL primary keys (mod_hr_root, form_hr_*,
--   sec_*, fld_*, etc.). Re-running it for a second org either hits PK
--   conflicts or wipes the first org's data via the OR id LIKE 'mod_hr%'
--   wipe clauses. This script side-steps that by suffixing every per-org id
--   with the last 8 chars of the target org id, so the source org keeps its
--   global ids and each target org gets its own _<pfx> namespace.
--
-- Idempotent: ON CONFLICT (id) DO UPDATE on every insert. Re-running re-syncs
-- the targets with whatever shape the source currently has.
--
-- Source detection: any org that owns a module with id 'mod_hr_root'.
-- Targets: the v_targets array below (edit to add/remove orgs).
-- =============================================================================

BEGIN;

-- ---- helper: regex-suffix HR-scoped ids inside text/JSONB content ----------
DROP FUNCTION IF EXISTS pg_temp.suffix_hr_ids(TEXT, TEXT);
CREATE FUNCTION pg_temp.suffix_hr_ids(p_text TEXT, p_pfx TEXT)
RETURNS TEXT AS $$
DECLARE
    s TEXT := p_text;
BEGIN
    IF s IS NULL THEN RETURN NULL; END IF;
    -- Suffix every occurrence of an HR-scoped id. A trailing (?!_<pfx>)
    -- look-ahead would keep the function strictly idempotent, but Postgres
    -- ERE has no look-ahead, so callers must pass un-suffixed source text.
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
    -- ---------------------------------------------------------------------
    -- Targets: add / remove orgs here.
    -- Each entry must reference a real organizations.id and a users.id.
    -- ---------------------------------------------------------------------
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
    -- ---------------------------------------------------------------------
    -- 1. Locate the source HR template (any org that owns 'mod_hr_root').
    -- ---------------------------------------------------------------------
    SELECT organization_id INTO v_src_org_id
      FROM form_modules
     WHERE id = 'mod_hr_root'
     LIMIT 1;

    IF v_src_org_id IS NULL THEN
        RAISE EXCEPTION 'No HR template found in this database. Run scripts/create-hr-module.sql first to bootstrap a source org, then re-run this script.';
    END IF;

    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Cloning HR module into additional organizations';
    RAISE NOTICE '  Source template org: %', v_src_org_id;
    RAISE NOTICE '  Targets:             % orgs', jsonb_array_length(v_targets);
    RAISE NOTICE '====================================================';

    FOR t IN SELECT * FROM jsonb_array_elements(v_targets) LOOP
        v_org_id  := t->>'orgId';
        v_user_id := t->>'userId';
        v_pfx     := '_' || lower(substring(v_org_id FROM GREATEST(1, length(v_org_id) - 7)));

        -- Skip the source org itself (already has the global ids).
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

        RAISE NOTICE '';
        RAISE NOTICE '── % (org=%, user=%, pfx=%)',
                     t->>'label', v_org_id, v_user_id, v_pfx;

        ---------------------------------------------------------------------
        -- 2. MODULES (parent_id self-ref → ORDER BY level so parents go first)
        ---------------------------------------------------------------------
        INSERT INTO form_modules (
            id, name, organization_id, description, icon, color, settings,
            parent_id, module_type, level, path, is_active, sort_order,
            created_at, updated_at
        )
        SELECT
            id || v_pfx, name, v_org_id, description, icon, color, settings,
            CASE WHEN parent_id IS NULL THEN NULL ELSE parent_id || v_pfx END,
            module_type, level, path, is_active, sort_order, NOW(), NOW()
          FROM form_modules
         WHERE organization_id = v_src_org_id
           AND id LIKE 'mod_hr%'
         ORDER BY level, sort_order
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, organization_id = EXCLUDED.organization_id,
            description = EXCLUDED.description, icon = EXCLUDED.icon,
            color = EXCLUDED.color, parent_id = EXCLUDED.parent_id,
            level = EXCLUDED.level, path = EXCLUDED.path,
            is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order,
            updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Modules:                 %', v_count;

        ---------------------------------------------------------------------
        -- 3. FORMS
        ---------------------------------------------------------------------
        INSERT INTO forms (
            id, module_id, name, description, settings,
            is_published, allow_anonymous, require_login,
            "isEmployeeForm", "isUserForm", created_at, updated_at
        )
        SELECT
            f.id || v_pfx, f.module_id || v_pfx, f.name, f.description, f.settings,
            f.is_published, f.allow_anonymous, f.require_login,
            f."isEmployeeForm", f."isUserForm", NOW(), NOW()
          FROM forms f
          JOIN form_modules m ON m.id = f.module_id
         WHERE m.organization_id = v_src_org_id
           AND m.id LIKE 'mod_hr%'
        ON CONFLICT (id) DO UPDATE SET
            module_id = EXCLUDED.module_id, name = EXCLUDED.name,
            description = EXCLUDED.description, settings = EXCLUDED.settings,
            is_published = EXCLUDED.is_published,
            allow_anonymous = EXCLUDED.allow_anonymous,
            require_login = EXCLUDED.require_login,
            "isEmployeeForm" = EXCLUDED."isEmployeeForm",
            "isUserForm" = EXCLUDED."isUserForm",
            updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Forms:                   %', v_count;

        ---------------------------------------------------------------------
        -- 4. SECTIONS
        ---------------------------------------------------------------------
        INSERT INTO form_sections (
            id, form_id, title, description, "order", columns,
            visible, collapsible, collapsed, exclude_from_inheritance,
            conditional, styling, created_at, updated_at
        )
        SELECT
            s.id || v_pfx, s.form_id || v_pfx, s.title, s.description,
            s."order", s.columns,
            s.visible, s.collapsible, s.collapsed, s.exclude_from_inheritance,
            s.conditional, s.styling, NOW(), NOW()
          FROM form_sections s
          JOIN forms f        ON f.id = s.form_id
          JOIN form_modules m ON m.id = f.module_id
         WHERE m.organization_id = v_src_org_id
           AND m.id LIKE 'mod_hr%'
        ON CONFLICT (id) DO UPDATE SET
            form_id = EXCLUDED.form_id, title = EXCLUDED.title,
            description = EXCLUDED.description, "order" = EXCLUDED."order",
            columns = EXCLUDED.columns, visible = EXCLUDED.visible,
            collapsible = EXCLUDED.collapsible, collapsed = EXCLUDED.collapsed,
            exclude_from_inheritance = EXCLUDED.exclude_from_inheritance,
            conditional = EXCLUDED.conditional, styling = EXCLUDED.styling,
            updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Sections:                %', v_count;

        ---------------------------------------------------------------------
        -- 5. FIELDS
        --    (form_fields.formula is a RELATION to formula_fields, not a
        --     column — that gets cloned in step 6 below.)
        ---------------------------------------------------------------------
        --   Note on column quoting: most form_fields columns map to snake_case
        --   via Prisma's @map(), but a few (decimalPlaces) have no @map and
        --   therefore live as the raw camelCase identifier in Postgres,
        --   requiring double-quotes.
        INSERT INTO form_fields (
            id, section_id, type, label, placeholder, description,
            default_value, options,
            is_dependent, parent_field_id, dependent_groups,
            validation, visible, readonly, width, "order",
            is_indexed, conditional, styling, properties,
            rollup, lookup, "decimalPlaces",
            created_at, updated_at
        )
        SELECT
            ff.id || v_pfx, ff.section_id || v_pfx,
            ff.type, ff.label, ff.placeholder, ff.description,
            ff.default_value, ff.options,
            ff.is_dependent,
            CASE WHEN ff.parent_field_id IS NULL THEN NULL
                 ELSE ff.parent_field_id || v_pfx END,
            ff.dependent_groups,
            ff.validation, ff.visible, ff.readonly, ff.width, ff."order",
            ff.is_indexed, ff.conditional, ff.styling, ff.properties,
            ff.rollup, ff.lookup, ff."decimalPlaces",
            NOW(), NOW()
          FROM form_fields ff
          JOIN form_sections s ON s.id = ff.section_id
          JOIN forms f         ON f.id = s.form_id
          JOIN form_modules m  ON m.id = f.module_id
         WHERE m.organization_id = v_src_org_id
           AND m.id LIKE 'mod_hr%'
        ON CONFLICT (id) DO UPDATE SET
            section_id = EXCLUDED.section_id, type = EXCLUDED.type,
            label = EXCLUDED.label, placeholder = EXCLUDED.placeholder,
            description = EXCLUDED.description,
            default_value = EXCLUDED.default_value, options = EXCLUDED.options,
            is_dependent = EXCLUDED.is_dependent,
            parent_field_id = EXCLUDED.parent_field_id,
            dependent_groups = EXCLUDED.dependent_groups,
            validation = EXCLUDED.validation, visible = EXCLUDED.visible,
            readonly = EXCLUDED.readonly, width = EXCLUDED.width,
            "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed,
            conditional = EXCLUDED.conditional, styling = EXCLUDED.styling,
            properties = EXCLUDED.properties,
            rollup = EXCLUDED.rollup, lookup = EXCLUDED.lookup,
            "decimalPlaces" = EXCLUDED."decimalPlaces",
            updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Fields:                  %', v_count;

        ---------------------------------------------------------------------
        -- 6. FORMULA FIELDS — expression strings reference fld_* ids → suffix
        ---------------------------------------------------------------------
        INSERT INTO formula_fields (
            id, "formFieldId", expression, "returnType",
            "autoRefresh", "showTooltip", "blankPreference", dependencies,
            created_at, updated_at
        )
        SELECT
            fx.id || v_pfx,
            fx."formFieldId" || v_pfx,
            pg_temp.suffix_hr_ids(fx.expression, v_pfx),
            fx."returnType",
            fx."autoRefresh", fx."showTooltip", fx."blankPreference",
            -- dependencies is jsonb array of strings → suffix each element
            (SELECT jsonb_agg(pg_temp.suffix_hr_ids(elem, v_pfx))
               FROM jsonb_array_elements_text(fx.dependencies) AS elem),
            NOW(), NOW()
          FROM formula_fields fx
          JOIN form_fields ff  ON ff.id = fx."formFieldId"
          JOIN form_sections s ON s.id = ff.section_id
          JOIN forms f         ON f.id = s.form_id
          JOIN form_modules m  ON m.id = f.module_id
         WHERE m.organization_id = v_src_org_id
           AND m.id LIKE 'mod_hr%'
        ON CONFLICT (id) DO UPDATE SET
            "formFieldId" = EXCLUDED."formFieldId",
            expression = EXCLUDED.expression,
            "returnType" = EXCLUDED."returnType",
            "autoRefresh" = EXCLUDED."autoRefresh",
            "showTooltip" = EXCLUDED."showTooltip",
            "blankPreference" = EXCLUDED."blankPreference",
            dependencies = EXCLUDED.dependencies,
            updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Formula fields:          %', v_count;

        ---------------------------------------------------------------------
        -- 7. LOOKUP SOURCES + RELATIONS
        ---------------------------------------------------------------------
        INSERT INTO lookup_sources (
            id, name, type, description,
            source_module_id, source_form_id, active,
            created_at, updated_at
        )
        SELECT
            ls.id || v_pfx, ls.name, ls.type, ls.description,
            ls.source_module_id || v_pfx,
            ls.source_form_id || v_pfx,
            ls.active, NOW(), NOW()
          FROM lookup_sources ls
          JOIN form_modules m ON m.id = ls.source_module_id
         WHERE m.organization_id = v_src_org_id
           AND m.id LIKE 'mod_hr%'
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, type = EXCLUDED.type,
            description = EXCLUDED.description,
            source_module_id = EXCLUDED.source_module_id,
            source_form_id = EXCLUDED.source_form_id,
            active = EXCLUDED.active, updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Lookup sources:          %', v_count;

        INSERT INTO lookup_field_relations (
            id, lookup_source_id, form_field_id, form_id, module_id,
            display_field, value_field, multiple, searchable, filters,
            created_at, updated_at
        )
        SELECT
            r.id || v_pfx,
            r.lookup_source_id || v_pfx,
            r.form_field_id || v_pfx,
            r.form_id || v_pfx,
            r.module_id || v_pfx,
            r.display_field || v_pfx,
            r.value_field || v_pfx,
            r.multiple, r.searchable, r.filters, NOW(), NOW()
          FROM lookup_field_relations r
          JOIN form_modules m ON m.id = r.module_id
         WHERE m.organization_id = v_src_org_id
           AND m.id LIKE 'mod_hr%'
        ON CONFLICT (id) DO UPDATE SET
            lookup_source_id = EXCLUDED.lookup_source_id,
            form_field_id = EXCLUDED.form_field_id,
            form_id = EXCLUDED.form_id, module_id = EXCLUDED.module_id,
            display_field = EXCLUDED.display_field,
            value_field = EXCLUDED.value_field,
            multiple = EXCLUDED.multiple, searchable = EXCLUDED.searchable,
            filters = EXCLUDED.filters, updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Lookup relations:        %', v_count;

        ---------------------------------------------------------------------
        -- 8. FORM TABLE MAPPINGS — multiple orgs share the same form_records_X
        --    storage tables; we differentiate by form_id which is now suffixed.
        ---------------------------------------------------------------------
        INSERT INTO form_table_mappings (
            id, form_id, storage_table, created_at, updated_at
        )
        SELECT
            ftm.id || v_pfx,
            ftm.form_id || v_pfx,
            ftm.storage_table, NOW(), NOW()
          FROM form_table_mappings ftm
          JOIN forms f        ON f.id = ftm.form_id
          JOIN form_modules m ON m.id = f.module_id
         WHERE m.organization_id = v_src_org_id
           AND m.id LIKE 'mod_hr%'
        ON CONFLICT (id) DO UPDATE SET
            form_id = EXCLUDED.form_id,
            storage_table = EXCLUDED.storage_table,
            updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Form-table mappings:     %', v_count;

        ---------------------------------------------------------------------
        -- 9. UNIQUE ID COUNTERS (auto-number generators)
        --    fieldId is @unique, so we must use the suffixed field id.
        ---------------------------------------------------------------------
        INSERT INTO unique_id_counters (
            id, "fieldId", "lastNumber", "createdAt", "updatedAt"
        )
        SELECT
            uc.id || v_pfx,
            uc."fieldId" || v_pfx,
            0,                                  -- start fresh per org
            NOW(), NOW()
          FROM unique_id_counters uc
          JOIN form_fields ff  ON ff.id = uc."fieldId"
          JOIN form_sections s ON s.id = ff.section_id
          JOIN forms f         ON f.id = s.form_id
          JOIN form_modules m  ON m.id = f.module_id
         WHERE m.organization_id = v_src_org_id
           AND m.id LIKE 'mod_hr%'
        ON CONFLICT (id) DO NOTHING;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Unique ID counters:      %', v_count;

        ---------------------------------------------------------------------
        -- 10. ORGANIZATION UNIT (default 'unit_hq') + ROLE (default 'role_admin')
        --
        --     roles has a UNIQUE(name, organization_id) constraint, so we
        --     defensively delete any pre-existing 'Administrator' row for
        --     this target org that doesn't already share our suffixed id.
        ---------------------------------------------------------------------
        INSERT INTO organization_units (
            id, name, description, organization_id,
            parent_id, level, sort_order, is_active,
            created_at, updated_at
        )
        VALUES (
            'unit_hq' || v_pfx, 'Headquarters',
            'Default top-level organization unit',
            v_org_id, NULL, 0, 0, TRUE, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, description = EXCLUDED.description,
            organization_id = EXCLUDED.organization_id,
            is_active = EXCLUDED.is_active, updated_at = NOW();

        DELETE FROM roles
         WHERE organization_id = v_org_id
           AND name = 'Administrator'
           AND id <> ('role_admin' || v_pfx);

        INSERT INTO roles (
            id, name, description, organization_id,
            parent_id, level, share_data_with_peers, sort_order,
            is_active, is_admin, created_at, updated_at
        )
        VALUES (
            'role_admin' || v_pfx, 'Administrator', 'Full system access',
            v_org_id, NULL, 0, FALSE, 0, TRUE, TRUE, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, description = EXCLUDED.description,
            organization_id = EXCLUDED.organization_id,
            is_active = EXCLUDED.is_active, is_admin = EXCLUDED.is_admin,
            updated_at = NOW();

        INSERT INTO unit_role_assignments (
            id, unit_id, role_id, created_at, updated_at
        )
        VALUES (
            'ura_admin_hq' || v_pfx,
            'unit_hq' || v_pfx,
            'role_admin' || v_pfx,
            NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            unit_id = EXCLUDED.unit_id, role_id = EXCLUDED.role_id,
            updated_at = NOW();

        INSERT INTO user_unit_assignments (
            id, user_id, unit_id, role_id, notes, created_at, updated_at
        )
        VALUES (
            'uua_admin' || v_pfx,
            v_user_id,
            'unit_hq' || v_pfx,
            'role_admin' || v_pfx,
            'HR clone: auto-assigned administrator role',
            NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id, unit_id = EXCLUDED.unit_id,
            role_id = EXCLUDED.role_id, notes = EXCLUDED.notes,
            updated_at = NOW();

        RAISE NOTICE '  Unit + Role + assigns:   ok (unit_hq%, role_admin%)', v_pfx, v_pfx;

        ---------------------------------------------------------------------
        -- 11. PERMISSIONS (org-scoped)
        --
        --     permissions.name has a GLOBAL UNIQUE constraint, so we suffix
        --     the name as well as the id to keep each org's row distinct.
        ---------------------------------------------------------------------
        INSERT INTO permissions (
            id, name, description, category, resource,
            organization_id, is_active, created_at, updated_at
        )
        SELECT
            p.id || v_pfx, p.name || v_pfx, p.description, p.category, p.resource,
            v_org_id, p.is_active, NOW(), NOW()
          FROM permissions p
         WHERE p.organization_id = v_src_org_id
           AND p.id LIKE 'perm_hr_%'
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name, description = EXCLUDED.description,
            category = EXCLUDED.category, resource = EXCLUDED.resource,
            organization_id = EXCLUDED.organization_id,
            is_active = EXCLUDED.is_active, updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Permissions:             %', v_count;

        ---------------------------------------------------------------------
        -- 12. ROUTE PERMISSIONS (org-scoped; pattern stays — same /hr/* routes)
        ---------------------------------------------------------------------
        INSERT INTO route_permissions (
            id, pattern, description, organization_id,
            created_at, updated_at
        )
        SELECT
            rp.id || v_pfx, rp.pattern, rp.description,
            v_org_id, NOW(), NOW()
          FROM route_permissions rp
         WHERE rp.organization_id = v_src_org_id
           AND rp.id LIKE 'rp_hr%'
        ON CONFLICT (id) DO UPDATE SET
            pattern = EXCLUDED.pattern, description = EXCLUDED.description,
            organization_id = EXCLUDED.organization_id,
            updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  Route permissions:       %', v_count;

        ---------------------------------------------------------------------
        -- 13. USER PERMISSIONS — admin grants on every HR module + form
        ---------------------------------------------------------------------
        INSERT INTO user_permissions (
            id, user_id, permission_id, module_id, form_id,
            granted, can_view, can_create, can_edit, can_delete,
            is_system_admin, reason, granted_by, granted_at,
            is_active, created_at, updated_at
        )
        SELECT
            up.id || v_pfx,
            v_user_id,
            up.permission_id || v_pfx,
            CASE WHEN up.module_id IS NULL THEN NULL ELSE up.module_id || v_pfx END,
            CASE WHEN up.form_id   IS NULL THEN NULL ELSE up.form_id   || v_pfx END,
            up.granted, up.can_view, up.can_create, up.can_edit, up.can_delete,
            up.is_system_admin, 'HR clone bootstrap', v_user_id, NOW(),
            up.is_active, NOW(), NOW()
          FROM user_permissions up
         WHERE up.is_active = TRUE
           AND (up.id LIKE 'up_hr_%' OR up.id LIKE 'up_form_%')
           AND (
                up.module_id IN (
                    SELECT id FROM form_modules
                     WHERE organization_id = v_src_org_id
                       AND id LIKE 'mod_hr%'
                )
             OR up.form_id IN (
                    SELECT f.id FROM forms f
                      JOIN form_modules m ON m.id = f.module_id
                     WHERE m.organization_id = v_src_org_id
                       AND m.id LIKE 'mod_hr%'
                )
           )
        ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            permission_id = EXCLUDED.permission_id,
            module_id = EXCLUDED.module_id, form_id = EXCLUDED.form_id,
            granted = EXCLUDED.granted, can_view = EXCLUDED.can_view,
            can_create = EXCLUDED.can_create, can_edit = EXCLUDED.can_edit,
            can_delete = EXCLUDED.can_delete,
            is_system_admin = EXCLUDED.is_system_admin,
            reason = EXCLUDED.reason, granted_by = EXCLUDED.granted_by,
            is_active = EXCLUDED.is_active, updated_at = NOW();
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE '  User permissions:        %', v_count;

    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'HR module clone complete.';
    RAISE NOTICE '  Each target org now has a per-org-suffixed copy of';
    RAISE NOTICE '  the source HR template. Run the companion script';
    RAISE NOTICE '  scripts/clone-hr-automations-to-orgs.sql next to';
    RAISE NOTICE '  populate functions, workflow rules and bindings.';
    RAISE NOTICE '====================================================';
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Module hierarchy for one of the new orgs:
--   SELECT id, name, parent_id, level, path
--     FROM form_modules
--    WHERE organization_id = 'cmomgdbvn0007fveo93ccyr0d'
--    ORDER BY level, sort_order;
--
-- Field count per form per org (HR forms come to 241 each):
--   SELECT m.organization_id, f.name, COUNT(ff.id) AS fields
--     FROM form_modules m
--     JOIN forms f         ON f.module_id = m.id
--     JOIN form_sections s ON s.form_id   = f.id
--     JOIN form_fields ff  ON ff.section_id = s.id
--    WHERE m.organization_id IN (
--      'cmomgdbvn0007fveo93ccyr0d',
--      'cmomgjvns000nvd7w9bpdm2ip',
--      'cmomgkz8q0005pmbwhi868mtj'
--    )
--    GROUP BY m.organization_id, f.name
--    ORDER BY m.organization_id, f.name;
