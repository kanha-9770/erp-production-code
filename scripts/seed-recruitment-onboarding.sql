-- ─────────────────────────────────────────────────────────────────────
-- Recruitment → Onboarding seed script
-- 5 dummy employees walked through Staffing Plan → Job Opening →
-- Job Application (HIRED) → Job Offer (ACCEPTED) → Appointment Letter
-- → Employee Master.
--
-- Idempotent: re-running updates existing seed rows by stable IDs.
-- Field IDs are discovered at runtime by matching field LABELS, so the
-- script works regardless of how your forms were created.
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- Drop helpers if a previous failed run left them behind
DROP FUNCTION IF EXISTS pg_temp.find_field_id(TEXT, TEXT[]);
DROP FUNCTION IF EXISTS pg_temp.build_record_data(TEXT, JSONB);
DROP FUNCTION IF EXISTS pg_temp.storage_table_for(TEXT);
DROP FUNCTION IF EXISTS pg_temp.insert_record(TEXT, TEXT, JSONB, TEXT, NUMERIC, DATE, TEXT);

-- ─── helper 1: find a field id on a form by label (case-insensitive, fuzzy) ───
CREATE FUNCTION pg_temp.find_field_id(p_form_id TEXT, p_labels TEXT[])
RETURNS TEXT AS $$
DECLARE
  fid TEXT;
  lbl TEXT;
BEGIN
  -- Exact (case-insensitive) match first
  FOREACH lbl IN ARRAY p_labels LOOP
    SELECT ff.id INTO fid
    FROM form_fields ff
    JOIN form_sections fs ON fs.id = ff.section_id
    WHERE fs.form_id = p_form_id
      AND lower(ff.label) = lower(lbl)
    LIMIT 1;
    IF fid IS NOT NULL THEN RETURN fid; END IF;
  END LOOP;

  -- Fuzzy: alphanumeric-only match
  FOREACH lbl IN ARRAY p_labels LOOP
    SELECT ff.id INTO fid
    FROM form_fields ff
    JOIN form_sections fs ON fs.id = ff.section_id
    WHERE fs.form_id = p_form_id
      AND regexp_replace(lower(ff.label), '[^a-z0-9]', '', 'g')
          = regexp_replace(lower(lbl),    '[^a-z0-9]', '', 'g')
    LIMIT 1;
    IF fid IS NOT NULL THEN RETURN fid; END IF;
  END LOOP;

  -- Last resort: partial contains
  FOREACH lbl IN ARRAY p_labels LOOP
    SELECT ff.id INTO fid
    FROM form_fields ff
    JOIN form_sections fs ON fs.id = ff.section_id
    WHERE fs.form_id = p_form_id
      AND lower(ff.label) LIKE '%' || lower(lbl) || '%'
    LIMIT 1;
    IF fid IS NOT NULL THEN RETURN fid; END IF;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─── helper 2: build the structured record_data JSON ───
-- p_values is an array of {"labels": [...], "value": "..."}
-- Stores the CANONICAL shape (matches lib/utils/form-utils.ts transformToStructuredData):
--   { formId, formName, sections: { sid: { fields: { fid: value } } }, subforms: {}, metadata: {...} }
-- Values are stored as native JSON types based on the field's type (number/boolean/string).
CREATE FUNCTION pg_temp.build_record_data(p_form_id TEXT, p_values JSONB)
RETURNS JSONB AS $$
DECLARE
  form_name TEXT;
  sections_obj JSONB := '{}'::jsonb;
  total_sections INT := 0;
  total_fields INT := 0;
  v JSONB;
  fid TEXT;
  sid TEXT;
  ftype TEXT;
  fval TEXT;
  fjson JSONB;
  cur_section JSONB;
  fields_obj JSONB;
