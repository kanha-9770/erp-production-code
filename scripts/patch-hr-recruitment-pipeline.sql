BEGIN;

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

COMMIT;

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
