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

BEGIN;

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

 COMMIT;

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