BEGIN
  SELECT name INTO form_name FROM forms WHERE id = p_form_id;
  IF form_name IS NULL THEN
    RAISE NOTICE '  ! form % not found, skipping', p_form_id;
    RETURN NULL;
  END IF;

  -- Pre-create all section keys so totalSections matches form_utils
  SELECT COUNT(*) INTO total_sections FROM form_sections WHERE form_id = p_form_id;
  FOR sid IN SELECT id FROM form_sections WHERE form_id = p_form_id LOOP
    sections_obj := sections_obj || jsonb_build_object(sid, jsonb_build_object('fields', '{}'::jsonb));
  END LOOP;

  FOR v IN SELECT * FROM jsonb_array_elements(p_values) LOOP
    -- Accept either a direct fieldId (preferred) or a labels[] for fuzzy lookup
    IF v ? 'fieldId' THEN
      fid := v ->> 'fieldId';
      PERFORM 1 FROM form_fields ff
        JOIN form_sections fs ON fs.id = ff.section_id
        WHERE ff.id = fid AND fs.form_id = p_form_id;
      IF NOT FOUND THEN fid := NULL; END IF;
    ELSE
      fid := pg_temp.find_field_id(
        p_form_id,
        ARRAY(SELECT jsonb_array_elements_text(v->'labels'))
      );
    END IF;
    IF fid IS NULL THEN CONTINUE; END IF;

    SELECT ff.section_id, ff.type
      INTO sid, ftype
    FROM form_fields ff WHERE ff.id = fid;

    IF sid IS NULL THEN CONTINUE; END IF;

    cur_section := COALESCE(sections_obj -> sid, jsonb_build_object('fields', '{}'::jsonb));
    fields_obj  := cur_section -> 'fields';

    fval := v ->> 'value';

    -- Cast to JSON-native type so the form viewer renders correctly
    fjson := CASE
      WHEN fval IS NULL THEN 'null'::jsonb
      WHEN ftype IN ('number', 'integer', 'decimal', 'currency') THEN
        CASE WHEN fval ~ '^-?\d+(\.\d+)?$' THEN to_jsonb(fval::numeric) ELSE to_jsonb(fval) END
      WHEN ftype = 'boolean' THEN
        to_jsonb(lower(fval) IN ('true','t','1','yes'))
      ELSE to_jsonb(fval)
    END;

    fields_obj := fields_obj || jsonb_build_object(fid, fjson);
    cur_section := jsonb_set(cur_section, '{fields}', fields_obj);
    sections_obj := sections_obj || jsonb_build_object(sid, cur_section);
    total_fields := total_fields + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'formId',   p_form_id,
    'formName', form_name,
    'metadata', jsonb_build_object(
      'submittedAt',    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'submittedBy',    'seed-script',
      'totalFields',    total_fields,
      'totalSections',  total_sections,
      'totalSubforms',  0,
      'source',         'seed-recruitment-onboarding.sql'
    ),
    'sections', sections_obj,
    'subforms', '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql;

-- ─── helper 3: storage table number for a form ───
CREATE FUNCTION pg_temp.storage_table_for(p_form_id TEXT)
RETURNS INT AS $$
  SELECT NULLIF(regexp_replace(storage_table, '\D', '', 'g'), '')::int
  FROM form_table_mappings
  WHERE form_id = p_form_id;
$$ LANGUAGE sql;

-- ─── helper 4: insert into the right sharded table + unified table ───
CREATE FUNCTION pg_temp.insert_record(
  p_record_id TEXT,
  p_form_id   TEXT,
  p_data      JSONB,
  p_emp_id    TEXT,
  p_amount    NUMERIC,
  p_date      DATE,
  p_status    TEXT
) RETURNS VOID AS $$
DECLARE
  tbl_num INT;
  tbl_name TEXT;
  sql TEXT;
  org_id TEXT;
