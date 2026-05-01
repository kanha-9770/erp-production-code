BEGIN;

UPDATE payroll_configurations
   SET is_active = FALSE,
       updated_at = NOW()
 WHERE is_active = TRUE
   AND organization_id IS NULL;

WITH cross_org AS (
    SELECT pc.id
      FROM payroll_configurations pc
      LEFT JOIN forms f_emp        ON f_emp.id = pc.attendance_field_mappings->'employee'->>'formId'
      LEFT JOIN form_modules m_emp ON m_emp.id = f_emp.module_id
      LEFT JOIN forms f_in         ON f_in.id  = pc.attendance_field_mappings->'checkIn'->>'formId'
      LEFT JOIN form_modules m_in  ON m_in.id  = f_in.module_id
      LEFT JOIN forms f_out        ON f_out.id = pc.attendance_field_mappings->'checkOut'->>'formId'
      LEFT JOIN form_modules m_out ON m_out.id = f_out.module_id
     WHERE pc.is_active = TRUE
       AND pc.organization_id IS NOT NULL
       AND (
            (m_emp.organization_id IS NOT NULL AND m_emp.organization_id <> pc.organization_id)
         OR (m_in.organization_id  IS NOT NULL AND m_in.organization_id  <> pc.organization_id)
         OR (m_out.organization_id IS NOT NULL AND m_out.organization_id <> pc.organization_id)
       )
)
UPDATE payroll_configurations
   SET is_active = FALSE,
       updated_at = NOW()
 WHERE id IN (SELECT id FROM cross_org);

WITH polluted AS (
    SELECT fr.id, m.organization_id AS true_org
      FROM form_records fr
      JOIN forms f        ON f.id = fr.form_id
      JOIN form_modules m ON m.id = f.module_id
     WHERE m.organization_id IS NOT NULL
       AND fr.organization_id IS DISTINCT FROM m.organization_id
)
UPDATE form_records fr
   SET organization_id = p.true_org,
       updated_at = NOW()
  FROM polluted p
 WHERE fr.id = p.id;

WITH polluted_14 AS (
    SELECT r.id, m.organization_id AS true_org
      FROM form_records_14 r
      JOIN forms f        ON f.id = r.form_id
      JOIN form_modules m ON m.id = f.module_id
     WHERE m.organization_id IS NOT NULL
       AND r."organizationId" IS DISTINCT FROM m.organization_id
)
UPDATE form_records_14 r
   SET "organizationId" = p.true_org,
       updated_at = NOW()
  FROM polluted_14 p
 WHERE r.id = p.id;

SELECT 'orgs'                  AS metric, COUNT(*) AS value FROM organizations
UNION ALL
SELECT 'users_with_org',                  COUNT(*) FROM users WHERE organization_id IS NOT NULL
UNION ALL
SELECT 'users_without_org',               COUNT(*) FROM users WHERE organization_id IS NULL
UNION ALL
SELECT 'active_payroll_configs',          COUNT(*) FROM payroll_configurations WHERE is_active
UNION ALL
SELECT 'active_configs_null_org',         COUNT(*) FROM payroll_configurations WHERE is_active AND organization_id IS NULL
UNION ALL
SELECT 'form_records_total',              COUNT(*) FROM form_records
UNION ALL
SELECT 'form_records_org_mismatch',       COUNT(*)
  FROM form_records fr
  JOIN forms f        ON f.id = fr.form_id
  JOIN form_modules m ON m.id = f.module_id
 WHERE m.organization_id IS NOT NULL
   AND fr.organization_id IS DISTINCT FROM m.organization_id
UNION ALL
SELECT 'form_records_14_org_mismatch',    COUNT(*)
  FROM form_records_14 r
  JOIN forms f        ON f.id = r.form_id
  JOIN form_modules m ON m.id = f.module_id
 WHERE m.organization_id IS NOT NULL
   AND r."organizationId" IS DISTINCT FROM m.organization_id;

COMMIT;
