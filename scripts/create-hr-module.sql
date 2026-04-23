-- =============================================================================
-- HR MODULE — COMPLETE BOOTSTRAP (WIPE + REBUILD for a specific organization)
-- =============================================================================
-- This script:
--   1. WIPES every module/form currently owned by the target organization,
--      plus any module whose id starts with 'mod_hr%' (cleans up residue from
--      prior runs of this script that may have landed on a different org).
--      Cascading deletes remove forms, sections, fields, formula_fields,
--      records, subforms, lookup sources, lookup field relations, and
--      form_table_mappings.
--   2. REBUILDS the full HR module tree for the target org:
--        HR
--         +- Employee Management   -> Employee Master          (39 fields)
--         +- Payroll               -> Payroll Record (+5 formulas), Salary Slip
--         +- Attendance            -> Check In  (10 fields, camera + GPS + time)
--         |                       -> Check Out (11 fields, camera + GPS + time + work hours)
--         +- Leave Management      -> Leave Application
--   3. Seeds supporting registries (field types, formula operators +
--      functions, leave types + rules, lookup source, payroll config,
--      unique id counters, route permissions).
--   4. Grants the target user system-admin access on every HR module + form
--      via user_permissions.
--
-- PAYROLL FORMULAS:
--   Working Day Amt = (Total Salary / Month Days) * Working Days
--   Leave Day Amt   = (Total Salary / Month Days) * Leave Days
--   Half Day Amt    = (Total Salary / Month Days) * Half Days * 0.5
--   Total Amt       = Working + Leave + Half + Bonus + Overtime
--   Given Salary    = Total Amt - Advance Taken
--
-- Target DB: PostgreSQL (matches prisma/schema.prisma).
-- Pre-req: run against the DIRECT connection URL (port 5432), not pgbouncer.
-- Safe to re-run: step 1 wipes then step 2+ uses ON CONFLICT DO UPDATE.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_org_id  TEXT := 'cmo9uk3440005u7ngdg652eoq';
    v_user_id TEXT := 'cmo9uhu660000u7ngr51zv3wv';
    v_deleted INTEGER;