BEGIN
  IF p_data IS NULL THEN RETURN; END IF;

  tbl_num := pg_temp.storage_table_for(p_form_id);
  IF tbl_num IS NULL THEN
    RAISE NOTICE '  ! no storage table mapped for %, skipping', p_form_id;
    RETURN;
  END IF;
  tbl_name := 'form_records_' || tbl_num;

  -- form_records_14 requires organization_id
  IF tbl_num = 14 THEN
    SELECT id INTO org_id FROM organizations LIMIT 1;
    IF org_id IS NULL THEN
      RAISE NOTICE '  ! no organization exists, cannot insert into form_records_14';
      RETURN;
    END IF;
  END IF;

  -- Sharded insert (idempotent via id)
  -- Note: form_records_14 uses camelCase "organizationId" (no @map in Prisma), unlike form_records which uses organization_id
  -- Also: form_records_14.employee_id is an FK to employees(id) — we leave it NULL since the actual emp id lives in record_data
  IF tbl_num = 14 THEN
    sql := format(
      'INSERT INTO %I (id, form_id, record_data, %I, amount, date, submitted_by, submitted_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET record_data = EXCLUDED.record_data, status = EXCLUDED.status, updated_at = NOW()',
      tbl_name, 'organizationId'
    );
    EXECUTE sql USING p_record_id, p_form_id, p_data, org_id, p_amount, p_date, 'seed-script', p_status;
  ELSE
    sql := format(
      'INSERT INTO %I (id, form_id, record_data, employee_id, amount, date, submitted_by, submitted_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET record_data = EXCLUDED.record_data, status = EXCLUDED.status, updated_at = NOW()',
      tbl_name
    );
    EXECUTE sql USING p_record_id, p_form_id, p_data, p_emp_id, p_amount, p_date, 'seed-script', p_status;
  END IF;

  -- Unified dual-write
  INSERT INTO form_records (id, form_id, record_data, organization_id, employee_id, amount, date, submitted_by, submitted_at, status, created_at, updated_at)
  VALUES (p_record_id, p_form_id, p_data, org_id, p_emp_id, p_amount, p_date, 'seed-script', NOW(), p_status, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
  SET record_data = EXCLUDED.record_data, status = EXCLUDED.status, updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ─── main: seed 5 employees through the recruitment + onboarding flow ───
DO $$
DECLARE
  -- 5 dummy employees
  emps JSONB := '[
    {"empId":"EMP001","first":"Aarav","last":"Sharma","email":"aarav.sharma@nessco.in","phone":"+91-9000000001","designation":"Senior Engineer","department":"Engineering","salary":85000,"profile":"Engineering"},
    {"empId":"EMP002","first":"Priya","last":"Patel","email":"priya.patel@nessco.in","phone":"+91-9000000002","designation":"Product Manager","department":"Product","salary":95000,"profile":"Product"},
    {"empId":"EMP003","first":"Rohan","last":"Verma","email":"rohan.verma@nessco.in","phone":"+91-9000000003","designation":"UI Designer","department":"Design","salary":65000,"profile":"Design"},
    {"empId":"EMP004","first":"Anjali","last":"Singh","email":"anjali.singh@nessco.in","phone":"+91-9000000004","designation":"HR Executive","department":"Human Resources","salary":55000,"profile":"Human Resources"},
    {"empId":"EMP005","first":"Vikram","last":"Iyer","email":"vikram.iyer@nessco.in","phone":"+91-9000000005","designation":"Data Analyst","department":"Analytics","salary":70000,"profile":"Analytics"}
  ]'::jsonb;
  e JSONB;
  rec_id TEXT;
  data JSONB;
  full_name TEXT;
  -- per-stage unique IDs (deterministic from loop index)
  idx INT := 0;
  staff_id TEXT;
  open_id TEXT;
  app_id TEXT;
  offer_id TEXT;
  appt_id TEXT;
  -- attendance scratch
  d DATE;
  in_off INT;
  out_off INT;
  in_time TEXT;
  out_time TEXT;
  in_count INT;
  out_count INT;
  empId_text TEXT;
  month_start DATE := date_trunc('month', CURRENT_DATE)::date;
  month_end   DATE := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;
