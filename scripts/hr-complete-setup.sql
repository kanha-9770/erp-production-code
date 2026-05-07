-- =============================================================================
-- HR MODULE - COMPLETE PRODUCTION SETUP (ALL-IN-ONE)
-- =============================================================================
--
-- Single self-contained script that bootstraps the full HR system end-to-end:
--   1. HR module structure (5 modules / 19 sub-modules / 20 forms / 241 fields)
--   2. HR automations (CRM functions + workflow rules + function bindings)
--   3. Recruitment pipeline patches (auto-numbered IDs)
--   4. Appointment Letter -> Employee Master hotfix
--
-- Idempotent. Safe to run on every deploy.
--
-- HOW TO RUN
--   Option A (recommended) - via the runner (auto-resolves org/user IDs):
--       npm run setup:hr
--
--   Option B - directly with psql (ids must already match a real org/user):
--       psql "$DATABASE_URL" -f scripts/hr-complete-setup.sql
--       (edit the v_org_id / v_user_id declarations inside each DO block first)
--
-- Source files (kept for reference, do not need to be run separately):
--   scripts/create-hr-module.sql
--   scripts/create-hr-automations.sql
--   scripts/patch-hr-recruitment-pipeline.sql
--   scripts/hotfix-appt-to-emp.sql
-- =============================================================================

BEGIN;


-- =============================================================================
-- PART 1/4 - HR MODULE STRUCTURE
-- modules / forms / sections / 241 fields / lookups / leave types / route perms / role + admin / user perms
-- Source: scripts/create-hr-module.sql
-- =============================================================================

-- =============================================================================
-- HR MODULE - COMPLETE BOOTSTRAP (WIPE + REBUILD)
-- =============================================================================
-- Full structure per HR_System_Modules spec:
--   5 Modules / 19 Sub-Modules / 20 Forms / 241 Field Entries
--
--   HR
--    |- HR Core          -> Employee Master, Check In, Check Out,
--    |                      Leave Application, Holiday List          (5 forms)
--    |- Recruitment      -> Staffing Plan, Job Opening, Job App,
--    |                      Job Offer, Appointment Letter, Referral  (6 forms)
--    |- Performance      -> KRA Master, Performance Appraisal        (2 forms)
--    |- Engagement       -> Self Target, Self Initiative, Problem,
--    |                      Kaizen, Employee Suggestion               (5 forms)
--    \- Asset & Admin    -> Asset Management, SIM Management          (2 forms)
--
-- Target DB: PostgreSQL (matches prisma/schema.prisma).
-- Safe to re-run: wipes then UPSERTs.
-- =============================================================================



