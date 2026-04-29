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

BEGIN;

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

COMMIT;

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