BEGIN
    -- -----------------------------------------------------------------------
    -- Validate that the organization and user exist before doing anything
    -- -----------------------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id) THEN
        RAISE EXCEPTION 'Organization % does not exist — aborting.', v_org_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
        RAISE EXCEPTION 'User % does not exist — aborting.', v_user_id;
    END IF;

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Bootstrapping HR module';
    RAISE NOTICE '  Organization: %', v_org_id;
    RAISE NOTICE '  Admin user:   %', v_user_id;
    RAISE NOTICE '==========================================';

    -- =========================================================================
    -- STEP 1 — WIPE existing modules/forms for this org
    -- =========================================================================
    -- Order matters: counters/configs/permissions have no cascade from modules,
    -- so delete them BEFORE the module cascade removes the fields they point to.

    -- 1a. Unique id counters referencing fields that belong to modules we're about to delete.
    DELETE FROM unique_id_counters
     WHERE "fieldId" IN (
        SELECT ff.id
          FROM form_fields ff
          JOIN form_sections s ON s.id = ff.section_id
          JOIN forms f        ON f.id = s.form_id
          JOIN form_modules m ON m.id = f.module_id
         WHERE m.organization_id = v_org_id OR m.id LIKE 'mod_hr%'
     );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped unique_id_counters: %', v_deleted;

    -- 1b. Payroll configuration for this org.
    DELETE FROM payroll_configurations WHERE organization_id = v_org_id OR id = 'cfg_hr_payroll';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped payroll_configurations: %', v_deleted;

    -- 1c. HR route permissions for this org.
    DELETE FROM route_permissions
     WHERE organization_id = v_org_id AND pattern LIKE '/hr%';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped route_permissions: %', v_deleted;

    -- 1d. User permissions attached to modules/forms about to disappear.
    DELETE FROM user_permissions
     WHERE (module_id IN (SELECT id FROM form_modules WHERE organization_id = v_org_id OR id LIKE 'mod_hr%'))
        OR (form_id   IN (SELECT f.id FROM forms f
                           JOIN form_modules m ON m.id = f.module_id
                          WHERE m.organization_id = v_org_id OR m.id LIKE 'mod_hr%'))
        OR id LIKE 'up_hr_%' OR id LIKE 'up_form_%';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped user_permissions: %', v_deleted;

    -- 1d-bis. Permissions catalog rows used by the HR bootstrap.
    -- Remove by id AND by (name, org) to free up the UNIQUE(name) constraint
    -- in case a prior run created them with different cuid ids.
    DELETE FROM permissions
     WHERE id IN ('perm_hr_admin','perm_hr_view','perm_hr_create','perm_hr_edit','perm_hr_delete')
        OR (organization_id = v_org_id
            AND name IN ('HR Admin','HR View','HR Create','HR Edit','HR Delete'));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped permissions: %', v_deleted;

    -- 1e. Finally drop modules. Cascades remove:
    --     forms, form_sections, form_fields, formula_fields, form_records,
    --     form_records_1..15, form_table_mappings, subforms, subform_records,
    --     form_events, lookup_sources, lookup_field_relations, role_permissions
    DELETE FROM form_modules
     WHERE organization_id = v_org_id OR id LIKE 'mod_hr%';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped form_modules: %', v_deleted;

    RAISE NOTICE '-------- Wipe complete. Rebuilding. --------';

    -- =========================================================================
    -- STEP 2 — FIELD TYPES REGISTRY (global, upsert)
    -- =========================================================================
    INSERT INTO field_types (id, name, label, category, icon, description, default_props, active, created_at, updated_at) VALUES
        ('ft_text',       'text',       'Text',        'basic',    'text',           'Single-line text',          '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_textarea',   'textarea',   'Text Area',   'basic',    'align-left',     'Multi-line text',           '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_email',      'email',      'Email',       'basic',    'mail',           'Email input',               '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_tel',        'tel',        'Phone',       'basic',    'phone',          'Telephone input',           '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_number',     'number',     'Number',      'basic',    'hash',           'Numeric input',             '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_date',       'date',       'Date',        'datetime', 'calendar',       'Date picker',               '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_time',       'time',       'Time',        'datetime', 'clock',          'Time picker',               '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_datetime',   'datetime',   'Date & Time', 'datetime', 'calendar-clock', 'Combined date + time',      '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_select',     'select',     'Dropdown',    'choice',   'list',           'Single-choice dropdown',    '{"width":"full","options":[]}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_multiselect','multiselect','Multi-select','choice',   'list-checks',    'Multi-choice dropdown',     '{"width":"full","options":[]}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_radio',      'radio',      'Radio Group', 'choice',   'circle-dot',     'Single-choice radio group', '{"width":"full","options":[]}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_checkbox',   'checkbox',   'Checkbox',    'choice',   'check',          'Boolean toggle',            '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_file',       'file',       'File Upload', 'media',    'upload',         'File upload',               '{"width":"full","accept":"*/*","maxSize":5242880}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_lookup',     'lookup',     'Lookup',      'advanced', 'link',           'Reference another form',    '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_formula',    'formula',    'Formula',     'advanced', 'function',       'Computed field',            '{"width":"full","readonly":true}'::jsonb, TRUE, NOW(), NOW())
    ON CONFLICT (name) DO UPDATE SET
        label = EXCLUDED.label, category = EXCLUDED.category, icon = EXCLUDED.icon,
        description = EXCLUDED.description, default_props = EXCLUDED.default_props,
        active = EXCLUDED.active, updated_at = NOW();

    -- =========================================================================
    -- STEP 3 — FORMULA OPERATORS & FUNCTIONS
    -- =========================================================================
    INSERT INTO formula_operators (id, symbol, type, description, precedence, "createdAt") VALUES
        ('op_plus',  '+',  'arithmetic', 'Addition',        10, NOW()),
        ('op_minus', '-',  'arithmetic', 'Subtraction',     10, NOW()),
        ('op_mul',   '*',  'arithmetic', 'Multiplication',  20, NOW()),
        ('op_div',   '/',  'arithmetic', 'Division',        20, NOW()),
        ('op_mod',   '%',  'arithmetic', 'Modulo',          20, NOW()),
        ('op_eq',    '==', 'comparison', 'Equal',            5, NOW()),
        ('op_neq',   '!=', 'comparison', 'Not equal',        5, NOW()),
        ('op_gt',    '>',  'comparison', 'Greater than',     5, NOW()),
        ('op_lt',    '<',  'comparison', 'Less than',        5, NOW()),
        ('op_gte',   '>=', 'comparison', 'Greater or equal', 5, NOW()),
        ('op_lte',   '<=', 'comparison', 'Less or equal',    5, NOW()),
        ('op_and',   '&&', 'logical',    'Logical AND',      3, NOW()),
        ('op_or',    '||', 'logical',    'Logical OR',       2, NOW())
    ON CONFLICT (symbol) DO UPDATE SET
        type = EXCLUDED.type, description = EXCLUDED.description,
        precedence = EXCLUDED.precedence;

    INSERT INTO formula_functions (id, name, description, syntax, example, "returnType", args, "isBuiltIn", "createdAt", "updatedAt") VALUES
        ('fn_sum',          'SUM',          'Sum of numbers',              'SUM(a,b,...)',       'SUM({a},{b})',              'Number',   '[{"name":"values","type":"number","repeatable":true}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_avg',          'AVG',          'Average of numbers',          'AVG(a,b,...)',       'AVG({a},{b},{c})',          'Number',   '[{"name":"values","type":"number","repeatable":true}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_min',          'MIN',          'Minimum value',               'MIN(a,b,...)',       'MIN({a},{b})',              'Number',   '[{"name":"values","type":"number","repeatable":true}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_max',          'MAX',          'Maximum value',               'MAX(a,b,...)',       'MAX({a},{b})',              'Number',   '[{"name":"values","type":"number","repeatable":true}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_abs',          'ABS',          'Absolute value',              'ABS(x)',             'ABS({amount})',             'Number',   '[{"name":"x","type":"number"}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_round',        'ROUND',        'Round to n decimals',         'ROUND(x,n)',         'ROUND({amount},2)',         'Number',   '[{"name":"x","type":"number"},{"name":"digits","type":"number"}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_floor',        'FLOOR',        'Round down to integer',       'FLOOR(x)',           'FLOOR({amount})',           'Number',   '[{"name":"x","type":"number"}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_ceil',         'CEIL',         'Round up to integer',         'CEIL(x)',            'CEIL({amount})',            'Number',   '[{"name":"x","type":"number"}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_if',           'IF',           'Conditional',                 'IF(cond,then,else)', 'IF({a}>0,{a},0)',           'Number',   '[{"name":"cond","type":"boolean"},{"name":"then","type":"any"},{"name":"else","type":"any"}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_today',        'TODAY',        'Current date',                'TODAY()',            'TODAY()',                   'Date',     '[]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_now',          'NOW',          'Current datetime',            'NOW()',              'NOW()',                     'DateTime', '[]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_datediff',     'DATEDIFF',     'Days between two dates',      'DATEDIFF(a,b)',      'DATEDIFF({to},{from})',     'Number',   '[{"name":"a","type":"date"},{"name":"b","type":"date"}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_dateadd',      'DATEADD',      'Add days to a date',          'DATEADD(d,n)',       'DATEADD({d},30)',           'Date',     '[{"name":"date","type":"date"},{"name":"days","type":"number"}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_working_hours','WORKING_HOURS','Hours between two datetimes', 'WORKING_HOURS(a,b)', 'WORKING_HOURS({in},{out})', 'Number',   '[{"name":"a","type":"datetime"},{"name":"b","type":"datetime"}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_concat',       'CONCAT',       'Concatenate strings',         'CONCAT(a,b,...)',    'CONCAT({fn}," ",{ln})',     'Text',     '[{"name":"values","type":"any","repeatable":true}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_isnumber',     'ISNUMBER',     'Check if value is numeric',   'ISNUMBER(x)',        'ISNUMBER({v})',             'Boolean',  '[{"name":"x","type":"any"}]'::jsonb, TRUE, NOW(), NOW()),
        ('fn_isblank',      'ISBLANK',      'Check if value is empty',     'ISBLANK(x)',         'ISBLANK({v})',              'Boolean',  '[{"name":"x","type":"any"}]'::jsonb, TRUE, NOW(), NOW())
    ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description, syntax = EXCLUDED.syntax,
        example = EXCLUDED.example, "returnType" = EXCLUDED."returnType",
        args = EXCLUDED.args, "isBuiltIn" = EXCLUDED."isBuiltIn",
        "updatedAt" = NOW();

    -- =========================================================================
    -- STEP 4 — MODULES (scoped to v_org_id)
    -- =========================================================================
    INSERT INTO form_modules (
        id, name, organization_id, description, icon, color, settings,
        parent_id, module_type, level, path, is_active, sort_order,
        created_at, updated_at
    ) VALUES
        ('mod_hr_root',       'HR',                  v_org_id, 'Human Resources - manages employees, payroll, attendance and leave', 'users',       '#3B82F6', '{}'::jsonb, NULL,          'standard', 0, '/hr',                      TRUE, 10, NOW(), NOW()),
        ('mod_hr_employee',   'Employee Management', v_org_id, 'Employee master data, profiles, documents',                          'user',        '#2563EB', '{}'::jsonb, 'mod_hr_root', 'standard', 1, '/hr/employee-management',  TRUE, 10, NOW(), NOW()),
        ('mod_hr_payroll',    'Payroll',             v_org_id, 'Salary processing, payslips and bonuses',                            'dollar-sign', '#16A34A', '{}'::jsonb, 'mod_hr_root', 'standard', 1, '/hr/payroll',              TRUE, 20, NOW(), NOW()),
        ('mod_hr_attendance', 'Attendance',          v_org_id, 'Daily attendance, shifts and timesheets',                            'clock',       '#F59E0B', '{}'::jsonb, 'mod_hr_root', 'standard', 1, '/hr/attendance',           TRUE, 30, NOW(), NOW()),
        ('mod_hr_leave',      'Leave Management',    v_org_id, 'Leave applications, approvals and balances',                         'calendar',    '#DC2626', '{}'::jsonb, 'mod_hr_root', 'standard', 1, '/hr/leave-management',     TRUE, 40, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
        color = EXCLUDED.color, parent_id = EXCLUDED.parent_id,
        organization_id = EXCLUDED.organization_id, updated_at = NOW();

    -- =========================================================================
    -- STEP 5 — FORMS
    -- =========================================================================
    INSERT INTO forms (
        id, module_id, name, description, settings,
        is_published, allow_anonymous, require_login,
        "isEmployeeForm", "isUserForm", created_at, updated_at
    ) VALUES
        ('form_hr_employee_master',  'mod_hr_employee',   'Employee Master',    'Master record for every employee - personal, contact, documents and payroll setup', '{}'::jsonb, TRUE, FALSE, TRUE, TRUE,  FALSE, NOW(), NOW()),
        ('form_hr_payroll_record',   'mod_hr_payroll',    'Payroll Record',     'Monthly payroll calculation with auto-computed amounts',                           '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_salary_slip',      'mod_hr_payroll',    'Salary Slip',        'Issued monthly salary slip document',                                              '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_checkin',          'mod_hr_attendance', 'Check In',           'Daily check-in with camera selfie, GPS address and timestamp',                     '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_checkout',         'mod_hr_attendance', 'Check Out',          'Daily check-out with camera selfie, GPS address, timestamp and work hours',        '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_leave_application','mod_hr_leave',      'Leave Application',  'Employee leave request with approval flow',                                        '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        module_id = EXCLUDED.module_id, name = EXCLUDED.name,
        description = EXCLUDED.description,
        "isEmployeeForm" = EXCLUDED."isEmployeeForm", updated_at = NOW();

    -- =========================================================================
    -- STEP 6 — SECTIONS
    -- =========================================================================
    INSERT INTO form_sections (
        id, form_id, title, description, "order", columns,
        visible, collapsible, collapsed, exclude_from_inheritance,
        created_at, updated_at
    ) VALUES
        -- Employee Master
        ('sec_emp_basic',     'form_hr_employee_master', 'Basic Information',   'Identity and role',                  0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_emp_personal',  'form_hr_employee_master', 'Personal Details',    'Date of birth, nativity, addresses', 1, 2, TRUE, TRUE,  FALSE, FALSE, NOW(), NOW()),
        ('sec_emp_contact',   'form_hr_employee_master', 'Contact Information', 'Phone and email',                    2, 2, TRUE, TRUE,  FALSE, FALSE, NOW(), NOW()),
        ('sec_emp_documents', 'form_hr_employee_master', 'Documents',           'ID proofs and uploads',              3, 2, TRUE, TRUE,  FALSE, FALSE, NOW(), NOW()),
        ('sec_emp_bank',      'form_hr_employee_master', 'Bank Details',        'Salary bank account',                4, 2, TRUE, TRUE,  FALSE, FALSE, NOW(), NOW()),
        ('sec_emp_employment','form_hr_employee_master', 'Employment Details',  'Shift, joining, agreement',          5, 2, TRUE, TRUE,  FALSE, FALSE, NOW(), NOW()),
        ('sec_emp_salary',    'form_hr_employee_master', 'Salary & Allowances', 'Total salary and variable pay',      6, 2, TRUE, TRUE,  FALSE, TRUE,  NOW(), NOW()),
        ('sec_emp_company',   'form_hr_employee_master', 'Company Assets',      'Company-issued assets',              7, 2, TRUE, TRUE,  FALSE, FALSE, NOW(), NOW()),

        -- Payroll Record
        ('sec_pay_header',   'form_hr_payroll_record', 'Employee',            'Who is being paid',                      0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_pay_days',     'form_hr_payroll_record', 'Period & Attendance', 'Month and day counts',                   1, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_pay_earnings', 'form_hr_payroll_record', 'Pay Components',      'Base pay, day amounts, bonus, overtime', 2, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_pay_deduct',   'form_hr_payroll_record', 'Deductions',          'Advances and deductions',                3, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_pay_totals',   'form_hr_payroll_record', 'Totals & Status',     'Final computed pay',                     4, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Salary Slip
        ('sec_slip_meta',     'form_hr_salary_slip', 'Slip Details', 'Identifying details', 0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_slip_earnings', 'form_hr_salary_slip', 'Earnings',     'Pay components',      1, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_slip_totals',   'form_hr_salary_slip', 'Totals',       'Net payable',         2, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Check In form
        ('sec_ci_employee', 'form_hr_checkin', 'Employee',         'Identity',                                  0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_ci_capture',  'form_hr_checkin', 'Check In Capture', 'Selfie, address, timestamp, check-in time', 1, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_ci_review',   'form_hr_checkin', 'Review',           'Attendance and HR status',                  2, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Check Out form
        ('sec_co_employee', 'form_hr_checkout', 'Employee',          'Identity',                                             0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_co_capture',  'form_hr_checkout', 'Check Out Capture', 'Selfie, address, timestamp, check-out time and hours', 1, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_co_review',   'form_hr_checkout', 'Review',            'HR status',                                            2, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Leave Application
        ('sec_leave_main',     'form_hr_leave_application', 'Leave Request', 'Dates and type',   0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_leave_approval', 'form_hr_leave_application', 'Approval',      'Manager decision', 1, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        form_id = EXCLUDED.form_id, title = EXCLUDED.title,
        description = EXCLUDED.description, "order" = EXCLUDED."order",
        columns = EXCLUDED.columns, updated_at = NOW();

    -- =========================================================================
    -- STEP 7 — FIELDS: EMPLOYEE MASTER (39 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_emp_employee_id',    'sec_emp_basic', 'text',     'Employee ID',    'e.g. EMP-0001', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true,"unique":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_emp_employee_name',  'sec_emp_basic', 'text',     'Employee Name',  'Full name', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE, NOW(), NOW()),
        ('fld_emp_sex',            'sec_emp_basic', 'select',   'Sex', NULL, NULL, NULL,
         '[{"label":"Male","value":"MALE"},{"label":"Female","value":"FEMALE"},{"label":"Other","value":"OTHER"},{"label":"Prefer not to say","value":"PREFER_NOT_TO_SAY"}]'::jsonb,
         FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, FALSE, NOW(), NOW()),
        ('fld_emp_department',     'sec_emp_basic', 'select',   'Department', 'Select department', NULL, NULL,
         '[{"label":"Administration","value":"ADMIN"},{"label":"Human Resources","value":"HR"},{"label":"Finance","value":"FINANCE"},{"label":"Sales","value":"SALES"},{"label":"Marketing","value":"MARKETING"},{"label":"Production","value":"PRODUCTION"},{"label":"Operations","value":"OPERATIONS"},{"label":"IT","value":"IT"},{"label":"R&D","value":"RND"},{"label":"Logistics","value":"LOGISTICS"}]'::jsonb,
         FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3, TRUE, NOW(), NOW()),
        ('fld_emp_designation',    'sec_emp_basic', 'text',     'Designation', 'Job title', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 4, TRUE, NOW(), NOW()),

        ('fld_emp_dob',            'sec_emp_personal', 'date',     'DOB', NULL, 'Date of birth', NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, FALSE, NOW(), NOW()),
        ('fld_emp_native',         'sec_emp_personal', 'text',     'Native', 'Native place', NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 6, FALSE, NOW(), NOW()),
        ('fld_emp_belong_country', 'sec_emp_personal', 'text',     'Belong Country', 'Country of origin', NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_emp_permanent_addr', 'sec_emp_personal', 'textarea', 'Permanent Address', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 8, FALSE, NOW(), NOW()),
        ('fld_emp_current_addr',   'sec_emp_personal', 'textarea', 'Current Address', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 9, FALSE, NOW(), NOW()),

        ('fld_emp_personal_contact','sec_emp_contact', 'tel',   'Personal Contact', 'Primary phone', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true,"pattern":"^[0-9+\\-\\s]{7,20}$"}'::jsonb, TRUE, FALSE, 'half', 10, TRUE, NOW(), NOW()),
        ('fld_emp_alt_no_1',       'sec_emp_contact', 'tel',   'Alternate No. 1', 'Secondary phone', NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 11, FALSE, NOW(), NOW()),
        ('fld_emp_alt_no_2',       'sec_emp_contact', 'tel',   'Alternate No. 2', 'Tertiary phone', NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 12, FALSE, NOW(), NOW()),
        ('fld_emp_email_1',        'sec_emp_contact', 'email', 'Email Address 1', 'Primary email', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 13, TRUE, NOW(), NOW()),
        ('fld_emp_email_2',        'sec_emp_contact', 'email', 'Email Address 2', 'Secondary email', NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 14, FALSE, NOW(), NOW()),

        ('fld_emp_aadhar_upload',  'sec_emp_documents', 'file', 'Aadhar Card Upload', 'Upload Aadhar scan', NULL, NULL,
         '[]'::jsonb, FALSE, '{"accept":"image/*,application/pdf","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 15, FALSE, NOW(), NOW()),
        ('fld_emp_aadhar_no',      'sec_emp_documents', 'text', 'Aadhar Card No.', '12-digit number', NULL, NULL,
         '[]'::jsonb, FALSE, '{"pattern":"^[0-9]{12}$"}'::jsonb, TRUE, FALSE, 'half', 16, TRUE, NOW(), NOW()),
        ('fld_emp_pan_upload',     'sec_emp_documents', 'file', 'PAN Card Upload', 'Upload PAN scan', NULL, NULL,
         '[]'::jsonb, FALSE, '{"accept":"image/*,application/pdf","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 17, FALSE, NOW(), NOW()),
        ('fld_emp_passport_upload','sec_emp_documents', 'file', 'Passport Upload', 'Upload passport scan', NULL, NULL,
         '[]'::jsonb, FALSE, '{"accept":"image/*,application/pdf","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 18, FALSE, NOW(), NOW()),

        ('fld_emp_bank_name',      'sec_emp_bank', 'text', 'Bank Name', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 19, FALSE, NOW(), NOW()),
        ('fld_emp_bank_account',   'sec_emp_bank', 'text', 'Bank Account No.', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"pattern":"^[0-9]{6,20}$"}'::jsonb, TRUE, FALSE, 'half', 20, FALSE, NOW(), NOW()),
        ('fld_emp_ifsc',           'sec_emp_bank', 'text', 'IFSC Code', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"pattern":"^[A-Z]{4}0[A-Z0-9]{6}$"}'::jsonb, TRUE, FALSE, 'half', 21, FALSE, NOW(), NOW()),

        ('fld_emp_status',         'sec_emp_employment', 'select', 'Status', NULL, NULL, 'ACTIVE',
         '[{"label":"Active","value":"ACTIVE"},{"label":"Inactive","value":"INACTIVE"},{"label":"On Leave","value":"ON_LEAVE"},{"label":"Terminated","value":"TERMINATED"}]'::jsonb,
         FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 22, TRUE, NOW(), NOW()),
        ('fld_emp_shift_type',     'sec_emp_employment', 'select', 'Shift Type', NULL, NULL, NULL,
         '[{"label":"Day","value":"DAY"},{"label":"Night","value":"NIGHT"},{"label":"Rotational","value":"ROTATIONAL"},{"label":"General","value":"GENERAL"}]'::jsonb,
         FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 23, FALSE, NOW(), NOW()),
        ('fld_emp_in_time',        'sec_emp_employment', 'time',   'In Time',  NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 24, FALSE, NOW(), NOW()),
        ('fld_emp_out_time',       'sec_emp_employment', 'time',   'Out Time', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 25, FALSE, NOW(), NOW()),
        ('fld_emp_date_joining',   'sec_emp_employment', 'date',   'Date of Joining', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 26, TRUE, NOW(), NOW()),
        ('fld_emp_date_leaving',   'sec_emp_employment', 'date',   'Date of Leaving', NULL, 'Blank if still employed', NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 27, FALSE, NOW(), NOW()),
        ('fld_emp_increment_month','sec_emp_employment', 'select', 'Increment Month', NULL, 'Month in which annual increment is due', NULL,
         '[{"label":"January","value":1},{"label":"February","value":2},{"label":"March","value":3},{"label":"April","value":4},{"label":"May","value":5},{"label":"June","value":6},{"label":"July","value":7},{"label":"August","value":8},{"label":"September","value":9},{"label":"October","value":10},{"label":"November","value":11},{"label":"December","value":12}]'::jsonb,
         FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 28, FALSE, NOW(), NOW()),
        ('fld_emp_years_agreement','sec_emp_employment', 'number', 'Years of Agreement While Joining', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0,"max":50}'::jsonb, TRUE, FALSE, 'half', 29, FALSE, NOW(), NOW()),
        ('fld_emp_bonus_after',    'sec_emp_employment', 'number', 'Bonus After How Many Years', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0,"max":50}'::jsonb, TRUE, FALSE, 'half', 30, FALSE, NOW(), NOW()),
        ('fld_emp_company_name',   'sec_emp_employment', 'text',   'Company Name', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 31, FALSE, NOW(), NOW()),

        ('fld_emp_total_salary',   'sec_emp_salary', 'number', 'Total Salary',    'CTC', NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 32, FALSE, NOW(), NOW()),
        ('fld_emp_given_salary',   'sec_emp_salary', 'number', 'Given Salary',    'In-hand', NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 33, FALSE, NOW(), NOW()),
        ('fld_emp_bonus_amount',   'sec_emp_salary', 'number', 'Bonus Amount',    NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 34, FALSE, NOW(), NOW()),
        ('fld_emp_night_allow',    'sec_emp_salary', 'number', 'Night Allowance', 'Per night', NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 35, FALSE, NOW(), NOW()),
        ('fld_emp_over_time',      'sec_emp_salary', 'number', 'Over Time',       'Rate per hour', NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 36, FALSE, NOW(), NOW()),
        ('fld_emp_one_hour_extra', 'sec_emp_salary', 'number', '1 Hour Extra',    'Rate per extra hour', NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 37, FALSE, NOW(), NOW()),

        ('fld_emp_company_sim',    'sec_emp_company', 'checkbox', 'Company Sim Issue', NULL, 'Tick if a company SIM has been issued', 'false',
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 38, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, visible = EXCLUDED.visible,
        readonly = EXCLUDED.readonly, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 8 — FIELDS: PAYROLL RECORD (19 fields, 5 formulas)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_pay_id',           'sec_pay_header', 'text',   'ID',          'e.g. PAY-0001', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true,"unique":true}'::jsonb, TRUE, FALSE, 'half',    0, TRUE, NOW(), NOW()),
        ('fld_pay_name',         'sec_pay_header', 'text',   'Name',        'Employee name', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half',    1, TRUE, NOW(), NOW()),
        ('fld_pay_department',   'sec_pay_header', 'select', 'Department',  NULL, NULL, NULL,
         '[{"label":"Administration","value":"ADMIN"},{"label":"Human Resources","value":"HR"},{"label":"Finance","value":"FINANCE"},{"label":"Sales","value":"SALES"},{"label":"Marketing","value":"MARKETING"},{"label":"Production","value":"PRODUCTION"},{"label":"Operations","value":"OPERATIONS"},{"label":"IT","value":"IT"},{"label":"R&D","value":"RND"},{"label":"Logistics","value":"LOGISTICS"}]'::jsonb,
         FALSE, '{}'::jsonb, TRUE, FALSE, 'half',    2, TRUE, NOW(), NOW()),
        ('fld_pay_designation',  'sec_pay_header', 'text',   'Designation', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half',    3, FALSE, NOW(), NOW()),

        ('fld_pay_month',        'sec_pay_days', 'select', 'Month', NULL, NULL, NULL,
         '[{"label":"January","value":1},{"label":"February","value":2},{"label":"March","value":3},{"label":"April","value":4},{"label":"May","value":5},{"label":"June","value":6},{"label":"July","value":7},{"label":"August","value":8},{"label":"September","value":9},{"label":"October","value":10},{"label":"November","value":11},{"label":"December","value":12}]'::jsonb,
         FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'quarter', 4, TRUE, NOW(), NOW()),
        ('fld_pay_month_days',   'sec_pay_days', 'number', 'Month Days',   'Total days in the month (28-31)', NULL, '30',
         '[]'::jsonb, FALSE, '{"required":true,"min":1,"max":31}'::jsonb, TRUE, FALSE, 'quarter', 5, FALSE, NOW(), NOW()),
        ('fld_pay_working_days', 'sec_pay_days', 'number', 'Working Days', NULL, NULL, '0',
         '[]'::jsonb, FALSE, '{"min":0,"max":31}'::jsonb, TRUE, FALSE, 'quarter', 6, FALSE, NOW(), NOW()),
        ('fld_pay_leave_days',   'sec_pay_days', 'number', 'Leave Days',   NULL, NULL, '0',
         '[]'::jsonb, FALSE, '{"min":0,"max":31}'::jsonb, TRUE, FALSE, 'quarter', 7, FALSE, NOW(), NOW()),
        ('fld_pay_half_days',    'sec_pay_days', 'number', 'Half Days',    NULL, NULL, '0',
         '[]'::jsonb, FALSE, '{"min":0,"max":31}'::jsonb, TRUE, FALSE, 'quarter', 8, FALSE, NOW(), NOW()),

        ('fld_pay_total_salary', 'sec_pay_earnings', 'number',  'Total Salary',    'Monthly CTC before attendance adjustments', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true,"min":0}'::jsonb, TRUE, FALSE, 'half',    9, FALSE, NOW(), NOW()),
        ('fld_pay_bonus',        'sec_pay_earnings', 'number',  'Bonus',           NULL, NULL, '0',
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half',   10, FALSE, NOW(), NOW()),
        ('fld_pay_working_amt',  'sec_pay_earnings', 'formula', 'Working Day Amt', NULL, '(Total Salary / Month Days) * Working Days', NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, TRUE,  'half',   11, FALSE, NOW(), NOW()),
        ('fld_pay_leave_amt',    'sec_pay_earnings', 'formula', 'Leave Day Amt',   NULL, '(Total Salary / Month Days) * Leave Days', NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, TRUE,  'half',   12, FALSE, NOW(), NOW()),
        ('fld_pay_half_amt',     'sec_pay_earnings', 'formula', 'Half Day Amt',    NULL, '(Total Salary / Month Days) * Half Days * 0.5', NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, TRUE,  'half',   13, FALSE, NOW(), NOW()),
        ('fld_pay_overtime',     'sec_pay_earnings', 'number',  'Overtime',        'Overtime amount', NULL, '0',
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half',   14, FALSE, NOW(), NOW()),

        ('fld_pay_advance',      'sec_pay_deduct',   'number',  'Advance Taken',   NULL, NULL, '0',
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half',   15, FALSE, NOW(), NOW()),

        ('fld_pay_total_amt',    'sec_pay_totals',   'formula', 'Total Amt',       NULL, 'Working + Leave + Half + Bonus + Overtime', NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, TRUE,  'half',   16, FALSE, NOW(), NOW()),
        ('fld_pay_given_salary', 'sec_pay_totals',   'formula', 'Given Salary',    NULL, 'Total Amt - Advance Taken', NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, TRUE,  'half',   17, FALSE, NOW(), NOW()),
        ('fld_pay_status',       'sec_pay_totals',   'select',  'Status',          NULL, NULL, 'pending',
         '[{"label":"Pending","value":"pending"},{"label":"Processed","value":"processed"},{"label":"Paid","value":"paid"},{"label":"On Hold","value":"hold"}]'::jsonb,
         FALSE, '{}'::jsonb, TRUE, FALSE, 'half',   18, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        readonly = EXCLUDED.readonly, "order" = EXCLUDED."order",
        updated_at = NOW();

    -- =========================================================================
    -- STEP 9a — FIELDS: CHECK IN (10 fields)
    -- Separate form so employees submit a check-in record at start of shift.
    -- "Selfie" uses file type with capture="user" — on mobile this opens the
    -- front camera directly; on desktop it falls back to a file picker.
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        -- Employee
        ('fld_ci_employee_id',   'sec_ci_employee', 'text',   'Employee ID',   'e.g. EMP-0001', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_ci_employee_name', 'sec_ci_employee', 'text',   'Employee Name', 'Full name',     NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE, NOW(), NOW()),
        ('fld_ci_department',    'sec_ci_employee', 'select', 'Department',    NULL, NULL, NULL,
         '[{"label":"Administration","value":"ADMIN"},{"label":"Human Resources","value":"HR"},{"label":"Finance","value":"FINANCE"},{"label":"Sales","value":"SALES"},{"label":"Marketing","value":"MARKETING"},{"label":"Production","value":"PRODUCTION"},{"label":"Operations","value":"OPERATIONS"},{"label":"IT","value":"IT"},{"label":"R&D","value":"RND"},{"label":"Logistics","value":"LOGISTICS"}]'::jsonb,
         FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 2, TRUE, NOW(), NOW()),

        -- Capture (camera + GPS + time)
        ('fld_ci_selfie',    'sec_ci_capture', 'file',     'Selfie (Check In)',    'Tap to open camera', 'Front camera capture', NULL,
         '[]'::jsonb, FALSE, '{"required":true,"accept":"image/*","capture":"user","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW()),
        ('fld_ci_address',   'sec_ci_capture', 'textarea', 'Address (Check In)',   'Auto-captured from GPS', NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_ci_timestamp', 'sec_ci_capture', 'datetime', 'Timestamp (Check In)', NULL, 'Auto-captured server-side', NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, TRUE, NOW(), NOW()),
        ('fld_ci_time',      'sec_ci_capture', 'time',     'Check In Time',        NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 6, FALSE, NOW(), NOW()),

        -- Review
        ('fld_ci_status',    'sec_ci_review', 'select', 'Attendance Status', NULL, NULL, 'PRESENT',
         '[{"label":"Present","value":"PRESENT"},{"label":"Late","value":"LATE"},{"label":"Half Day","value":"HALF_DAY"},{"label":"Work From Home","value":"WFH"}]'::jsonb,
         FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 7, TRUE, NOW(), NOW()),
        ('fld_ci_hr_status', 'sec_ci_review', 'select', 'HR Status',         NULL, 'HR approval / verification', 'PENDING',
         '[{"label":"Pending","value":"PENDING"},{"label":"Approved","value":"APPROVED"},{"label":"Rejected","value":"REJECTED"},{"label":"Needs Clarification","value":"CLARIFY"}]'::jsonb,
         FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 8, TRUE, NOW(), NOW()),
        ('fld_ci_notes',     'sec_ci_review', 'textarea', 'Notes',            'Optional remarks', NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 9, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 9b — FIELDS: CHECK OUT (11 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        -- Employee
        ('fld_co_employee_id',   'sec_co_employee', 'text',   'Employee ID',   'e.g. EMP-0001', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_co_employee_name', 'sec_co_employee', 'text',   'Employee Name', 'Full name',     NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE, NOW(), NOW()),
        ('fld_co_department',    'sec_co_employee', 'select', 'Department',    NULL, NULL, NULL,
         '[{"label":"Administration","value":"ADMIN"},{"label":"Human Resources","value":"HR"},{"label":"Finance","value":"FINANCE"},{"label":"Sales","value":"SALES"},{"label":"Marketing","value":"MARKETING"},{"label":"Production","value":"PRODUCTION"},{"label":"Operations","value":"OPERATIONS"},{"label":"IT","value":"IT"},{"label":"R&D","value":"RND"},{"label":"Logistics","value":"LOGISTICS"}]'::jsonb,
         FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 2, TRUE, NOW(), NOW()),

        -- Capture (camera + GPS + time + hours worked)
        ('fld_co_selfie',    'sec_co_capture', 'file',     'Selfie (Check Out)',    'Tap to open camera', 'Front camera capture', NULL,
         '[]'::jsonb, FALSE, '{"required":true,"accept":"image/*","capture":"user","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW()),
        ('fld_co_address',   'sec_co_capture', 'textarea', 'Address (Check Out)',   'Auto-captured from GPS', NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_co_timestamp', 'sec_co_capture', 'datetime', 'Timestamp (Check Out)', NULL, 'Auto-captured server-side', NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, TRUE, NOW(), NOW()),
        ('fld_co_time',      'sec_co_capture', 'time',     'Check Out Time',        NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 6, FALSE, NOW(), NOW()),
        ('fld_co_work_hours','sec_co_capture', 'number',   'Work Hours',            'Hours worked this shift', NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0,"max":24}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_co_overtime',  'sec_co_capture', 'number',   'Overtime Hours',        'Extra hours beyond shift', NULL, '0',
         '[]'::jsonb, FALSE, '{"min":0,"max":12}'::jsonb, TRUE, FALSE, 'half', 8, FALSE, NOW(), NOW()),

        -- Review
        ('fld_co_hr_status', 'sec_co_review', 'select',   'HR Status', NULL, 'HR approval / verification', 'PENDING',
         '[{"label":"Pending","value":"PENDING"},{"label":"Approved","value":"APPROVED"},{"label":"Rejected","value":"REJECTED"},{"label":"Needs Clarification","value":"CLARIFY"}]'::jsonb,
         FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 9, TRUE, NOW(), NOW()),
        ('fld_co_notes',     'sec_co_review', 'textarea', 'Notes',     'Optional remarks', NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 10, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 10 — FIELDS: SALARY SLIP
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_slip_employee',  'sec_slip_meta', 'lookup', 'Employee', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_slip_period',    'sec_slip_meta', 'text',   'Pay Period', 'e.g. Apr 2026', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE, NOW(), NOW()),
        ('fld_slip_issue_date','sec_slip_meta', 'date',   'Issue Date', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, FALSE, NOW(), NOW()),
        ('fld_slip_basic',     'sec_slip_earnings', 'number', 'Basic',      NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW()),
        ('fld_slip_allowances','sec_slip_earnings', 'number', 'Allowances', NULL, NULL, '0',
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_slip_bonus',     'sec_slip_earnings', 'number', 'Bonus',      NULL, NULL, '0',
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 5, FALSE, NOW(), NOW()),
        ('fld_slip_deductions','sec_slip_earnings', 'number', 'Deductions', NULL, NULL, '0',
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 6, FALSE, NOW(), NOW()),
        ('fld_slip_net',       'sec_slip_totals',   'number', 'Net Payable',NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_slip_file',      'sec_slip_totals',   'file',   'Slip PDF',   NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"accept":"application/pdf","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 8, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", updated_at = NOW();

    -- =========================================================================
    -- STEP 11 — FIELDS: LEAVE APPLICATION
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_leave_employee',  'sec_leave_main', 'lookup', 'Employee', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_leave_type',      'sec_leave_main', 'select', 'Leave Type', NULL, NULL, NULL,
         '[{"label":"Casual","value":"CASUAL"},{"label":"Sick","value":"SICK"},{"label":"Earned","value":"EARNED"},{"label":"Half Day","value":"HALF_DAY"},{"label":"Short Leave","value":"SHORT_LEAVE"},{"label":"Unpaid","value":"UNPAID"},{"label":"Maternity","value":"MATERNITY"},{"label":"Paternity","value":"PATERNITY"}]'::jsonb,
         FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE, NOW(), NOW()),
        ('fld_leave_from',      'sec_leave_main', 'date',     'From Date',    NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE, NOW(), NOW()),
        ('fld_leave_to',        'sec_leave_main', 'date',     'To Date',      NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3, TRUE, NOW(), NOW()),
        ('fld_leave_days',      'sec_leave_main', 'number',   'Total Days',   NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_leave_reason',    'sec_leave_main', 'textarea', 'Reason', 'Reason for leave', NULL, NULL,
         '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 5, FALSE, NOW(), NOW()),
        ('fld_leave_contact',   'sec_leave_main', 'tel',      'Contact During Leave', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 6, FALSE, NOW(), NOW()),
        ('fld_leave_attachment','sec_leave_main', 'file',     'Attachment', 'Medical certificate etc.', NULL, NULL,
         '[]'::jsonb, FALSE, '{"accept":"image/*,application/pdf","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_leave_status',    'sec_leave_approval', 'select',   'Approval Status', NULL, NULL, 'PENDING',
         '[{"label":"Pending","value":"PENDING"},{"label":"Approved","value":"APPROVED"},{"label":"Rejected","value":"REJECTED"},{"label":"Cancelled","value":"CANCELLED"}]'::jsonb,
         FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 8, TRUE, NOW(), NOW()),
        ('fld_leave_approver',  'sec_leave_approval', 'text',     'Approver', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 9, FALSE, NOW(), NOW()),
        ('fld_leave_remarks',   'sec_leave_approval', 'textarea', 'Remarks', NULL, NULL, NULL,
         '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 10, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", updated_at = NOW();

    -- =========================================================================
    -- STEP 12 — FORMULA FIELDS (payroll computed columns)
    -- =========================================================================
    INSERT INTO formula_fields (
        id, "formFieldId", expression, "returnType",
        "autoRefresh", "showTooltip", "blankPreference", dependencies,
        created_at, updated_at
    ) VALUES
        ('ff_pay_working_amt',  'fld_pay_working_amt',
         '({fld_pay_total_salary} / {fld_pay_month_days}) * {fld_pay_working_days}',
         'Number', TRUE, TRUE, 'Zero',
         '["fld_pay_total_salary","fld_pay_month_days","fld_pay_working_days"]'::jsonb,
         NOW(), NOW()),
        ('ff_pay_leave_amt',    'fld_pay_leave_amt',
         '({fld_pay_total_salary} / {fld_pay_month_days}) * {fld_pay_leave_days}',
         'Number', TRUE, TRUE, 'Zero',
         '["fld_pay_total_salary","fld_pay_month_days","fld_pay_leave_days"]'::jsonb,
         NOW(), NOW()),
        ('ff_pay_half_amt',     'fld_pay_half_amt',
         '({fld_pay_total_salary} / {fld_pay_month_days}) * {fld_pay_half_days} * 0.5',
         'Number', TRUE, TRUE, 'Zero',
         '["fld_pay_total_salary","fld_pay_month_days","fld_pay_half_days"]'::jsonb,
         NOW(), NOW()),
        ('ff_pay_total_amt',    'fld_pay_total_amt',
         '{fld_pay_working_amt} + {fld_pay_leave_amt} + {fld_pay_half_amt} + {fld_pay_bonus} + {fld_pay_overtime}',
         'Number', TRUE, TRUE, 'Zero',
         '["fld_pay_working_amt","fld_pay_leave_amt","fld_pay_half_amt","fld_pay_bonus","fld_pay_overtime"]'::jsonb,
         NOW(), NOW()),
        ('ff_pay_given_salary', 'fld_pay_given_salary',
         '{fld_pay_total_amt} - {fld_pay_advance}',
         'Number', TRUE, TRUE, 'Zero',
         '["fld_pay_total_amt","fld_pay_advance"]'::jsonb,
         NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        expression       = EXCLUDED.expression,
        "returnType"     = EXCLUDED."returnType",
        "autoRefresh"    = EXCLUDED."autoRefresh",
        "showTooltip"    = EXCLUDED."showTooltip",
        "blankPreference"= EXCLUDED."blankPreference",
        dependencies     = EXCLUDED.dependencies,
        updated_at       = NOW();

    -- =========================================================================
    -- STEP 13 — LEAVE TYPES & RULES (global)
    -- =========================================================================
    INSERT INTO leave_types (id, name, code, category, description, color, icon, is_active, sort_order, created_at, updated_at) VALUES
        ('lt_full_day_leave',  'Full Day Leave',  'FULL_DAY_LEAVE',  'FULL_DAY',    'Standard full day leave',        '#ef4444', 'Calendar', TRUE, 1, NOW(), NOW()),
        ('lt_half_day_leave',  'Half Day Leave',  'HALF_DAY_LEAVE',  'HALF_DAY',    'Half day leave (4 hours)',       '#f59e0b', 'Clock',    TRUE, 2, NOW(), NOW()),
        ('lt_short_leave',     'Short Leave',     'SHORT_LEAVE',     'SHORT_LEAVE', 'Short leave (1-2 hours)',        '#3b82f6', 'Clock',    TRUE, 3, NOW(), NOW()),
        ('lt_hourly_leave',    'Hourly Leave',    'HOURLY_LEAVE',    'HOURLY',      'Hourly leave for short absences','#10b981', 'Hourglass',TRUE, 4, NOW(), NOW())
    ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name, category = EXCLUDED.category,
        description = EXCLUDED.description, color = EXCLUDED.color,
        icon = EXCLUDED.icon, is_active = EXCLUDED.is_active,
        sort_order = EXCLUDED.sort_order, updated_at = NOW();

    INSERT INTO leave_rules (
        id, leave_type_id, name, description, deduction_percentage, hours_equivalent,
        requires_approval, max_consecutive_days, min_notice_days, affects_attendance,
        is_paid, carry_forward, max_carry_forward_days, accrual_rate, is_active,
        created_at, updated_at
    ) VALUES
        ('lr_sick_leave',    'lt_full_day_leave', 'Sick Leave',    'Paid sick leave with medical certificate', 0,   NULL, TRUE, 10,  1, TRUE, TRUE,  TRUE,  10,  1.0, TRUE, NOW(), NOW()),
        ('lr_casual_leave',  'lt_full_day_leave', 'Casual Leave',  'Paid casual leave up to 12 days / year',   0,   NULL, TRUE, 5,   2, TRUE, TRUE,  FALSE, NULL,1.0, TRUE, NOW(), NOW()),
        ('lr_earned_leave',  'lt_full_day_leave', 'Earned Leave',  'Accrued earned leave (privileged leave)',  0,   NULL, TRUE, 15,  7, TRUE, TRUE,  TRUE,  30,  1.75,TRUE, NOW(), NOW()),
        ('lr_unpaid_leave',  'lt_full_day_leave', 'Unpaid Leave',  'Leave without pay',                        100, NULL, TRUE, 30,  3, TRUE, FALSE, FALSE, NULL,NULL,TRUE, NOW(), NOW()),
        ('lr_half_day',      'lt_half_day_leave', 'Half Day',      'Half day leave with 50 percent deduction', 50,  4,    TRUE, 1,   1, TRUE, FALSE, FALSE, NULL,NULL,TRUE, NOW(), NOW()),
        ('lr_short_leave',   'lt_short_leave',    'Short Leave',   'Short leave 1-2 hours, hourly deduction',  100, 2,    FALSE,1,   0, FALSE,FALSE, FALSE, NULL,NULL,TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        leave_type_id = EXCLUDED.leave_type_id, name = EXCLUDED.name,
        description = EXCLUDED.description,
        deduction_percentage = EXCLUDED.deduction_percentage,
        hours_equivalent = EXCLUDED.hours_equivalent,
        requires_approval = EXCLUDED.requires_approval,
        max_consecutive_days = EXCLUDED.max_consecutive_days,
        min_notice_days = EXCLUDED.min_notice_days,
        affects_attendance = EXCLUDED.affects_attendance,
        is_paid = EXCLUDED.is_paid, carry_forward = EXCLUDED.carry_forward,
        max_carry_forward_days = EXCLUDED.max_carry_forward_days,
        accrual_rate = EXCLUDED.accrual_rate, is_active = EXCLUDED.is_active,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 14 — LOOKUP SOURCE + RELATIONS (Employee Master)
    -- =========================================================================
    INSERT INTO lookup_sources (
        id, name, type, description, source_module_id, source_form_id,
        active, created_at, updated_at
    ) VALUES (
        'lks_hr_employees', 'HR Employees', 'form',
        'All records from the Employee Master form',
        'mod_hr_employee', 'form_hr_employee_master',
        TRUE, NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, type = EXCLUDED.type,
        description = EXCLUDED.description,
        source_module_id = EXCLUDED.source_module_id,
        source_form_id = EXCLUDED.source_form_id,
        active = EXCLUDED.active, updated_at = NOW();

    INSERT INTO lookup_field_relations (
        id, lookup_source_id, form_field_id, form_id, module_id,
        display_field, value_field, multiple, searchable, filters,
        created_at, updated_at
    ) VALUES
        ('lkr_slip_employee',  'lks_hr_employees', 'fld_slip_employee',
         'form_hr_salary_slip', 'mod_hr_payroll',
         'fld_emp_employee_name', 'fld_emp_employee_id',
         FALSE, TRUE, '{}'::jsonb, NOW(), NOW()),

        ('lkr_leave_employee', 'lks_hr_employees', 'fld_leave_employee',
         'form_hr_leave_application', 'mod_hr_leave',
         'fld_emp_employee_name', 'fld_emp_employee_id',
         FALSE, TRUE, '{}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        lookup_source_id = EXCLUDED.lookup_source_id,
        form_field_id = EXCLUDED.form_field_id,
        form_id = EXCLUDED.form_id, module_id = EXCLUDED.module_id,
        display_field = EXCLUDED.display_field,
        value_field = EXCLUDED.value_field,
        multiple = EXCLUDED.multiple, searchable = EXCLUDED.searchable,
        filters = EXCLUDED.filters, updated_at = NOW();

    -- =========================================================================
    -- STEP 15 — PAYROLL CONFIGURATION (links attendance + leave forms)
    -- =========================================================================
    INSERT INTO payroll_configurations (
        id, attendance_form_ids, leave_form_ids,
        attendance_field_mappings, leave_field_mappings,
        organization_id, is_active, created_at, updated_at
    ) VALUES (
        'cfg_hr_payroll',
        '["form_hr_checkin","form_hr_checkout"]'::jsonb,
        '["form_hr_leave_application"]'::jsonb,
        jsonb_build_object(
          'form_hr_checkin', jsonb_build_object(
            'employeeId',   'fld_ci_employee_id',
            'employeeName', 'fld_ci_employee_name',
            'department',   'fld_ci_department',
            'date',         'fld_ci_timestamp',
            'status',       'fld_ci_status',
            'checkIn',      'fld_ci_time',
            'hrStatus',     'fld_ci_hr_status'
          ),
          'form_hr_checkout', jsonb_build_object(
            'employeeId', 'fld_co_employee_id',
            'employeeName','fld_co_employee_name',
            'department', 'fld_co_department',
            'date',       'fld_co_timestamp',
            'checkOut',   'fld_co_time',
            'workHours',  'fld_co_work_hours',
            'overtime',   'fld_co_overtime',
            'hrStatus',   'fld_co_hr_status'
          )
        ),
        jsonb_build_object(
          'form_hr_leave_application', jsonb_build_object(
            'employeeId', 'fld_leave_employee',
            'leaveType',  'fld_leave_type',
            'fromDate',   'fld_leave_from',
            'toDate',     'fld_leave_to',
            'days',       'fld_leave_days',
            'status',     'fld_leave_status'
          )
        ),
        v_org_id, TRUE, NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        attendance_form_ids       = EXCLUDED.attendance_form_ids,
        leave_form_ids            = EXCLUDED.leave_form_ids,
        attendance_field_mappings = EXCLUDED.attendance_field_mappings,
        leave_field_mappings      = EXCLUDED.leave_field_mappings,
        organization_id           = EXCLUDED.organization_id,
        is_active                 = EXCLUDED.is_active,
        updated_at                = NOW();

    -- =========================================================================
    -- STEP 16 — UNIQUE ID COUNTERS (auto-number EMP-/PAY-)
    -- =========================================================================
    INSERT INTO unique_id_counters (id, "fieldId", "lastNumber", "createdAt", "updatedAt") VALUES
        ('uc_emp', 'fld_emp_employee_id', 0, NOW(), NOW()),
        ('uc_pay', 'fld_pay_id',          0, NOW(), NOW()),
        ('uc_ci',  'fld_ci_employee_id',  0, NOW(), NOW()),
        ('uc_co',  'fld_co_employee_id',  0, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    -- =========================================================================
    -- STEP 17 — FORM -> STORAGE TABLE MAPPINGS
    -- =========================================================================
    -- Drop any stale v1 mapping for the old merged attendance form.
    DELETE FROM form_table_mappings WHERE id = 'ftm_hr_daily_attendance';

    -- NOTE: storage_table MUST be one of form_records_1..15 — those are the
    -- sharded tables the submit route (/api/forms/[formId]/submit) writes to.
    -- The unified `form_records` table is a dual-write target, not a primary
    -- target, so mapping a form to it causes submit to fail with
    -- "Unsupported table: form_records".
    INSERT INTO form_table_mappings (id, form_id, storage_table, created_at, updated_at) VALUES
        ('ftm_hr_employee_master',   'form_hr_employee_master',    'form_records_14', NOW(), NOW()),
        ('ftm_hr_payroll_record',    'form_hr_payroll_record',     'form_records_1',  NOW(), NOW()),
        ('ftm_hr_salary_slip',       'form_hr_salary_slip',        'form_records_2',  NOW(), NOW()),
        ('ftm_hr_checkin',           'form_hr_checkin',            'form_records_3',  NOW(), NOW()),
        ('ftm_hr_checkout',          'form_hr_checkout',           'form_records_4',  NOW(), NOW()),
        ('ftm_hr_leave_application', 'form_hr_leave_application',  'form_records_5',  NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        form_id = EXCLUDED.form_id,
        storage_table = EXCLUDED.storage_table,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 18 — ROUTE PERMISSIONS for /hr/* (org-scoped)
    -- =========================================================================
    INSERT INTO route_permissions (id, pattern, description, organization_id, created_at, updated_at) VALUES
        ('rp_hr_root',       '/hr',                      'HR module home',      v_org_id, NOW(), NOW()),
        ('rp_hr_employee',   '/hr/employee-management',  'Employee management', v_org_id, NOW(), NOW()),
        ('rp_hr_payroll',    '/hr/payroll',              'Payroll processing',  v_org_id, NOW(), NOW()),
        ('rp_hr_attendance', '/hr/attendance',           'Attendance tracking', v_org_id, NOW(), NOW()),
        ('rp_hr_leave',      '/hr/leave-management',     'Leave management',    v_org_id, NOW(), NOW())
    ON CONFLICT (pattern, organization_id) DO UPDATE SET
        description = EXCLUDED.description, updated_at = NOW();

    -- =========================================================================
    -- STEP 19 — PERMISSIONS catalog — required so user_permissions.permission_id
    --           points at a real row.  The app calls
    --           prisma.permission.findMany({ where: { id: { in: [...ids] } } }),
    --           which throws if any id is NULL — so every user_permissions row
    --           MUST reference an existing Permission.
    -- =========================================================================
    INSERT INTO permissions (id, name, description, category, resource, organization_id, is_active, created_at, updated_at) VALUES
        ('perm_hr_admin',  'HR Admin',  'Full HR administration (system admin)', 'ADMIN',  '*',       v_org_id, TRUE, NOW(), NOW()),
        ('perm_hr_view',   'HR View',   'View HR data',                          'READ',   'hr',      v_org_id, TRUE, NOW(), NOW()),
        ('perm_hr_create', 'HR Create', 'Create HR records',                     'WRITE',  'hr',      v_org_id, TRUE, NOW(), NOW()),
        ('perm_hr_edit',   'HR Edit',   'Edit HR records',                       'WRITE',  'hr',      v_org_id, TRUE, NOW(), NOW()),
        ('perm_hr_delete', 'HR Delete', 'Delete HR records',                     'DELETE', 'hr',      v_org_id, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        category = EXCLUDED.category, resource = EXCLUDED.resource,
        organization_id = EXCLUDED.organization_id, is_active = EXCLUDED.is_active,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 19b — ADMIN ROLE + ASSIGNMENT
    -- This makes the user a real admin system-wide (not just HR) so every
    -- form-builder permission check (`useFormPermissions`, /api/auth/me,
    -- /api/admin/permissions) returns isAdmin=true and every Publish/Edit/
    -- Delete button is enabled without any per-form permission grants.
    -- =========================================================================

    -- 19b.1  Default "Headquarters" org unit to attach roles to
    INSERT INTO organization_units (id, name, description, organization_id, parent_id, level, sort_order, is_active, created_at, updated_at)
    VALUES ('unit_hq', 'Headquarters', 'Default top-level organization unit',
            v_org_id, NULL, 0, 0, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        organization_id = EXCLUDED.organization_id, is_active = EXCLUDED.is_active,
        updated_at = NOW();

    -- 19b.2  Administrator role with is_admin = TRUE
    --        (unique by (name, organization_id) — see schema)
    -- First scrub any stale row with the same (name, org) but a different id
    -- so ON CONFLICT (id) DO UPDATE cannot fail the unique constraint.
    DELETE FROM roles
     WHERE organization_id = v_org_id
       AND name = 'Administrator'
       AND id <> 'role_admin';

    INSERT INTO roles (id, name, description, organization_id, parent_id, level, share_data_with_peers, sort_order, is_active, is_admin, created_at, updated_at)
    VALUES ('role_admin', 'Administrator', 'Full system access',
            v_org_id, NULL, 0, FALSE, 0, TRUE, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        organization_id = EXCLUDED.organization_id,
        is_active = EXCLUDED.is_active, is_admin = EXCLUDED.is_admin,
        updated_at = NOW();

    -- 19b.3  Link role to unit (required before user assignment)
    INSERT INTO unit_role_assignments (id, unit_id, role_id, created_at, updated_at)
    VALUES ('ura_admin_hq', 'unit_hq', 'role_admin', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    -- 19b.4  Assign user to unit with admin role (unique by (user_id, unit_id))
    -- Clean any existing assignment for this user+unit first so our row wins.
    DELETE FROM user_unit_assignments
     WHERE user_id = v_user_id AND unit_id = 'unit_hq' AND id <> 'uua_admin_user';

    INSERT INTO user_unit_assignments (id, user_id, unit_id, role_id, notes, created_at, updated_at)
    VALUES ('uua_admin_user', v_user_id, 'unit_hq', 'role_admin',
            'HR bootstrap: auto-assigned administrator role', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id, unit_id = EXCLUDED.unit_id,
        role_id = EXCLUDED.role_id, updated_at = NOW();

    -- =========================================================================
    -- STEP 20 — USER PERMISSIONS — grant v_user_id full admin on all HR
    --           Belt-and-braces: the admin role above already covers this,
    --           but explicit per-module/per-form overrides make the user
    --           visible in the Permissions settings UI too.
    -- =========================================================================
    INSERT INTO user_permissions (
        id, user_id, permission_id, module_id, form_id,
        granted, can_view, can_create, can_edit, can_delete, is_system_admin,
        reason, granted_by, granted_at, is_active,
        created_at, updated_at
    ) VALUES
        -- Module-level grants
        ('up_hr_root_admin',    v_user_id, 'perm_hr_admin', 'mod_hr_root',       NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: module admin', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hr_emp_admin',     v_user_id, 'perm_hr_admin', 'mod_hr_employee',   NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: module admin', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hr_pay_admin',     v_user_id, 'perm_hr_admin', 'mod_hr_payroll',    NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: module admin', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hr_att_admin',     v_user_id, 'perm_hr_admin', 'mod_hr_attendance', NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: module admin', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hr_leave_admin',   v_user_id, 'perm_hr_admin', 'mod_hr_leave',      NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: module admin', v_user_id, NOW(), TRUE, NOW(), NOW()),
        -- Form-level grants
        ('up_form_emp_admin',   v_user_id, 'perm_hr_admin', NULL, 'form_hr_employee_master',    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: form admin', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_pay_admin',   v_user_id, 'perm_hr_admin', NULL, 'form_hr_payroll_record',     TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: form admin', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_slip_admin',  v_user_id, 'perm_hr_admin', NULL, 'form_hr_salary_slip',        TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: form admin', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_ci_admin',    v_user_id, 'perm_hr_admin', NULL, 'form_hr_checkin',            TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: form admin', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_co_admin',    v_user_id, 'perm_hr_admin', NULL, 'form_hr_checkout',           TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: form admin', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_leave_admin', v_user_id, 'perm_hr_admin', NULL, 'form_hr_leave_application',  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap: form admin', v_user_id, NOW(), TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id, permission_id = EXCLUDED.permission_id,
        module_id = EXCLUDED.module_id, form_id = EXCLUDED.form_id,
        granted = EXCLUDED.granted, can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
        can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete,
        is_system_admin = EXCLUDED.is_system_admin, is_active = EXCLUDED.is_active,
        updated_at = NOW();

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'HR bootstrap complete.';
    RAISE NOTICE '  Organization:        %', v_org_id;
    RAISE NOTICE '  Admin user:          %', v_user_id;
    RAISE NOTICE '  Modules:              5';
    RAISE NOTICE '  Forms:                6 (Employee, Payroll, Slip, Check In, Check Out, Leave)';
    RAISE NOTICE '  Sections:            22';
    RAISE NOTICE '  Fields:              99 (39 emp + 19 pay + 10 CI + 11 CO + 9 slip + 11 leave)';
    RAISE NOTICE '  Formula fields:       5';
    RAISE NOTICE '  Leave types/rules:    4 / 6';
    RAISE NOTICE '  Route permissions:    5';
    RAISE NOTICE '  Permissions catalog:  5 (HR Admin/View/Create/Edit/Delete)';
    RAISE NOTICE '  Admin role:           role_admin (is_admin = TRUE) -> assigned to user';
    RAISE NOTICE '  User permissions:    11 (5 modules + 6 forms, all -> perm_hr_admin)';
    RAISE NOTICE '==========================================';
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES — paste in Supabase SQL editor after the script runs
-- =============================================================================
-- Modules visible to your org:
-- SELECT id, name, parent_id, level, path
--   FROM form_modules
--  WHERE organization_id = 'cmo9uk3440005u7ngdg652eoq'
--  ORDER BY level, sort_order;
--
-- Forms and their modules:
-- SELECT f.id, f.name, m.name AS module
--   FROM forms f JOIN form_modules m ON m.id = f.module_id
--  WHERE m.organization_id = 'cmo9uk3440005u7ngdg652eoq';
--
-- All HR fields grouped by form/section:
-- SELECT f.name AS form, s.title AS section, ff.label, ff.type, ff."order"
--   FROM form_fields ff
--   JOIN form_sections s ON s.id = ff.section_id
--   JOIN forms f        ON f.id = s.form_id
--   JOIN form_modules m ON m.id = f.module_id
--  WHERE m.organization_id = 'cmo9uk3440005u7ngdg652eoq'
--  ORDER BY f.name, s."order", ff."order";
--
-- Payroll formulas:
-- SELECT ff.label, fx.expression, fx."returnType", fx.dependencies
--   FROM formula_fields fx JOIN form_fields ff ON ff.id = fx."formFieldId"
--  WHERE ff.id LIKE 'fld_pay_%';
--
-- Your user permissions:
-- SELECT module_id, form_id, can_view, can_edit, can_delete, is_system_admin, reason
--   FROM user_permissions
--  WHERE user_id = 'cmo9uhu660000u7ngr51zv3wv'
--  ORDER BY module_id NULLS LAST, form_id NULLS LAST;