DO $$
DECLARE
    v_org_id  TEXT := 'cmojv2bpr000hu700t3jrj0vq';
    v_user_id TEXT := 'cmojv15ct000cu700xrgwrbe8';
    v_deleted INTEGER;
    v_dept_opts       TEXT := '[{"label":"Administration","value":"ADMIN"},{"label":"Human Resources","value":"HR"},{"label":"Finance","value":"FINANCE"},{"label":"Sales","value":"SALES"},{"label":"Marketing","value":"MARKETING"},{"label":"Production","value":"PRODUCTION"},{"label":"Operations","value":"OPERATIONS"},{"label":"IT","value":"IT"},{"label":"R&D","value":"RND"},{"label":"Logistics","value":"LOGISTICS"},{"label":"Quality","value":"QUALITY"},{"label":"Maintenance","value":"MAINTENANCE"}]';
    v_emp_type_opts   TEXT := '[{"label":"Full-Time","value":"FULL_TIME"},{"label":"Part-Time","value":"PART_TIME"},{"label":"Contract","value":"CONTRACT"},{"label":"Intern","value":"INTERN"},{"label":"Consultant","value":"CONSULTANT"},{"label":"Temporary","value":"TEMPORARY"},{"label":"Probation","value":"PROBATION"}]';
    v_shift_opts      TEXT := '[{"label":"Day","value":"DAY"},{"label":"Night","value":"NIGHT"},{"label":"Rotational","value":"ROTATIONAL"},{"label":"General","value":"GENERAL"},{"label":"Morning","value":"MORNING"},{"label":"Evening","value":"EVENING"}]';
    v_salutation_opts TEXT := '[{"label":"Mr.","value":"MR"},{"label":"Mrs.","value":"MRS"},{"label":"Ms.","value":"MS"},{"label":"Dr.","value":"DR"},{"label":"Prof.","value":"PROF"}]';
    v_gender_opts     TEXT := '[{"label":"Male","value":"MALE"},{"label":"Female","value":"FEMALE"},{"label":"Other","value":"OTHER"},{"label":"Prefer not to say","value":"PREFER_NOT_TO_SAY"}]';
    v_blood_opts      TEXT := '[{"label":"A+","value":"A+"},{"label":"A-","value":"A-"},{"label":"B+","value":"B+"},{"label":"B-","value":"B-"},{"label":"O+","value":"O+"},{"label":"O-","value":"O-"},{"label":"AB+","value":"AB+"},{"label":"AB-","value":"AB-"}]';
    v_marital_opts    TEXT := '[{"label":"Single","value":"SINGLE"},{"label":"Married","value":"MARRIED"},{"label":"Divorced","value":"DIVORCED"},{"label":"Widowed","value":"WIDOWED"},{"label":"Separated","value":"SEPARATED"}]';
    v_accom_opts      TEXT := '[{"label":"Own House","value":"OWN"},{"label":"Rented","value":"RENTED"},{"label":"Company Provided","value":"COMPANY_PROVIDED"},{"label":"Hostel","value":"HOSTEL"},{"label":"Paying Guest","value":"PG"},{"label":"With Family","value":"FAMILY"}]';
    v_month_opts      TEXT := '[{"label":"January","value":1},{"label":"February","value":2},{"label":"March","value":3},{"label":"April","value":4},{"label":"May","value":5},{"label":"June","value":6},{"label":"July","value":7},{"label":"August","value":8},{"label":"September","value":9},{"label":"October","value":10},{"label":"November","value":11},{"label":"December","value":12}]';
    v_emp_status_opts TEXT := '[{"label":"Active","value":"ACTIVE"},{"label":"Inactive","value":"INACTIVE"},{"label":"On Leave","value":"ON_LEAVE"},{"label":"Suspended","value":"SUSPENDED"},{"label":"Terminated","value":"TERMINATED"},{"label":"Resigned","value":"RESIGNED"},{"label":"Retired","value":"RETIRED"}]';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id) THEN
        RAISE EXCEPTION 'Organization % does not exist - aborting.', v_org_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
        RAISE EXCEPTION 'User % does not exist - aborting.', v_user_id;
    END IF;

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Bootstrapping HR module (full 5-module spec)';
    RAISE NOTICE '  Organization: %', v_org_id;
    RAISE NOTICE '  Admin user:   %', v_user_id;
    RAISE NOTICE '==========================================';

    -- =========================================================================
    -- STEP 1 - WIPE existing HR modules/forms for this org
    -- =========================================================================
    DELETE FROM unique_id_counters
     WHERE "fieldId" IN (
        SELECT ff.id FROM form_fields ff
          JOIN form_sections s ON s.id = ff.section_id
          JOIN forms f        ON f.id = s.form_id
          JOIN form_modules m ON m.id = f.module_id
         WHERE m.organization_id = v_org_id OR m.id LIKE 'mod_hr%'
     );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped unique_id_counters: %', v_deleted;

    DELETE FROM payroll_configurations WHERE organization_id = v_org_id OR id = 'cfg_hr_payroll';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped payroll_configurations: %', v_deleted;

    -- Wipe route_permissions for this org AND any rows that re-use the well-
    -- known HR ids from a previous bootstrap on a different org (PK is `id`,
    -- not (id, org), so cross-org id collisions would otherwise block INSERT).
    DELETE FROM route_permissions
     WHERE (organization_id = v_org_id AND pattern LIKE '/hr%')
        OR id LIKE 'rp_hr%';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped route_permissions: %', v_deleted;

    DELETE FROM user_permissions
     WHERE (module_id IN (SELECT id FROM form_modules WHERE organization_id = v_org_id OR id LIKE 'mod_hr%'))
        OR (form_id   IN (SELECT f.id FROM forms f
                           JOIN form_modules m ON m.id = f.module_id
                          WHERE m.organization_id = v_org_id OR m.id LIKE 'mod_hr%'))
        OR id LIKE 'up_hr_%' OR id LIKE 'up_form_%';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped user_permissions: %', v_deleted;

    DELETE FROM permissions
     WHERE id IN ('perm_hr_admin','perm_hr_view','perm_hr_create','perm_hr_edit','perm_hr_delete')
        OR (organization_id = v_org_id
            AND name IN ('HR Admin','HR View','HR Create','HR Edit','HR Delete'));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped permissions: %', v_deleted;

    DELETE FROM form_modules
     WHERE organization_id = v_org_id OR id LIKE 'mod_hr%';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped form_modules: %', v_deleted;

    RAISE NOTICE '-------- Wipe complete. Rebuilding. --------';

    -- =========================================================================
    -- STEP 2 - FIELD TYPES REGISTRY (global, upsert)
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
        ('ft_image',      'image',      'Image',       'media',    'image',          'Image upload',              '{"width":"full","accept":"image/*","maxSize":5242880}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_signature',  'signature',  'Signature',   'media',    'pen-tool',       'Signature capture',         '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_rating',     'rating',     'Rating',      'choice',   'star',           'Star rating',               '{"width":"full","max":5}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_lookup',     'lookup',     'Lookup',      'advanced', 'link',           'Reference another form',    '{"width":"full"}'::jsonb, TRUE, NOW(), NOW()),
        ('ft_formula',    'formula',    'Formula',     'advanced', 'function',       'Computed field',            '{"width":"full","readonly":true}'::jsonb, TRUE, NOW(), NOW())
    ON CONFLICT (name) DO UPDATE SET
        label = EXCLUDED.label, category = EXCLUDED.category, icon = EXCLUDED.icon,
        description = EXCLUDED.description, default_props = EXCLUDED.default_props,
        active = EXCLUDED.active, updated_at = NOW();

    -- =========================================================================
    -- STEP 3 - FORMULA OPERATORS & FUNCTIONS
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
    -- STEP 4 - MODULES (1 root + 5 top-level + 19 sub-modules = 25)
    -- =========================================================================
    INSERT INTO form_modules (
        id, name, organization_id, description, icon, color, settings,
        parent_id, module_type, level, path, is_active, sort_order,
        created_at, updated_at
    ) VALUES
        ('mod_hr_root',            'HR',                    v_org_id, 'Human Resources - complete HR management',                  'users',          '#3B82F6', '{}'::jsonb, NULL,            'standard', 0, '/hr',                                   TRUE, 10, NOW(), NOW()),
        ('mod_hrcore',             'HR Core',               v_org_id, 'Core employee info, attendance, leave, holidays',           'user-cog',       '#2563EB', '{}'::jsonb, 'mod_hr_root',   'standard', 1, '/hr/core',                              TRUE, 10, NOW(), NOW()),
        ('mod_hrrec',              'Recruitment',           v_org_id, 'Hiring lifecycle - plans, openings, offers',                'briefcase',      '#9333EA', '{}'::jsonb, 'mod_hr_root',   'standard', 1, '/hr/recruitment',                       TRUE, 20, NOW(), NOW()),
        ('mod_hrperf',             'Performance',           v_org_id, 'KRAs and performance appraisals',                           'trending-up',    '#16A34A', '{}'::jsonb, 'mod_hr_root',   'standard', 1, '/hr/performance',                       TRUE, 30, NOW(), NOW()),
        ('mod_hreng',              'Employee Engagement',   v_org_id, 'Targets, initiatives, Kaizen, suggestions',                 'heart-handshake','#F59E0B', '{}'::jsonb, 'mod_hr_root',   'standard', 1, '/hr/engagement',                        TRUE, 40, NOW(), NOW()),
        ('mod_hradm',              'Asset & Admin',         v_org_id, 'Asset allocation and SIM management',                       'laptop',         '#DC2626', '{}'::jsonb, 'mod_hr_root',   'standard', 1, '/hr/admin',                             TRUE, 50, NOW(), NOW()),
        ('mod_hrcore_emp',         'Employee Master',       v_org_id, 'Central employee profile repository',                       'user',           '#1E40AF', '{}'::jsonb, 'mod_hrcore',    'standard', 2, '/hr/core/employee-master',              TRUE, 10, NOW(), NOW()),
        ('mod_hrcore_att',         'Attendance',            v_org_id, 'Daily check-in / check-out',                                'clock',          '#0EA5E9', '{}'::jsonb, 'mod_hrcore',    'standard', 2, '/hr/core/attendance',                   TRUE, 20, NOW(), NOW()),
        ('mod_hrcore_leave',       'Leave Management',      v_org_id, 'Leave applications and approvals',                          'calendar',       '#0284C7', '{}'::jsonb, 'mod_hrcore',    'standard', 2, '/hr/core/leave-management',             TRUE, 30, NOW(), NOW()),
        ('mod_hrcore_holiday',     'Holiday List',          v_org_id, 'Organizational holiday calendar',                           'calendar-days',  '#0369A1', '{}'::jsonb, 'mod_hrcore',    'standard', 2, '/hr/core/holiday-list',                 TRUE, 40, NOW(), NOW()),
        ('mod_hrrec_staff',        'Staffing Plan',         v_org_id, 'Manpower planning and budget',                              'clipboard-list', '#7E22CE', '{}'::jsonb, 'mod_hrrec',     'standard', 2, '/hr/recruitment/staffing-plan',         TRUE, 10, NOW(), NOW()),
        ('mod_hrrec_opening',      'Job Opening',           v_org_id, 'Publish approved vacancies',                                'megaphone',      '#8B5CF6', '{}'::jsonb, 'mod_hrrec',     'standard', 2, '/hr/recruitment/job-opening',           TRUE, 20, NOW(), NOW()),
        ('mod_hrrec_app',          'Job Application',       v_org_id, 'Applications received for openings',                        'file-text',      '#A855F7', '{}'::jsonb, 'mod_hrrec',     'standard', 2, '/hr/recruitment/job-application',       TRUE, 30, NOW(), NOW()),
        ('mod_hrrec_offer',        'Job Offer',             v_org_id, 'Offers extended to shortlisted candidates',                 'award',          '#C084FC', '{}'::jsonb, 'mod_hrrec',     'standard', 2, '/hr/recruitment/job-offer',             TRUE, 40, NOW(), NOW()),
        ('mod_hrrec_appt',         'Appointment Letter',    v_org_id, 'Formal appointment letters',                                'scroll',         '#D8B4FE', '{}'::jsonb, 'mod_hrrec',     'standard', 2, '/hr/recruitment/appointment-letter',    TRUE, 50, NOW(), NOW()),
        ('mod_hrrec_ref',          'Employee Referral',     v_org_id, 'Referrals submitted by employees',                          'user-plus',      '#E9D5FF', '{}'::jsonb, 'mod_hrrec',     'standard', 2, '/hr/recruitment/employee-referral',     TRUE, 60, NOW(), NOW()),
        ('mod_hrperf_kra',         'KRA',                   v_org_id, 'Key Result Areas by designation',                           'target',         '#15803D', '{}'::jsonb, 'mod_hrperf',    'standard', 2, '/hr/performance/kra',                   TRUE, 10, NOW(), NOW()),
        ('mod_hrperf_apr',         'Performance Appraisal', v_org_id, 'Scores earned against KRAs',                                'bar-chart',      '#22C55E', '{}'::jsonb, 'mod_hrperf',    'standard', 2, '/hr/performance/appraisal',             TRUE, 20, NOW(), NOW()),
        ('mod_hreng_tgt',          'Self Target',           v_org_id, 'Monthly self-targets',                                      'goal',           '#EA580C', '{}'::jsonb, 'mod_hreng',     'standard', 2, '/hr/engagement/self-target',            TRUE, 10, NOW(), NOW()),
        ('mod_hreng_init',         'Self Initiative',       v_org_id, 'Voluntary initiatives taken',                               'lightbulb',      '#F97316', '{}'::jsonb, 'mod_hreng',     'standard', 2, '/hr/engagement/self-initiative',        TRUE, 20, NOW(), NOW()),
        ('mod_hreng_prob',         'Problem Registration',  v_org_id, 'Problems identified and solved',                            'alert-triangle', '#FB923C', '{}'::jsonb, 'mod_hreng',     'standard', 2, '/hr/engagement/problem-registration',   TRUE, 30, NOW(), NOW()),
        ('mod_hreng_kz',           'Kaizen',                v_org_id, 'Continuous improvement activities',                         'recycle',        '#FDBA74', '{}'::jsonb, 'mod_hreng',     'standard', 2, '/hr/engagement/kaizen',                 TRUE, 40, NOW(), NOW()),
        ('mod_hreng_sug',          'Employee Suggestion',   v_org_id, 'Suggestions from employees',                                'message-square', '#FED7AA', '{}'::jsonb, 'mod_hreng',     'standard', 2, '/hr/engagement/employee-suggestion',    TRUE, 50, NOW(), NOW()),
        ('mod_hradm_asset',        'Asset Management',      v_org_id, 'Company assets allocated to employees',                     'laptop',         '#B91C1C', '{}'::jsonb, 'mod_hradm',     'standard', 2, '/hr/admin/asset-management',            TRUE, 10, NOW(), NOW()),
        ('mod_hradm_sim',          'SIM Management',        v_org_id, 'SIM cards allocation and recharge',                         'smartphone',     '#EF4444', '{}'::jsonb, 'mod_hradm',     'standard', 2, '/hr/admin/sim-management',              TRUE, 20, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
        color = EXCLUDED.color, parent_id = EXCLUDED.parent_id, level = EXCLUDED.level,
        path = EXCLUDED.path, sort_order = EXCLUDED.sort_order,
        organization_id = EXCLUDED.organization_id, updated_at = NOW();

    -- =========================================================================
    -- STEP 5 - FORMS (20 total)
    -- =========================================================================
    INSERT INTO forms (
        id, module_id, name, description, settings,
        is_published, allow_anonymous, require_login,
        "isEmployeeForm", "isUserForm", created_at, updated_at
    ) VALUES
        ('form_hr_employee_master',        'mod_hrcore_emp',     'Employee Master',        'Central repository of complete employee information',                  '{}'::jsonb, TRUE, FALSE, TRUE, TRUE,  FALSE, NOW(), NOW()),
        ('form_hr_checkin',                'mod_hrcore_att',     'Check In',               'Records start of workday with location and photo evidence',            '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_checkout',               'mod_hrcore_att',     'Check Out',              'Records end of workday with location and camera verification',         '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_leave_application',      'mod_hrcore_leave',   'Leave Application',      'Leave request with multi-level approval flow',                         '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_holiday_list',           'mod_hrcore_holiday', 'Holiday List',           'Official holiday list for a given year',                               '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_staffing_plan',          'mod_hrrec_staff',    'Staffing Plan',          'Manpower requirements, vacancies and costs',                           '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_job_opening',            'mod_hrrec_opening',  'Job Opening',            'Approved staffing plan entry as a live job posting',                   '{}'::jsonb, TRUE, TRUE,  FALSE,FALSE, FALSE, NOW(), NOW()),
        ('form_hr_job_application',        'mod_hrrec_app',      'Job Application',        'Candidate details, resume, and screening info',                        '{}'::jsonb, TRUE, TRUE,  FALSE,FALSE, FALSE, NOW(), NOW()),
        ('form_hr_job_offer',              'mod_hrrec_offer',    'Job Offer',              'Offer with salary terms, conditions, and acceptance',                  '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_appointment_letter',     'mod_hrrec_appt',     'Appointment Letter',     'Printable appointment letter from template',                           '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_employee_referral',      'mod_hrrec_ref',      'Employee Referral',      'Referral details linked to referring employee',                        '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_kra_master',             'mod_hrperf_kra',     'KRA Master',             'KRA template used during appraisals',                                  '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_performance_appraisal',  'mod_hrperf_apr',     'Performance Appraisal',  'Scores earned by each employee against each goal',                     '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_self_target',            'mod_hreng_tgt',      'Self Target',            'Self-defined monthly target with engagement points',                   '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_self_initiative',        'mod_hreng_init',     'Self Initiative',        'Initiatives defined by employees with benefits',                       '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_problem_registration',   'mod_hreng_prob',     'Problem Registration',   'Problem, impact, solution and supporting media',                       '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_kaizen',                 'mod_hreng_kz',       'Kaizen',                 'Kaizen projects, why-analysis, results and benefits',                  '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_employee_suggestion',    'mod_hreng_sug',      'Employee Suggestion',    'Suggestion with expected benefits and supporting media',               '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_asset_management',       'mod_hradm_asset',    'Asset Management',       'Allocate, track and update status of company assets',                  '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW()),
        ('form_hr_sim_management',         'mod_hradm_sim',      'SIM Management',         'SIM allocation, plan, recharge and location info',                     '{}'::jsonb, TRUE, FALSE, TRUE, FALSE, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        module_id = EXCLUDED.module_id, name = EXCLUDED.name,
        description = EXCLUDED.description,
        "isEmployeeForm" = EXCLUDED."isEmployeeForm",
        allow_anonymous = EXCLUDED.allow_anonymous,
        require_login = EXCLUDED.require_login,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 6 - SECTIONS
    -- =========================================================================
    INSERT INTO form_sections (
        id, form_id, title, description, "order", columns,
        visible, collapsible, collapsed, exclude_from_inheritance,
        created_at, updated_at
    ) VALUES
        -- Employee Master (7 sections per PDF A-G)
        ('sec_emp_personal',    'form_hr_employee_master', 'Personal Information', 'Identity, DOB, nationality',              0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_emp_contact',     'form_hr_employee_master', 'Contact Information',  'Email, phone, addresses, emergency',      1, 2, TRUE, TRUE,  FALSE, FALSE, NOW(), NOW()),
        ('sec_emp_employment',  'form_hr_employee_master', 'Employment Details',   'Company, department, shift, joining',     2, 2, TRUE, TRUE,  FALSE, FALSE, NOW(), NOW()),
        ('sec_emp_documents',   'form_hr_employee_master', 'Document Uploads',     'Passport, Aadhar, PAN',                   3, 2, TRUE, TRUE,  FALSE, FALSE, NOW(), NOW()),
        ('sec_emp_salary',      'form_hr_employee_master', 'Salary & Compensation','Salary mode, overtime, bonus',            4, 2, TRUE, TRUE,  FALSE, TRUE,  NOW(), NOW()),
        ('sec_emp_bank',        'form_hr_employee_master', 'Bank Details',         'Salary bank account',                     5, 2, TRUE, TRUE,  FALSE, TRUE,  NOW(), NOW()),
        ('sec_emp_exit',        'form_hr_employee_master', 'Exit / Resignation',   'Resignation and relieving details',       6, 2, TRUE, TRUE,  TRUE,  FALSE, NOW(), NOW()),

        -- Check In (1 section)
        ('sec_ci_main',         'form_hr_checkin',         'Check In',             'Employee check-in with location and photo',0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Check Out (1 section)
        ('sec_co_main',         'form_hr_checkout',        'Check Out',            'Employee check-out with location and photo',0,2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Leave Application (2 sections)
        ('sec_leave_request',   'form_hr_leave_application', 'Leave Request',      'Employee and dates',                      0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_leave_approval',  'form_hr_leave_application', 'Approval',           'Manager and HR approval',                 1, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Holiday List (1 section)
        ('sec_holiday_main',    'form_hr_holiday_list',    'Holiday',              'Holiday list entries',                    0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Staffing Plan (1 section)
        ('sec_staff_main',      'form_hr_staffing_plan',   'Staffing Plan',        'Role, vacancies and cost estimation',     0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Job Opening (1 section)
        ('sec_open_main',       'form_hr_job_opening',     'Job Opening',          'Live job posting details',                0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Job Application (2 sections)
        ('sec_app_candidate',   'form_hr_job_application', 'Candidate',            'Applicant details, resume, screening',    0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_app_status',      'form_hr_job_application', 'Status',               'Rating and process status',               1, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Job Offer (1 section)
        ('sec_offer_main',      'form_hr_job_offer',       'Job Offer',            'Offer terms and conditions',              0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Appointment Letter (1 section)
        ('sec_appt_main',       'form_hr_appointment_letter', 'Appointment Letter','Formal appointment letter template',      0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Employee Referral (1 section)
        ('sec_ref_main',        'form_hr_employee_referral', 'Referral',           'Referred candidate and referrer',         0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- KRA Master (1 section)
        ('sec_kra_main',        'form_hr_kra_master',      'KRA Definition',       'Goal definition and weightage',           0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Performance Appraisal (1 section)
        ('sec_apr_main',        'form_hr_performance_appraisal', 'Appraisal',      'Employee scoring against KRA',            0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Self Target (1 section)
        ('sec_tgt_main',        'form_hr_self_target',     'Self Target',          'Monthly self-defined target',             0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Self Initiative (1 section)
        ('sec_init_main',       'form_hr_self_initiative', 'Self Initiative',      'Initiative and benefits',                 0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Problem Registration (2 sections)
        ('sec_prob_problem',    'form_hr_problem_registration', 'Problem',         'Problem and impact',                      0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_prob_solution',   'form_hr_problem_registration', 'Solution',        'Solution and evidence',                   1, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Kaizen (3 sections)
        ('sec_kz_info',         'form_hr_kaizen',          'Kaizen Info',          'Employee, area, theme, start date',       0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_kz_analysis',     'form_hr_kaizen',          'Problem & Analysis',   'Before/after media and why-analysis',     1, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_kz_result',       'form_hr_kaizen',          'Result & Benefits',    'Result, benefits and signatures',         2, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Employee Suggestion (1 section)
        ('sec_sug_main',        'form_hr_employee_suggestion', 'Suggestion',       'Suggestion details and benefits',         0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- Asset Management (1 section)
        ('sec_asset_main',      'form_hr_asset_management', 'Asset',               'Company asset allocation',                0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),

        -- SIM Management (2 sections)
        ('sec_sim_details',     'form_hr_sim_management',  'SIM Details',          'Number, provider, plan',                  0, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW()),
        ('sec_sim_user',        'form_hr_sim_management',  'User & Recharge',      'Assigned employee and recharge history',  1, 2, TRUE, FALSE, FALSE, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        form_id = EXCLUDED.form_id, title = EXCLUDED.title,
        description = EXCLUDED.description, "order" = EXCLUDED."order",
        columns = EXCLUDED.columns, updated_at = NOW();

    -- =========================================================================
    -- STEP 7 - FIELDS: EMPLOYEE MASTER (52 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        -- A. Personal Information (10)
        ('fld_emp_salutation',      'sec_emp_personal', 'select',   'Salutation',      NULL,               NULL, NULL, v_salutation_opts::jsonb, FALSE, '{}'::jsonb,                                      TRUE, FALSE, 'quarter', 0,  FALSE, NOW(), NOW()),
        ('fld_emp_first_name',      'sec_emp_personal', 'text',     'First Name',      'First name',       NULL, NULL, '[]'::jsonb,              FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half',    1,  TRUE,  NOW(), NOW()),
        ('fld_emp_last_name',       'sec_emp_personal', 'text',     'Last Name',       'Last name',        NULL, NULL, '[]'::jsonb,              FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half',    2,  TRUE,  NOW(), NOW()),
        ('fld_emp_gender',          'sec_emp_personal', 'select',   'Gender',          NULL,               NULL, NULL, v_gender_opts::jsonb,     FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half',    3,  FALSE, NOW(), NOW()),
        ('fld_emp_dob',             'sec_emp_personal', 'date',     'Date of Birth',   NULL,               NULL, NULL, '[]'::jsonb,              FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half',    4,  FALSE, NOW(), NOW()),
        ('fld_emp_place_birth',     'sec_emp_personal', 'text',     'Place of Birth',  'City, country',    NULL, NULL, '[]'::jsonb,              FALSE, '{}'::jsonb,                                      TRUE, FALSE, 'half',    5,  FALSE, NOW(), NOW()),
        ('fld_emp_blood_group',     'sec_emp_personal', 'select',   'Blood Group',     NULL,               NULL, NULL, v_blood_opts::jsonb,      FALSE, '{}'::jsonb,                                      TRUE, FALSE, 'half',    6,  FALSE, NOW(), NOW()),
        ('fld_emp_nationality',     'sec_emp_personal', 'text',     'Nationality',     'e.g. Indian',      NULL, 'Indian', '[]'::jsonb,          FALSE, '{}'::jsonb,                                      TRUE, FALSE, 'half',    7,  FALSE, NOW(), NOW()),
        ('fld_emp_marital',         'sec_emp_personal', 'select',   'Marital Status',  NULL,               NULL, NULL, v_marital_opts::jsonb,    FALSE, '{}'::jsonb,                                      TRUE, FALSE, 'half',    8,  FALSE, NOW(), NOW()),
        ('fld_emp_image',           'sec_emp_personal', 'image',    'Employee Image',  NULL,               'Profile photo', NULL, '[]'::jsonb,    FALSE, '{"accept":"image/*","maxSize":5242880}'::jsonb,  TRUE, FALSE, 'half',    9,  FALSE, NOW(), NOW()),

        -- B. Contact Information (10)
        ('fld_emp_personal_email',  'sec_emp_contact',  'email',    'Personal Email',       'personal@example.com', NULL, NULL, '[]'::jsonb,      FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half', 10, TRUE,  NOW(), NOW()),
        ('fld_emp_company_email',   'sec_emp_contact',  'email',    'Company Email',        'work@company.com',     NULL, NULL, '[]'::jsonb,      FALSE, '{}'::jsonb,                                      TRUE, FALSE, 'half', 11, TRUE,  NOW(), NOW()),
        ('fld_emp_cell_number',     'sec_emp_contact',  'tel',      'Cell Number',          'Primary phone',        NULL, NULL, '[]'::jsonb,      FALSE, '{"required":true,"pattern":"^[0-9+\\-\\s]{7,20}$"}'::jsonb, TRUE, FALSE, 'half', 12, TRUE, NOW(), NOW()),
        ('fld_emp_current_addr',    'sec_emp_contact',  'textarea', 'Current Address',      NULL,                   NULL, NULL, '[]'::jsonb,      FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'full', 13, FALSE, NOW(), NOW()),
        ('fld_emp_permanent_addr',  'sec_emp_contact',  'textarea', 'Permanent Address',    NULL,                   NULL, NULL, '[]'::jsonb,      FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'full', 14, FALSE, NOW(), NOW()),
        ('fld_emp_current_accom',   'sec_emp_contact',  'select',   'Current Accommodation Type',   NULL,           NULL, NULL, v_accom_opts::jsonb, FALSE, '{}'::jsonb,                                  TRUE, FALSE, 'half', 15, FALSE, NOW(), NOW()),
        ('fld_emp_permanent_accom', 'sec_emp_contact',  'select',   'Permanent Accommodation Type', NULL,           NULL, NULL, v_accom_opts::jsonb, FALSE, '{}'::jsonb,                                  TRUE, FALSE, 'half', 16, FALSE, NOW(), NOW()),
        ('fld_emp_emergency_name',  'sec_emp_contact',  'text',     'Emergency Contact Name',       'Full name',    NULL, NULL, '[]'::jsonb,      FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half', 17, FALSE, NOW(), NOW()),
        ('fld_emp_emergency_phone', 'sec_emp_contact',  'tel',      'Emergency Phone',              'Phone',        NULL, NULL, '[]'::jsonb,      FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half', 18, FALSE, NOW(), NOW()),
        ('fld_emp_relation',        'sec_emp_contact',  'text',     'Relation',                     'e.g. Father',  NULL, NULL, '[]'::jsonb,      FALSE, '{}'::jsonb,                                      TRUE, FALSE, 'half', 19, FALSE, NOW(), NOW()),

        -- C. Employment Details (13)
        ('fld_emp_employee_id',     'sec_emp_employment', 'text',   'Employee ID',       'e.g. EMP-0001',  NULL, NULL, '[]'::jsonb,              FALSE, '{"required":true,"unique":true}'::jsonb,         TRUE, FALSE, 'half', 20, TRUE,  NOW(), NOW()),
        ('fld_emp_emp_type',        'sec_emp_employment', 'select', 'Employment Type',   NULL,             NULL, NULL, v_emp_type_opts::jsonb,   FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half', 21, TRUE,  NOW(), NOW()),
        ('fld_emp_company',         'sec_emp_employment', 'text',   'Company',           'Company name',   NULL, NULL, '[]'::jsonb,              FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half', 22, FALSE, NOW(), NOW()),
        ('fld_emp_branch',          'sec_emp_employment', 'text',   'Branch',            'Branch / location', NULL, NULL, '[]'::jsonb,           FALSE, '{}'::jsonb,                                      TRUE, FALSE, 'half', 23, FALSE, NOW(), NOW()),
        ('fld_emp_department',      'sec_emp_employment', 'select', 'Department',        NULL,             NULL, NULL, v_dept_opts::jsonb,       FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half', 24, TRUE,  NOW(), NOW()),
        ('fld_emp_date_joining',    'sec_emp_employment', 'date',   'Date of Joining',   NULL,             NULL, NULL, '[]'::jsonb,              FALSE, '{"required":true}'::jsonb,                      TRUE, FALSE, 'half', 25, TRUE,  NOW(), NOW()),
        ('fld_emp_shift_type',      'sec_emp_employment', 'select', 'Shift Type',        NULL,             NULL, NULL, v_shift_opts::jsonb,      FALSE, '{}'::jsonb,                                      TRUE, FALSE, 'half', 26, FALSE, NOW(), NOW()),
        ('fld_emp_in_time',         'sec_emp_employment', 'time',   'In Time',           NULL,             'Scheduled in time', NULL, '[]'::jsonb, FALSE, '{}'::jsonb,                                    TRUE, FALSE, 'half', 27, FALSE, NOW(), NOW()),
        ('fld_emp_out_time',        'sec_emp_employment', 'time',   'Out Time',          NULL,             'Scheduled out time', NULL, '[]'::jsonb, FALSE, '{}'::jsonb,                                   TRUE, FALSE, 'half', 28, FALSE, NOW(), NOW()),
        ('fld_emp_total_hours',     'sec_emp_employment', 'number', 'Total Working Hours',  'Hours per shift', NULL, '8', '[]'::jsonb,           FALSE, '{"min":0,"max":24}'::jsonb,                     TRUE, FALSE, 'half', 29, FALSE, NOW(), NOW()),
        ('fld_emp_eng_team',        'sec_emp_employment', 'text',   'Employee Engagement Team Name', 'Team name', NULL, NULL, '[]'::jsonb,       FALSE, '{}'::jsonb,                                      TRUE, FALSE, 'half', 30, FALSE, NOW(), NOW()),
        ('fld_emp_status',          'sec_emp_employment', 'select', 'Status',            NULL,             NULL, 'ACTIVE', v_emp_status_opts::jsonb, FALSE, '{"required":true}'::jsonb,                  TRUE, FALSE, 'half', 31, TRUE,  NOW(), NOW()),
        ('fld_emp_years_agreement', 'sec_emp_employment', 'number', 'Years of Agreement While Joining', 'Years', NULL, NULL, '[]'::jsonb,         FALSE, '{"min":0,"max":50}'::jsonb,                     TRUE, FALSE, 'half', 32, FALSE, NOW(), NOW()),

        -- D. Document Uploads (3)
        ('fld_emp_passport_upload', 'sec_emp_documents', 'file',    'Passport Upload',   'Upload passport scan', NULL, NULL, '[]'::jsonb,        FALSE, '{"accept":"image/*,application/pdf","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 33, FALSE, NOW(), NOW()),
        ('fld_emp_aadhar_upload',   'sec_emp_documents', 'file',    'Aadhar Card Upload','Upload Aadhar scan',   NULL, NULL, '[]'::jsonb,        FALSE, '{"accept":"image/*,application/pdf","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 34, FALSE, NOW(), NOW()),
        ('fld_emp_pan_upload',      'sec_emp_documents', 'file',    'PAN Card Upload',   'Upload PAN scan',      NULL, NULL, '[]'::jsonb,        FALSE, '{"accept":"image/*,application/pdf","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 35, FALSE, NOW(), NOW()),

        -- E. Salary & Compensation (9)
        ('fld_emp_salary_mode',     'sec_emp_salary', 'select',  'Salary Mode',     NULL,   NULL, 'BANK_TRANSFER',
            '[{"label":"Bank Transfer","value":"BANK_TRANSFER"},{"label":"Cash","value":"CASH"},{"label":"Cheque","value":"CHEQUE"},{"label":"UPI","value":"UPI"}]'::jsonb,
            FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 36, FALSE, NOW(), NOW()),
        ('fld_emp_salary_amount',   'sec_emp_salary', 'number',  'Salary Amount',   'Base salary',           NULL, NULL, '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 37, FALSE, NOW(), NOW()),
        ('fld_emp_total_salary',    'sec_emp_salary', 'number',  'Total Salary',    'CTC',                   NULL, NULL, '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 38, FALSE, NOW(), NOW()),
        ('fld_emp_per_hour_salary', 'sec_emp_salary', 'number',  'Per Hour Salary', 'Hourly rate',           NULL, NULL, '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 39, FALSE, NOW(), NOW()),
        ('fld_emp_overtime',        'sec_emp_salary', 'checkbox','Overtime',        NULL, 'Is overtime applicable', 'false', '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 40, FALSE, NOW(), NOW()),
        ('fld_emp_overtime_rate',   'sec_emp_salary', 'number',  'Overtime Rate',   'Rate per overtime hour',NULL, NULL, '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 41, FALSE, NOW(), NOW()),
        ('fld_emp_bonus_amount',    'sec_emp_salary', 'number',  'Bonus Amount',    NULL,                    NULL, NULL, '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 42, FALSE, NOW(), NOW()),
        ('fld_emp_bonus_after',     'sec_emp_salary', 'number',  'Bonus After How Many Years', 'Years',      NULL, NULL, '[]'::jsonb, FALSE, '{"min":0,"max":50}'::jsonb, TRUE, FALSE, 'half', 43, FALSE, NOW(), NOW()),
        ('fld_emp_increment_month', 'sec_emp_salary', 'select',  'Increment Month', NULL, 'Month annual increment is due', NULL, v_month_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 44, FALSE, NOW(), NOW()),

        -- F. Bank Details (2)
        ('fld_emp_bank_account',    'sec_emp_bank', 'text', 'Bank Account No', NULL, NULL, NULL, '[]'::jsonb, FALSE, '{"pattern":"^[0-9]{6,20}$"}'::jsonb,           TRUE, FALSE, 'half', 45, FALSE, NOW(), NOW()),
        ('fld_emp_ifsc',            'sec_emp_bank', 'text', 'IFSC Code',       NULL, NULL, NULL, '[]'::jsonb, FALSE, '{"pattern":"^[A-Z]{4}0[A-Z0-9]{6}$"}'::jsonb,  TRUE, FALSE, 'half', 46, FALSE, NOW(), NOW()),

        -- G. Exit / Resignation Details (5)
        ('fld_emp_resign_date',     'sec_emp_exit', 'date',     'Resignation Letter Date', NULL, NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 47, FALSE, NOW(), NOW()),
        ('fld_emp_relieving_date',  'sec_emp_exit', 'date',     'Relieving Date',          NULL, NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 48, FALSE, NOW(), NOW()),
        ('fld_emp_reason_leaving',  'sec_emp_exit', 'textarea', 'Reason of Leaving',       NULL, NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 49, FALSE, NOW(), NOW()),
        ('fld_emp_notice_served',   'sec_emp_exit', 'checkbox', 'Notice Served',           NULL, 'Notice period served', 'false', '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 50, FALSE, NOW(), NOW()),
        ('fld_emp_new_workplace',   'sec_emp_exit', 'text',     'New Workplace',           'New employer', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 51, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, visible = EXCLUDED.visible,
        readonly = EXCLUDED.readonly, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 8 - FIELDS: CHECK IN (9 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_ci_employee_id', 'sec_ci_main', 'text',     'Employee ID',  'e.g. EMP-0001', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_ci_first_name',  'sec_ci_main', 'text',     'First Name',   'First name',    NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE,  NOW(), NOW()),
        ('fld_ci_last_name',   'sec_ci_main', 'text',     'Last Name',    'Last name',     NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE,  NOW(), NOW()),
        ('fld_ci_department',  'sec_ci_main', 'select',   'Department',   NULL,            NULL, NULL, v_dept_opts::jsonb,  FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 3, TRUE,  NOW(), NOW()),
        ('fld_ci_shift_type',  'sec_ci_main', 'select',   'Shift Type',   NULL,            NULL, NULL, v_shift_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_ci_in_date',     'sec_ci_main', 'date',     'In Date',      NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, TRUE,  NOW(), NOW()),
        ('fld_ci_in_time',     'sec_ci_main', 'time',     'In Time',      NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 6, FALSE, NOW(), NOW()),
        ('fld_ci_location',    'sec_ci_main', 'textarea', 'Location',     'GPS / address', 'Auto-captured from GPS', NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_ci_camera',      'sec_ci_main', 'file',     'Camera',       'Tap to open camera', 'Front camera selfie at check-in', NULL, '[]'::jsonb, FALSE, '{"required":true,"accept":"image/*","capture":"user","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 8, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 9 - FIELDS: CHECK OUT (6 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_co_employee_id', 'sec_co_main', 'text',     'Employee ID',  'e.g. EMP-0001', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_co_shift_type',  'sec_co_main', 'select',   'Shift Type',   NULL,            NULL, NULL, v_shift_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 1, FALSE, NOW(), NOW()),
        ('fld_co_out_date',    'sec_co_main', 'date',     'Out Date',     NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE,  NOW(), NOW()),
        ('fld_co_out_time',    'sec_co_main', 'time',     'Out Time',     NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW()),
        ('fld_co_location',    'sec_co_main', 'textarea', 'Location',     'GPS / address', 'Auto-captured from GPS', NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_co_camera',      'sec_co_main', 'file',     'Camera',       'Tap to open camera', 'Front camera selfie at check-out', NULL, '[]'::jsonb, FALSE, '{"required":true,"accept":"image/*","capture":"user","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 5, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 10 - FIELDS: LEAVE APPLICATION (10 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_leave_employee_id', 'sec_leave_request', 'text',     'Employee ID',   'e.g. EMP-0001', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_leave_first_name',  'sec_leave_request', 'text',     'First Name',    NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, FALSE, NOW(), NOW()),
        ('fld_leave_last_name',   'sec_leave_request', 'text',     'Last Name',     NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, FALSE, NOW(), NOW()),
        ('fld_leave_department',  'sec_leave_request', 'select',   'Department',    NULL,            NULL, NULL, v_dept_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 3, TRUE,  NOW(), NOW()),
        ('fld_leave_reason',      'sec_leave_request', 'textarea', 'Leave Reason',  'Reason for leave', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 4, FALSE, NOW(), NOW()),
        ('fld_leave_start_date',  'sec_leave_request', 'date',     'Leave Start Date', NULL,         NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, TRUE,  NOW(), NOW()),
        ('fld_leave_end_date',    'sec_leave_request', 'date',     'Leave End Date',   NULL,         NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 6, TRUE,  NOW(), NOW()),
        ('fld_leave_total_days',  'sec_leave_request', 'formula',  'Total Leave Days', NULL, 'Auto-calculated: end - start + 1', NULL, '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, TRUE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_leave_mgr_approval','sec_leave_approval','select',   'Reporting Manager Approval', NULL, NULL, 'PENDING',
            '[{"label":"Pending","value":"PENDING"},{"label":"Approved","value":"APPROVED"},{"label":"Rejected","value":"REJECTED"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 8, TRUE,  NOW(), NOW()),
        ('fld_leave_hr_approval', 'sec_leave_approval','select',   'HR Approval',                NULL, NULL, 'PENDING',
            '[{"label":"Pending","value":"PENDING"},{"label":"Approved","value":"APPROVED"},{"label":"Rejected","value":"REJECTED"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 9, TRUE,  NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width, readonly = EXCLUDED.readonly,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 11 - FIELDS: HOLIDAY LIST (5 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_holiday_list_name', 'sec_holiday_main', 'text',     'Holiday List Name',  'e.g. Holidays 2026', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_holiday_total',     'sec_holiday_main', 'number',   'Total No. of Holidays', 'Count', NULL, NULL, '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 1, FALSE, NOW(), NOW()),
        ('fld_holiday_date',      'sec_holiday_main', 'date',     'Date',               NULL,                NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE,  NOW(), NOW()),
        ('fld_holiday_type',      'sec_holiday_main', 'select',   'Holiday Type',       NULL,                NULL, NULL,
            '[{"label":"National","value":"NATIONAL"},{"label":"Religious","value":"RELIGIOUS"},{"label":"Regional","value":"REGIONAL"},{"label":"Company","value":"COMPANY"},{"label":"Optional","value":"OPTIONAL"},{"label":"Restricted","value":"RESTRICTED"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW()),
        ('fld_holiday_desc',      'sec_holiday_main', 'textarea', 'Description',        'Description / notes', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 4, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 12 - FIELDS: STAFFING PLAN (9 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_staff_plan_id',    'sec_staff_main', 'text',    'New Staffing Plan ID', 'e.g. SP-0001',  NULL, NULL, '[]'::jsonb, FALSE, '{"required":true,"unique":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_staff_profile',    'sec_staff_main', 'text',    'Profile Name',         'e.g. Senior Developer', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE, NOW(), NOW()),
        ('fld_staff_company',    'sec_staff_main', 'text',    'Company',              NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, FALSE, NOW(), NOW()),
        ('fld_staff_department', 'sec_staff_main', 'select',  'Department',           NULL,            NULL, NULL, v_dept_opts::jsonb,     FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3, TRUE, NOW(), NOW()),
        ('fld_staff_designation','sec_staff_main', 'text',    'Designation',          'Job title',     NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 4, TRUE, NOW(), NOW()),
        ('fld_staff_emp_type',   'sec_staff_main', 'select',  'Employment Type',      NULL,            NULL, NULL, v_emp_type_opts::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, FALSE, NOW(), NOW()),
        ('fld_staff_vacancies',  'sec_staff_main', 'number',  'No. of Vacancies',     NULL,            NULL, '1',  '[]'::jsonb, FALSE, '{"required":true,"min":0}'::jsonb, TRUE, FALSE, 'half', 6, FALSE, NOW(), NOW()),
        ('fld_staff_cost_per',   'sec_staff_main', 'number',  'Estimated Cost Per Person', 'Annual',   NULL, NULL, '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_staff_total_cost', 'sec_staff_main', 'formula', 'Total Estimated Cost', NULL, 'Vacancies x Cost Per Person', NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, TRUE, 'half', 8, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width, readonly = EXCLUDED.readonly,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 13 - FIELDS: JOB OPENING (11 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_open_plan_id',     'sec_open_main', 'lookup',   'New Staffing Plan ID', NULL,           'Linked staffing plan', NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_open_profile',     'sec_open_main', 'text',     'Profile Name',         NULL,           NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE, NOW(), NOW()),
        ('fld_open_company',     'sec_open_main', 'text',     'Company',              NULL,           NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb,               TRUE, FALSE, 'half', 2, FALSE, NOW(), NOW()),
        ('fld_open_department',  'sec_open_main', 'select',   'Department',           NULL,           NULL, NULL, v_dept_opts::jsonb,     FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3, TRUE, NOW(), NOW()),
        ('fld_open_designation', 'sec_open_main', 'text',     'Designation',          'Job title',    NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 4, TRUE, NOW(), NOW()),
        ('fld_open_emp_type',    'sec_open_main', 'select',   'Employment Type',      NULL,           NULL, NULL, v_emp_type_opts::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, FALSE, NOW(), NOW()),
        ('fld_open_vacancies',   'sec_open_main', 'number',   'No. of Vacancies',     NULL,           NULL, '1',  '[]'::jsonb, FALSE, '{"required":true,"min":0}'::jsonb, TRUE, FALSE, 'half', 6, FALSE, NOW(), NOW()),
        ('fld_open_status',      'sec_open_main', 'select',   'Status',               NULL,           NULL, 'OPEN',
            '[{"label":"Draft","value":"DRAFT"},{"label":"Open","value":"OPEN"},{"label":"On Hold","value":"HOLD"},{"label":"Closed","value":"CLOSED"},{"label":"Filled","value":"FILLED"},{"label":"Cancelled","value":"CANCELLED"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 7, TRUE, NOW(), NOW()),
        ('fld_open_publish',     'sec_open_main', 'checkbox', 'Publish on Website',   NULL,           'Make visible on public career page', 'false', '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 8, FALSE, NOW(), NOW()),
        ('fld_open_salary',      'sec_open_main', 'text',     'Salary Approx',        'e.g. 10-15 LPA', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 9, FALSE, NOW(), NOW()),
        ('fld_open_job_desc',    'sec_open_main', 'textarea', 'Job Description',      'Responsibilities and requirements', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 10, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 14 - FIELDS: JOB APPLICATION (15 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_app_plan_id',      'sec_app_candidate', 'lookup',  'New Staffing Plan ID', NULL,              'Linked staffing plan', NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_app_opening_id',   'sec_app_candidate', 'lookup',  'New Job Opening ID',   NULL,              'Linked opening',       NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE,  NOW(), NOW()),
        ('fld_app_name',         'sec_app_candidate', 'text',    'Applicant Name',       'Full name',       NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE,  NOW(), NOW()),
        ('fld_app_source',       'sec_app_candidate', 'select',  'Applicant Source',     NULL,              NULL, NULL,
            '[{"label":"Website","value":"WEBSITE"},{"label":"LinkedIn","value":"LINKEDIN"},{"label":"Referral","value":"REFERRAL"},{"label":"Job Portal","value":"JOB_PORTAL"},{"label":"Agency","value":"AGENCY"},{"label":"Walk In","value":"WALK_IN"},{"label":"Campus","value":"CAMPUS"},{"label":"Other","value":"OTHER"}]'::jsonb,
            FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 3, TRUE, NOW(), NOW()),
        ('fld_app_email',        'sec_app_candidate', 'email',   'Applicant Email ID',   NULL,              NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 4, TRUE,  NOW(), NOW()),
        ('fld_app_mobile',       'sec_app_candidate', 'tel',     'Applicant Mobile Number', NULL,           NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, TRUE,  NOW(), NOW()),
        ('fld_app_department',   'sec_app_candidate', 'select',  'Department',           NULL,              NULL, NULL, v_dept_opts::jsonb,     FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 6, TRUE, NOW(), NOW()),
        ('fld_app_designation',  'sec_app_candidate', 'text',    'Designation',          NULL,              NULL, NULL, '[]'::jsonb,            FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_app_emp_type',     'sec_app_candidate', 'select',  'Employment Type',      NULL,              NULL, NULL, v_emp_type_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 8, FALSE, NOW(), NOW()),
        ('fld_app_resume',       'sec_app_candidate', 'file',    'Applicant Resume',     'Upload resume',   NULL, NULL, '[]'::jsonb,            FALSE, '{"required":true,"accept":"application/pdf,.doc,.docx","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 9, FALSE, NOW(), NOW()),
        ('fld_app_cover_letter', 'sec_app_candidate', 'textarea','Cover Letter',         NULL,              NULL, NULL, '[]'::jsonb,            FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 10, FALSE, NOW(), NOW()),
        ('fld_app_job_desc',     'sec_app_candidate', 'textarea','Job Description',      NULL,              'Copied from opening', NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, TRUE,  'full', 11, FALSE, NOW(), NOW()),
        ('fld_app_salary_exp',   'sec_app_candidate', 'text',    'Salary Expectation',   'e.g. 12 LPA',     NULL, NULL, '[]'::jsonb,            FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 12, FALSE, NOW(), NOW()),
        ('fld_app_rating',       'sec_app_status',    'rating',  'Applicant Rating',     NULL,              'Internal rating 1-5',  NULL, '[]'::jsonb, FALSE, '{"min":0,"max":5}'::jsonb, TRUE, FALSE, 'half', 13, FALSE, NOW(), NOW()),
        ('fld_app_status',       'sec_app_status',    'select',  'Status',               NULL,              NULL, 'APPLIED',
            '[{"label":"Applied","value":"APPLIED"},{"label":"Screening","value":"SCREENING"},{"label":"Shortlisted","value":"SHORTLISTED"},{"label":"Interview","value":"INTERVIEW"},{"label":"Offer","value":"OFFER"},{"label":"Hired","value":"HIRED"},{"label":"Rejected","value":"REJECTED"},{"label":"On Hold","value":"HOLD"},{"label":"Withdrawn","value":"WITHDRAWN"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 14, TRUE,  NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width, readonly = EXCLUDED.readonly,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 15 - FIELDS: JOB OFFER (10 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_offer_plan_id',    'sec_offer_main', 'lookup',  'New Staffing Plan ID', NULL, 'Linked staffing plan', NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_offer_opening_id', 'sec_offer_main', 'lookup',  'New Job Opening ID',   NULL, 'Linked opening',       NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE, NOW(), NOW()),
        ('fld_offer_name',       'sec_offer_main', 'text',    'Applicant Name',       'Full name',                  NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE, NOW(), NOW()),
        ('fld_offer_mobile',     'sec_offer_main', 'tel',     'Applicant Mobile Number', NULL,                      NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW()),
        ('fld_offer_email',      'sec_offer_main', 'email',   'Applicant Email ID',   NULL,                         NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, TRUE,  NOW(), NOW()),
        ('fld_offer_date',       'sec_offer_main', 'date',    'Offer Date',           NULL,                         NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, TRUE, NOW(), NOW()),
        ('fld_offer_status',     'sec_offer_main', 'select',  'Status',               NULL,                         NULL, 'DRAFT',
            '[{"label":"Draft","value":"DRAFT"},{"label":"Sent","value":"SENT"},{"label":"Accepted","value":"ACCEPTED"},{"label":"Rejected","value":"REJECTED"},{"label":"Expired","value":"EXPIRED"},{"label":"Withdrawn","value":"WITHDRAWN"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 6, TRUE, NOW(), NOW()),
        ('fld_offer_term',       'sec_offer_main', 'text',    'Job Offer Term',       'Offer term summary',         NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_offer_value',      'sec_offer_main', 'textarea','Value / Description',  'Compensation and description',NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 8, FALSE, NOW(), NOW()),
        ('fld_offer_tnc',        'sec_offer_main', 'textarea','Terms & Condition Template', NULL,                   NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 9, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 16 - FIELDS: APPOINTMENT LETTER (8 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_appt_applicant', 'sec_appt_main', 'text',     'Job Applicant Name',          'Full name',               NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_appt_company',   'sec_appt_main', 'text',     'Company',                     'Employer company',        NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, FALSE, NOW(), NOW()),
        ('fld_appt_date',      'sec_appt_main', 'date',     'Appointment Date',            NULL,                      NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE,  NOW(), NOW()),
        ('fld_appt_template',  'sec_appt_main', 'select',   'Appointment Letter Template', NULL,                      NULL, NULL,
            '[{"label":"Standard","value":"STANDARD"},{"label":"Intern","value":"INTERN"},{"label":"Contract","value":"CONTRACT"},{"label":"Consultant","value":"CONSULTANT"}]'::jsonb,
            FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW()),
        ('fld_appt_intro',     'sec_appt_main', 'textarea', 'Introduction',                'Opening paragraph',       NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 4, FALSE, NOW(), NOW()),
        ('fld_appt_title',     'sec_appt_main', 'text',     'Title',                       'Letter title',            NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 5, FALSE, NOW(), NOW()),
        ('fld_appt_desc',      'sec_appt_main', 'textarea', 'Description',                 'Body of appointment letter',NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 6, FALSE, NOW(), NOW()),
        ('fld_appt_closing',   'sec_appt_main', 'textarea', 'Closing Notes',               'Closing paragraph',       NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 7, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 17 - FIELDS: EMPLOYEE REFERRAL (10 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_ref_applicant',   'sec_ref_main', 'text',     'Applicant Name',       'Full name',           NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_ref_email',       'sec_ref_main', 'email',    'Applicant Email ID',   NULL,                  NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE,  NOW(), NOW()),
        ('fld_ref_mobile',      'sec_ref_main', 'tel',      'Applicant Mobile No.', NULL,                  NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE,  NOW(), NOW()),
        ('fld_ref_date',        'sec_ref_main', 'date',     'Referral Date',        NULL,                  NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3, TRUE,  NOW(), NOW()),
        ('fld_ref_resume',      'sec_ref_main', 'file',     'Resume',               'Upload resume',       NULL, NULL, '[]'::jsonb, FALSE, '{"accept":"application/pdf,.doc,.docx","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_ref_designation', 'sec_ref_main', 'text',     'Designation',          'Applied position',    NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 5, FALSE, NOW(), NOW()),
        ('fld_ref_employee_id', 'sec_ref_main', 'text',     'Employee ID',          'Referring employee',  NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 6, TRUE,  NOW(), NOW()),
        ('fld_ref_first_name',  'sec_ref_main', 'text',     'First Name',           'Referrer first name', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_ref_department',  'sec_ref_main', 'select',   'Department',           'Referrer department', NULL, NULL, v_dept_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 8, FALSE, NOW(), NOW()),
        ('fld_ref_remark',      'sec_ref_main', 'textarea', 'Remark',               'Referrer remark',     NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 9, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 18 - FIELDS: KRA MASTER (4 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_kra_department',  'sec_kra_main', 'select', 'Department',  NULL,         NULL, NULL, v_dept_opts::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_kra_designation', 'sec_kra_main', 'text',   'Designation', 'Job title',  NULL, NULL, '[]'::jsonb,        FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE,  NOW(), NOW()),
        ('fld_kra_goal_name',   'sec_kra_main', 'text',   'Goal Name',   'KRA goal',   NULL, NULL, '[]'::jsonb,        FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE,  NOW(), NOW()),
        ('fld_kra_weightage',   'sec_kra_main', 'number', 'Weightage',   'Weight %',   NULL, NULL, '[]'::jsonb,        FALSE, '{"required":true,"min":0,"max":100}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 19 - FIELDS: PERFORMANCE APPRAISAL (7 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_apr_employee_name','sec_apr_main', 'text',    'Employee Name',  'Full name',    NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_apr_department',   'sec_apr_main', 'select',  'Department',     NULL,           NULL, NULL, v_dept_opts::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, TRUE,  NOW(), NOW()),
        ('fld_apr_designation',  'sec_apr_main', 'text',    'Designation',    NULL,           NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE,  NOW(), NOW()),
        ('fld_apr_goal_name',    'sec_apr_main', 'text',    'Goal Name',      'KRA goal',     NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3, TRUE,  NOW(), NOW()),
        ('fld_apr_weightage',    'sec_apr_main', 'number',  'Weightage',      'Weight %',     NULL, NULL, '[]'::jsonb, FALSE, '{"required":true,"min":0,"max":100}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_apr_score',        'sec_apr_main', 'number',  'Score',          '0-10',         NULL, NULL, '[]'::jsonb, FALSE, '{"required":true,"min":0,"max":10}'::jsonb, TRUE, FALSE, 'half', 5, FALSE, NOW(), NOW()),
        ('fld_apr_score_earned', 'sec_apr_main', 'formula', 'Score Earned',   NULL, 'Weightage x Score / 10', NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, TRUE, 'half', 6, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width, readonly = EXCLUDED.readonly,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 20 - FIELDS: SELF TARGET (8 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_tgt_employee_id', 'sec_tgt_main', 'text',     'Employee ID',   'e.g. EMP-0001', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_tgt_first_name',  'sec_tgt_main', 'text',     'First Name',    NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, FALSE, NOW(), NOW()),
        ('fld_tgt_last_name',   'sec_tgt_main', 'text',     'Last Name',     NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, FALSE, NOW(), NOW()),
        ('fld_tgt_department',  'sec_tgt_main', 'select',   'Department',    NULL,            NULL, NULL, v_dept_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 3, TRUE,  NOW(), NOW()),
        ('fld_tgt_team_name',   'sec_tgt_main', 'text',     'Employee Engagement Team Name', 'Team name', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_tgt_target_month','sec_tgt_main', 'select',   'Target Month',  NULL,            NULL, NULL, v_month_opts::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, TRUE,  NOW(), NOW()),
        ('fld_tgt_target',      'sec_tgt_main', 'textarea', 'Target',        'Target details',NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 6, FALSE, NOW(), NOW()),
        ('fld_tgt_points',      'sec_tgt_main', 'number',   'Employee Engagement Points', NULL, NULL, '0', '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 21 - FIELDS: SELF INITIATIVE (9 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_init_employee_id','sec_init_main', 'text',     'Employee ID',  'e.g. EMP-0001', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_init_first_name', 'sec_init_main', 'text',     'First Name',   NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, FALSE, NOW(), NOW()),
        ('fld_init_last_name',  'sec_init_main', 'text',     'Last Name',    NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, FALSE, NOW(), NOW()),
        ('fld_init_department', 'sec_init_main', 'select',   'Department',   NULL,            NULL, NULL, v_dept_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 3, TRUE,  NOW(), NOW()),
        ('fld_init_team_name',  'sec_init_main', 'text',     'Employee Engagement Team Name', NULL, NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_init_category',   'sec_init_main', 'select',   'Self Initiative Category', NULL, NULL, NULL,
            '[{"label":"Cost Saving","value":"COST_SAVING"},{"label":"Productivity","value":"PRODUCTIVITY"},{"label":"Quality","value":"QUALITY"},{"label":"Safety","value":"SAFETY"},{"label":"Customer","value":"CUSTOMER"},{"label":"Team","value":"TEAM"},{"label":"Innovation","value":"INNOVATION"},{"label":"Other","value":"OTHER"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, TRUE, NOW(), NOW()),
        ('fld_init_define',     'sec_init_main', 'textarea', 'Define Initiative', 'Describe initiative', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 6, FALSE, NOW(), NOW()),
        ('fld_init_benefits',   'sec_init_main', 'textarea', 'Initiative Benefits', 'Expected benefits', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 7, FALSE, NOW(), NOW()),
        ('fld_init_points',     'sec_init_main', 'number',   'Employee Engagement Points', NULL, NULL, '0', '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 8, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 22 - FIELDS: PROBLEM REGISTRATION (12 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_prob_employee_id', 'sec_prob_problem',  'text',     'Employee ID',  'e.g. EMP-0001', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_prob_first_name',  'sec_prob_problem',  'text',     'First Name',   NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, FALSE, NOW(), NOW()),
        ('fld_prob_last_name',   'sec_prob_problem',  'text',     'Last Name',    NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, FALSE, NOW(), NOW()),
        ('fld_prob_department',  'sec_prob_problem',  'select',   'Department',   NULL,            NULL, NULL, v_dept_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 3, TRUE,  NOW(), NOW()),
        ('fld_prob_team_name',   'sec_prob_problem',  'text',     'Employee Engagement Team Name', NULL, NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_prob_problem',     'sec_prob_problem',  'textarea', 'Problem',      'Describe the problem', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 5, FALSE, NOW(), NOW()),
        ('fld_prob_problem_med', 'sec_prob_problem',  'file',     'Problem Media','Photo/video of problem', NULL, NULL, '[]'::jsonb, FALSE, '{"accept":"image/*,video/*","maxSize":10485760}'::jsonb, TRUE, FALSE, 'half', 6, FALSE, NOW(), NOW()),
        ('fld_prob_impact',      'sec_prob_problem',  'textarea', 'Impact',       'Business impact', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 7, FALSE, NOW(), NOW()),
        ('fld_prob_solution',    'sec_prob_solution', 'textarea', 'Solution',     'Solution implemented', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 8, FALSE, NOW(), NOW()),
        ('fld_prob_solution_med','sec_prob_solution', 'file',     'Solution Media','Photo/video of solution', NULL, NULL, '[]'::jsonb, FALSE, '{"accept":"image/*,video/*","maxSize":10485760}'::jsonb, TRUE, FALSE, 'half', 9, FALSE, NOW(), NOW()),
        ('fld_prob_selfie',      'sec_prob_solution', 'file',     'Selfie',       'Selfie with solution', NULL, NULL, '[]'::jsonb, FALSE, '{"accept":"image/*","capture":"user","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 10, FALSE, NOW(), NOW()),
        ('fld_prob_points',      'sec_prob_solution', 'number',   'Employee Engagement Points', NULL, NULL, '0', '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 11, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 23 - FIELDS: KAIZEN (19 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_kz_employee_id','sec_kz_info',     'text',     'Employee ID',  'e.g. EMP-0001', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_kz_first_name', 'sec_kz_info',     'text',     'First Name',   NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1, FALSE, NOW(), NOW()),
        ('fld_kz_middle_name','sec_kz_info',     'text',     'Middle Name',  NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 2, FALSE, NOW(), NOW()),
        ('fld_kz_last_name',  'sec_kz_info',     'text',     'Last Name',    NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW()),
        ('fld_kz_department', 'sec_kz_info',     'select',   'Department',   NULL,            NULL, NULL, v_dept_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, TRUE,  NOW(), NOW()),
        ('fld_kz_team_name',  'sec_kz_info',     'text',     'Employee Engagement Team Name', NULL, NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 5, FALSE, NOW(), NOW()),
        ('fld_kz_area',       'sec_kz_info',     'select',   'Kaizen Area',  NULL,            NULL, NULL,
            '[{"label":"Safety","value":"SAFETY"},{"label":"Quality","value":"QUALITY"},{"label":"Cost","value":"COST"},{"label":"Delivery","value":"DELIVERY"},{"label":"Productivity","value":"PRODUCTIVITY"},{"label":"Morale","value":"MORALE"},{"label":"Environment","value":"ENVIRONMENT"},{"label":"Other","value":"OTHER"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 6, TRUE, NOW(), NOW()),
        ('fld_kz_start_date', 'sec_kz_info',     'date',     'Start Date',   NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_kz_theme',      'sec_kz_info',     'text',     'Theme',        'Kaizen theme',  NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 8, FALSE, NOW(), NOW()),

        ('fld_kz_problem',    'sec_kz_analysis', 'textarea', 'Problem',      'Problem statement', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 9,  FALSE, NOW(), NOW()),
        ('fld_kz_before',     'sec_kz_analysis', 'file',     'Before Media', 'Photo/video before', NULL, NULL, '[]'::jsonb, FALSE, '{"accept":"image/*,video/*","maxSize":10485760}'::jsonb, TRUE, FALSE, 'half', 10, FALSE, NOW(), NOW()),
        ('fld_kz_after',      'sec_kz_analysis', 'file',     'After Media',  'Photo/video after',  NULL, NULL, '[]'::jsonb, FALSE, '{"accept":"image/*,video/*","maxSize":10485760}'::jsonb, TRUE, FALSE, 'half', 11, FALSE, NOW(), NOW()),
        ('fld_kz_why',        'sec_kz_analysis', 'textarea', 'Why Analysis', '5-why / root cause', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 12, FALSE, NOW(), NOW()),

        ('fld_kz_result',     'sec_kz_result',   'textarea', 'Result',       'Measured result',    NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 13, FALSE, NOW(), NOW()),
        ('fld_kz_benefits',   'sec_kz_result',   'textarea', 'Benefits',     'Benefits delivered', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 14, FALSE, NOW(), NOW()),
        ('fld_kz_contributor','sec_kz_result',   'text',     'Employee Contributor', 'Other contributors', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 15, FALSE, NOW(), NOW()),
        ('fld_kz_signature',  'sec_kz_result',   'signature','Signature',    NULL,                'Signature', NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 16, FALSE, NOW(), NOW()),
        ('fld_kz_selfie',     'sec_kz_result',   'file',     'Selfie',       NULL, 'Selfie of contributor',   NULL, '[]'::jsonb, FALSE, '{"accept":"image/*","capture":"user","maxSize":5242880}'::jsonb, TRUE, FALSE, 'half', 17, FALSE, NOW(), NOW()),
        ('fld_kz_points',     'sec_kz_result',   'number',   'Employee Engagement Points', NULL, NULL, '0', '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 18, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 24 - FIELDS: EMPLOYEE SUGGESTION (11 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_sug_employee_id','sec_sug_main', 'text',     'Employee ID', 'e.g. EMP-0001', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0,  TRUE,  NOW(), NOW()),
        ('fld_sug_first_name', 'sec_sug_main', 'text',     'First Name',  NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 1,  FALSE, NOW(), NOW()),
        ('fld_sug_middle_name','sec_sug_main', 'text',     'Middle Name', NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 2,  FALSE, NOW(), NOW()),
        ('fld_sug_last_name',  'sec_sug_main', 'text',     'Last Name',   NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3,  FALSE, NOW(), NOW()),
        ('fld_sug_department', 'sec_sug_main', 'select',   'Department',  NULL,            NULL, NULL, v_dept_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4,  TRUE,  NOW(), NOW()),
        ('fld_sug_team_name',  'sec_sug_main', 'text',     'Employee Engagement Team Name', NULL, NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 5,  FALSE, NOW(), NOW()),
        ('fld_sug_suggestion', 'sec_sug_main', 'textarea', 'Suggestion',  'Your suggestion',NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'full', 6,  FALSE, NOW(), NOW()),
        ('fld_sug_benefits',   'sec_sug_main', 'textarea', 'Benefits',    'Expected benefits', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 7,  FALSE, NOW(), NOW()),
        ('fld_sug_given_by',   'sec_sug_main', 'text',     'Suggestion Given By', 'Full name',  NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 8,  FALSE, NOW(), NOW()),
        ('fld_sug_media',      'sec_sug_main', 'file',     'Media',       'Supporting media', NULL, NULL, '[]'::jsonb, FALSE, '{"accept":"image/*,video/*,application/pdf","maxSize":10485760}'::jsonb, TRUE, FALSE, 'half', 9, FALSE, NOW(), NOW()),
        ('fld_sug_points',     'sec_sug_main', 'number',   'Employee Engagement Points', NULL, NULL, '0', '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 10, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 25 - FIELDS: ASSET MANAGEMENT (11 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_asset_id',          'sec_asset_main', 'text',     'Asset ID',        'e.g. AST-0001', NULL, NULL, '[]'::jsonb, FALSE, '{"required":true,"unique":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_asset_employee_id', 'sec_asset_main', 'text',     'Employee ID',     'Assigned to',   NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 1, TRUE,  NOW(), NOW()),
        ('fld_asset_first_name',  'sec_asset_main', 'text',     'First Name',      NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 2, FALSE, NOW(), NOW()),
        ('fld_asset_last_name',   'sec_asset_main', 'text',     'Last Name',       NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW()),
        ('fld_asset_department',  'sec_asset_main', 'select',   'Department',      NULL,            NULL, NULL, v_dept_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, TRUE, NOW(), NOW()),
        ('fld_asset_type',        'sec_asset_main', 'select',   'Asset Type',      NULL,            NULL, NULL,
            '[{"label":"Laptop","value":"LAPTOP"},{"label":"Desktop","value":"DESKTOP"},{"label":"Mobile Phone","value":"MOBILE"},{"label":"Tablet","value":"TABLET"},{"label":"Monitor","value":"MONITOR"},{"label":"Headphone","value":"HEADPHONE"},{"label":"Keyboard","value":"KEYBOARD"},{"label":"Mouse","value":"MOUSE"},{"label":"Printer","value":"PRINTER"},{"label":"Camera","value":"CAMERA"},{"label":"Vehicle","value":"VEHICLE"},{"label":"Furniture","value":"FURNITURE"},{"label":"ID Card","value":"ID_CARD"},{"label":"Other","value":"OTHER"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 5, TRUE, NOW(), NOW()),
        ('fld_asset_serial',      'sec_asset_main', 'text',     'Asset Serial No.',NULL,            NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 6, TRUE,  NOW(), NOW()),
        ('fld_asset_model',       'sec_asset_main', 'text',     'Asset Model',     'Make/model',    NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 7, FALSE, NOW(), NOW()),
        ('fld_asset_config',      'sec_asset_main', 'textarea', 'Configuration',   'Specifications',NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 8, FALSE, NOW(), NOW()),
        ('fld_asset_status',      'sec_asset_main', 'select',   'Asset Status',    NULL,            NULL, 'ASSIGNED',
            '[{"label":"In Stock","value":"IN_STOCK"},{"label":"Assigned","value":"ASSIGNED"},{"label":"In Repair","value":"REPAIR"},{"label":"Lost","value":"LOST"},{"label":"Damaged","value":"DAMAGED"},{"label":"Retired","value":"RETIRED"},{"label":"Returned","value":"RETURNED"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 9, TRUE, NOW(), NOW()),
        ('fld_asset_remarks',     'sec_asset_main', 'textarea', 'Remarks',         'Notes',         NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 10, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 26 - FIELDS: SIM MANAGEMENT (15 fields)
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_sim_mobile',       'sec_sim_details', 'tel',     'Mobile No.',      NULL,     NULL, NULL, '[]'::jsonb, FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 0, TRUE,  NOW(), NOW()),
        ('fld_sim_imsi',         'sec_sim_details', 'text',    'IMSI Number',     'IMSI',   NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 1, TRUE,  NOW(), NOW()),
        ('fld_sim_provider',     'sec_sim_details', 'select',  'Service Provider',NULL,     NULL, NULL,
            '[{"label":"Airtel","value":"AIRTEL"},{"label":"Jio","value":"JIO"},{"label":"Vi","value":"VI"},{"label":"BSNL","value":"BSNL"},{"label":"MTNL","value":"MTNL"},{"label":"Other","value":"OTHER"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 2, TRUE, NOW(), NOW()),
        ('fld_sim_type',         'sec_sim_details', 'select',  'SIM Type',        NULL,     NULL, NULL,
            '[{"label":"Prepaid","value":"PREPAID"},{"label":"Postpaid","value":"POSTPAID"},{"label":"Data Only","value":"DATA"},{"label":"eSIM","value":"ESIM"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 3, FALSE, NOW(), NOW()),
        ('fld_sim_plan',         'sec_sim_details', 'text',    'Plan Type',       'Plan name', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 4, FALSE, NOW(), NOW()),
        ('fld_sim_issue_by',     'sec_sim_details', 'text',    'SIM Issue By',    'Issuing authority', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 5, FALSE, NOW(), NOW()),
        ('fld_sim_location',     'sec_sim_details', 'text',    'SIM Location',    'Branch/site', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 6, FALSE, NOW(), NOW()),
        ('fld_sim_status',       'sec_sim_details', 'select',  'SIM Status',      NULL,     NULL, 'ACTIVE',
            '[{"label":"Active","value":"ACTIVE"},{"label":"Inactive","value":"INACTIVE"},{"label":"Suspended","value":"SUSPENDED"},{"label":"Lost","value":"LOST"},{"label":"Blocked","value":"BLOCKED"},{"label":"Returned","value":"RETURNED"}]'::jsonb,
            FALSE, '{"required":true}'::jsonb, TRUE, FALSE, 'half', 7, TRUE, NOW(), NOW()),

        ('fld_sim_employee_id',  'sec_sim_user',    'text',    'Employee ID',     'Assigned to', NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 8, TRUE,  NOW(), NOW()),
        ('fld_sim_first_name',   'sec_sim_user',    'text',    'First Name',      NULL,          NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 9, FALSE, NOW(), NOW()),
        ('fld_sim_last_name',    'sec_sim_user',    'text',    'Last Name',       NULL,          NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 10,FALSE, NOW(), NOW()),
        ('fld_sim_department',   'sec_sim_user',    'select',  'Department',      NULL,          NULL, NULL, v_dept_opts::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 11, TRUE, NOW(), NOW()),
        ('fld_sim_recharge_date','sec_sim_user',    'date',    'Recharge Date',   NULL,          NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 12, FALSE, NOW(), NOW()),
        ('fld_sim_recharge_amt', 'sec_sim_user',    'number',  'Recharge Amount', NULL,          NULL, NULL, '[]'::jsonb, FALSE, '{"min":0}'::jsonb, TRUE, FALSE, 'half', 13, FALSE, NOW(), NOW()),
        ('fld_sim_remarks',      'sec_sim_user',    'textarea','Remarks',         'Notes',       NULL, NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'full', 14, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- =========================================================================
    -- STEP 27 - FORMULA FIELDS (computed columns)
    -- =========================================================================
    INSERT INTO formula_fields (
        id, "formFieldId", expression, "returnType",
        "autoRefresh", "showTooltip", "blankPreference", dependencies,
        created_at, updated_at
    ) VALUES
        -- Staffing Plan: Total Estimated Cost = Vacancies * Cost Per Person
        ('ff_staff_total_cost', 'fld_staff_total_cost',
         '{fld_staff_vacancies} * {fld_staff_cost_per}',
         'Number', TRUE, TRUE, 'Zero',
         '["fld_staff_vacancies","fld_staff_cost_per"]'::jsonb,
         NOW(), NOW()),

        -- Leave Application: Total Leave Days = end - start + 1
        ('ff_leave_total_days', 'fld_leave_total_days',
         'DATEDIFF({fld_leave_end_date},{fld_leave_start_date}) + 1',
         'Number', TRUE, TRUE, 'Zero',
         '["fld_leave_start_date","fld_leave_end_date"]'::jsonb,
         NOW(), NOW()),

        -- Performance Appraisal: Score Earned = Weightage * Score / 10
        ('ff_apr_score_earned', 'fld_apr_score_earned',
         '({fld_apr_weightage} * {fld_apr_score}) / 10',
         'Number', TRUE, TRUE, 'Zero',
         '["fld_apr_weightage","fld_apr_score"]'::jsonb,
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
    -- STEP 28 - LEAVE TYPES & RULES (global)
    -- =========================================================================
    INSERT INTO leave_types (id, name, code, category, description, color, icon, is_active, sort_order, created_at, updated_at) VALUES
        ('lt_full_day_leave', 'Full Day Leave', 'FULL_DAY_LEAVE', 'FULL_DAY',    'Standard full day leave',         '#ef4444', 'Calendar', TRUE, 1, NOW(), NOW()),
        ('lt_half_day_leave', 'Half Day Leave', 'HALF_DAY_LEAVE', 'HALF_DAY',    'Half day leave (4 hours)',        '#f59e0b', 'Clock',    TRUE, 2, NOW(), NOW()),
        ('lt_short_leave',    'Short Leave',    'SHORT_LEAVE',    'SHORT_LEAVE', 'Short leave (1-2 hours)',         '#3b82f6', 'Clock',    TRUE, 3, NOW(), NOW()),
        ('lt_hourly_leave',   'Hourly Leave',   'HOURLY_LEAVE',   'HOURLY',      'Hourly leave for short absences', '#10b981', 'Hourglass',TRUE, 4, NOW(), NOW())
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
        ('lr_sick_leave',     'lt_full_day_leave', 'Sick Leave',    'Paid sick leave with medical certificate',  0,   NULL, TRUE, 10,  1, TRUE, TRUE,  TRUE,  10,   1.0, TRUE, NOW(), NOW()),
        ('lr_casual_leave',   'lt_full_day_leave', 'Casual Leave',  'Paid casual leave up to 12 days / year',    0,   NULL, TRUE, 5,   2, TRUE, TRUE,  FALSE, NULL, 1.0, TRUE, NOW(), NOW()),
        ('lr_earned_leave',   'lt_full_day_leave', 'Earned Leave',  'Accrued earned leave (privileged leave)',   0,   NULL, TRUE, 15,  7, TRUE, TRUE,  TRUE,  30,   1.75,TRUE, NOW(), NOW()),
        ('lr_unpaid_leave',   'lt_full_day_leave', 'Unpaid Leave',  'Leave without pay',                         100, NULL, TRUE, 30,  3, TRUE, FALSE, FALSE, NULL, NULL,TRUE, NOW(), NOW()),
        ('lr_maternity',      'lt_full_day_leave', 'Maternity',     'Maternity leave per statutory requirement', 0,   NULL, TRUE, 182, 30,TRUE, TRUE,  FALSE, NULL, NULL,TRUE, NOW(), NOW()),
        ('lr_paternity',      'lt_full_day_leave', 'Paternity',     'Paternity leave',                           0,   NULL, TRUE, 15,  7, TRUE, TRUE,  FALSE, NULL, NULL,TRUE, NOW(), NOW()),
        ('lr_half_day',       'lt_half_day_leave', 'Half Day',      'Half day leave with 50 percent deduction',  50,  4,    TRUE, 1,   1, TRUE, FALSE, FALSE, NULL, NULL,TRUE, NOW(), NOW()),
        ('lr_short_leave',    'lt_short_leave',    'Short Leave',   'Short leave 1-2 hours, hourly deduction',   100, 2,    FALSE,1,   0, FALSE,FALSE, FALSE, NULL, NULL,TRUE, NOW(), NOW())
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
    -- STEP 29 - LOOKUP SOURCES + RELATIONS
    --   Employee Master -> referenced by many forms
    --   Staffing Plan   -> referenced by Job Opening, Job App, Job Offer
    --   Job Opening     -> referenced by Job App, Job Offer
    -- =========================================================================
    INSERT INTO lookup_sources (id, name, type, description, source_module_id, source_form_id, active, created_at, updated_at) VALUES
        ('lks_hr_employees', 'HR Employees',   'form', 'All records from Employee Master',  'mod_hrcore_emp',   'form_hr_employee_master', TRUE, NOW(), NOW()),
        ('lks_staffing_plans','HR Staffing Plans','form','All records from Staffing Plan',  'mod_hrrec_staff',  'form_hr_staffing_plan',   TRUE, NOW(), NOW()),
        ('lks_job_openings', 'HR Job Openings','form', 'All records from Job Opening',      'mod_hrrec_opening','form_hr_job_opening',     TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
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
        -- Staffing Plan lookups on Job Opening / Application / Offer
        ('lkr_open_plan',       'lks_staffing_plans', 'fld_open_plan_id',      'form_hr_job_opening',     'mod_hrrec_opening', 'fld_staff_profile',    'fld_staff_plan_id',    FALSE, TRUE, '{}'::jsonb, NOW(), NOW()),
        ('lkr_app_plan',        'lks_staffing_plans', 'fld_app_plan_id',       'form_hr_job_application', 'mod_hrrec_app',     'fld_staff_profile',    'fld_staff_plan_id',    FALSE, TRUE, '{}'::jsonb, NOW(), NOW()),
        ('lkr_offer_plan',      'lks_staffing_plans', 'fld_offer_plan_id',     'form_hr_job_offer',       'mod_hrrec_offer',   'fld_staff_profile',    'fld_staff_plan_id',    FALSE, TRUE, '{}'::jsonb, NOW(), NOW()),
        -- Job Opening lookups on Application / Offer
        ('lkr_app_opening',     'lks_job_openings',   'fld_app_opening_id',    'form_hr_job_application', 'mod_hrrec_app',     'fld_open_profile',     'fld_open_plan_id',     FALSE, TRUE, '{}'::jsonb, NOW(), NOW()),
        ('lkr_offer_opening',   'lks_job_openings',   'fld_offer_opening_id',  'form_hr_job_offer',       'mod_hrrec_offer',   'fld_open_profile',     'fld_open_plan_id',     FALSE, TRUE, '{}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        lookup_source_id = EXCLUDED.lookup_source_id,
        form_field_id = EXCLUDED.form_field_id,
        form_id = EXCLUDED.form_id, module_id = EXCLUDED.module_id,
        display_field = EXCLUDED.display_field,
        value_field = EXCLUDED.value_field,
        multiple = EXCLUDED.multiple, searchable = EXCLUDED.searchable,
        filters = EXCLUDED.filters, updated_at = NOW();

    -- =========================================================================
    -- STEP 30 - UNIQUE ID COUNTERS (auto-number generators)
    -- =========================================================================
    INSERT INTO unique_id_counters (id, "fieldId", "lastNumber", "createdAt", "updatedAt") VALUES
        ('uc_emp',     'fld_emp_employee_id',  0, NOW(), NOW()),
        ('uc_staff',   'fld_staff_plan_id',    0, NOW(), NOW()),
        ('uc_asset',   'fld_asset_id',         0, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    -- =========================================================================
    -- STEP 31 - FORM -> STORAGE TABLE MAPPINGS
    --   Only form_records_1..15 are valid storage targets (sharded tables
    --   the submit route writes to). 20 forms share across 15 tables.
    -- =========================================================================
    DELETE FROM form_table_mappings WHERE id LIKE 'ftm_hr_%';

    INSERT INTO form_table_mappings (id, form_id, storage_table, created_at, updated_at) VALUES
        ('ftm_hr_employee_master',       'form_hr_employee_master',       'form_records_1',  NOW(), NOW()),
        ('ftm_hr_checkin',               'form_hr_checkin',               'form_records_2',  NOW(), NOW()),
        ('ftm_hr_checkout',              'form_hr_checkout',              'form_records_3',  NOW(), NOW()),
        ('ftm_hr_leave_application',     'form_hr_leave_application',     'form_records_4',  NOW(), NOW()),
        ('ftm_hr_holiday_list',          'form_hr_holiday_list',          'form_records_5',  NOW(), NOW()),
        ('ftm_hr_staffing_plan',         'form_hr_staffing_plan',         'form_records_6',  NOW(), NOW()),
        ('ftm_hr_job_opening',           'form_hr_job_opening',           'form_records_7',  NOW(), NOW()),
        ('ftm_hr_job_application',       'form_hr_job_application',       'form_records_8',  NOW(), NOW()),
        ('ftm_hr_job_offer',             'form_hr_job_offer',             'form_records_9',  NOW(), NOW()),
        ('ftm_hr_appointment_letter',    'form_hr_appointment_letter',    'form_records_10', NOW(), NOW()),
        ('ftm_hr_employee_referral',     'form_hr_employee_referral',     'form_records_11', NOW(), NOW()),
        ('ftm_hr_kra_master',            'form_hr_kra_master',            'form_records_12', NOW(), NOW()),
        ('ftm_hr_performance_appraisal', 'form_hr_performance_appraisal', 'form_records_13', NOW(), NOW()),
        ('ftm_hr_self_target',           'form_hr_self_target',           'form_records_14', NOW(), NOW()),
        ('ftm_hr_self_initiative',       'form_hr_self_initiative',       'form_records_15', NOW(), NOW()),
        -- Remaining 5 forms share tables with earlier forms (records differentiated by form_id)
        ('ftm_hr_problem_registration',  'form_hr_problem_registration',  'form_records_1',  NOW(), NOW()),
        ('ftm_hr_kaizen',                'form_hr_kaizen',                'form_records_2',  NOW(), NOW()),
        ('ftm_hr_employee_suggestion',   'form_hr_employee_suggestion',   'form_records_3',  NOW(), NOW()),
        ('ftm_hr_asset_management',      'form_hr_asset_management',      'form_records_4',  NOW(), NOW()),
        ('ftm_hr_sim_management',        'form_hr_sim_management',        'form_records_5',  NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        form_id = EXCLUDED.form_id,
        storage_table = EXCLUDED.storage_table,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 32 - ROUTE PERMISSIONS for /hr/* (org-scoped)
    -- =========================================================================
    INSERT INTO route_permissions (id, pattern, description, organization_id, created_at, updated_at) VALUES
        ('rp_hr_root',        '/hr',                                      'HR module home',            v_org_id, NOW(), NOW()),
        ('rp_hrcore',         '/hr/core',                                 'HR Core',                   v_org_id, NOW(), NOW()),
        ('rp_hrcore_emp',     '/hr/core/employee-master',                 'Employee Master',           v_org_id, NOW(), NOW()),
        ('rp_hrcore_att',     '/hr/core/attendance',                      'Attendance',                v_org_id, NOW(), NOW()),
        ('rp_hrcore_leave',   '/hr/core/leave-management',                'Leave Management',          v_org_id, NOW(), NOW()),
        ('rp_hrcore_holiday', '/hr/core/holiday-list',                    'Holiday List',              v_org_id, NOW(), NOW()),
        ('rp_hrrec',          '/hr/recruitment',                          'Recruitment',               v_org_id, NOW(), NOW()),
        ('rp_hrrec_staff',    '/hr/recruitment/staffing-plan',            'Staffing Plan',             v_org_id, NOW(), NOW()),
        ('rp_hrrec_opening',  '/hr/recruitment/job-opening',              'Job Opening',               v_org_id, NOW(), NOW()),
        ('rp_hrrec_app',      '/hr/recruitment/job-application',          'Job Application',           v_org_id, NOW(), NOW()),
        ('rp_hrrec_offer',    '/hr/recruitment/job-offer',                'Job Offer',                 v_org_id, NOW(), NOW()),
        ('rp_hrrec_appt',     '/hr/recruitment/appointment-letter',       'Appointment Letter',        v_org_id, NOW(), NOW()),
        ('rp_hrrec_ref',      '/hr/recruitment/employee-referral',        'Employee Referral',         v_org_id, NOW(), NOW()),
        ('rp_hrperf',         '/hr/performance',                          'Performance',               v_org_id, NOW(), NOW()),
        ('rp_hrperf_kra',     '/hr/performance/kra',                      'KRA Master',                v_org_id, NOW(), NOW()),
        ('rp_hrperf_apr',     '/hr/performance/appraisal',                'Performance Appraisal',     v_org_id, NOW(), NOW()),
        ('rp_hreng',          '/hr/engagement',                           'Employee Engagement',       v_org_id, NOW(), NOW()),
        ('rp_hreng_tgt',      '/hr/engagement/self-target',               'Self Target',               v_org_id, NOW(), NOW()),
        ('rp_hreng_init',     '/hr/engagement/self-initiative',           'Self Initiative',           v_org_id, NOW(), NOW()),
        ('rp_hreng_prob',     '/hr/engagement/problem-registration',      'Problem Registration',      v_org_id, NOW(), NOW()),
        ('rp_hreng_kz',       '/hr/engagement/kaizen',                    'Kaizen',                    v_org_id, NOW(), NOW()),
        ('rp_hreng_sug',      '/hr/engagement/employee-suggestion',       'Employee Suggestion',       v_org_id, NOW(), NOW()),
        ('rp_hradm',          '/hr/admin',                                'Asset & Admin',             v_org_id, NOW(), NOW()),
        ('rp_hradm_asset',    '/hr/admin/asset-management',               'Asset Management',          v_org_id, NOW(), NOW()),
        ('rp_hradm_sim',      '/hr/admin/sim-management',                 'SIM Management',            v_org_id, NOW(), NOW())
    ON CONFLICT (pattern, organization_id) DO UPDATE SET
        description = EXCLUDED.description, updated_at = NOW();

    -- =========================================================================
    -- STEP 33 - PERMISSIONS catalog
    -- =========================================================================
    INSERT INTO permissions (id, name, description, category, resource, organization_id, is_active, created_at, updated_at) VALUES
        ('perm_hr_admin',  'HR Admin',  'Full HR administration (system admin)', 'ADMIN',  '*',  v_org_id, TRUE, NOW(), NOW()),
        ('perm_hr_view',   'HR View',   'View HR data',                          'READ',   'hr', v_org_id, TRUE, NOW(), NOW()),
        ('perm_hr_create', 'HR Create', 'Create HR records',                     'WRITE',  'hr', v_org_id, TRUE, NOW(), NOW()),
        ('perm_hr_edit',   'HR Edit',   'Edit HR records',                       'WRITE',  'hr', v_org_id, TRUE, NOW(), NOW()),
        ('perm_hr_delete', 'HR Delete', 'Delete HR records',                     'DELETE', 'hr', v_org_id, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        category = EXCLUDED.category, resource = EXCLUDED.resource,
        organization_id = EXCLUDED.organization_id, is_active = EXCLUDED.is_active,
        updated_at = NOW();

    -- =========================================================================
    -- STEP 34 - ADMIN ROLE + ASSIGNMENT (system-wide admin)
    -- =========================================================================
    INSERT INTO organization_units (id, name, description, organization_id, parent_id, level, sort_order, is_active, created_at, updated_at)
    VALUES ('unit_hq', 'Headquarters', 'Default top-level organization unit',
            v_org_id, NULL, 0, 0, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        organization_id = EXCLUDED.organization_id, is_active = EXCLUDED.is_active,
        updated_at = NOW();

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

    INSERT INTO unit_role_assignments (id, unit_id, role_id, created_at, updated_at)
    VALUES ('ura_admin_hq', 'unit_hq', 'role_admin', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    DELETE FROM user_unit_assignments
     WHERE user_id = v_user_id AND unit_id = 'unit_hq' AND id <> 'uua_admin_user';

    INSERT INTO user_unit_assignments (id, user_id, unit_id, role_id, notes, created_at, updated_at)
    VALUES ('uua_admin_user', v_user_id, 'unit_hq', 'role_admin',
            'HR bootstrap: auto-assigned administrator role', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id, unit_id = EXCLUDED.unit_id,
        role_id = EXCLUDED.role_id, updated_at = NOW();

    -- =========================================================================
    -- STEP 35 - USER PERMISSIONS - grant v_user_id admin on all HR
    -- =========================================================================
    INSERT INTO user_permissions (
        id, user_id, permission_id, module_id, form_id,
        granted, can_view, can_create, can_edit, can_delete, is_system_admin,
        reason, granted_by, granted_at, is_active,
        created_at, updated_at
    ) VALUES
        -- Module-level grants (25 modules)
        ('up_hr_root_admin',          v_user_id, 'perm_hr_admin', 'mod_hr_root',            NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrcore_admin',           v_user_id, 'perm_hr_admin', 'mod_hrcore',             NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrrec_admin',            v_user_id, 'perm_hr_admin', 'mod_hrrec',              NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrperf_admin',           v_user_id, 'perm_hr_admin', 'mod_hrperf',             NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hreng_admin',            v_user_id, 'perm_hr_admin', 'mod_hreng',              NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hradm_admin',            v_user_id, 'perm_hr_admin', 'mod_hradm',              NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrcore_emp_admin',       v_user_id, 'perm_hr_admin', 'mod_hrcore_emp',         NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrcore_att_admin',       v_user_id, 'perm_hr_admin', 'mod_hrcore_att',         NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrcore_leave_admin',     v_user_id, 'perm_hr_admin', 'mod_hrcore_leave',       NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrcore_holiday_admin',   v_user_id, 'perm_hr_admin', 'mod_hrcore_holiday',     NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrrec_staff_admin',      v_user_id, 'perm_hr_admin', 'mod_hrrec_staff',        NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrrec_opening_admin',    v_user_id, 'perm_hr_admin', 'mod_hrrec_opening',      NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrrec_app_admin',        v_user_id, 'perm_hr_admin', 'mod_hrrec_app',          NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrrec_offer_admin',      v_user_id, 'perm_hr_admin', 'mod_hrrec_offer',        NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrrec_appt_admin',       v_user_id, 'perm_hr_admin', 'mod_hrrec_appt',         NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrrec_ref_admin',        v_user_id, 'perm_hr_admin', 'mod_hrrec_ref',          NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrperf_kra_admin',       v_user_id, 'perm_hr_admin', 'mod_hrperf_kra',         NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hrperf_apr_admin',       v_user_id, 'perm_hr_admin', 'mod_hrperf_apr',         NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hreng_tgt_admin',        v_user_id, 'perm_hr_admin', 'mod_hreng_tgt',          NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hreng_init_admin',       v_user_id, 'perm_hr_admin', 'mod_hreng_init',         NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hreng_prob_admin',       v_user_id, 'perm_hr_admin', 'mod_hreng_prob',         NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hreng_kz_admin',         v_user_id, 'perm_hr_admin', 'mod_hreng_kz',           NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hreng_sug_admin',        v_user_id, 'perm_hr_admin', 'mod_hreng_sug',          NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hradm_asset_admin',      v_user_id, 'perm_hr_admin', 'mod_hradm_asset',        NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_hradm_sim_admin',        v_user_id, 'perm_hr_admin', 'mod_hradm_sim',          NULL, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        -- Form-level grants (20 forms)
        ('up_form_emp_master',        v_user_id, 'perm_hr_admin', NULL, 'form_hr_employee_master',       TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_checkin',           v_user_id, 'perm_hr_admin', NULL, 'form_hr_checkin',               TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_checkout',          v_user_id, 'perm_hr_admin', NULL, 'form_hr_checkout',              TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_leave_app',         v_user_id, 'perm_hr_admin', NULL, 'form_hr_leave_application',     TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_holiday',           v_user_id, 'perm_hr_admin', NULL, 'form_hr_holiday_list',          TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_staffing',          v_user_id, 'perm_hr_admin', NULL, 'form_hr_staffing_plan',         TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_opening',           v_user_id, 'perm_hr_admin', NULL, 'form_hr_job_opening',           TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_job_app',           v_user_id, 'perm_hr_admin', NULL, 'form_hr_job_application',       TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_offer',             v_user_id, 'perm_hr_admin', NULL, 'form_hr_job_offer',             TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_appt',              v_user_id, 'perm_hr_admin', NULL, 'form_hr_appointment_letter',    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_referral',          v_user_id, 'perm_hr_admin', NULL, 'form_hr_employee_referral',     TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_kra',               v_user_id, 'perm_hr_admin', NULL, 'form_hr_kra_master',            TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_apr',               v_user_id, 'perm_hr_admin', NULL, 'form_hr_performance_appraisal', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_tgt',               v_user_id, 'perm_hr_admin', NULL, 'form_hr_self_target',           TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_init',              v_user_id, 'perm_hr_admin', NULL, 'form_hr_self_initiative',       TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_prob',              v_user_id, 'perm_hr_admin', NULL, 'form_hr_problem_registration',  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_kz',                v_user_id, 'perm_hr_admin', NULL, 'form_hr_kaizen',                TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_sug',               v_user_id, 'perm_hr_admin', NULL, 'form_hr_employee_suggestion',   TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_asset',             v_user_id, 'perm_hr_admin', NULL, 'form_hr_asset_management',      TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW()),
        ('up_form_sim',               v_user_id, 'perm_hr_admin', NULL, 'form_hr_sim_management',        TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 'HR bootstrap', v_user_id, NOW(), TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id, permission_id = EXCLUDED.permission_id,
        module_id = EXCLUDED.module_id, form_id = EXCLUDED.form_id,
        granted = EXCLUDED.granted, can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
        can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete,
        is_system_admin = EXCLUDED.is_system_admin, is_active = EXCLUDED.is_active,
        updated_at = NOW();

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'HR bootstrap complete.';
    RAISE NOTICE '  Organization:       %', v_org_id;
    RAISE NOTICE '  Admin user:         %', v_user_id;
    RAISE NOTICE '  Modules:            25 (1 root + 5 top-level + 19 sub)';
    RAISE NOTICE '  Forms:              20';
    RAISE NOTICE '  Sections:           31';
    RAISE NOTICE '  Fields:             241 (matches PDF spec)';
    RAISE NOTICE '  Formula fields:     3 (Total Cost, Total Leave Days, Score Earned)';
    RAISE NOTICE '  Leave types/rules:  4 / 8';
    RAISE NOTICE '  Lookup sources:     3 (Employees, Staffing Plans, Job Openings)';
    RAISE NOTICE '  Route permissions:  25';
    RAISE NOTICE '  Permissions:        5 (HR Admin/View/Create/Edit/Delete)';
    RAISE NOTICE '  Admin role:         role_admin (is_admin=TRUE) assigned to user';
    RAISE NOTICE '  User permissions:   45 (25 modules + 20 forms)';
    RAISE NOTICE '==========================================';
END $$;



-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Module hierarchy:
--   SELECT id, name, parent_id, level, path, sort_order
--     FROM form_modules
--    WHERE organization_id = 'cmojv2bpr000hu700t3jrj0vq'
--    ORDER BY level, sort_order;
--
-- Forms and their modules:
--   SELECT f.id, f.name, m.name AS module
--     FROM forms f JOIN form_modules m ON m.id = f.module_id
--    WHERE m.organization_id = 'cmojv2bpr000hu700t3jrj0vq'
--    ORDER BY m.level, m.sort_order;
--
-- All HR fields grouped by form/section:
--   SELECT f.name AS form, s.title AS section, ff.label, ff.type, ff."order"
--     FROM form_fields ff
--     JOIN form_sections s ON s.id = ff.section_id
--     JOIN forms f        ON f.id = s.form_id
--     JOIN form_modules m ON m.id = f.module_id
--    WHERE m.organization_id = 'cmojv2bpr000hu700t3jrj0vq'
--    ORDER BY f.name, s."order", ff."order";
--
-- Field count per form (should match: 52,9,6,10,5,9,11,15,10,8,10,4,7,8,9,12,19,11,11,15 = 241):
--   SELECT f.name, COUNT(ff.id) AS field_count
--     FROM forms f
--     JOIN form_sections s ON s.form_id = f.id
--     JOIN form_fields ff  ON ff.section_id = s.id
--     JOIN form_modules m  ON m.id = f.module_id
--    WHERE m.organization_id = 'cmojv2bpr000hu700t3jrj0vq'
--    GROUP BY f.name
--    ORDER BY f.name;
--
-- Formula fields:
--   SELECT ff.label, fx.expression, fx."returnType", fx.dependencies
--     FROM formula_fields fx JOIN form_fields ff ON ff.id = fx."formFieldId";
--
-- User permissions:
--   SELECT module_id, form_id, can_view, can_edit, can_delete, is_system_admin, reason
--     FROM user_permissions
--    WHERE user_id = 'cmojv15ct000cu700xrgwrbe8'
--    ORDER BY module_id NULLS LAST, form_id NULLS LAST;


-- =============================================================================
-- PART 2/4 - HR AUTOMATIONS
-- CRM functions + workflow rules + function bindings
-- Source: scripts/create-hr-automations.sql
-- =============================================================================

-- =============================================================================
-- HR AUTOMATIONS - FUNCTIONS + WORKFLOW RULES + BINDINGS
-- =============================================================================
-- Depends on: scripts/create-hr-module.sql (must run first)
--
-- Seeds the "automation layer" for the HR system built in create-hr-module.sql:
--   1. CrmFunction  - JavaScript snippets that run in a VM sandbox
--   2. WorkflowRule - rule-based triggers on record Create/Edit/Delete
--                     evaluates conditions, then runs Field Update actions
--                     and/or Function actions
--   3. FunctionBinding - attaches a function to a form/field on specific
--                        events (onFieldChange, afterCreate, afterUpdate, etc.)
--
-- How the engine works (lib/workflow/trigger.ts):
--   - WorkflowRule.moduleName matches form_modules.name (a STRING, not the id)
--   - conditions = [{field:"<fieldId>", operator:"is|is not|contains|is empty|is not empty", value:"..."}]
--   - instantActions = [{type:"Field Update", targetFieldId, targetValue}
--                      | {type:"Function", functionId, functionName}]
--   - Function return value auto-applies to record fields if keys match fieldIds/apiNames
--
-- Safe to re-run: wipes only HR automation rows then UPSERTs.
-- =============================================================================



DO $$
DECLARE
    v_org_id  TEXT := 'cmojv2bpr000hu700t3jrj0vq';
    v_user_id TEXT := 'cmojv15ct000cu700xrgwrbe8';
    v_deleted INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id) THEN
        RAISE EXCEPTION 'Organization % does not exist - aborting.', v_org_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
        RAISE EXCEPTION 'User % does not exist - aborting.', v_user_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM form_modules WHERE id = 'mod_hr_root' AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'HR module not bootstrapped - run scripts/create-hr-module.sql first.';
    END IF;

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Seeding HR automations (functions + rules)';
    RAISE NOTICE '  Organization: %', v_org_id;
    RAISE NOTICE '  Creator user: %', v_user_id;
    RAISE NOTICE '==========================================';

    -- =========================================================================
    -- STEP 1 - WIPE existing HR automations for this org (safe re-run)
    -- =========================================================================
    DELETE FROM function_bindings
     WHERE id LIKE 'fb_hr_%'
        OR function_id IN (SELECT id FROM crm_functions WHERE id LIKE 'fn_hr_%');
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped function_bindings: %', v_deleted;

    DELETE FROM workflow_rules
     WHERE id LIKE 'wfr_hr_%'
        OR (organization_id = v_org_id
            AND module_name IN (
                'Employee Master','Attendance','Leave Management','Holiday List',
                'Staffing Plan','Job Opening','Job Application','Job Offer',
                'Appointment Letter','Employee Referral',
                'KRA','Performance Appraisal',
                'Self Target','Self Initiative','Problem Registration','Kaizen','Employee Suggestion',
                'Asset Management','SIM Management'
            ));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped workflow_rules: %', v_deleted;

    DELETE FROM crm_functions WHERE id LIKE 'fn_hr_%';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Wiped crm_functions: %', v_deleted;

    RAISE NOTICE '-------- Wipe complete. Rebuilding. --------';

    -- =========================================================================
    -- STEP 2 - CRM FUNCTIONS (JavaScript automation scripts)
    -- =========================================================================
    -- Each function receives ctx.input with:
    --   { triggerSource, ruleId, ruleName, moduleName, action, recordId, recordData }
    -- when called from a WorkflowRule, or { input, recordId, recordData } when
    -- called from a FunctionBinding. Return an object keyed by fieldId / label /
    -- apiName to auto-write-back field values, or return {ok:true} for side-
    -- effects only.
    -- =========================================================================
    INSERT INTO crm_functions (
        id, name, display_name, category, language, description,
        associated, rest_api, script, organization_id, created_by_id,
        created_at, updated_at
    ) VALUES

    -- ---- 1. Employee onboarding: set defaults on create -------------------
    ('fn_hr_employee_onboarding',
     'hr_employee_onboarding',
     'HR: Employee Onboarding Defaults',
     'Automation', 'JavaScript',
     'When an Employee Master record is created, set Status=ACTIVE if missing and Total Working Hours=8 if blank.',
     TRUE, FALSE,
     $js$
// Ensure new employees default to ACTIVE + 8h workday.
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const out = {};
if (!get('fld_emp_status')) out['fld_emp_status'] = 'ACTIVE';
if (!get('fld_emp_total_hours')) out['fld_emp_total_hours'] = 8;
if (!get('fld_emp_nationality')) out['fld_emp_nationality'] = 'Indian';
return out;
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 2. Leave: calculate total days from start/end dates --------------
    ('fn_hr_leave_calc_days',
     'hr_leave_calc_days',
     'HR: Calculate Leave Days',
     'Automation', 'JavaScript',
     'Auto-calculate total leave days from Leave Start Date and Leave End Date (inclusive).',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const start = get('fld_leave_start_date');
const end   = get('fld_leave_end_date');
if (!start || !end) return { ok: false };
const d1 = new Date(start);
const d2 = new Date(end);
if (isNaN(d1) || isNaN(d2) || d2 < d1) return { ok: false };
const days = Math.floor((d2 - d1) / 86400000) + 1;
return { 'fld_leave_total_days': days };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 3. Leave: auto-approve short sick leaves -------------------------
    ('fn_hr_leave_auto_approve_short',
     'hr_leave_auto_approve_short',
     'HR: Auto-Approve Short Leave',
     'Automation', 'JavaScript',
     'For single-day leaves, auto-approve at manager level (keeps HR approval pending).',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const days = Number(get('fld_leave_total_days')) || 0;
if (days === 1) return { 'fld_leave_mgr_approval': 'APPROVED' };
return { ok: true };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 4. Performance Appraisal: compute Score Earned -------------------
    ('fn_hr_appraisal_score',
     'hr_appraisal_score',
     'HR: Compute Appraisal Score Earned',
     'Automation', 'JavaScript',
     'Compute Score Earned = Weightage x Score / 10, rounded to 2 decimals.',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const w = Number(get('fld_apr_weightage')) || 0;
const s = Number(get('fld_apr_score')) || 0;
const earned = Math.round((w * s / 10) * 100) / 100;
return { 'fld_apr_score_earned': earned };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 5. Staffing Plan: total estimated cost ---------------------------
    ('fn_hr_staff_total_cost',
     'hr_staff_total_cost',
     'HR: Compute Staffing Total Cost',
     'Automation', 'JavaScript',
     'Compute Total Estimated Cost = No. of Vacancies x Estimated Cost Per Person.',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const vac  = Number(get('fld_staff_vacancies')) || 0;
const cost = Number(get('fld_staff_cost_per')) || 0;
return { 'fld_staff_total_cost': vac * cost };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 6. Job Application: copy Job Description (and other fields) from opening ------------
    ('fn_hr_job_app_copy_desc',
     'hr_job_app_copy_desc',
     'HR: Copy Job Description from Opening',
     'Automation', 'JavaScript',
     'On Job Application save/edit, look up the linked Job Opening and copy Job Description, Department, Designation and Employment Type when blank on the application.',
     TRUE, FALSE,
     $js$
// FIX: Read the opening from the Job Opening module via the lookup field's
// stored value. Job Opening's lookup-store is fld_open_plan_id (the plan ID
// text), so fld_app_opening_id on the application stores that same plan ID.
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const norm = (s) => String(s == null ? '' : s).trim().toUpperCase();

const openingKey = norm(get('fld_app_opening_id'));
if (!openingKey) return { ok: true };

const openings = await ctx.records.list('Job Opening', { limit: 500 });
const match = openings.find(function (r) {
  var d = (r && r.data) || {};
  return norm(d['New Staffing Plan ID']) === openingKey;
});
if (!match) return { ok: true };

var od = match.data || {};
var out = {};
if (od['Job Description'] && !get('fld_app_job_desc'))   out['fld_app_job_desc']    = od['Job Description'];
if (od['Department']      && !get('fld_app_department')) out['fld_app_department']  = od['Department'];
if (od['Designation']     && !get('fld_app_designation'))out['fld_app_designation'] = od['Designation'];
if (od['Employment Type'] && !get('fld_app_emp_type'))   out['fld_app_emp_type']    = od['Employment Type'];
return Object.keys(out).length ? out : { ok: true };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 7. Kaizen: engagement points based on area -----------------------
    ('fn_hr_kaizen_points',
     'hr_kaizen_points',
     'HR: Kaizen Engagement Points',
     'Automation', 'JavaScript',
     'Award engagement points based on Kaizen Area. Safety=100, Quality=80, Cost=80, Productivity=70, else 50.',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const existing = Number(get('fld_kz_points'));
if (existing && existing > 0) return { ok: true };
const area = String(get('fld_kz_area') || '').toUpperCase();
const map = { SAFETY: 100, QUALITY: 80, COST: 80, DELIVERY: 70, PRODUCTIVITY: 70, MORALE: 60, ENVIRONMENT: 60 };
return { 'fld_kz_points': map[area] || 50 };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 8. Problem Registration: default engagement points ---------------
    ('fn_hr_problem_points',
     'hr_problem_points',
     'HR: Problem Registration Points',
     'Automation', 'JavaScript',
     'Award 30 engagement points when a problem is registered (if not already set).',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const existing = Number(get('fld_prob_points'));
if (existing && existing > 0) return { ok: true };
return { 'fld_prob_points': 30 };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 9. Suggestion / Initiative default points ------------------------
    ('fn_hr_suggestion_points',
     'hr_suggestion_points',
     'HR: Suggestion / Initiative Points',
     'Automation', 'JavaScript',
     'Award default engagement points for suggestions (20) or self-initiatives (40) when blank.',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const out = {};
if (get('fld_sug_suggestion') !== undefined && !Number(get('fld_sug_points'))) out['fld_sug_points'] = 20;
if (get('fld_init_define')   !== undefined && !Number(get('fld_init_points'))) out['fld_init_points'] = 40;
if (get('fld_tgt_target')    !== undefined && !Number(get('fld_tgt_points'))) out['fld_tgt_points'] = 50;
return Object.keys(out).length ? out : { ok: true };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 10. Asset: auto-set status to ASSIGNED when employee filled -------
    ('fn_hr_asset_auto_status',
     'hr_asset_auto_status',
     'HR: Asset Auto-Assign Status',
     'Automation', 'JavaScript',
     'If Asset Management has Employee ID filled, flip status to ASSIGNED; if blank, set IN_STOCK.',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const emp = String(get('fld_asset_employee_id') || '').trim();
return { 'fld_asset_status': emp ? 'ASSIGNED' : 'IN_STOCK' };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 11. SIM: auto-set status when employee assigned -------------------
    ('fn_hr_sim_auto_status',
     'hr_sim_auto_status',
     'HR: SIM Auto-Assign Status',
     'Automation', 'JavaScript',
     'Set SIM Status = ACTIVE when Employee ID is filled, INACTIVE when cleared.',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const emp = String(get('fld_sim_employee_id') || '').trim();
return { 'fld_sim_status': emp ? 'ACTIVE' : 'INACTIVE' };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 12. Job Offer: defaults + pull applicant info from Job Application ---
    ('fn_hr_offer_populate',
     'hr_offer_populate',
     'HR: Offer Populate from Application',
     'Automation', 'JavaScript',
     'On Job Offer save, default Offer Date to today and Status to DRAFT, then look up the most-recent Job Application for the linked opening (preferring HIRED/OFFER/INTERVIEW/SHORTLISTED) and pull Applicant Name / Email / Mobile when blank.',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const norm = (s) => String(s == null ? '' : s).trim().toUpperCase();

const out = {};
if (!get('fld_offer_date'))   out['fld_offer_date']   = new Date().toISOString().slice(0, 10);
if (!get('fld_offer_status')) out['fld_offer_status'] = 'DRAFT';

const openingKey = norm(get('fld_offer_opening_id'));
const haveName   = String(get('fld_offer_name')   || '').trim();
const haveEmail  = String(get('fld_offer_email')  || '').trim();
const haveMobile = String(get('fld_offer_mobile') || '').trim();

if (openingKey && (!haveName || !haveEmail || !haveMobile)) {
  const apps = await ctx.records.list('Job Application', { limit: 500 });
  const candidates = apps.filter(function (r) {
    var d = (r && r.data) || {};
    return norm(d['New Job Opening ID']) === openingKey;
  });
  // Prefer the furthest-along applicant for this opening.
  var priority = { HIRED: 0, OFFER: 1, INTERVIEW: 2, SHORTLISTED: 3, SCREENING: 4, APPLIED: 5 };
  candidates.sort(function (a, b) {
    var sa = norm((a.data && a.data['Status']) || '');
    var sb = norm((b.data && b.data['Status']) || '');
    var pa = priority[sa] == null ? 9 : priority[sa];
    var pb = priority[sb] == null ? 9 : priority[sb];
    return pa - pb;
  });
  var pick = candidates[0];
  if (pick && pick.data) {
    if (!haveName   && pick.data['Applicant Name'])          out['fld_offer_name']   = pick.data['Applicant Name'];
    if (!haveEmail  && pick.data['Applicant Email ID'])      out['fld_offer_email']  = pick.data['Applicant Email ID'];
    if (!haveMobile && pick.data['Applicant Mobile Number']) out['fld_offer_mobile'] = pick.data['Applicant Mobile Number'];
  }
}
return Object.keys(out).length ? out : { ok: true };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 13. Check-In/Out: stamp server timestamps -------------------------
    ('fn_hr_attendance_stamp',
     'hr_attendance_stamp',
     'HR: Attendance Timestamp Stamp',
     'Automation', 'JavaScript',
     'On Check-In/Check-Out create, if In Date / Out Date missing, default to today.',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const today = new Date().toISOString().slice(0, 10);
const out = {};
if (ctx.input.moduleName === 'Attendance') {
  if (get('fld_ci_employee_id') && !get('fld_ci_in_date')) out['fld_ci_in_date'] = today;
  if (get('fld_co_employee_id') && !get('fld_co_out_date')) out['fld_co_out_date'] = today;
}
return Object.keys(out).length ? out : { ok: true };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 14. Holiday List: auto-count holidays -----------------------------
    ('fn_hr_holiday_count',
     'hr_holiday_count',
     'HR: Holiday Count',
     'Automation', 'JavaScript',
     'If Total No. of Holidays is blank, default to 1 (each row is one holiday entry).',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
if (Number(get('fld_holiday_total')) > 0) return { ok: true };
return { 'fld_holiday_total': 1 };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 15. Leave: mark Employee ON_LEAVE when fully approved -------------
    ('fn_hr_leave_apply_status',
     'hr_leave_apply_status',
     'HR: Apply Leave Status on Approval',
     'Automation', 'JavaScript',
     'When both manager and HR approvals are APPROVED, log the decision (side-effect only).',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const mgr = String(get('fld_leave_mgr_approval') || '');
const hr  = String(get('fld_leave_hr_approval')  || '');
if (mgr === 'APPROVED' && hr === 'APPROVED') {
  console.log('[HR] Leave fully approved', ctx.input.recordId);
}
return { ok: true };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- =========================================================================
    -- PHASE 1 RECRUITMENT PIPELINE FUNCTIONS (F6 -> F7 -> F8 -> F9 -> F10 -> F1)
    -- Each step looks up the prior form by its text-key (Plan ID / Opening ID
    -- / applicant identity). Lookup fields store their configured "value
    -- field" -- for HR this is the Plan ID text -- so we match records by
    -- normalising both sides (trim, uppercase, zero-pad-neutral).
    -- =========================================================================

    -- ---- 16. Job Opening: fill from Staffing Plan -------------------------
    ('fn_hr_opening_fill_from_plan',
     'hr_opening_fill_from_plan',
     'HR: Fill Job Opening from Staffing Plan',
     'Automation', 'JavaScript',
     'When New Staffing Plan ID is selected on a Job Opening, copy Profile Name, Company, Department, Designation, Employment Type, and No. of Vacancies from the Staffing Plan (only fills blanks, never clobbers).',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
function norm(s) {
  s = String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
  return s.replace(/(\d+)/g, function (n) { return String(Number(n)); });
}
// Lookup by binding payload OR record data. Binding sends flat label keys.
var planKey =
  (ctx.input && (ctx.input['New Staffing Plan ID'] || ctx.input.New_Staffing_Plan_ID)) || null;
if (!planKey) planKey = get('fld_open_plan_id');
var needle = norm(planKey);
if (!needle) return { ok: false, reason: 'no plan id' };

const plans = await ctx.records.list('Staffing Plan', { limit: 500 });
const match = plans.find(function (r) {
  var d = (r && r.data) || {};
  return norm(d['New Staffing Plan ID']) === needle;
});
if (!match) return { ok: false, reason: 'plan not found' };

var pd = match.data || {};
var out = {};
if (pd['Profile Name']     && !get('fld_open_profile'))     out['fld_open_profile']     = pd['Profile Name'];
if (pd['Company']          && !get('fld_open_company'))     out['fld_open_company']     = pd['Company'];
if (pd['Department']       && !get('fld_open_department'))  out['fld_open_department']  = pd['Department'];
if (pd['Designation']      && !get('fld_open_designation')) out['fld_open_designation'] = pd['Designation'];
if (pd['Employment Type']  && !get('fld_open_emp_type'))    out['fld_open_emp_type']    = pd['Employment Type'];
if (pd['No. of Vacancies'] != null && !get('fld_open_vacancies')) out['fld_open_vacancies'] = pd['No. of Vacancies'];
return Object.keys(out).length ? out : { ok: true };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 17. Job Application: fill from Job Opening (and through to Plan) ----
    ('fn_hr_app_fill_from_opening',
     'hr_app_fill_from_opening',
     'HR: Fill Job Application from Opening',
     'Automation', 'JavaScript',
     'When New Job Opening ID is selected on a Job Application, copy Department, Designation, Employment Type, and Job Description from the linked Job Opening (only fills blanks).',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
function norm(s) {
  s = String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
  return s.replace(/(\d+)/g, function (n) { return String(Number(n)); });
}
var openingKey =
  (ctx.input && (ctx.input['New Job Opening ID'] || ctx.input.New_Job_Opening_ID)) || null;
if (!openingKey) openingKey = get('fld_app_opening_id');
var needle = norm(openingKey);
if (!needle) return { ok: false, reason: 'no opening id' };

const openings = await ctx.records.list('Job Opening', { limit: 500 });
const match = openings.find(function (r) {
  var d = (r && r.data) || {};
  return norm(d['New Staffing Plan ID']) === needle;
});
if (!match) return { ok: false, reason: 'opening not found' };

var od = match.data || {};
var out = {};
if (od['Department']      && !get('fld_app_department'))  out['fld_app_department']  = od['Department'];
if (od['Designation']     && !get('fld_app_designation')) out['fld_app_designation'] = od['Designation'];
if (od['Employment Type'] && !get('fld_app_emp_type'))    out['fld_app_emp_type']    = od['Employment Type'];
if (od['Job Description'] && !get('fld_app_job_desc'))    out['fld_app_job_desc']    = od['Job Description'];
return Object.keys(out).length ? out : { ok: true };
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 18. Appointment Letter: auto-create when Offer is ACCEPTED ----------
    ('fn_hr_appt_create_from_offer',
     'hr_appt_create_from_offer',
     'HR: Create Appointment Letter from Offer',
     'Automation', 'JavaScript',
     'When a Job Offer status changes to ACCEPTED, auto-create an Appointment Letter for the applicant. Idempotent: skipped if an Appointment Letter already exists for that applicant. Default Appointment Date = Offer Date + 14 days.',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const norm = (s) => String(s == null ? '' : s).trim().toUpperCase();

const status = norm(get('fld_offer_status'));
if (status !== 'ACCEPTED') return { ok: true, skipped: 'status not ACCEPTED' };

const applicantName = String(get('fld_offer_name') || '').trim();
if (!applicantName) return { ok: false, reason: 'offer has no applicant name' };

// Idempotency: if an Appointment Letter already exists for this applicant, skip.
const existing = await ctx.records.list('Appointment Letter', { limit: 500 });
const dup = existing.find(function (r) {
  var d = (r && r.data) || {};
  return norm(d['Job Applicant Name']) === norm(applicantName);
});
if (dup) return { ok: true, alreadyExists: dup.id };

// Default appointment date = Offer Date + 14 days, fallback today + 14.
var offerDate = get('fld_offer_date');
var base = offerDate ? new Date(offerDate) : new Date();
if (isNaN(base.getTime())) base = new Date();
base.setDate(base.getDate() + 14);
var apptDate = base.toISOString().slice(0, 10);

// Pull Company from the Staffing Plan if available.
var company = '';
var planKey = norm(get('fld_offer_plan_id'));
if (planKey) {
  var plans = await ctx.records.list('Staffing Plan', { limit: 500 });
  var planRow = plans.find(function (r) {
    var d = (r && r.data) || {};
    return norm(d['New Staffing Plan ID']) === planKey;
  });
  if (planRow && planRow.data && planRow.data['Company']) company = planRow.data['Company'];
}

var payload = {
  'Job Applicant Name': applicantName,
  'Appointment Date':   apptDate,
};
if (company) payload['Company'] = company;

try {
  var created = await ctx.records.create('Appointment Letter', payload);
  return { ok: true, createdId: created.id };
} catch (e) {
  return { ok: false, reason: 'create failed: ' + (e && e.message ? e.message : String(e)) };
}
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 19. Employee Master: auto-create on Appointment Letter create -------
    ('fn_hr_emp_create_from_appt',
     'hr_emp_create_from_appt',
     'HR: Create Employee Master from Appointment Letter',
     'Automation', 'JavaScript',
     'When an Appointment Letter is created, auto-create the Employee Master record. Pulls First/Last Name from the appointment, Department/Designation/Employment Type/Email/Mobile from the matching Job Application, generates a sequential Employee ID. Idempotent.',
     TRUE, FALSE,
     $js$
// Read the just-saved appointment via ctx.records.get so we get fields keyed
// by LABEL, not by fieldId. The Applicant Name / Company / Job Application
// fields are lookup-type with auto-generated cuids that vary per environment;
// reading by label keeps this function stable across schema rebuilds.
const recordId = ctx.input && ctx.input.recordId;
if (!recordId) return { ok: false, reason: 'no recordId' };
const appt = await ctx.records.get('Appointment Letter', recordId);
if (!appt) return { ok: false, reason: 'appointment not found' };
const a = appt.data || {};
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const norm = (s) => String(s == null ? '' : s).trim().toUpperCase();

const applicantName = String(a['Applicant Name'] || get('fld_appt_applicant') || '').trim();
if (!applicantName) return { ok: false, reason: 'no applicant name' };

const apptDate = String(a['Appointment Date'] || get('fld_appt_date') || '').trim() || new Date().toISOString().slice(0, 10);
const company  = String(a['Company'] || get('fld_appt_company') || '').trim();

// Parse "First Middle Last" into firstName + lastName.
var nameParts = applicantName.split(/\s+/).filter(Boolean);
var firstName = nameParts.shift() || applicantName;
var lastName  = nameParts.length ? nameParts.join(' ') : firstName;

// Idempotency: matching first+last already exists?
const employees = await ctx.records.list('Employee Master', { limit: 500 });
const empDup = employees.find(function (r) {
  var d = (r && r.data) || {};
  return norm(d['First Name']) === norm(firstName) && norm(d['Last Name']) === norm(lastName);
});
if (empDup) return { ok: true, alreadyExists: empDup.id };

// Look up the matching Job Application (most recent, by full applicant name).
var applicationData = {};
const apps = await ctx.records.list('Job Application', { limit: 500 });
const appMatch = apps.find(function (r) {
  var d = (r && r.data) || {};
  return norm(d['Applicant Name']) === norm(applicantName);
});
if (appMatch && appMatch.data) applicationData = appMatch.data;

// Generate sequential Employee ID. Use count() then pad to 4 digits.
var nextSeq = employees.length + 1;
try {
  var c = await ctx.records.count('Employee Master');
  if (typeof c === 'number' && c >= 0) nextSeq = c + 1;
} catch (e) { /* fall through */ }
var empId = 'EMP-' + String(nextSeq).padStart(4, '0');

var payload = {
  'Employee ID':         empId,
  'First Name':          firstName,
  'Last Name':           lastName,
  'Status':              'ACTIVE',
  'Date of Joining':     apptDate,
  'Total Working Hours': 8,
  'Nationality':         'Indian',
};
if (company || applicationData['Company']) payload['Company'] = company || applicationData['Company'];
if (applicationData['Department'])         payload['Department']      = applicationData['Department'];
if (applicationData['Designation'])        payload['Designation']     = applicationData['Designation'];
if (applicationData['Employment Type'])    payload['Employment Type'] = applicationData['Employment Type'];
if (applicationData['Applicant Email ID'])      payload['Personal Email'] = applicationData['Applicant Email ID'];
if (applicationData['Applicant Mobile Number']) payload['Cell Number']    = applicationData['Applicant Mobile Number'];

try {
  var created = await ctx.records.create('Employee Master', payload);
  return { ok: true, createdId: created.id, employeeId: empId };
} catch (e) {
  return { ok: false, reason: 'create failed: ' + (e && e.message ? e.message : String(e)) };
}
$js$,
     v_org_id, v_user_id, NOW(), NOW()),

    -- ---- 20. Employee Referral: auto-create Job Application from referral ----
    ('fn_hr_referral_create_application',
     'hr_referral_create_application',
     'HR: Create Job Application from Referral',
     'Automation', 'JavaScript',
     'When an Employee Referral is created, auto-create a Job Application with Source=REFERRAL and the candidate details. Idempotent on candidate email.',
     TRUE, FALSE,
     $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const norm = (s) => String(s == null ? '' : s).trim().toUpperCase();

const candidateName   = String(get('fld_ref_applicant') || '').trim();
const candidateEmail  = String(get('fld_ref_email')     || '').trim();
const candidateMobile = String(get('fld_ref_mobile')    || '').trim();
const designation     = String(get('fld_ref_designation') || '').trim();

if (!candidateName)  return { ok: false, reason: 'referral has no applicant name' };
if (!candidateEmail) return { ok: false, reason: 'referral has no applicant email' };

// Idempotency: skip if a Job Application already exists for this email.
const existing = await ctx.records.list('Job Application', { limit: 500 });
const dup = existing.find(function (r) {
  var d = (r && r.data) || {};
  return norm(d['Applicant Email ID']) === norm(candidateEmail);
});
if (dup) return { ok: true, alreadyExists: dup.id };

var payload = {
  'Applicant Name':          candidateName,
  'Applicant Email ID':      candidateEmail,
  'Applicant Source':        'REFERRAL',
  'Status':                  'APPLIED',
};
if (candidateMobile) payload['Applicant Mobile Number'] = candidateMobile;
if (designation)     payload['Designation']             = designation;

try {
  var created = await ctx.records.create('Job Application', payload);
  return { ok: true, createdId: created.id };
} catch (e) {
  return { ok: false, reason: 'create failed: ' + (e && e.message ? e.message : String(e)) };
}
$js$,
     v_org_id, v_user_id, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, display_name = EXCLUDED.display_name,
        category = EXCLUDED.category, language = EXCLUDED.language,
        description = EXCLUDED.description,
        associated = EXCLUDED.associated, rest_api = EXCLUDED.rest_api,
        script = EXCLUDED.script,
        organization_id = EXCLUDED.organization_id,
        created_by_id = EXCLUDED.created_by_id,
        updated_at = NOW();

    -- ---- 16. Employee Master LOOKUP: auto-fill from Employee ID ----------
    -- Given "EMP-0001" typed into any forms Employee ID field, find the
    -- matching Employee Master record and return its First Name / Last Name
    -- / Department (and Middle Name if the source has one). The binding
    -- runner's auto-output-mode matches these return keys against the
    -- current forms field labels, so ONE function populates all 10 forms:
    --   Check In, Leave, Employee Referral, Self Target, Self Initiative,
    --   Problem Registration, Kaizen, Employee Suggestion, Asset Management,
    --   SIM Management.
    INSERT INTO crm_functions (
        id, name, display_name, category, language, description,
        associated, rest_api, script, organization_id, created_by_id,
        created_at, updated_at
    ) VALUES
    ('fn_hr_lookup_employee',
     'hr_lookup_employee',
     'HR: Lookup Employee by ID',
     'Automation', 'JavaScript',
     'Looks up Employee Master by Employee ID and returns First Name, Last Name, Department (auto-fills any HR form that has those field labels).',
     TRUE, FALSE,
     $js$
// ============================================================
// HR: Lookup Employee by ID (fuzzy + fast)
//
// Works from either context:
//   1. FunctionBinding (onFieldChange) - ctx.input is formData flat-keyed
//      by apiName and label: ctx.input["Employee ID"] == typed value.
//   2. WorkflowRule (Create/Edit) - ctx.input is {recordData, moduleName, ...}
//      and the Employee ID lives in ctx.input.recordData.sections[*].fields.
//
// Match is forgiving to reduce user friction:
//   - Trim + uppercase
//   - Collapse internal whitespace
//   - Zero-pad-neutral: "EMP-001" matches "EMP-0001" (every digit run is
//     reduced to its integer value).
// ============================================================

function norm(s) {
  s = String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
  // Strip leading zeros in every digit run: "EMP-0001" -> "EMP-1"
  return s.replace(/(\d+)/g, function (n) { return String(Number(n)); });
}

function fromSections(rd, test) {
  var secs = (rd && rd.sections) || {};
  var keys = Object.keys(secs);
  for (var i = 0; i < keys.length; i++) {
    var s = secs[keys[i]];
    var fields = (s && s.fields) || {};
    var fkeys = Object.keys(fields);
    for (var j = 0; j < fkeys.length; j++) {
      var fid = fkeys[j];
      if (test(fid)) {
        var v = fields[fid];
        var val = v && typeof v === 'object' && 'value' in v ? v.value : v;
        if (val !== undefined && val !== null && val !== '') return val;
      }
    }
  }
  return undefined;
}

// Pull the typed Employee ID. Four fallbacks keep this robust.
var empId =
  (ctx.input && (ctx.input['Employee ID'] || ctx.input.Employee_ID)) || null;

if (!empId) {
  // workflow-rule shape: recordData is nested under ctx.input
  var rd1 = ctx.input && ctx.input.recordData;
  if (rd1) empId = fromSections(rd1, function (fid) { return /employee_id$/i.test(fid); });
}
if (!empId && ctx.recordData) {
  // binding shape: recordData sits at top level of ctx for saved records
  empId = fromSections(ctx.recordData, function (fid) { return /employee_id$/i.test(fid); });
}
if (!empId) return { ok: false, error: 'no employee id' };

var needle = norm(empId);
if (!needle) return { ok: false, error: 'employee id is blank' };

// Fast path: small first page (50 rows), grow to 500 only if needed.
// In steady state almost every lookup hits a match in the first 50 rows.
var pageSize = 50;
var emps = await ctx.records.list('Employee Master', { limit: pageSize });

function findMatch(list) {
  for (var k = 0; k < list.length; k++) {
    var row = list[k];
    var id = row && row.data && (row.data['Employee ID'] || row.data.Employee_ID);
    if (id != null && norm(id) === needle) return row;
  }
  return null;
}

var match = findMatch(emps);
if (!match && emps.length === pageSize) {
  // Fallback: scan the rest in one bigger page.
  var more = await ctx.records.list('Employee Master', { limit: 500, skip: pageSize });
  match = findMatch(more);
}
if (!match) return { ok: false, error: 'employee not found: ' + empId };

// Auto-output mode: these label keys are matched against the CURRENT form's
// fields. Forms without "Middle Name" (etc.) silently skip.
var d = match.data || {};
var out = {};
if (d['First Name'])  out['First Name']  = d['First Name'];
if (d['Middle Name']) out['Middle Name'] = d['Middle Name'];
if (d['Last Name'])   out['Last Name']   = d['Last Name'];
if (d['Department'])  out['Department']  = d['Department'];
return out;
$js$,
     v_org_id, v_user_id, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, display_name = EXCLUDED.display_name,
        category = EXCLUDED.category, language = EXCLUDED.language,
        description = EXCLUDED.description,
        associated = EXCLUDED.associated, rest_api = EXCLUDED.rest_api,
        script = EXCLUDED.script,
        organization_id = EXCLUDED.organization_id,
        created_by_id = EXCLUDED.created_by_id,
        updated_at = NOW();

    RAISE NOTICE 'Seeded 21 HR functions (15 automation + 5 recruitment pipeline + 1 employee lookup)';

    -- =========================================================================
    -- STEP 3 - WORKFLOW RULES
    -- Format reminders:
    --   module_name         = form_modules.name (string, not id)
    --   execute_based_on    = 'record-action'
    --   record_action       = 'Create' | 'Edit' | 'Create or Edit' | 'Delete'
    --   condition_type      = 'all' | 'matching'
    --   conditions          = [{"field":"<fieldId>","operator":"is","value":"..."}]
    --   instant_actions     = [{"type":"Field Update"|"Function", ...}]
    -- =========================================================================
    INSERT INTO workflow_rules (
        id, name, description, module_name, execute_based_on, record_action,
        condition_type, conditions, instant_actions,
        active, organization_id, created_by_id, created_at, updated_at
    ) VALUES

    -- ===== EMPLOYEE MASTER =====
    ('wfr_hr_emp_onboarding',
     'Employee Onboarding Defaults',
     'On new Employee Master, set defaults (Status=ACTIVE, Working Hours=8, Nationality=Indian).',
     'Employee Master', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_employee_onboarding","functionName":"HR: Employee Onboarding Defaults"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_emp_resigned',
     'Employee Resigned - clear company email',
     'When Employee Status becomes RESIGNED, clear Company Email.',
     'Employee Master', 'record-action', 'Edit', 'matching',
     '[{"field":"fld_emp_status","operator":"is","value":"RESIGNED"}]'::jsonb,
     '[{"type":"Field Update","targetFieldId":"fld_emp_company_email","targetValue":""}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_emp_terminated',
     'Employee Terminated - mark inactive',
     'When Status becomes TERMINATED, also ensure it stays that way (audit illustrative).',
     'Employee Master', 'record-action', 'Edit', 'matching',
     '[{"field":"fld_emp_status","operator":"is","value":"TERMINATED"}]'::jsonb,
     '[{"type":"Field Update","targetFieldId":"fld_emp_notice_served","targetValue":"true"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== ATTENDANCE =====
    ('wfr_hr_attendance_stamp',
     'Attendance Auto-Timestamp',
     'On Check In / Check Out create, default dates to today when blank.',
     'Attendance', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_attendance_stamp","functionName":"HR: Attendance Timestamp Stamp"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== LEAVE MANAGEMENT =====
    ('wfr_hr_leave_calc',
     'Leave - Calculate Total Days',
     'Auto-fill Total Leave Days from Start/End on Create or Edit.',
     'Leave Management', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_leave_calc_days","functionName":"HR: Calculate Leave Days"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_leave_auto_approve_short',
     'Leave - Auto-Approve 1 day',
     'Auto-approve single-day leaves at manager level.',
     'Leave Management', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_leave_auto_approve_short","functionName":"HR: Auto-Approve Short Leave"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_leave_mgr_rejected',
     'Leave - Manager Rejected auto-rejects HR',
     'If manager rejects, HR approval follows automatically.',
     'Leave Management', 'record-action', 'Edit', 'matching',
     '[{"field":"fld_leave_mgr_approval","operator":"is","value":"REJECTED"}]'::jsonb,
     '[{"type":"Field Update","targetFieldId":"fld_leave_hr_approval","targetValue":"REJECTED"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_leave_fully_approved',
     'Leave - Fully Approved Logger',
     'Log side-effect when both approvals granted.',
     'Leave Management', 'record-action', 'Edit', 'matching',
     '[{"field":"fld_leave_hr_approval","operator":"is","value":"APPROVED"}]'::jsonb,
     '[{"type":"Function","functionId":"fn_hr_leave_apply_status","functionName":"HR: Apply Leave Status on Approval"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== HOLIDAY LIST =====
    ('wfr_hr_holiday_count',
     'Holiday - Default Count',
     'Default Total Holidays to 1 if blank.',
     'Holiday List', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_holiday_count","functionName":"HR: Holiday Count"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== STAFFING PLAN =====
    ('wfr_hr_staff_total_cost',
     'Staffing - Total Estimated Cost',
     'Compute Total Estimated Cost on Create or Edit.',
     'Staffing Plan', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_staff_total_cost","functionName":"HR: Compute Staffing Total Cost"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== JOB OPENING =====
    ('wfr_hr_opening_filled_close',
     'Job Opening - Filled closes record',
     'Once all vacancies filled, set status to CLOSED via admin edit (manual trigger example).',
     'Job Opening', 'record-action', 'Edit', 'matching',
     '[{"field":"fld_open_status","operator":"is","value":"FILLED"}]'::jsonb,
     '[{"type":"Field Update","targetFieldId":"fld_open_publish","targetValue":"false"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== JOB APPLICATION =====
    ('wfr_hr_app_copy_desc',
     'Job Application - Copy JD from Opening',
     'Copy the openings Job Description into the application (for candidate record).',
     'Job Application', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_job_app_copy_desc","functionName":"HR: Copy Job Description from Opening"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_app_hired_status',
     'Job Application - Hired sets rating 5',
     'When applicant status = HIRED, stamp rating 5 for audit.',
     'Job Application', 'record-action', 'Edit', 'matching',
     '[{"field":"fld_app_status","operator":"is","value":"HIRED"}]'::jsonb,
     '[{"type":"Field Update","targetFieldId":"fld_app_rating","targetValue":"5"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_app_rejected_note',
     'Job Application - Rejected cleans rating',
     'When applicant rejected, clear rating to 0.',
     'Job Application', 'record-action', 'Edit', 'matching',
     '[{"field":"fld_app_status","operator":"is","value":"REJECTED"}]'::jsonb,
     '[{"type":"Field Update","targetFieldId":"fld_app_rating","targetValue":"0"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== JOB OFFER =====
    ('wfr_hr_offer_create',
     'Job Offer - Defaults + Populate from Application',
     'On Offer Create or Edit, stamp Offer Date / Status defaults and pull Applicant Name / Email / Mobile from the linked Job Application.',
     'Job Offer', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_offer_populate","functionName":"HR: Offer Populate from Application"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_offer_accepted',
     'Job Offer - Accepted triggers Appointment Letter',
     'When Offer is ACCEPTED, stamp the term text and auto-create an Appointment Letter for the applicant.',
     'Job Offer', 'record-action', 'Edit', 'matching',
     '[{"field":"fld_offer_status","operator":"is","value":"ACCEPTED"}]'::jsonb,
     '[{"type":"Field Update","targetFieldId":"fld_offer_term","targetValue":"Accepted by applicant"},{"type":"Function","functionId":"fn_hr_appt_create_from_offer","functionName":"HR: Create Appointment Letter from Offer"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== PERFORMANCE APPRAISAL =====
    ('wfr_hr_appraisal_score',
     'Appraisal - Compute Score Earned',
     'Compute Score Earned on every Create or Edit.',
     'Performance Appraisal', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_appraisal_score","functionName":"HR: Compute Appraisal Score Earned"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== SELF TARGET =====
    ('wfr_hr_tgt_default_points',
     'Self Target - Default Points',
     'Award default 50 engagement points when target is set.',
     'Self Target', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_suggestion_points","functionName":"HR: Suggestion / Initiative Points"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== SELF INITIATIVE =====
    ('wfr_hr_init_default_points',
     'Self Initiative - Default Points',
     'Award default 40 engagement points when an initiative is defined.',
     'Self Initiative', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_suggestion_points","functionName":"HR: Suggestion / Initiative Points"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== PROBLEM REGISTRATION =====
    ('wfr_hr_prob_default_points',
     'Problem - Default Points',
     'Award 30 engagement points when a problem is registered.',
     'Problem Registration', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_problem_points","functionName":"HR: Problem Registration Points"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== KAIZEN =====
    ('wfr_hr_kaizen_points',
     'Kaizen - Area-based Points',
     'Award engagement points based on Kaizen Area (Safety=100, Quality=80, ...).',
     'Kaizen', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_kaizen_points","functionName":"HR: Kaizen Engagement Points"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== EMPLOYEE SUGGESTION =====
    ('wfr_hr_sug_default_points',
     'Suggestion - Default Points',
     'Award 20 engagement points when suggestion submitted.',
     'Employee Suggestion', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_suggestion_points","functionName":"HR: Suggestion / Initiative Points"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== ASSET MANAGEMENT =====
    ('wfr_hr_asset_auto_status',
     'Asset - Auto Status on Assignment',
     'Asset status flips ASSIGNED / IN_STOCK based on Employee ID.',
     'Asset Management', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_asset_auto_status","functionName":"HR: Asset Auto-Assign Status"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_asset_lost',
     'Asset - Lost clears assignment',
     'When Asset Status becomes LOST, clear the Employee assignment.',
     'Asset Management', 'record-action', 'Edit', 'matching',
     '[{"field":"fld_asset_status","operator":"is","value":"LOST"}]'::jsonb,
     '[{"type":"Field Update","targetFieldId":"fld_asset_employee_id","targetValue":""}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- ===== SIM MANAGEMENT =====
    ('wfr_hr_sim_auto_status',
     'SIM - Auto Status on Assignment',
     'SIM status flips ACTIVE / INACTIVE based on Employee ID.',
     'SIM Management', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_sim_auto_status","functionName":"HR: SIM Auto-Assign Status"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_sim_lost_block',
     'SIM - Lost auto-blocks',
     'When SIM Status is LOST, re-stamp to BLOCKED for carrier.',
     'SIM Management', 'record-action', 'Edit', 'matching',
     '[{"field":"fld_sim_status","operator":"is","value":"LOST"}]'::jsonb,
     '[{"type":"Field Update","targetFieldId":"fld_sim_status","targetValue":"BLOCKED"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- =========================================================================
    -- PHASE 1 RECRUITMENT PIPELINE RULES
    -- Forward-chain: F6 -> F7 -> F8 -> F9 -> F10 -> F1, plus F11 -> F8.
    -- These wire the new fn_hr_*_fill_from_* and fn_hr_*_create_from_*
    -- functions onto record-action triggers.
    -- =========================================================================
    ('wfr_hr_opening_fill_from_plan',
     'Job Opening - Fill from Staffing Plan',
     'On Job Opening Create or Edit, look up the linked Staffing Plan and auto-fill Profile Name, Company, Department, Designation, Employment Type, No. of Vacancies (only when blank).',
     'Job Opening', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_opening_fill_from_plan","functionName":"HR: Fill Job Opening from Staffing Plan"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_app_fill_from_opening',
     'Job Application - Fill from Job Opening',
     'On Job Application Create or Edit, look up the linked Job Opening and auto-fill Department, Designation, Employment Type, Job Description (only when blank).',
     'Job Application', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_app_fill_from_opening","functionName":"HR: Fill Job Application from Opening"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_appt_to_employee',
     'Appointment Letter - Auto-create Employee Master',
     'When an Appointment Letter is created (the candidate has been onboarded), auto-create the Employee Master record. Pulls dept/designation/email/mobile from the matching Job Application.',
     'Appointment Letter', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_emp_create_from_appt","functionName":"HR: Create Employee Master from Appointment Letter"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_referral_to_application',
     'Employee Referral - Auto-create Job Application',
     'When an Employee Referral is created, auto-create a corresponding Job Application with Source = REFERRAL.',
     'Employee Referral', 'record-action', 'Create', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_referral_create_application","functionName":"HR: Create Job Application from Referral"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    -- =========================================================================
    -- EMPLOYEE LOOKUP SAFETY-NET RULES
    -- Server-side backstop for the onFieldChange bindings. Fire on every
    -- Create OR Edit in each auto-fill module. The server reads the saved
    -- record, looks up Employee Master by Employee ID (fuzzy match), and
    -- writes First Name / Last Name / Department into the record - so even
    -- when the live debounced auto-fill misses, saving ALWAYS populates.
    -- =========================================================================
    ('wfr_hr_autofill_attendance',
     'Attendance - Auto-Fill Employee Info',
     'On Check In / Check Out save, populate First/Last Name & Department from Employee Master.',
     'Attendance', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_lookup_employee","functionName":"HR: Lookup Employee by ID"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_autofill_leave',
     'Leave - Auto-Fill Employee Info',
     'On Leave Application save, populate First/Last Name & Department from Employee Master.',
     'Leave Management', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_lookup_employee","functionName":"HR: Lookup Employee by ID"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_autofill_ref',
     'Referral - Auto-Fill Referrer Info',
     'On Employee Referral save, populate referrer First Name & Department from Employee Master.',
     'Employee Referral', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_lookup_employee","functionName":"HR: Lookup Employee by ID"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_autofill_tgt',
     'Self Target - Auto-Fill Employee Info',
     'On Self Target save, populate First/Last Name & Department from Employee Master.',
     'Self Target', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_lookup_employee","functionName":"HR: Lookup Employee by ID"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_autofill_init',
     'Self Initiative - Auto-Fill Employee Info',
     'On Self Initiative save, populate First/Last Name & Department from Employee Master.',
     'Self Initiative', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_lookup_employee","functionName":"HR: Lookup Employee by ID"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_autofill_prob',
     'Problem Registration - Auto-Fill Employee Info',
     'On Problem Registration save, populate First/Last Name & Department from Employee Master.',
     'Problem Registration', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_lookup_employee","functionName":"HR: Lookup Employee by ID"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_autofill_kz',
     'Kaizen - Auto-Fill Employee Info',
     'On Kaizen save, populate First/Middle/Last Name & Department from Employee Master.',
     'Kaizen', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_lookup_employee","functionName":"HR: Lookup Employee by ID"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_autofill_sug',
     'Employee Suggestion - Auto-Fill Employee Info',
     'On Suggestion save, populate First/Middle/Last Name & Department from Employee Master.',
     'Employee Suggestion', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_lookup_employee","functionName":"HR: Lookup Employee by ID"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_autofill_asset',
     'Asset Management - Auto-Fill Employee Info',
     'On Asset Management save, populate assignees First/Last Name & Department from Employee Master.',
     'Asset Management', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_lookup_employee","functionName":"HR: Lookup Employee by ID"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW()),

    ('wfr_hr_autofill_sim',
     'SIM Management - Auto-Fill Employee Info',
     'On SIM Management save, populate assignees First/Last Name & Department from Employee Master.',
     'SIM Management', 'record-action', 'Create or Edit', 'all', NULL,
     '[{"type":"Function","functionId":"fn_hr_lookup_employee","functionName":"HR: Lookup Employee by ID"}]'::jsonb,
     TRUE, v_org_id, v_user_id, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        module_name = EXCLUDED.module_name,
        execute_based_on = EXCLUDED.execute_based_on,
        record_action = EXCLUDED.record_action,
        condition_type = EXCLUDED.condition_type,
        conditions = EXCLUDED.conditions,
        instant_actions = EXCLUDED.instant_actions,
        active = EXCLUDED.active,
        organization_id = EXCLUDED.organization_id,
        created_by_id = EXCLUDED.created_by_id,
        updated_at = NOW();

    RAISE NOTICE 'Seeded 40 HR workflow rules (30 module + 10 autofill safety-net)';

    -- =========================================================================
    -- STEP 4 - FUNCTION BINDINGS
    -- Wires functions directly to forms/fields on specific events. Use this
    -- for interactive UX (field-level calc) vs WorkflowRule (record-level).
    -- Events: onFieldChange | onFieldBlur | beforeSubmit | afterCreate | afterUpdate | manual
    -- =========================================================================
    INSERT INTO function_bindings (
        id, function_id, form_id, field_id, module_id,
        event, input_mapping, output_mapping, condition,
        active, "order", organization_id, created_at, updated_at
    ) VALUES

    -- Leave Application: live-calc total days on end-date blur
    ('fb_hr_leave_calc_blur_end',
     'fn_hr_leave_calc_days',
     'form_hr_leave_application', 'fld_leave_end_date', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 10, v_org_id, NOW(), NOW()),

    ('fb_hr_leave_calc_blur_start',
     'fn_hr_leave_calc_days',
     'form_hr_leave_application', 'fld_leave_start_date', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 20, v_org_id, NOW(), NOW()),

    -- Staffing Plan: live-calc total cost on vacancies/cost-per-person blur
    ('fb_hr_staff_cost_vac',
     'fn_hr_staff_total_cost',
     'form_hr_staffing_plan', 'fld_staff_vacancies', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 10, v_org_id, NOW(), NOW()),

    ('fb_hr_staff_cost_per',
     'fn_hr_staff_total_cost',
     'form_hr_staffing_plan', 'fld_staff_cost_per', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 20, v_org_id, NOW(), NOW()),

    -- Performance Appraisal: live-calc score earned
    ('fb_hr_apr_score_w',
     'fn_hr_appraisal_score',
     'form_hr_performance_appraisal', 'fld_apr_weightage', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 10, v_org_id, NOW(), NOW()),

    ('fb_hr_apr_score_s',
     'fn_hr_appraisal_score',
     'form_hr_performance_appraisal', 'fld_apr_score', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 20, v_org_id, NOW(), NOW()),

    -- Asset Management: flip status when employee_id changes
    ('fb_hr_asset_status_emp',
     'fn_hr_asset_auto_status',
     'form_hr_asset_management', 'fld_asset_employee_id', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 10, v_org_id, NOW(), NOW()),

    -- SIM Management: flip status when employee_id changes
    ('fb_hr_sim_status_emp',
     'fn_hr_sim_auto_status',
     'form_hr_sim_management', 'fld_sim_employee_id', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 10, v_org_id, NOW(), NOW()),

    -- Kaizen: set points when area selected
    ('fb_hr_kaizen_points_area',
     'fn_hr_kaizen_points',
     'form_hr_kaizen', 'fld_kz_area', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 10, v_org_id, NOW(), NOW()),

    -- Employee Master: before submit, stamp defaults for missing fields
    ('fb_hr_emp_onboard_before',
     'fn_hr_employee_onboarding',
     'form_hr_employee_master', NULL, NULL,
     'beforeSubmit',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 10, v_org_id, NOW(), NOW()),

    -- Job Application: copy JD from opening before submit
    ('fb_hr_app_copy_desc_before',
     'fn_hr_job_app_copy_desc',
     'form_hr_job_application', NULL, NULL,
     'beforeSubmit',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 10, v_org_id, NOW(), NOW()),

    -- Job Offer: on create, populate defaults
    ('fb_hr_offer_populate_before',
     'fn_hr_offer_populate',
     'form_hr_job_offer', NULL, NULL,
     'beforeSubmit',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 10, v_org_id, NOW(), NOW()),

    -- Phase 1 Recruitment Pipeline: live onFieldChange auto-fill
    -- Job Opening: when New Staffing Plan ID is picked, multi-field fill
    ('fb_hr_open_fill_plan',
     'fn_hr_opening_fill_from_plan',
     'form_hr_job_opening', 'fld_open_plan_id', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 5, v_org_id, NOW(), NOW()),

    -- Job Application: when New Job Opening ID is picked, multi-field fill
    ('fb_hr_app_fill_open',
     'fn_hr_app_fill_from_opening',
     'form_hr_job_application', 'fld_app_opening_id', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 5, v_org_id, NOW(), NOW()),

    -- Job Offer: when New Job Opening ID is picked, pull applicant info
    ('fb_hr_offer_fill_open',
     'fn_hr_offer_populate',
     'form_hr_job_offer', 'fld_offer_opening_id', NULL,
     'onFieldChange',
     '{}'::jsonb, '{}'::jsonb, NULL,
     TRUE, 5, v_org_id, NOW(), NOW())
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

    -- =========================================================================
    -- STEP 4b - EMPLOYEE AUTO-FILL BINDINGS
    -- One function, one binding per form. Event is 'onFieldChange' (NOT
    -- onFieldBlur) - that's what the in-page <FunctionBindingRunner> listens
    -- for; onFieldBlur is loaded but never dispatched by the client runtime.
    -- The runner debounces 300ms so auto-fill fires once the user pauses
    -- typing a complete Employee ID.
    -- outputMapping is '{}'::jsonb so the runner's auto-output-mode matches
    -- the functions return keys ("First Name", "Last Name", "Department")
    -- against the current forms field labels and writes them back.
    -- =========================================================================
    INSERT INTO function_bindings (
        id, function_id, form_id, field_id, module_id,
        event, input_mapping, output_mapping, condition,
        active, "order", organization_id, created_at, updated_at
    ) VALUES
        ('fb_hr_autofill_ci',
         'fn_hr_lookup_employee', 'form_hr_checkin',              'fld_ci_employee_id',    NULL,
         'onFieldChange', '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 5, v_org_id, NOW(), NOW()),

        ('fb_hr_autofill_leave',
         'fn_hr_lookup_employee', 'form_hr_leave_application',    'fld_leave_employee_id', NULL,
         'onFieldChange', '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 5, v_org_id, NOW(), NOW()),

        ('fb_hr_autofill_ref',
         'fn_hr_lookup_employee', 'form_hr_employee_referral',    'fld_ref_employee_id',   NULL,
         'onFieldChange', '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 5, v_org_id, NOW(), NOW()),

        ('fb_hr_autofill_tgt',
         'fn_hr_lookup_employee', 'form_hr_self_target',          'fld_tgt_employee_id',   NULL,
         'onFieldChange', '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 5, v_org_id, NOW(), NOW()),

        ('fb_hr_autofill_init',
         'fn_hr_lookup_employee', 'form_hr_self_initiative',      'fld_init_employee_id',  NULL,
         'onFieldChange', '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 5, v_org_id, NOW(), NOW()),

        ('fb_hr_autofill_prob',
         'fn_hr_lookup_employee', 'form_hr_problem_registration', 'fld_prob_employee_id',  NULL,
         'onFieldChange', '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 5, v_org_id, NOW(), NOW()),

        ('fb_hr_autofill_kz',
         'fn_hr_lookup_employee', 'form_hr_kaizen',               'fld_kz_employee_id',    NULL,
         'onFieldChange', '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 5, v_org_id, NOW(), NOW()),

        ('fb_hr_autofill_sug',
         'fn_hr_lookup_employee', 'form_hr_employee_suggestion',  'fld_sug_employee_id',   NULL,
         'onFieldChange', '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 5, v_org_id, NOW(), NOW()),

        ('fb_hr_autofill_asset',
         'fn_hr_lookup_employee', 'form_hr_asset_management',     'fld_asset_employee_id', NULL,
         'onFieldChange', '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 5, v_org_id, NOW(), NOW()),

        ('fb_hr_autofill_sim',
         'fn_hr_lookup_employee', 'form_hr_sim_management',       'fld_sim_employee_id',   NULL,
         'onFieldChange', '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 5, v_org_id, NOW(), NOW())
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

    RAISE NOTICE 'Seeded 25 HR function bindings (15 calc + 10 employee auto-fill)';

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'HR automations ready.';
    RAISE NOTICE '  Functions:         21 (15 automation + 5 recruitment pipeline + 1 employee lookup)';
    RAISE NOTICE '  Workflow Rules:    40 (30 module + 10 autofill safety-net)';
    RAISE NOTICE '  Function Bindings: 25 (15 calc + 10 employee auto-fill)';
    RAISE NOTICE '==========================================';
END $$;



-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- All HR functions:
--   SELECT id, display_name, category, associated, rest_api
--     FROM crm_functions
--    WHERE id LIKE 'fn_hr_%'
--    ORDER BY id;
--
-- All HR workflow rules by module:
--   SELECT module_name, name, record_action, condition_type,
--          jsonb_array_length(COALESCE(conditions,'[]'::jsonb)) AS conditions_count,
--          jsonb_array_length(COALESCE(instant_actions,'[]'::jsonb)) AS actions_count,
--          active
--     FROM workflow_rules
--    WHERE id LIKE 'wfr_hr_%'
--    ORDER BY module_name, name;
--
-- All HR function bindings:
--   SELECT fb.id, cf.display_name AS function, fb.event,
--          f.name AS form, fld.label AS field
--     FROM function_bindings fb
--     JOIN crm_functions cf ON cf.id = fb.function_id
--     LEFT JOIN forms f    ON f.id = fb.form_id
--     LEFT JOIN form_fields fld ON fld.id = fb.field_id
--    WHERE fb.id LIKE 'fb_hr_%'
--    ORDER BY f.name, fld.label;
--
-- To watch automations fire in real-time, tail the server logs and submit
-- records via the HR forms - lib/workflow/trigger.ts logs each rule firing.


-- =============================================================================
-- PART 3/4 - RECRUITMENT PIPELINE PATCH
-- auto-numbered IDs across recruitment forms
-- Source: scripts/patch-hr-recruitment-pipeline.sql
-- =============================================================================

DO $$
DECLARE
    v_org_id  TEXT := 'cmojv2bpr000hu700t3jrj0vq';
    v_user_id TEXT := 'cmojv15ct000cu700xrgwrbe8';
    v_open_id_existed       BOOLEAN;
    v_app_id_existed        BOOLEAN;
    v_offer_id_existed      BOOLEAN;
    v_appt_id_existed       BOOLEAN;
    v_ref_id_existed        BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id) THEN
        RAISE EXCEPTION 'Organization % does not exist - aborting.', v_org_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM form_modules WHERE id = 'mod_hr_root' AND organization_id = v_org_id) THEN
        RAISE EXCEPTION 'HR module not bootstrapped - run scripts/create-hr-module.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM crm_functions WHERE id = 'fn_hr_emp_create_from_appt') THEN
        RAISE EXCEPTION 'HR automations not bootstrapped - run scripts/create-hr-automations.sql first.';
    END IF;

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Applying recruitment pipeline patches';
    RAISE NOTICE '==========================================';

    -- =========================================================================
    -- PATCH #4 (run first - patches #3 reference these new fields)
    -- Add own auto-numbered ID fields to Forms 7, 8, 9, 10, 11.
    -- =========================================================================

    -- Detect first-run state per form so the order-bump only happens once.
    SELECT EXISTS(SELECT 1 FROM form_fields WHERE id = 'fld_open_id')  INTO v_open_id_existed;
    SELECT EXISTS(SELECT 1 FROM form_fields WHERE id = 'fld_app_id')   INTO v_app_id_existed;
    SELECT EXISTS(SELECT 1 FROM form_fields WHERE id = 'fld_offer_id') INTO v_offer_id_existed;
    SELECT EXISTS(SELECT 1 FROM form_fields WHERE id = 'fld_appt_id')  INTO v_appt_id_existed;
    SELECT EXISTS(SELECT 1 FROM form_fields WHERE id = 'fld_ref_id')   INTO v_ref_id_existed;

    -- Bump existing field orders by 1 to make room for the new ID at order=0.
    -- Only on first run; ON CONFLICT keeps subsequent runs idempotent.
    IF NOT v_open_id_existed THEN
        UPDATE form_fields SET "order" = "order" + 1 WHERE section_id = 'sec_open_main';
    END IF;
    IF NOT v_app_id_existed THEN
        UPDATE form_fields SET "order" = "order" + 1 WHERE section_id IN ('sec_app_candidate','sec_app_status');
    END IF;
    IF NOT v_offer_id_existed THEN
        UPDATE form_fields SET "order" = "order" + 1 WHERE section_id = 'sec_offer_main';
    END IF;
    IF NOT v_appt_id_existed THEN
        UPDATE form_fields SET "order" = "order" + 1 WHERE section_id = 'sec_appt_main';
    END IF;
    IF NOT v_ref_id_existed THEN
        UPDATE form_fields SET "order" = "order" + 1 WHERE section_id = 'sec_ref_main';
    END IF;

    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_open_id',  'sec_open_main',     'text', 'Job Opening ID',        'e.g. JO-0001', 'Auto-generated', NULL, '[]'::jsonb, FALSE, '{"required":true,"unique":true}'::jsonb, TRUE, TRUE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_app_id',   'sec_app_candidate', 'text', 'Job Application ID',    'e.g. JA-0001', 'Auto-generated', NULL, '[]'::jsonb, FALSE, '{"required":true,"unique":true}'::jsonb, TRUE, TRUE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_offer_id', 'sec_offer_main',    'text', 'Job Offer ID',          'e.g. OF-0001', 'Auto-generated', NULL, '[]'::jsonb, FALSE, '{"required":true,"unique":true}'::jsonb, TRUE, TRUE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_appt_id',  'sec_appt_main',     'text', 'Appointment Letter ID', 'e.g. AL-0001', 'Auto-generated', NULL, '[]'::jsonb, FALSE, '{"required":true,"unique":true}'::jsonb, TRUE, TRUE, 'half', 0, TRUE, NOW(), NOW()),
        ('fld_ref_id',   'sec_ref_main',      'text', 'Referral ID',           'e.g. ER-0001', 'Auto-generated', NULL, '[]'::jsonb, FALSE, '{"required":true,"unique":true}'::jsonb, TRUE, TRUE, 'half', 0, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        readonly = EXCLUDED.readonly,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- Auto-number counters. The /api/generate-unique-id/[fieldId] endpoint
    -- atomically increments these and pads to the configured digit width.
    INSERT INTO unique_id_counters (id, "fieldId", "lastNumber", "createdAt", "updatedAt") VALUES
        ('uc_open',  'fld_open_id',  0, NOW(), NOW()),
        ('uc_app',   'fld_app_id',   0, NOW(), NOW()),
        ('uc_offer', 'fld_offer_id', 0, NOW(), NOW()),
        ('uc_appt',  'fld_appt_id',  0, NOW(), NOW()),
        ('uc_ref',   'fld_ref_id',   0, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Patch #4 applied: 5 ID fields + 5 unique_id_counters seeded.';

    -- =========================================================================
    -- PATCH #1 - Form 11 referrer Employee ID -> true lookup
    -- =========================================================================
    UPDATE form_fields
       SET type        = 'lookup',
           description = 'Referring employee (lookup from Employee Master)',
           updated_at  = NOW()
     WHERE id = 'fld_ref_employee_id';

    INSERT INTO lookup_field_relations (
        id, lookup_source_id, form_field_id, form_id, module_id,
        display_field, value_field, multiple, searchable, filters,
        created_at, updated_at
    ) VALUES
        ('lkr_ref_employee', 'lks_hr_employees', 'fld_ref_employee_id',
         'form_hr_employee_referral', 'mod_hrrec_ref',
         'fld_emp_first_name', 'fld_emp_employee_id',
         FALSE, TRUE, '{}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        lookup_source_id = EXCLUDED.lookup_source_id,
        form_field_id    = EXCLUDED.form_field_id,
        form_id          = EXCLUDED.form_id,
        module_id        = EXCLUDED.module_id,
        display_field    = EXCLUDED.display_field,
        value_field      = EXCLUDED.value_field,
        multiple         = EXCLUDED.multiple,
        searchable       = EXCLUDED.searchable,
        filters          = EXCLUDED.filters,
        updated_at       = NOW();

    RAISE NOTICE 'Patch #1 applied: Form 11 referrer is now a true lookup.';

    -- =========================================================================
    -- PATCH #2 - Appointment Letter sign-off fields
    -- =========================================================================
    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_appt_signed',      'sec_appt_main', 'checkbox', 'Signed',      NULL, 'Tick when the candidate signs the appointment letter', 'false', '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 20, TRUE,  NOW(), NOW()),
        ('fld_appt_signed_date', 'sec_appt_main', 'date',     'Signed Date', NULL, 'Date the candidate signed the letter',                NULL,    '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 21, FALSE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    -- Re-gate the Appointment Letter -> Employee Master rule so it fires only
    -- when the letter is marked Signed (Create OR Edit, conditional).
    UPDATE workflow_rules
       SET name           = 'Appointment Letter - Employee Master on Sign',
           description    = 'When an Appointment Letter is marked Signed, auto-create the Employee Master record. Pulls dept/designation/email/mobile from the linked Job Application (FK preferred, name-match fallback). Idempotent.',
           record_action  = 'Create or Edit',
           condition_type = 'matching',
           conditions     = '[{"field":"fld_appt_signed","operator":"is","value":"true"}]'::jsonb,
           updated_at     = NOW()
     WHERE id = 'wfr_hr_appt_to_employee';

    RAISE NOTICE 'Patch #2 applied: Form 10 sign-off fields added; handoff gated on Signed=true.';

    -- =========================================================================
    -- PATCH #3 - Explicit FK lookups for Job Application
    -- =========================================================================
    INSERT INTO lookup_sources (id, name, type, description, source_module_id, source_form_id, active, created_at, updated_at) VALUES
        ('lks_job_applications', 'HR Job Applications', 'form', 'All records from Job Application',
         'mod_hrrec_app', 'form_hr_job_application', TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, type = EXCLUDED.type,
        description = EXCLUDED.description,
        source_module_id = EXCLUDED.source_module_id,
        source_form_id = EXCLUDED.source_form_id,
        active = EXCLUDED.active, updated_at = NOW();

    INSERT INTO form_fields (
        id, section_id, type, label, placeholder, description, default_value,
        options, is_dependent, validation, visible, readonly, width, "order",
        is_indexed, created_at, updated_at
    ) VALUES
        ('fld_offer_application_id', 'sec_offer_main', 'lookup', 'Job Application ID',     NULL, 'Linked Job Application (FK)', NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 22, TRUE, NOW(), NOW()),
        ('fld_appt_application_id',  'sec_appt_main',  'lookup', 'Job Application ID',     NULL, 'Linked Job Application (FK)', NULL, '[]'::jsonb, FALSE, '{}'::jsonb, TRUE, FALSE, 'half', 22, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        section_id = EXCLUDED.section_id, type = EXCLUDED.type, label = EXCLUDED.label,
        placeholder = EXCLUDED.placeholder, description = EXCLUDED.description,
        default_value = EXCLUDED.default_value, options = EXCLUDED.options,
        validation = EXCLUDED.validation, width = EXCLUDED.width,
        "order" = EXCLUDED."order", is_indexed = EXCLUDED.is_indexed, updated_at = NOW();

    INSERT INTO lookup_field_relations (
        id, lookup_source_id, form_field_id, form_id, module_id,
        display_field, value_field, multiple, searchable, filters,
        created_at, updated_at
    ) VALUES
        ('lkr_offer_app', 'lks_job_applications', 'fld_offer_application_id',
         'form_hr_job_offer', 'mod_hrrec_offer',
         'fld_app_name', 'fld_app_id',
         FALSE, TRUE, '{}'::jsonb, NOW(), NOW()),
        ('lkr_appt_app',  'lks_job_applications', 'fld_appt_application_id',
         'form_hr_appointment_letter', 'mod_hrrec_appt',
         'fld_app_name', 'fld_app_id',
         FALSE, TRUE, '{}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        lookup_source_id = EXCLUDED.lookup_source_id,
        form_field_id    = EXCLUDED.form_field_id,
        form_id          = EXCLUDED.form_id,
        module_id        = EXCLUDED.module_id,
        display_field    = EXCLUDED.display_field,
        value_field      = EXCLUDED.value_field,
        multiple         = EXCLUDED.multiple,
        searchable       = EXCLUDED.searchable,
        filters          = EXCLUDED.filters,
        updated_at       = NOW();

    -- Rewrite fn_hr_appt_create_from_offer: propagate fld_offer_application_id
    -- onto the new appointment letter so the FK chain is preserved.
    UPDATE crm_functions
       SET script = $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const norm = (s) => String(s == null ? '' : s).trim().toUpperCase();

const status = norm(get('fld_offer_status'));
if (status !== 'ACCEPTED') return { ok: true, skipped: 'status not ACCEPTED' };

const applicantName = String(get('fld_offer_name') || '').trim();
if (!applicantName) return { ok: false, reason: 'offer has no applicant name' };

// Idempotency: skip if an Appointment Letter already exists for this applicant.
const existing = await ctx.records.list('Appointment Letter', { limit: 500 });
const dup = existing.find(function (r) {
  var d = (r && r.data) || {};
  return norm(d['Job Applicant Name']) === norm(applicantName);
});
if (dup) return { ok: true, alreadyExists: dup.id };

// Default appointment date = Offer Date + 14, fallback today + 14.
var offerDate = get('fld_offer_date');
var base = offerDate ? new Date(offerDate) : new Date();
if (isNaN(base.getTime())) base = new Date();
base.setDate(base.getDate() + 14);
var apptDate = base.toISOString().slice(0, 10);

// Pull Company from the Staffing Plan if available.
var company = '';
var planKey = norm(get('fld_offer_plan_id'));
if (planKey) {
  var plans = await ctx.records.list('Staffing Plan', { limit: 500 });
  var planRow = plans.find(function (r) {
    var d = (r && r.data) || {};
    return norm(d['New Staffing Plan ID']) === planKey;
  });
  if (planRow && planRow.data && planRow.data['Company']) company = planRow.data['Company'];
}

var payload = {
  'Job Applicant Name': applicantName,
  'Appointment Date':   apptDate,
  'Signed':             false,
};
if (company) payload['Company'] = company;

// PATCH #3: propagate the Job Application FK if the offer carries it.
var appFk = String(get('fld_offer_application_id') || '').trim();
if (appFk) payload['Job Application ID'] = appFk;

try {
  var created = await ctx.records.create('Appointment Letter', payload);
  return { ok: true, createdId: created.id };
} catch (e) {
  return { ok: false, reason: 'create failed: ' + (e && e.message ? e.message : String(e)) };
}
$js$,
           updated_at = NOW()
     WHERE id = 'fn_hr_appt_create_from_offer';

    -- Rewrite fn_hr_emp_create_from_appt: gate on Signed=true, prefer the FK
    -- match on fld_appt_application_id, fall back to applicant name match
    -- for legacy records that pre-date the FK column.
    UPDATE crm_functions
       SET description = 'When an Appointment Letter is marked Signed, auto-create the Employee Master record. Pulls First/Last Name from the appointment, Department/Designation/Employment Type/Email/Mobile from the linked Job Application (FK preferred, name-match fallback), generates a sequential Employee ID. Idempotent.',
           script = $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const norm = (s) => String(s == null ? '' : s).trim().toUpperCase();
const truthy = (v) => {
  if (v === true) return true;
  if (v === false || v == null) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'on';
};

// PATCH #2: gate strictly on signed=true. The workflow rule already filters
// at the trigger layer; this is defence-in-depth so the function is also
// safe to invoke directly.
if (!truthy(get('fld_appt_signed'))) {
  return { ok: true, skipped: 'appointment not signed' };
}

const applicantName = String(get('fld_appt_applicant') || '').trim();
if (!applicantName) return { ok: false, reason: 'no applicant name' };

const apptDate = String(get('fld_appt_signed_date') || get('fld_appt_date') || '').trim() || new Date().toISOString().slice(0, 10);
const company  = String(get('fld_appt_company') || '').trim();

// Parse "First Middle Last" into firstName + lastName.
var nameParts = applicantName.split(/\s+/).filter(Boolean);
var firstName = nameParts.shift() || applicantName;
var lastName  = nameParts.length ? nameParts.join(' ') : firstName;

// Idempotency: matching first+last already exists?
const employees = await ctx.records.list('Employee Master', { limit: 500 });
const empDup = employees.find(function (r) {
  var d = (r && r.data) || {};
  return norm(d['First Name']) === norm(firstName) && norm(d['Last Name']) === norm(lastName);
});
if (empDup) return { ok: true, alreadyExists: empDup.id };

// PATCH #3: prefer the FK link to Job Application.
var applicationData = {};
const apps = await ctx.records.list('Job Application', { limit: 500 });
const appFk = String(get('fld_appt_application_id') || '').trim();

var appMatch = null;
if (appFk) {
  appMatch = apps.find(function (r) {
    var d = (r && r.data) || {};
    return norm(d['Job Application ID']) === norm(appFk);
  });
}
if (!appMatch) {
  // Fallback: legacy records linked only by applicant name.
  appMatch = apps.find(function (r) {
    var d = (r && r.data) || {};
    return norm(d['Applicant Name']) === norm(applicantName);
  });
}
if (appMatch && appMatch.data) applicationData = appMatch.data;

// Generate sequential Employee ID. Use count() then pad to 4 digits.
var nextSeq = employees.length + 1;
try {
  var c = await ctx.records.count('Employee Master');
  if (typeof c === 'number' && c >= 0) nextSeq = c + 1;
} catch (e) { /* fall through */ }
var empId = 'EMP-' + String(nextSeq).padStart(4, '0');

var payload = {
  'Employee ID':         empId,
  'First Name':          firstName,
  'Last Name':           lastName,
  'Status':              'ACTIVE',
  'Date of Joining':     apptDate,
  'Total Working Hours': 8,
  'Nationality':         'Indian',
};
if (company || applicationData['Company']) payload['Company'] = company || applicationData['Company'];
if (applicationData['Department'])         payload['Department']      = applicationData['Department'];
if (applicationData['Designation'])        payload['Designation']     = applicationData['Designation'];
if (applicationData['Employment Type'])    payload['Employment Type'] = applicationData['Employment Type'];
if (applicationData['Applicant Email ID'])      payload['Personal Email'] = applicationData['Applicant Email ID'];
if (applicationData['Applicant Mobile Number']) payload['Cell Number']    = applicationData['Applicant Mobile Number'];

try {
  var created = await ctx.records.create('Employee Master', payload);
  return { ok: true, createdId: created.id, employeeId: empId };
} catch (e) {
  return { ok: false, reason: 'create failed: ' + (e && e.message ? e.message : String(e)) };
}
$js$,
           updated_at = NOW()
     WHERE id = 'fn_hr_emp_create_from_appt';

    RAISE NOTICE 'Patch #3 applied: Job Application FK lookups added; automations now use FK with name-match fallback.';

    -- =========================================================================
    -- PATCH #5 - Status label spec alignment (values unchanged)
    -- =========================================================================
    UPDATE form_fields
       SET options = '[{"label":"New","value":"APPLIED"},{"label":"Screening","value":"SCREENING"},{"label":"Shortlisted","value":"SHORTLISTED"},{"label":"Interview","value":"INTERVIEW"},{"label":"Offer","value":"OFFER"},{"label":"Selected","value":"HIRED"},{"label":"Rejected","value":"REJECTED"},{"label":"On Hold","value":"HOLD"},{"label":"Withdrawn","value":"WITHDRAWN"}]'::jsonb,
           updated_at = NOW()
     WHERE id = 'fld_app_status';

    UPDATE form_fields
       SET options = '[{"label":"Draft","value":"DRAFT"},{"label":"Awaiting Response","value":"SENT"},{"label":"Accepted","value":"ACCEPTED"},{"label":"Rejected","value":"REJECTED"},{"label":"Expired","value":"EXPIRED"},{"label":"Withdrawn","value":"WITHDRAWN"}]'::jsonb,
           updated_at = NOW()
     WHERE id = 'fld_offer_status';

    RAISE NOTICE 'Patch #5 applied: status labels relabeled to spec (stored values unchanged).';

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'All recruitment pipeline patches applied.';
    RAISE NOTICE '==========================================';
END $$;



-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- New ID fields and counters:
--   SELECT f.id, f.label, c."lastNumber"
--     FROM form_fields f
--     LEFT JOIN unique_id_counters c ON c."fieldId" = f.id
--    WHERE f.id IN ('fld_open_id','fld_app_id','fld_offer_id','fld_appt_id','fld_ref_id');
--
-- Form 11 referrer is a true lookup:
--   SELECT id, type FROM form_fields WHERE id = 'fld_ref_employee_id';
--   SELECT * FROM lookup_field_relations WHERE id = 'lkr_ref_employee';
--
-- Appointment-letter sign-off fields:
--   SELECT id, type, label FROM form_fields WHERE id LIKE 'fld_appt_signed%';
--
-- Workflow rule re-gated:
--   SELECT id, record_action, condition_type, conditions
--     FROM workflow_rules WHERE id = 'wfr_hr_appt_to_employee';
--
-- Job Application FK lookups on Forms 9 & 10:
--   SELECT id, form_id, value_field, display_field FROM lookup_field_relations
--    WHERE id IN ('lkr_offer_app','lkr_appt_app');
--
-- Status labels updated:
--   SELECT id, options->0 AS first_option FROM form_fields
--    WHERE id IN ('fld_app_status','fld_offer_status');


-- =============================================================================
-- PART 4/4 - APPOINTMENT->EMPLOYEE HOTFIX
-- Appointment Letter -> Employee Master rule + function fix
-- Source: scripts/hotfix-appt-to-emp.sql
-- =============================================================================

-- =============================================================================
-- HOTFIX: Appointment Letter -> Employee Master automation
-- =============================================================================
-- Two fixes:
--   1. Workflow rule wfr_hr_appt_to_employee was gated on the string "true",
--      but checkbox values are stored as JSON boolean true. Strict equality
--      never matched, so the rule never fired even when Signed was ticked.
--      -> Drop the condition. Fire on every Create OR Edit. The function
--         already has an internal truthy() gate that handles both boolean
--         and string values.
--
--   2. Function fn_hr_emp_create_from_appt only knew about the canonical
--      fld_appt_applicant / fld_appt_company / fld_appt_application_id
--      field ids. The form here uses cuid-based field ids that were created
--      via the form-builder UI:
--          cmojz82n70044u700uebbfxp9 - Job Application ID (lookup)
--          cmojz83cz0046u700hcbdt3t1 - Applicant Name     (lookup)
--          cmojz83vv0048u7005z1rvtpc - Company            (lookup)
--      -> Try canonical id first, then the cuid alias, then scan the linked
--         Job Application record for the value. Idempotent and safe to re-run.
--
-- Safe to re-run.
-- =============================================================================



DO $$
DECLARE
    v_org_id  TEXT := 'cmojv2bpr000hu700t3jrj0vq';
    v_user_id TEXT := 'cmojv15ct000cu700xrgwrbe8';
BEGIN
    -- ---- Fix #1: open the workflow gate -----------------------------------
    UPDATE workflow_rules
       SET name           = 'Appointment Letter - Employee Master on Sign',
           description    = 'On Appointment Letter Create or Edit, run the Employee Master creation function. The function gates internally on Signed=true (handles both boolean and string values), so we let every save trigger it without an SQL-level condition.',
           record_action  = 'Create or Edit',
           condition_type = 'all',
           conditions     = NULL,
           active         = TRUE,
           updated_at     = NOW()
     WHERE id = 'wfr_hr_appt_to_employee';

    RAISE NOTICE 'Workflow rule wfr_hr_appt_to_employee re-opened (no condition).';

    -- ---- Fix #2: rewrite the function to support custom cuid field ids ----
    UPDATE crm_functions
       SET description = 'When an Appointment Letter is marked Signed, auto-create the Employee Master record. Reads applicant info from canonical fld_appt_* ids first, then the cuid aliases used by the live form, then falls back to the linked Job Application record. Idempotent.',
           script = $js$
const data = ctx.input.recordData || {};
const get = (id) => {
  const flat = data[id];
  if (flat !== undefined) return flat && typeof flat === 'object' && 'value' in flat ? flat.value : flat;
  const secs = data.sections || {};
  for (const s of Object.values(secs)) {
    const f = s && s.fields && s.fields[id];
    if (f !== undefined) return f && typeof f === 'object' && 'value' in f ? f.value : f;
  }
  return undefined;
};
const norm = (s) => String(s == null ? '' : s).trim().toUpperCase();
const truthy = (v) => {
  if (v === true) return true;
  if (v === false || v == null) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'on';
};
const firstNonEmpty = (ids) => {
  for (var i = 0; i < ids.length; i++) {
    var v = get(ids[i]);
    if (v != null) {
      var str = String(v).trim();
      if (str) return str;
    }
  }
  return '';
};

// PATCH #2 gate: only proceed when the candidate has signed.
if (!truthy(get('fld_appt_signed'))) {
  return { ok: true, skipped: 'appointment not signed' };
}

// Field-id resolution. Canonical schema ids are tried first; cuid aliases
// (created via the form-builder UI for this org) are tried as a fallback.
var APPLICANT_NAME_IDS = ['fld_appt_applicant', 'cmojz83cz0046u700hcbdt3t1'];
var COMPANY_IDS        = ['fld_appt_company',   'cmojz83vv0048u7005z1rvtpc'];
var APP_FK_IDS         = ['fld_appt_application_id', 'cmojz82n70044u700uebbfxp9'];

var applicantName = firstNonEmpty(APPLICANT_NAME_IDS);
var company       = firstNonEmpty(COMPANY_IDS);
var appFk         = firstNonEmpty(APP_FK_IDS);

// Apparent date: prefer signed date, fall back to appointment date, then today.
var apptDate = firstNonEmpty(['fld_appt_signed_date', 'fld_appt_date'])
            || new Date().toISOString().slice(0, 10);

// Fetch the linked Job Application up front - it's the source of truth for
// dept/designation/email/mobile, and a name fallback if the appointment
// letter didn't carry one.
var applicationData = {};
if (appFk) {
  var apps = await ctx.records.list('Job Application', { limit: 500 });
  var appMatch = apps.find(function (r) {
    if (!r) return false;
    var d = r.data || {};
    // Match by Job Application ID text (JA-0001), record id (cuid/uuid), or
    // applicant name as a last-ditch heuristic.
    return norm(d['Job Application ID']) === norm(appFk)
        || norm(r.id) === norm(appFk)
        || (applicantName && norm(d['Applicant Name']) === norm(applicantName));
  });
  if (appMatch && appMatch.data) applicationData = appMatch.data;
}
// Even without an FK, try the name-match fallback against Job Application.
if (!applicantName && Object.keys(applicationData).length === 0) {
  // nothing to do
} else if (!Object.keys(applicationData).length && applicantName) {
  var apps2 = await ctx.records.list('Job Application', { limit: 500 });
  var nameMatch = apps2.find(function (r) {
    var d = (r && r.data) || {};
    return norm(d['Applicant Name']) === norm(applicantName);
  });
  if (nameMatch && nameMatch.data) applicationData = nameMatch.data;
}
// If applicantName is still empty, lift it from the application.
if (!applicantName && applicationData['Applicant Name']) {
  applicantName = String(applicationData['Applicant Name']).trim();
}
if (!applicantName) {
  return { ok: false, reason: 'no applicant name (none on appointment, none on linked application)' };
}

// Parse "First Middle Last" into firstName + lastName.
var nameParts = applicantName.split(/\s+/).filter(Boolean);
var firstName = nameParts.shift() || applicantName;
var lastName  = nameParts.length ? nameParts.join(' ') : firstName;

// Idempotency: matching first+last already exists?
const employees = await ctx.records.list('Employee Master', { limit: 500 });
const empDup = employees.find(function (r) {
  var d = (r && r.data) || {};
  return norm(d['First Name']) === norm(firstName) && norm(d['Last Name']) === norm(lastName);
});
if (empDup) return { ok: true, alreadyExists: empDup.id };

// Generate sequential Employee ID: EMP-0001, EMP-0002, ...
var nextSeq = employees.length + 1;
try {
  var c = await ctx.records.count('Employee Master');
  if (typeof c === 'number' && c >= 0) nextSeq = c + 1;
} catch (e) { /* fall through */ }
var empId = 'EMP-' + String(nextSeq).padStart(4, '0');

var payload = {
  'Employee ID':         empId,
  'First Name':          firstName,
  'Last Name':           lastName,
  'Status':              'ACTIVE',
  'Date of Joining':     apptDate,
  'Total Working Hours': 8,
  'Nationality':         'Indian',
};
if (company || applicationData['Company']) payload['Company'] = company || applicationData['Company'];
if (applicationData['Department'])         payload['Department']      = applicationData['Department'];
if (applicationData['Designation'])        payload['Designation']     = applicationData['Designation'];
if (applicationData['Employment Type'])    payload['Employment Type'] = applicationData['Employment Type'];
if (applicationData['Applicant Email ID'])      payload['Personal Email'] = applicationData['Applicant Email ID'];
if (applicationData['Applicant Mobile Number']) payload['Cell Number']    = applicationData['Applicant Mobile Number'];

try {
  var created = await ctx.records.create('Employee Master', payload);
  return { ok: true, createdId: created.id, employeeId: empId };
} catch (e) {
  return { ok: false, reason: 'create failed: ' + (e && e.message ? e.message : String(e)) };
}
$js$,
           updated_at = NOW()
     WHERE id = 'fn_hr_emp_create_from_appt';

    RAISE NOTICE 'Function fn_hr_emp_create_from_appt rewritten with cuid-id fallbacks.';

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Hotfix applied. Open the latest Appointment Letter,';
    RAISE NOTICE 're-tick Signed and save. The Employee Master should';
    RAISE NOTICE 'be auto-created.';
    RAISE NOTICE '==========================================';
END $$;



-- =============================================================================
-- VERIFY
-- =============================================================================
-- After running this, open a recent Appointment Letter and re-save it
-- (toggling Signed off and back on, then Save, is enough to fire the rule).
-- Then run:
--
--   SELECT id,
--          record_data->>'Employee ID' AS emp_id,
--          record_data->>'First Name'  AS first_name,
--          record_data->>'Last Name'   AS last_name,
--          created_at
--     FROM form_records_1
--    WHERE form_id = 'form_hr_employee_master'
--    ORDER BY created_at DESC
--    LIMIT 5;
--
-- You should see a freshly-created EMP-XXXX row.

COMMIT;

-- =============================================================================
-- END HR MODULE COMPLETE SETUP
-- =============================================================================