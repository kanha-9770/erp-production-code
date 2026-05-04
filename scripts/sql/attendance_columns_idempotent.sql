-- Idempotent SQL to bring an existing Postgres database up to the current
-- attendance-related schema without running `prisma migrate dev`.
--
-- Use this when the dev server holds the Prisma DLL lock on Windows and
-- you can't restart immediately. After running this against your DB, you
-- still need to do `npx prisma generate` next time the server is down so
-- the runtime client knows about the columns.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / IF EXISTS guards,
-- so executing twice is a no-op on the second pass.
--
-- Run via: psql, Supabase SQL editor, or any Postgres client connected
-- to the same DB Prisma is using.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- attendance_records — additive columns from the punch-hardening rounds
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS organization_id     TEXT,
  ADD COLUMN IF NOT EXISTS check_in_at         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS check_out_at        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS check_in_lat        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_in_lng        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_out_lat       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_out_lng       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS check_in_ip         TEXT,
  ADD COLUMN IF NOT EXISTS check_out_ip        TEXT,
  ADD COLUMN IF NOT EXISTS check_in_device     TEXT,
  ADD COLUMN IF NOT EXISTS check_out_device    TEXT,
  ADD COLUMN IF NOT EXISTS check_in_source     TEXT,
  ADD COLUMN IF NOT EXISTS check_out_source    TEXT,
  ADD COLUMN IF NOT EXISTS break_minutes       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_minutes        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_out_minutes   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_minutes    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_auto_checked_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status              TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key     TEXT,
  ADD COLUMN IF NOT EXISTS check_in_photo      TEXT,
  ADD COLUMN IF NOT EXISTS check_out_photo     TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_idempotency_key_key
  ON attendance_records(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS attendance_records_organization_id_idx
  ON attendance_records(organization_id);

CREATE INDEX IF NOT EXISTS attendance_records_check_in_at_idx
  ON attendance_records(check_in_at);

-- ─────────────────────────────────────────────────────────────────────
-- attendance_configurations — full table (one row per org)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_configurations (
  id                              TEXT PRIMARY KEY,
  organization_id                 TEXT UNIQUE,
  default_shift_start             TEXT NOT NULL DEFAULT '09:00',
  default_shift_end               TEXT NOT NULL DEFAULT '18:00',
  grace_minutes                   INTEGER NOT NULL DEFAULT 15,
  half_day_min_hours              DOUBLE PRECISION NOT NULL DEFAULT 4,
  full_day_min_hours              DOUBLE PRECISION NOT NULL DEFAULT 8,
  overtime_after_hours            DOUBLE PRECISION NOT NULL DEFAULT 9,
  break_minutes                   INTEGER NOT NULL DEFAULT 60,
  weekly_off_days                 JSONB NOT NULL DEFAULT '[0]'::jsonb,
  auto_checkout_at                TEXT,
  geofence_mode                   TEXT NOT NULL DEFAULT 'OFF',
  geofence_lat                    DOUBLE PRECISION,
  geofence_lng                    DOUBLE PRECISION,
  geofence_radius_m               INTEGER,
  ip_whitelist                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  payable_basis                   TEXT NOT NULL DEFAULT 'monthDays',
  workflow_module_name            TEXT DEFAULT 'Attendance',
  enforce_employee_active         BOOLEAN NOT NULL DEFAULT FALSE,
  min_punch_gap_seconds           INTEGER NOT NULL DEFAULT 5,
  face_capture_mode               TEXT NOT NULL DEFAULT 'OFF',
  face_photo_max_kb               INTEGER NOT NULL DEFAULT 800,
  attendance_module_id            TEXT,
  notify_on_punch                 BOOLEAN NOT NULL DEFAULT TRUE,
  attendance_approver_role_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active                       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Idempotent column adds for tenants whose table was created before the
-- newest fields landed. Each ALTER is a no-op when the column exists.
ALTER TABLE attendance_configurations
  ADD COLUMN IF NOT EXISTS workflow_module_name         TEXT DEFAULT 'Attendance',
  ADD COLUMN IF NOT EXISTS enforce_employee_active      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS min_punch_gap_seconds        INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS face_capture_mode            TEXT NOT NULL DEFAULT 'OFF',
  ADD COLUMN IF NOT EXISTS face_photo_max_kb            INTEGER NOT NULL DEFAULT 800,
  ADD COLUMN IF NOT EXISTS attendance_module_id         TEXT,
  ADD COLUMN IF NOT EXISTS notify_on_punch              BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS attendance_approver_role_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS attendance_configurations_organization_id_idx
  ON attendance_configurations(organization_id);

CREATE INDEX IF NOT EXISTS attendance_configurations_is_active_idx
  ON attendance_configurations(is_active);

-- ─────────────────────────────────────────────────────────────────────
-- attendance_regularizations — request → admin/approver review → apply
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_regularizations (
  id                       TEXT PRIMARY KEY,
  organization_id          TEXT NOT NULL,
  user_id                  TEXT NOT NULL,
  date                     TEXT NOT NULL,
  attendance_id            TEXT,
  current_check_in_at      TIMESTAMP(3),
  current_check_out_at     TIMESTAMP(3),
  requested_check_in_at    TIMESTAMP(3),
  requested_check_out_at   TIMESTAMP(3),
  reason                   TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'PENDING',
  requested_by_id          TEXT NOT NULL,
  reviewed_by_id           TEXT,
  reviewed_at              TIMESTAMP(3),
  review_note              TEXT,
  created_at               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS attendance_regularizations_org_status_idx
  ON attendance_regularizations(organization_id, status);

CREATE INDEX IF NOT EXISTS attendance_regularizations_user_date_idx
  ON attendance_regularizations(user_id, date);

CREATE INDEX IF NOT EXISTS attendance_regularizations_status_idx
  ON attendance_regularizations(status);

CREATE INDEX IF NOT EXISTS attendance_regularizations_requested_by_id_idx
  ON attendance_regularizations(requested_by_id);

COMMIT;
