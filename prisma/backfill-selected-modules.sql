-- Backfill Organization.selected_modules for existing rows.
-- Run once after the schema migration that adds the `selected_modules` column.
-- Existing orgs are granted ALL modules so current behavior is preserved —
-- nobody loses access to a page they could previously see.
--
-- Usage:
--   psql "$DATABASE_URL" -f prisma/backfill-selected-modules.sql
--
-- Safe to run repeatedly; only orgs with an empty array get updated.

UPDATE organizations
SET selected_modules = ARRAY['hr', 'real_estate', 'inventory', 'asset_management']
WHERE selected_modules IS NULL
   OR cardinality(selected_modules) = 0;
