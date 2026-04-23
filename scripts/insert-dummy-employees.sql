-- =============================================================================
-- DUMMY EMPLOYEE DATA — 3 employees for the Employee Master form
-- =============================================================================
-- Writes to both:
--   1. employees                 (columns mapped 1:1 to the Employee model)
--   2. form_records_14           (the storage table mapped for the Employee
--                                 Master form; record_data carries the same
--                                 values keyed by form-field id so the Form
--                                 Builder listing and detail views work)
--
-- Re-running is safe: every row uses ON CONFLICT (id) DO UPDATE.
-- Linked to:
--   Organization: cmo9uk3440005u7ngdg652eoq
--   Form:         form_hr_employee_master
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_org_id  TEXT := 'cmo9uk3440005u7ngdg652eoq';
    v_user_id TEXT := 'cmo9uhu660000u7ngr51zv3wv';
    v_form_id TEXT := 'form_hr_employee_master';
BEGIN
    -- Validate pre-reqs
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id) THEN
        RAISE EXCEPTION 'Organization % does not exist.', v_org_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM forms WHERE id = v_form_id) THEN
        RAISE EXCEPTION 'Form % does not exist. Run create-hr-module.sql first.', v_form_id;
    END IF;

    -- =========================================================================
    -- 1. employees — one row per employee
    -- =========================================================================
    INSERT INTO employees (
        id, user_id, employee_name, gender, department, designation, dob,
        native_place, country, permanent_address, current_address,
        personal_contact, alternate_no_1, alternate_no_2,
        email_address_1, email_address_2,
        aadhar_card_upload, aadhar_card_no, pan_card_upload, passport_upload,
        bank_name, bank_account_no, ifsc_code,
        status, shift_type, in_time, out_time,
        date_of_joining, date_of_leaving, increment_month,
        years_of_agreement, bonus_after_years, company_name,
        total_salary, given_salary, bonus_amount,
        night_allowance, over_time, one_hour_extra, company_sim_issue,
        created_at, updated_at
    ) VALUES
        (
            'emp_rajesh_kumar', NULL, 'Rajesh Kumar', 'MALE', 'IT', 'Senior Software Engineer',
            DATE '1990-05-15', 'Jaipur', 'India',
            '123 MG Road, Jaipur, Rajasthan 302001',
            'Flat 4B, Green Valley Apartments, Gurgaon, Haryana 122001',
            '+91 9876543210', '+91 9876543211', '+91 9876543212',
            'rajesh.kumar@example.com', 'rajesh.personal@example.com',
            NULL, '123456789012', NULL, NULL,
            'HDFC Bank', '50100123456789', 'HDFC0001234',
            'ACTIVE', 'DAY', '09:00', '18:00',
            DATE '2020-06-01', NULL, 6,
            3, 1, 'Nessco',
            120000, 100000, 10000,
            500, 300, 400, TRUE,
            NOW(), NOW()
        ),
        (
            'emp_priya_sharma', NULL, 'Priya Sharma', 'FEMALE', 'HR', 'HR Manager',
            DATE '1988-08-22', 'Mumbai', 'India',
            '45 Linking Road, Bandra West, Mumbai, Maharashtra 400050',
            '45 Linking Road, Bandra West, Mumbai, Maharashtra 400050',
            '+91 9998887776', '+91 9998887777', NULL,
            'priya.sharma@example.com', 'priya.hr@example.com',
            NULL, '234567890123', NULL, NULL,
            'ICICI Bank', '602002345678', 'ICIC0005678',
            'ACTIVE', 'GENERAL', '09:30', '18:30',
            DATE '2019-03-15', NULL, 4,
            5, 2, 'Nessco',
            150000, 125000, 15000,
            0, 0, 500, TRUE,
            NOW(), NOW()
        ),
        (
            'emp_amit_patel', NULL, 'Amit Patel', 'MALE', 'PRODUCTION', 'Production Supervisor',
            DATE '1985-11-10', 'Ahmedabad', 'India',
            'Plot 78, Satellite, Ahmedabad, Gujarat 380015',
            'Plot 78, Satellite, Ahmedabad, Gujarat 380015',
            '+91 9765432109', '+91 9765432108', NULL,
            'amit.patel@example.com', NULL,
            NULL, '345678901234', NULL, NULL,
            'State Bank of India', '32100345678901', 'SBIN0009012',
            'ACTIVE', 'ROTATIONAL', '08:00', '17:00',
            DATE '2018-01-10', NULL, 1,
            5, 1, 'Nessco',
            80000, 70000, 8000,
            300, 200, 250, FALSE,
            NOW(), NOW()
        )
    ON CONFLICT (id) DO UPDATE SET
        employee_name      = EXCLUDED.employee_name,
        gender             = EXCLUDED.gender,
        department         = EXCLUDED.department,
        designation        = EXCLUDED.designation,
        dob                = EXCLUDED.dob,
        native_place       = EXCLUDED.native_place,
        country            = EXCLUDED.country,
        permanent_address  = EXCLUDED.permanent_address,
        current_address    = EXCLUDED.current_address,
        personal_contact   = EXCLUDED.personal_contact,
        alternate_no_1     = EXCLUDED.alternate_no_1,
        alternate_no_2     = EXCLUDED.alternate_no_2,
        email_address_1    = EXCLUDED.email_address_1,
        email_address_2    = EXCLUDED.email_address_2,
        aadhar_card_no     = EXCLUDED.aadhar_card_no,
        bank_name          = EXCLUDED.bank_name,
        bank_account_no    = EXCLUDED.bank_account_no,
        ifsc_code          = EXCLUDED.ifsc_code,
        status             = EXCLUDED.status,
        shift_type         = EXCLUDED.shift_type,
        in_time            = EXCLUDED.in_time,
        out_time           = EXCLUDED.out_time,
        date_of_joining    = EXCLUDED.date_of_joining,
        date_of_leaving    = EXCLUDED.date_of_leaving,
        increment_month    = EXCLUDED.increment_month,
        years_of_agreement = EXCLUDED.years_of_agreement,
        bonus_after_years  = EXCLUDED.bonus_after_years,
        company_name       = EXCLUDED.company_name,
        total_salary       = EXCLUDED.total_salary,
        given_salary       = EXCLUDED.given_salary,
        bonus_amount       = EXCLUDED.bonus_amount,
        night_allowance    = EXCLUDED.night_allowance,
        over_time          = EXCLUDED.over_time,
        one_hour_extra     = EXCLUDED.one_hour_extra,
        company_sim_issue  = EXCLUDED.company_sim_issue,
        updated_at         = NOW();

    -- =========================================================================
    -- 2. form_records_14 — companion records so the form listing shows them.
    --    record_data is keyed by form-field id with {value,type,label}, which
    --    matches the shape other submissions in this codebase use.
    -- =========================================================================
    INSERT INTO form_records_14 (
        id, form_id, record_data, employee_id,
        submitted_by, submitted_at, status, user_id,
        "organizationId", created_at, updated_at
    ) VALUES
        (
            'rec_emp_rajesh_kumar', v_form_id,
            jsonb_build_object(
                'fld_emp_employee_id',     jsonb_build_object('value','EMP-0001','type','text','label','Employee ID'),
                'fld_emp_employee_name',   jsonb_build_object('value','Rajesh Kumar','type','text','label','Employee Name'),
                'fld_emp_sex',             jsonb_build_object('value','MALE','type','select','label','Sex'),
                'fld_emp_department',      jsonb_build_object('value','IT','type','select','label','Department'),
                'fld_emp_designation',     jsonb_build_object('value','Senior Software Engineer','type','text','label','Designation'),
                'fld_emp_dob',             jsonb_build_object('value','1990-05-15','type','date','label','DOB'),
                'fld_emp_native',          jsonb_build_object('value','Jaipur','type','text','label','Native'),
                'fld_emp_belong_country',  jsonb_build_object('value','India','type','text','label','Belong Country'),
                'fld_emp_permanent_addr',  jsonb_build_object('value','123 MG Road, Jaipur, Rajasthan 302001','type','textarea','label','Permanent Address'),
                'fld_emp_current_addr',    jsonb_build_object('value','Flat 4B, Green Valley Apartments, Gurgaon, Haryana 122001','type','textarea','label','Current Address'),
                'fld_emp_personal_contact',jsonb_build_object('value','+91 9876543210','type','tel','label','Personal Contact'),
                'fld_emp_alt_no_1',        jsonb_build_object('value','+91 9876543211','type','tel','label','Alternate No. 1'),
                'fld_emp_alt_no_2',        jsonb_build_object('value','+91 9876543212','type','tel','label','Alternate No. 2'),
                'fld_emp_email_1',         jsonb_build_object('value','rajesh.kumar@example.com','type','email','label','Email Address 1'),
                'fld_emp_email_2',         jsonb_build_object('value','rajesh.personal@example.com','type','email','label','Email Address 2'),
                'fld_emp_aadhar_no',       jsonb_build_object('value','123456789012','type','text','label','Aadhar Card No.'),
                'fld_emp_bank_name',       jsonb_build_object('value','HDFC Bank','type','text','label','Bank Name'),
                'fld_emp_bank_account',    jsonb_build_object('value','50100123456789','type','text','label','Bank Account No.'),
                'fld_emp_ifsc',            jsonb_build_object('value','HDFC0001234','type','text','label','IFSC Code'),
                'fld_emp_status',          jsonb_build_object('value','ACTIVE','type','select','label','Status'),
                'fld_emp_shift_type',      jsonb_build_object('value','DAY','type','select','label','Shift Type'),
                'fld_emp_in_time',         jsonb_build_object('value','09:00','type','time','label','In Time'),
                'fld_emp_out_time',        jsonb_build_object('value','18:00','type','time','label','Out Time'),
                'fld_emp_date_joining',    jsonb_build_object('value','2020-06-01','type','date','label','Date of Joining'),
                'fld_emp_increment_month', jsonb_build_object('value',6,'type','select','label','Increment Month'),
                'fld_emp_years_agreement', jsonb_build_object('value',3,'type','number','label','Years of Agreement While Joining'),
                'fld_emp_bonus_after',     jsonb_build_object('value',1,'type','number','label','Bonus After How Many Years'),
                'fld_emp_company_name',    jsonb_build_object('value','Nessco','type','text','label','Company Name'),
                'fld_emp_total_salary',    jsonb_build_object('value',120000,'type','number','label','Total Salary'),
                'fld_emp_given_salary',    jsonb_build_object('value',100000,'type','number','label','Given Salary'),
                'fld_emp_bonus_amount',    jsonb_build_object('value',10000,'type','number','label','Bonus Amount'),
                'fld_emp_night_allow',     jsonb_build_object('value',500,'type','number','label','Night Allowance'),
                'fld_emp_over_time',       jsonb_build_object('value',300,'type','number','label','Over Time'),
                'fld_emp_one_hour_extra',  jsonb_build_object('value',400,'type','number','label','1 Hour Extra'),
                'fld_emp_company_sim',     jsonb_build_object('value',TRUE,'type','checkbox','label','Company Sim Issue')
            ),
            'emp_rajesh_kumar',
            v_user_id, NOW(), 'submitted', v_user_id,
            v_org_id, NOW(), NOW()
        ),
        (
            'rec_emp_priya_sharma', v_form_id,
            jsonb_build_object(
                'fld_emp_employee_id',     jsonb_build_object('value','EMP-0002','type','text','label','Employee ID'),
                'fld_emp_employee_name',   jsonb_build_object('value','Priya Sharma','type','text','label','Employee Name'),
                'fld_emp_sex',             jsonb_build_object('value','FEMALE','type','select','label','Sex'),
                'fld_emp_department',      jsonb_build_object('value','HR','type','select','label','Department'),
                'fld_emp_designation',     jsonb_build_object('value','HR Manager','type','text','label','Designation'),
                'fld_emp_dob',             jsonb_build_object('value','1988-08-22','type','date','label','DOB'),
                'fld_emp_native',          jsonb_build_object('value','Mumbai','type','text','label','Native'),
                'fld_emp_belong_country',  jsonb_build_object('value','India','type','text','label','Belong Country'),
                'fld_emp_permanent_addr',  jsonb_build_object('value','45 Linking Road, Bandra West, Mumbai, Maharashtra 400050','type','textarea','label','Permanent Address'),
                'fld_emp_current_addr',    jsonb_build_object('value','45 Linking Road, Bandra West, Mumbai, Maharashtra 400050','type','textarea','label','Current Address'),
                'fld_emp_personal_contact',jsonb_build_object('value','+91 9998887776','type','tel','label','Personal Contact'),
                'fld_emp_alt_no_1',        jsonb_build_object('value','+91 9998887777','type','tel','label','Alternate No. 1'),
                'fld_emp_email_1',         jsonb_build_object('value','priya.sharma@example.com','type','email','label','Email Address 1'),
                'fld_emp_email_2',         jsonb_build_object('value','priya.hr@example.com','type','email','label','Email Address 2'),
                'fld_emp_aadhar_no',       jsonb_build_object('value','234567890123','type','text','label','Aadhar Card No.'),
                'fld_emp_bank_name',       jsonb_build_object('value','ICICI Bank','type','text','label','Bank Name'),
                'fld_emp_bank_account',    jsonb_build_object('value','602002345678','type','text','label','Bank Account No.'),
                'fld_emp_ifsc',            jsonb_build_object('value','ICIC0005678','type','text','label','IFSC Code'),
                'fld_emp_status',          jsonb_build_object('value','ACTIVE','type','select','label','Status'),
                'fld_emp_shift_type',      jsonb_build_object('value','GENERAL','type','select','label','Shift Type'),
                'fld_emp_in_time',         jsonb_build_object('value','09:30','type','time','label','In Time'),
                'fld_emp_out_time',        jsonb_build_object('value','18:30','type','time','label','Out Time'),
                'fld_emp_date_joining',    jsonb_build_object('value','2019-03-15','type','date','label','Date of Joining'),
                'fld_emp_increment_month', jsonb_build_object('value',4,'type','select','label','Increment Month'),
                'fld_emp_years_agreement', jsonb_build_object('value',5,'type','number','label','Years of Agreement While Joining'),
                'fld_emp_bonus_after',     jsonb_build_object('value',2,'type','number','label','Bonus After How Many Years'),
                'fld_emp_company_name',    jsonb_build_object('value','Nessco','type','text','label','Company Name'),
                'fld_emp_total_salary',    jsonb_build_object('value',150000,'type','number','label','Total Salary'),
                'fld_emp_given_salary',    jsonb_build_object('value',125000,'type','number','label','Given Salary'),
                'fld_emp_bonus_amount',    jsonb_build_object('value',15000,'type','number','label','Bonus Amount'),
                'fld_emp_night_allow',     jsonb_build_object('value',0,'type','number','label','Night Allowance'),
                'fld_emp_over_time',       jsonb_build_object('value',0,'type','number','label','Over Time'),
                'fld_emp_one_hour_extra',  jsonb_build_object('value',500,'type','number','label','1 Hour Extra'),
                'fld_emp_company_sim',     jsonb_build_object('value',TRUE,'type','checkbox','label','Company Sim Issue')
            ),
            'emp_priya_sharma',
            v_user_id, NOW(), 'submitted', v_user_id,
            v_org_id, NOW(), NOW()
        ),
        (
            'rec_emp_amit_patel', v_form_id,
            jsonb_build_object(
                'fld_emp_employee_id',     jsonb_build_object('value','EMP-0003','type','text','label','Employee ID'),
                'fld_emp_employee_name',   jsonb_build_object('value','Amit Patel','type','text','label','Employee Name'),
                'fld_emp_sex',             jsonb_build_object('value','MALE','type','select','label','Sex'),
                'fld_emp_department',      jsonb_build_object('value','PRODUCTION','type','select','label','Department'),
                'fld_emp_designation',     jsonb_build_object('value','Production Supervisor','type','text','label','Designation'),
                'fld_emp_dob',             jsonb_build_object('value','1985-11-10','type','date','label','DOB'),
                'fld_emp_native',          jsonb_build_object('value','Ahmedabad','type','text','label','Native'),
                'fld_emp_belong_country',  jsonb_build_object('value','India','type','text','label','Belong Country'),
                'fld_emp_permanent_addr',  jsonb_build_object('value','Plot 78, Satellite, Ahmedabad, Gujarat 380015','type','textarea','label','Permanent Address'),
                'fld_emp_current_addr',    jsonb_build_object('value','Plot 78, Satellite, Ahmedabad, Gujarat 380015','type','textarea','label','Current Address'),
                'fld_emp_personal_contact',jsonb_build_object('value','+91 9765432109','type','tel','label','Personal Contact'),
                'fld_emp_alt_no_1',        jsonb_build_object('value','+91 9765432108','type','tel','label','Alternate No. 1'),
                'fld_emp_email_1',         jsonb_build_object('value','amit.patel@example.com','type','email','label','Email Address 1'),
                'fld_emp_aadhar_no',       jsonb_build_object('value','345678901234','type','text','label','Aadhar Card No.'),
                'fld_emp_bank_name',       jsonb_build_object('value','State Bank of India','type','text','label','Bank Name'),
                'fld_emp_bank_account',    jsonb_build_object('value','32100345678901','type','text','label','Bank Account No.'),
                'fld_emp_ifsc',            jsonb_build_object('value','SBIN0009012','type','text','label','IFSC Code'),
                'fld_emp_status',          jsonb_build_object('value','ACTIVE','type','select','label','Status'),
                'fld_emp_shift_type',      jsonb_build_object('value','ROTATIONAL','type','select','label','Shift Type'),
                'fld_emp_in_time',         jsonb_build_object('value','08:00','type','time','label','In Time'),
                'fld_emp_out_time',        jsonb_build_object('value','17:00','type','time','label','Out Time'),
                'fld_emp_date_joining',    jsonb_build_object('value','2018-01-10','type','date','label','Date of Joining'),
                'fld_emp_increment_month', jsonb_build_object('value',1,'type','select','label','Increment Month'),
                'fld_emp_years_agreement', jsonb_build_object('value',5,'type','number','label','Years of Agreement While Joining'),
                'fld_emp_bonus_after',     jsonb_build_object('value',1,'type','number','label','Bonus After How Many Years'),
                'fld_emp_company_name',    jsonb_build_object('value','Nessco','type','text','label','Company Name'),
                'fld_emp_total_salary',    jsonb_build_object('value',80000,'type','number','label','Total Salary'),
                'fld_emp_given_salary',    jsonb_build_object('value',70000,'type','number','label','Given Salary'),
                'fld_emp_bonus_amount',    jsonb_build_object('value',8000,'type','number','label','Bonus Amount'),
                'fld_emp_night_allow',     jsonb_build_object('value',300,'type','number','label','Night Allowance'),
                'fld_emp_over_time',       jsonb_build_object('value',200,'type','number','label','Over Time'),
                'fld_emp_one_hour_extra',  jsonb_build_object('value',250,'type','number','label','1 Hour Extra'),
                'fld_emp_company_sim',     jsonb_build_object('value',FALSE,'type','checkbox','label','Company Sim Issue')
            ),
            'emp_amit_patel',
            v_user_id, NOW(), 'submitted', v_user_id,
            v_org_id, NOW(), NOW()
        )
    ON CONFLICT (id) DO UPDATE SET
        form_id          = EXCLUDED.form_id,
        record_data      = EXCLUDED.record_data,
        employee_id      = EXCLUDED.employee_id,
        submitted_by     = EXCLUDED.submitted_by,
        status           = EXCLUDED.status,
        user_id          = EXCLUDED.user_id,
        "organizationId" = EXCLUDED."organizationId",
        updated_at       = NOW();

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Inserted 3 dummy employees';
    RAISE NOTICE '  EMP-0001  Rajesh Kumar  (IT / Senior Software Engineer)';
    RAISE NOTICE '  EMP-0002  Priya Sharma  (HR / HR Manager)';
    RAISE NOTICE '  EMP-0003  Amit Patel    (Production / Supervisor)';
    RAISE NOTICE '==========================================';
END $$;

COMMIT;

-- =============================================================================
-- Verification queries
-- =============================================================================
-- SELECT id, employee_name, department, designation, status FROM employees
--  WHERE id LIKE 'emp_%' ORDER BY employee_name;
--
-- SELECT id, record_data->'fld_emp_employee_id'->>'value' AS emp_id,
--        record_data->'fld_emp_employee_name'->>'value' AS name,
--        record_data->'fld_emp_department'->>'value' AS dept,
--        submitted_at
--   FROM form_records_14
--  WHERE form_id = 'form_hr_employee_master'
--  ORDER BY record_data->'fld_emp_employee_id'->>'value';