BEGIN
  RAISE NOTICE '────────────────────────────────────────────';
  RAISE NOTICE 'Recruitment + Onboarding seed (5 employees)';
  RAISE NOTICE '────────────────────────────────────────────';

  FOR e IN SELECT * FROM jsonb_array_elements(emps) LOOP
    idx := idx + 1;
    full_name := (e->>'first') || ' ' || (e->>'last');

    -- Generate the per-stage unique IDs deterministically from the loop index.
    -- Re-running yields the same IDs (idempotent with ON CONFLICT DO UPDATE).
    staff_id := 'SP-'  || lpad(idx::text, 4, '0');
    open_id  := 'JO-'  || lpad(idx::text, 4, '0');
    app_id   := 'JA-'  || lpad(idx::text, 4, '0');
    offer_id := 'OF-'  || lpad(idx::text, 4, '0');
    appt_id  := 'AL-'  || lpad(idx::text, 4, '0');

    RAISE NOTICE '';
    RAISE NOTICE '── % (%)  staff=% open=% app=% offer=% appt=% ──',
      full_name, e->>'empId', staff_id, open_id, app_id, offer_id, appt_id;

    ---------------------------------------------------------------
    -- 1. Staffing Plan
    ---------------------------------------------------------------
    rec_id := 'seed-staff-' || (e->>'empId');
    data := pg_temp.build_record_data('form_hr_staffing_plan', jsonb_build_array(
      jsonb_build_object('fieldId', 'fld_staff_plan_id',  'value', staff_id),
      jsonb_build_object('labels',  '["Profile","Profile Name"]'::jsonb,         'value', e->>'profile'),
      jsonb_build_object('labels',  '["Department"]'::jsonb,                     'value', e->>'department'),
      jsonb_build_object('labels',  '["Designation"]'::jsonb,                    'value', e->>'designation'),
      jsonb_build_object('labels',  '["No. of Vacancies","Vacancies"]'::jsonb,   'value', '1'),
      jsonb_build_object('labels',  '["Estimated Cost / Person","Cost Per Person","Cost"]'::jsonb,
                                                                                   'value', e->>'salary'),
      jsonb_build_object('labels',  '["Total Cost"]'::jsonb,                     'value', e->>'salary')
    ));
    PERFORM pg_temp.insert_record(rec_id, 'form_hr_staffing_plan', data, e->>'empId', (e->>'salary')::numeric, NULL, 'submitted');
    RAISE NOTICE '  [1/7] Staffing Plan        % (%)', CASE WHEN data IS NULL THEN 'SKIPPED (form missing)' ELSE 'ok' END, staff_id;

    ---------------------------------------------------------------
    -- 2. Job Opening — references its Staffing Plan
    ---------------------------------------------------------------
    rec_id := 'seed-opening-' || (e->>'empId');
    data := pg_temp.build_record_data('form_hr_job_opening', jsonb_build_array(
      jsonb_build_object('fieldId', 'fld_open_id',       'value', open_id),
      jsonb_build_object('fieldId', 'fld_open_plan_id',  'value', staff_id),
      jsonb_build_object('labels',  '["Profile","Profile Name"]'::jsonb,    'value', e->>'profile'),
      jsonb_build_object('labels',  '["Department"]'::jsonb,                'value', e->>'department'),
      jsonb_build_object('labels',  '["Designation"]'::jsonb,               'value', e->>'designation'),
      jsonb_build_object('labels',  '["Status"]'::jsonb,                    'value', 'FILLED'),
      jsonb_build_object('labels',  '["Publish on Website","Publish"]'::jsonb, 'value', 'false'),
      jsonb_build_object('labels',  '["Job Description","JD","Description"]'::jsonb,
                                                                              'value', 'Seeking ' || (e->>'designation') || ' for ' || (e->>'department'))
    ));
    PERFORM pg_temp.insert_record(rec_id, 'form_hr_job_opening', data, e->>'empId', (e->>'salary')::numeric, NULL, 'submitted');
    RAISE NOTICE '  [2/7] Job Opening          % (%)', CASE WHEN data IS NULL THEN 'SKIPPED (form missing)' ELSE 'ok' END, open_id;

    ---------------------------------------------------------------
    -- 3. Job Application — status HIRED — references Staffing Plan + Job Opening
    ---------------------------------------------------------------
    rec_id := 'seed-app-' || (e->>'empId');
    data := pg_temp.build_record_data('form_hr_job_application', jsonb_build_array(
      jsonb_build_object('fieldId', 'fld_app_id',          'value', app_id),
      jsonb_build_object('fieldId', 'fld_app_plan_id',     'value', staff_id),
      jsonb_build_object('fieldId', 'fld_app_opening_id',  'value', open_id),
      jsonb_build_object('labels',  '["First Name"]'::jsonb,                          'value', e->>'first'),
      jsonb_build_object('labels',  '["Last Name"]'::jsonb,                           'value', e->>'last'),
      jsonb_build_object('labels',  '["Applicant Name","Candidate Name","Name"]'::jsonb,
                                                                                       'value', full_name),
      jsonb_build_object('labels',  '["Email"]'::jsonb,                               'value', e->>'email'),
      jsonb_build_object('labels',  '["Phone","Mobile","Cell Number"]'::jsonb,        'value', e->>'phone'),
      jsonb_build_object('labels',  '["Status"]'::jsonb,                              'value', 'HIRED'),
      jsonb_build_object('labels',  '["Rating"]'::jsonb,                              'value', '5'),
      jsonb_build_object('labels',  '["Job Description","JD","Description"]'::jsonb,
                                                                                       'value', 'Applied for ' || (e->>'designation'))
    ));
    PERFORM pg_temp.insert_record(rec_id, 'form_hr_job_application', data, e->>'empId', NULL, NULL, 'submitted');
    RAISE NOTICE '  [3/7] Job Application      % (%) HIRED', CASE WHEN data IS NULL THEN 'SKIPPED (form missing)' ELSE 'ok' END, app_id;

    ---------------------------------------------------------------
    -- 4. Job Offer — status ACCEPTED — references Staffing Plan
    ---------------------------------------------------------------
    rec_id := 'seed-offer-' || (e->>'empId');
    data := pg_temp.build_record_data('form_hr_job_offer', jsonb_build_array(
      jsonb_build_object('fieldId', 'fld_offer_id',       'value', offer_id),
      jsonb_build_object('fieldId', 'fld_offer_plan_id',  'value', staff_id),
      jsonb_build_object('labels',  '["Applicant Name","Candidate Name","Name"]'::jsonb,
                                                                                  'value', full_name),
      jsonb_build_object('labels',  '["Status"]'::jsonb,                          'value', 'ACCEPTED'),
      jsonb_build_object('labels',  '["Term","Offer Term"]'::jsonb,               'value', 'Accepted by applicant'),
      jsonb_build_object('labels',  '["Value","Offer Value","Salary","CTC"]'::jsonb, 'value', e->>'salary'),
      jsonb_build_object('labels',  '["Offer Date","Date"]'::jsonb,               'value', to_char(CURRENT_DATE, 'YYYY-MM-DD'))
    ));
    PERFORM pg_temp.insert_record(rec_id, 'form_hr_job_offer', data, e->>'empId', (e->>'salary')::numeric, CURRENT_DATE, 'submitted');
    RAISE NOTICE '  [4/7] Job Offer            % (%) ACCEPTED', CASE WHEN data IS NULL THEN 'SKIPPED (form missing)' ELSE 'ok' END, offer_id;

    ---------------------------------------------------------------
    -- 5. Appointment Letter
    ---------------------------------------------------------------
    rec_id := 'seed-appt-' || (e->>'empId');
    data := pg_temp.build_record_data('form_hr_appointment_letter', jsonb_build_array(
      jsonb_build_object('fieldId', 'fld_appt_id',  'value', appt_id),
      jsonb_build_object('labels',  '["Template"]'::jsonb,           'value', 'STANDARD'),
      jsonb_build_object('labels',  '["Applicant Name","Candidate Name","Name"]'::jsonb,
                                                                       'value', full_name),
      jsonb_build_object('labels',  '["Company Name","Company"]'::jsonb,
                                                                       'value', 'Nessco'),
      jsonb_build_object('labels',  '["Date"]'::jsonb,               'value', to_char(CURRENT_DATE, 'YYYY-MM-DD')),
      jsonb_build_object('labels',  '["Title","Job Title"]'::jsonb,  'value', e->>'designation')
    ));
    PERFORM pg_temp.insert_record(rec_id, 'form_hr_appointment_letter', data, e->>'empId', NULL, CURRENT_DATE, 'submitted');
    RAISE NOTICE '  [5/7] Appointment Letter   % (%)', CASE WHEN data IS NULL THEN 'SKIPPED (form missing)' ELSE 'ok' END, appt_id;

    ---------------------------------------------------------------
    -- 6. Employee Master  ← what payroll actually reads
    ---------------------------------------------------------------
    rec_id := 'seed-emp-' || (e->>'empId');
    data := pg_temp.build_record_data('form_hr_employee_master', jsonb_build_array(
      jsonb_build_object('fieldId', 'fld_emp_employee_id',  'value', e->>'empId'),
      jsonb_build_object('fieldId', 'fld_emp_first_name',   'value', e->>'first'),
      jsonb_build_object('fieldId', 'fld_emp_last_name',    'value', e->>'last'),
      jsonb_build_object('fieldId', 'fld_emp_salutation',   'value', 'Mr.'),
      jsonb_build_object('fieldId', 'fld_emp_department',   'value', e->>'department'),
      jsonb_build_object('fieldId', 'fld_emp_type',         'value', 'Full-time'),
      jsonb_build_object('fieldId', 'fld_emp_nationality',  'value', 'Indian'),
      jsonb_build_object('fieldId', 'fld_emp_cell_number',  'value', e->>'phone'),
      jsonb_build_object('labels',  '["Company Email","Email","Work Email"]'::jsonb,                       'value', e->>'email'),
      jsonb_build_object('labels',  '["Designation","Job Title","Title"]'::jsonb,                          'value', e->>'designation'),
      jsonb_build_object('labels',  '["Salary Amount","Salary","Total Salary","CTC","Monthly Salary"]'::jsonb,
                                                                                                            'value', e->>'salary')
    ));
    PERFORM pg_temp.insert_record(rec_id, 'form_hr_employee_master', data, e->>'empId', (e->>'salary')::numeric, NULL, 'submitted');
    RAISE NOTICE '  [6/7] Employee Master      % (%)', CASE WHEN data IS NULL THEN 'SKIPPED (form missing)' ELSE 'ok' END, e->>'empId';

    ---------------------------------------------------------------
    -- 7. Attendance: weekday Check-In + Check-Out for current month
    ---------------------------------------------------------------
    empId_text := e->>'empId';
    in_off  := (ascii(substring(empId_text, length(empId_text), 1))::int) % 30;
    out_off := ((ascii(substring(empId_text, length(empId_text), 1))::int) * 3) % 45;
    in_count := 0;
    out_count := 0;

    FOR d IN
      SELECT day::date
      FROM generate_series(month_start, month_end, '1 day'::interval) AS day
      WHERE EXTRACT(DOW FROM day) NOT IN (0, 6)
    LOOP
      -- Skip ~2/22 days per employee to simulate absences
      IF ((EXTRACT(DAY FROM d)::int) * (ascii(substring(empId_text, length(empId_text), 1))::int)) % 23 < 2 THEN
        CONTINUE;
      END IF;

      in_time  := lpad('9', 2, '0') || ':' || lpad((((EXTRACT(DAY FROM d)::int) + in_off) % 60)::text, 2, '0');
      out_time := '18:' || lpad((((EXTRACT(DAY FROM d)::int) + out_off) % 60)::text, 2, '0');

      -- Check-In
      rec_id := 'seed-checkin-' || empId_text || '-' || to_char(d, 'YYYY-MM-DD');
      data := pg_temp.build_record_data('form_hr_checkin', jsonb_build_array(
        jsonb_build_object('labels', '["In Date","Date","Attendance Date","Check-In Date"]'::jsonb, 'value', to_char(d, 'YYYY-MM-DD')),
        jsonb_build_object('labels', '["In Time","Check-In Time","Time","Time In"]'::jsonb,         'value', in_time),
        jsonb_build_object('labels', '["Employee ID","Emp ID"]'::jsonb,                              'value', empId_text),
        jsonb_build_object('labels', '["Email","Company Email"]'::jsonb,                             'value', e->>'email')
      ));
      IF data IS NOT NULL THEN
        -- Add top-level email + employeeId so payroll's identity matcher finds them even if the form has no such fields
        data := data || jsonb_build_object('email', e->>'email', 'employeeId', empId_text);
        PERFORM pg_temp.insert_record(rec_id, 'form_hr_checkin', data, empId_text, NULL, d, 'submitted');
        in_count := in_count + 1;
      END IF;

      -- Check-Out
      rec_id := 'seed-checkout-' || empId_text || '-' || to_char(d, 'YYYY-MM-DD');
      data := pg_temp.build_record_data('form_hr_checkout', jsonb_build_array(
        jsonb_build_object('labels', '["Out Date","Date","Attendance Date","Check-Out Date"]'::jsonb, 'value', to_char(d, 'YYYY-MM-DD')),
        jsonb_build_object('labels', '["Out Time","Check-Out Time","Time","Time Out"]'::jsonb,        'value', out_time),
        jsonb_build_object('labels', '["Employee ID","Emp ID"]'::jsonb,                                'value', empId_text),
        jsonb_build_object('labels', '["Email","Company Email"]'::jsonb,                               'value', e->>'email')
      ));
      IF data IS NOT NULL THEN
        data := data || jsonb_build_object('email', e->>'email', 'employeeId', empId_text);
        PERFORM pg_temp.insert_record(rec_id, 'form_hr_checkout', data, empId_text, NULL, d, 'submitted');
        out_count := out_count + 1;
      END IF;
    END LOOP;

    RAISE NOTICE '  [7/7] Attendance           % check-in + % check-out (% to %)',
      in_count, out_count, to_char(month_start, 'YYYY-MM-DD'), to_char(month_end, 'YYYY-MM-DD');
  END LOOP;

  -- Advance unique_id_counters past the seeded range so future real submissions
  -- via /api/generate-unique-id don't collide with our SP-0001..SP-0005 etc.
  -- We GREATEST to never go backward.
  INSERT INTO unique_id_counters (id, "fieldId", "lastNumber", "createdAt", "updatedAt") VALUES
    ('uc_seed_staff', 'fld_staff_plan_id',   idx::bigint, NOW(), NOW()),
    ('uc_seed_open',  'fld_open_id',         idx::bigint, NOW(), NOW()),
    ('uc_seed_app',   'fld_app_id',          idx::bigint, NOW(), NOW()),
    ('uc_seed_offer', 'fld_offer_id',        idx::bigint, NOW(), NOW()),
    ('uc_seed_appt',  'fld_appt_id',         idx::bigint, NOW(), NOW())
  ON CONFLICT ("fieldId") DO UPDATE
    SET "lastNumber" = GREATEST(unique_id_counters."lastNumber", EXCLUDED."lastNumber"),
        "updatedAt"  = NOW();
  RAISE NOTICE '';
  RAISE NOTICE 'Advanced unique_id_counters past seed range (%)', idx;

  RAISE NOTICE '';
  RAISE NOTICE '────────────────────────────────────────────';
  RAISE NOTICE 'Done. Visit /payroll and click Auto-Generate.';
  RAISE NOTICE '────────────────────────────────────────────';
END;
$$ LANGUAGE plpgsql;

COMMIT;
