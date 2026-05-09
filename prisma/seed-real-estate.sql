-- ============================================================================
-- REBM Module — Tailored seed data for testing.
--
-- TARGETED at:
--   organization_id = cmotuh90k00jcnx0j9j5og0ez
--   primary user    = cmotufdoz00j7nx0jlx3ocypc
--
-- This script:
--   1. Wires the Real Estate module into the sidebar (FormModule + anchor).
--   2. Creates 3 dummy users (emails end in @brokerage.test) so the MLM tree
--      has 4 levels — the *only* way to test multi-level commission overrides.
--      Those users have no password and cannot log in; they exist purely as
--      tree references. They are easy to identify and the UNINSTALL block at
--      the bottom removes them.
--   3. Seeds rich, realistic data across every REBM table.
--
-- Idempotent:
--   Every insert uses stable IDs prefixed `rebm_seed_` with ON CONFLICT (id)
--   DO NOTHING. Re-running this script does not duplicate or modify rows.
--
-- Touches:
--   re_*  tables, re_buyers, plus three new rows in `users` (dummy agents),
--   one row in `form_modules`, and one in `static_page_anchors`. Nothing else.
--
-- Prerequisites:
--   1. Schema is up to date:  npx prisma db push
--   2. The hardcoded organization and user IDs above exist.
--
-- Usage (from project root):
--   psql "$DATABASE_URL" -f prisma/seed-real-estate.sql
--
-- After seeding:
--   - Refresh the app — "Real Estate" appears in the sidebar.
--   - Three PENDING transactions are pre-loaded with CONTRACT docs. Open any
--     and click "Close & post commissions" to fire the engine end-to-end.
-- ============================================================================

BEGIN;

DO $REBM_SEED$
DECLARE
  -- ── Targets ────────────────────────────────────────────────────────────────
  v_org_id  text := 'cmotuh90k00jcnx0j9j5og0ez';
  v_user_1  text := 'cmotufdoz00j7nx0jlx3ocypc';  -- Principal Broker (real user)
  v_user_2  text := 'rebm_seed_user_2';            -- Dummy agent (Senior)
  v_user_3  text := 'rebm_seed_user_3';            -- Dummy agent (Associate)
  v_user_4  text := 'rebm_seed_user_4';            -- Dummy agent (Trainee)

  v_now     timestamptz := NOW();
  v_currency text := 'INR';

  -- ── Stable seed IDs ────────────────────────────────────────────────────────
  v_module_id     text := 'rebm_seed_module_real_estate';
  v_anchor_id     text := 'rebm_seed_anchor_group';

  v_rank_trainee  text := 'rebm_seed_rank_trainee';
  v_rank_assoc    text := 'rebm_seed_rank_associate';
  v_rank_senior   text := 'rebm_seed_rank_senior';
  v_rank_md       text := 'rebm_seed_rank_md';

  v_rule_v1       text := 'rebm_seed_rule_v1';   -- superseded
  v_rule_default  text := 'rebm_seed_rule_v2';   -- active

  v_agent_1       text := 'rebm_seed_agent_1';
  v_agent_2       text := 'rebm_seed_agent_2';
  v_agent_3       text := 'rebm_seed_agent_3';
  v_agent_4       text := 'rebm_seed_agent_4';
  -- Second leg / extended tree (status & compliance variety)
  v_agent_5       text := 'rebm_seed_agent_5';   -- Vikram   — Senior, COMPLIANT
  v_agent_6       text := 'rebm_seed_agent_6';   -- Neha     — Associate, COMPLIANT (recently promoted)
  v_agent_7       text := 'rebm_seed_agent_7';   -- Rahul    — Trainee, NON_COMPLIANT
  v_agent_8       text := 'rebm_seed_agent_8';   -- Aisha    — Trainee, SUSPENDED
  v_agent_9       text := 'rebm_seed_agent_9';   -- Karan    — Associate, TERMINATED
  v_agent_10      text := 'rebm_seed_agent_10';  -- Sneha    — Trainee, PENDING_KYC (3rd-level depth)

  v_user_5        text := 'rebm_seed_user_5';
  v_user_6        text := 'rebm_seed_user_6';
  v_user_7        text := 'rebm_seed_user_7';
  v_user_8        text := 'rebm_seed_user_8';
  v_user_9        text := 'rebm_seed_user_9';
  v_user_10       text := 'rebm_seed_user_10';

  v_buyer_1       text := 'rebm_seed_buyer_1';
  v_buyer_2       text := 'rebm_seed_buyer_2';
  v_buyer_3       text := 'rebm_seed_buyer_3';

  v_wallet_1      text := 'rebm_seed_wallet_1';
  v_wallet_2      text := 'rebm_seed_wallet_2';
  v_wallet_3      text := 'rebm_seed_wallet_3';
  v_wallet_4      text := 'rebm_seed_wallet_4';
  v_wallet_5      text := 'rebm_seed_wallet_5';   -- Vikram (active)
  v_wallet_6      text := 'rebm_seed_wallet_6';   -- Neha (active)
  v_wallet_7      text := 'rebm_seed_wallet_7';   -- Rahul (active but non-compliant)
  v_wallet_8      text := 'rebm_seed_wallet_8';   -- Aisha (frozen — suspended)
  v_wallet_9      text := 'rebm_seed_wallet_9';   -- Karan (frozen — terminated)

BEGIN
  -- ─── 0. Validate prerequisites ────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id) THEN
    RAISE EXCEPTION '[rebm-seed] Organization % not found.', v_org_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_1 AND organization_id = v_org_id) THEN
    RAISE EXCEPTION '[rebm-seed] User % not found in org %.', v_user_1, v_org_id;
  END IF;
  RAISE NOTICE '[rebm-seed] Targeting org=%, principal user=%', v_org_id, v_user_1;

  -- ─── 1. Dummy agent users (for the MLM tree) ──────────────────────────────
  -- Marked clearly so they're easy to identify. They cannot log in (no
  -- password). The UNINSTALL block at the bottom removes them.

  INSERT INTO users (
    id, email, status, organization_id, email_verified,
    first_name, last_name, department, created_at, updated_at
  ) VALUES
    (v_user_2, 'priya.sharma@brokerage.test', 'ACTIVE', v_org_id, true,
      'Priya', 'Sharma', 'Real Estate', v_now, v_now),
    (v_user_3, 'arjun.iyer@brokerage.test', 'ACTIVE', v_org_id, true,
      'Arjun', 'Iyer', 'Real Estate', v_now, v_now),
    (v_user_4, 'meera.patel@brokerage.test', 'ACTIVE', v_org_id, true,
      'Meera', 'Patel', 'Real Estate', v_now, v_now),
    (v_user_5, 'vikram.singh@brokerage.test', 'ACTIVE', v_org_id, true,
      'Vikram', 'Singh', 'Real Estate', v_now, v_now),
    (v_user_6, 'neha.kapoor@brokerage.test', 'ACTIVE', v_org_id, true,
      'Neha', 'Kapoor', 'Real Estate', v_now, v_now),
    (v_user_7, 'rahul.verma@brokerage.test', 'ACTIVE', v_org_id, true,
      'Rahul', 'Verma', 'Real Estate', v_now, v_now),
    (v_user_8, 'aisha.khan@brokerage.test', 'INACTIVE', v_org_id, true,
      'Aisha', 'Khan', 'Real Estate', v_now, v_now),
    (v_user_9, 'karan.mehra@brokerage.test', 'INACTIVE', v_org_id, true,
      'Karan', 'Mehra', 'Real Estate', v_now, v_now),
    (v_user_10, 'sneha.joshi@brokerage.test', 'ACTIVE', v_org_id, true,
      'Sneha', 'Joshi', 'Real Estate', v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- ─── 2. Sidebar wiring (FormModule + StaticPageAnchor) ────────────────────
  -- This is what makes "Real Estate" appear in the sidebar.
  -- Reuses an existing "Real Estate" FormModule if one was already created
  -- (e.g. by the in-app "Add to sidebar" install button), otherwise inserts
  -- a fresh row. v_module_id is rewritten to whichever id ends up in DB.

  SELECT id INTO v_module_id
    FROM form_modules
   WHERE organization_id = v_org_id AND name = 'Real Estate'
   LIMIT 1;

  IF v_module_id IS NULL THEN
    v_module_id := 'rebm_seed_module_real_estate';
    INSERT INTO form_modules (
      id, name, organization_id, description, icon, settings,
      module_type, level, path, is_active, sort_order, created_at, updated_at
    ) VALUES (
      v_module_id, 'Real Estate', v_org_id,
      'Property inventory, agents, leads, transactions, commissions.',
      'building2', '{}'::jsonb,
      'standard', 0, '/real-estate', true, 999, v_now, v_now
    );
  END IF;

  -- Anchor every page in the "Real Estate" group under that module.
  -- ON CONFLICT on the natural unique (organization_id, path) so a stale
  -- anchor from the in-app installer is repointed at the module above.
  INSERT INTO static_page_anchors (
    id, organization_id, path, module_id, sort_order, created_at, updated_at
  ) VALUES (
    v_anchor_id, v_org_id, 'group:Real Estate', v_module_id, 0, v_now, v_now
  )
  ON CONFLICT (organization_id, path)
    DO UPDATE SET module_id = EXCLUDED.module_id, updated_at = EXCLUDED.updated_at;

  -- ─── 3. Ranks ─────────────────────────────────────────────────────────────

  INSERT INTO re_ranks (
    id, organization_id, name, code, description, level,
    min_personal_sales, min_team_size, min_team_revenue, evaluation_window_days,
    override_percents, rank_up_bonus, team_bonus_percent,
    is_active, sort_order, created_at, updated_at
  ) VALUES
    (v_rank_trainee, v_org_id, 'Trainee', 'TRAINEE',
      'Entry rank — no minimums.', 0,
      NULL, NULL, NULL, NULL,
      '[]'::jsonb, NULL, NULL, true, 0, v_now, v_now),
    (v_rank_assoc, v_org_id, 'Associate', 'ASSOCIATE',
      'After 5 personal sales.', 1,
      5, NULL, NULL, NULL,
      '[5]'::jsonb, 5000, NULL, true, 1, v_now, v_now),
    (v_rank_senior, v_org_id, 'Senior Partner', 'SENIOR',
      '20 personal sales + team of 5 + 50M team revenue.', 2,
      20, 5, 50000000, NULL,
      '[5,3]'::jsonb, 25000, NULL, true, 2, v_now, v_now),
    (v_rank_md, v_org_id, 'Managing Director', 'MD',
      '50 sales + 15 team + 200M team revenue.', 3,
      50, 15, 200000000, NULL,
      '[5,3,1]'::jsonb, 100000, 1, true, 3, v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  -- ─── 4. Commission rules ──────────────────────────────────────────────────
  -- Two rows: v1 superseded (inactive), v2 active. Demonstrates the
  -- versioning history that closed transactions reference (FR-5.11 / BR-9).

  INSERT INTO re_commission_rules (
    id, organization_id, name, description, property_type, version, is_active,
    listing_agent_percent, selling_agent_percent, brokerage_percent,
    override_percents, use_rank_overrides, max_override_depth,
    default_base_percent, hold_period_days, compression_rule,
    created_by_id, created_at, updated_at
  ) VALUES
    (v_rule_v1, v_org_id,
      'Default split (legacy)',
      'Original 25/25/50 split — superseded by v2.',
      NULL, 1, false,
      25, 25, 50,
      '[4,2]'::jsonb, false, 2, 2, 7, true,
      v_user_1, v_now - INTERVAL '120 days', v_now - INTERVAL '60 days'),
    (v_rule_default, v_org_id,
      'Default split',
      'Org-wide active rule — 30/30/40 with 5/3/1 overrides.',
      NULL, 2, true,
      30, 30, 40,
      '[5,3,1]'::jsonb, false, 3,
      2, 7, true,
      v_user_1, v_now - INTERVAL '60 days', v_now)
  ON CONFLICT (id) DO NOTHING;

  -- ─── 5. Agent profiles (MLM tree) ─────────────────────────────────────────
  --   Agent 1  (Principal Broker)    ← real user
  --     ├── Agent 2 (Senior Partner) ← Priya
  --     │     ├── Agent 3 (Associate) ← Arjun
  --     │     └── Agent 4 (Trainee)   ← Meera

  INSERT INTO re_agent_profiles (
    id, organization_id, user_id, sponsor_id, parent_id, sponsor_code,
    rank_id, rank_assigned_at, status, compliance_status,
    license_number, license_authority, license_issued_at, license_expires_at,
    joined_at, specializations, service_areas, bio, created_at, updated_at
  ) VALUES
    -- Agent 1: Principal Broker, MD rank, fully compliant
    (v_agent_1, v_org_id, v_user_1, NULL, NULL, 'NESS-2024',
      v_rank_md, v_now - INTERVAL '180 days', 'ACTIVE', 'COMPLIANT',
      'RERA/MH/A52400012345', 'MahaRERA',
      v_now - INTERVAL '3 years', v_now + INTERVAL '2 years',
      v_now - INTERVAL '5 years',
      '["RESIDENTIAL","COMMERCIAL"]'::jsonb,
      '["Mumbai","Pune","Goa"]'::jsonb,
      'Principal broker. 12 years in Mumbai luxury and commercial real estate.',
      v_now - INTERVAL '5 years', v_now),

    -- Agent 2: Senior Partner, sponsored by Agent 1
    (v_agent_2, v_org_id, v_user_2, v_agent_1, v_agent_1, 'PRIYA-99',
      v_rank_senior, v_now - INTERVAL '90 days', 'ACTIVE', 'COMPLIANT',
      'RERA/MH/A52400067890', 'MahaRERA',
      v_now - INTERVAL '18 months', v_now + INTERVAL '14 months',
      v_now - INTERVAL '3 years',
      '["RESIDENTIAL"]'::jsonb,
      '["Andheri","Bandra","Worli"]'::jsonb,
      'Senior partner specialising in west-Mumbai residential.',
      v_now - INTERVAL '3 years', v_now),

    -- Agent 3: Associate, sponsored by Agent 2 — KYC pending (queue work)
    (v_agent_3, v_org_id, v_user_3, v_agent_2, v_agent_2, 'ARJUN-77',
      v_rank_assoc, v_now - INTERVAL '14 days', 'ACTIVE', 'PENDING_KYC',
      NULL, NULL, NULL, NULL,
      v_now - INTERVAL '8 months',
      '["RESIDENTIAL"]'::jsonb,
      '["Powai","Hiranandani","Vikhroli"]'::jsonb,
      'Joined 8 months ago. License application in progress.',
      v_now - INTERVAL '8 months', v_now),

    -- Agent 4: Trainee, sponsored by Agent 2 — pending KYC, expiring docs
    (v_agent_4, v_org_id, v_user_4, v_agent_2, v_agent_2, 'MEERA-55',
      v_rank_trainee, v_now - INTERVAL '60 days', 'ACTIVE', 'PENDING_KYC',
      NULL, NULL, NULL, NULL,
      v_now - INTERVAL '60 days',
      '["COMMERCIAL"]'::jsonb,
      '["BKC","Lower Parel","Goregaon"]'::jsonb,
      'Trainee — focused on commercial leasing.',
      v_now - INTERVAL '60 days', v_now),

    -- Agent 5: Senior Partner, second leg under Agent 1 — fully compliant.
    (v_agent_5, v_org_id, v_user_5, v_agent_1, v_agent_1, 'VIKRAM-42',
      v_rank_senior, v_now - INTERVAL '120 days', 'ACTIVE', 'COMPLIANT',
      'RERA/MH/A52400099001', 'MahaRERA',
      v_now - INTERVAL '24 months', v_now + INTERVAL '12 months',
      v_now - INTERVAL '4 years',
      '["RESIDENTIAL","COMMERCIAL"]'::jsonb,
      '["Pune","Hinjewadi","Kothrud"]'::jsonb,
      'Senior partner — Pune metro corridor specialist.',
      v_now - INTERVAL '4 years', v_now),

    -- Agent 6: Associate (recently promoted from Trainee, see promotion log)
    (v_agent_6, v_org_id, v_user_6, v_agent_5, v_agent_5, 'NEHA-21',
      v_rank_assoc, v_now - INTERVAL '7 days', 'ACTIVE', 'COMPLIANT',
      'RERA/MH/A52400099157', 'MahaRERA',
      v_now - INTERVAL '10 months', v_now + INTERVAL '14 months',
      v_now - INTERVAL '14 months',
      '["RESIDENTIAL"]'::jsonb,
      '["Pune","Wakad","Baner"]'::jsonb,
      'Promoted from Trainee last week — closed 5 deals in Q1.',
      v_now - INTERVAL '14 months', v_now),

    -- Agent 7: Trainee, NON_COMPLIANT — license expired (admin queue work)
    (v_agent_7, v_org_id, v_user_7, v_agent_5, v_agent_5, 'RAHUL-83',
      v_rank_trainee, v_now - INTERVAL '90 days', 'ACTIVE', 'NON_COMPLIANT',
      'RERA/MH/A52400099402', 'MahaRERA',
      v_now - INTERVAL '13 months', v_now - INTERVAL '30 days', -- EXPIRED
      v_now - INTERVAL '13 months',
      '["RESIDENTIAL"]'::jsonb,
      '["Pune","Pimpri","Chinchwad"]'::jsonb,
      'License lapsed — pending renewal. Should not appear on payouts.',
      v_now - INTERVAL '13 months', v_now),

    -- Agent 8: Trainee, SUSPENDED for ethics violation — under Priya
    (v_agent_8, v_org_id, v_user_8, v_agent_2, v_agent_2, 'AISHA-65',
      v_rank_trainee, v_now - INTERVAL '120 days', 'SUSPENDED', 'NON_COMPLIANT',
      'RERA/MH/A52400099510', 'MahaRERA',
      v_now - INTERVAL '8 months', v_now + INTERVAL '16 months',
      v_now - INTERVAL '10 months',
      '["RESIDENTIAL"]'::jsonb,
      '["Andheri","Juhu"]'::jsonb,
      'Suspended pending review — buyer-misrepresentation complaint.',
      v_now - INTERVAL '10 months', v_now),

    -- Agent 9: Associate, TERMINATED — left brokerage, retain history.
    (v_agent_9, v_org_id, v_user_9, v_agent_2, v_agent_2, 'KARAN-04',
      v_rank_assoc, v_now - INTERVAL '300 days', 'TERMINATED', 'NON_COMPLIANT',
      'RERA/MH/A52400099677', 'MahaRERA',
      v_now - INTERVAL '20 months', v_now + INTERVAL '4 months',
      v_now - INTERVAL '24 months',
      '["COMMERCIAL"]'::jsonb,
      '["BKC","Worli"]'::jsonb,
      'Left to join competitor — historical commissions retained.',
      v_now - INTERVAL '24 months', v_now),

    -- Agent 10: Trainee, PENDING_KYC — 3rd-level depth (under Neha → Vikram → MD)
    (v_agent_10, v_org_id, v_user_10, v_agent_6, v_agent_6, 'SNEHA-08',
      v_rank_trainee, v_now - INTERVAL '5 days', 'PENDING_KYC', 'PENDING_KYC',
      NULL, NULL, NULL, NULL,
      v_now - INTERVAL '5 days',
      '["RESIDENTIAL"]'::jsonb,
      '["Pune","Aundh"]'::jsonb,
      'Just onboarded by Neha — KYC docs in upload.',
      v_now - INTERVAL '5 days', v_now)
  ON CONFLICT (id) DO NOTHING;

  -- Suspension / termination metadata for the lifecycle test agents.
  UPDATE re_agent_profiles
     SET suspended_at      = v_now - INTERVAL '21 days',
         suspension_reason = 'Buyer misrepresentation complaint — under review.'
   WHERE id = v_agent_8;
  UPDATE re_agent_profiles
     SET terminated_at = v_now - INTERVAL '60 days'
   WHERE id = v_agent_9;

  -- Rank promotion history — exercises the promotion log UI.
  -- Neha was promoted from Trainee → Associate 7 days ago (system-triggered).
  -- Agent 1 promoted from Senior → MD 180 days ago (manual).
  INSERT INTO re_rank_promotions (
    id, agent_id, from_rank_id, to_rank_id, triggered_by,
    approved_by_id, reason, created_at
  ) VALUES
    ('rebm_seed_promo_neha', v_agent_6, v_rank_trainee, v_rank_assoc, 'SYSTEM',
      v_user_1, 'Auto-promoted: 5 personal sales threshold met.',
      v_now - INTERVAL '7 days'),
    ('rebm_seed_promo_md', v_agent_1, v_rank_senior, v_rank_md, 'MANUAL',
      v_user_1, 'Founding broker — assigned at module install.',
      v_now - INTERVAL '180 days')
  ON CONFLICT (id) DO NOTHING;

  -- ─── 6. Properties ────────────────────────────────────────────────────────

  INSERT INTO re_properties (
    id, organization_id, title, code, description,
    type, sub_type, status,
    address_line_1, city, state, country, postal_code,
    listing_price, currency, area, area_unit, bedrooms, bathrooms,
    parking_spots, year_built, features,
    commission_term_type, commission_percentage, commission_flat_fee,
    listed_at, expected_closing_at, expires_at,
    listing_agent_id, primary_image_url,
    created_by_id, created_at, updated_at
  ) VALUES
    -- 1. Andheri 3BHK — listed by Agent 3, available
    ('rebm_seed_prop_1', v_org_id,
      '3 BHK Sea-facing Apartment, Andheri West', 'PROP-ANDH-001',
      'Spacious 3 BHK apartment with sea-facing balcony. Park view from master bedroom.',
      'RESIDENTIAL', 'APARTMENT', 'AVAILABLE',
      'Plot 7, Lokhandwala Complex', 'Mumbai', 'Maharashtra', 'India', '400053',
      25000000, v_currency, 1450, 'sqft', 3, 3,
      2, 2018, '["pool","gym","gated","power-backup","clubhouse"]'::jsonb,
      'PERCENTAGE', 2, NULL,
      v_now - INTERVAL '40 days', v_now + INTERVAL '60 days', v_now + INTERVAL '180 days',
      v_user_3, 'https://picsum.photos/seed/andheri3bhk/1200/800',
      v_user_1, v_now - INTERVAL '40 days', v_now),

    -- 2. Goa villa — listed by Agent 2, available
    ('rebm_seed_prop_2', v_org_id,
      'Sea-facing Villa, Anjuna Goa', 'PROP-GOA-002',
      'Luxury 5 BHK villa in Anjuna with private pool and 6500 sqft of built-up area.',
      'RESIDENTIAL', 'VILLA', 'AVAILABLE',
      'Anjuna Beach Road', 'North Goa', 'Goa', 'India', '403509',
      80000000, v_currency, 6500, 'sqft', 5, 6,
      4, 2020, '["pool","sea-view","private-garden","staff-quarters","wine-cellar"]'::jsonb,
      'PERCENTAGE', 2.5, NULL,
      v_now - INTERVAL '15 days', v_now + INTERVAL '120 days', v_now + INTERVAL '270 days',
      v_user_2, 'https://picsum.photos/seed/goavilla/1200/800',
      v_user_1, v_now - INTERVAL '15 days', v_now),

    -- 3. BKC office — under contract, listed by Agent 1
    ('rebm_seed_prop_3', v_org_id,
      'Grade-A Office, BKC', 'PROP-BKC-003',
      '4500 sqft Grade-A office in Bandra-Kurla Complex Block G.',
      'COMMERCIAL', 'OFFICE', 'UNDER_CONTRACT',
      'BKC Block G, Plot 32', 'Mumbai', 'Maharashtra', 'India', '400051',
      120000000, v_currency, 4500, 'sqft', NULL, 4,
      8, 2019, '["air-conditioned","fire-safety","backup-power","cafeteria"]'::jsonb,
      'PERCENTAGE', 2, NULL,
      v_now - INTERVAL '90 days', v_now + INTERVAL '14 days', NULL,
      v_user_1, 'https://picsum.photos/seed/bkcoffice/1200/800',
      v_user_1, v_now - INTERVAL '90 days', v_now),

    -- 4. Pune plot — available, listed by Agent 2
    ('rebm_seed_prop_4', v_org_id,
      'Residential Plot, Hinjewadi Phase III', 'PROP-PUN-004',
      '5000 sqft residential plot, gated layout, 30 minutes from Pune airport.',
      'LAND', 'PLOT', 'AVAILABLE',
      'Hinjewadi Phase III, Plot 142', 'Pune', 'Maharashtra', 'India', '411057',
      12000000, v_currency, 5000, 'sqft', NULL, NULL,
      NULL, NULL, '["gated-layout","corner-plot"]'::jsonb,
      'PERCENTAGE', 2, NULL,
      v_now - INTERVAL '60 days', NULL, v_now + INTERVAL '365 days',
      v_user_2, 'https://picsum.photos/seed/puneplot/1200/800',
      v_user_1, v_now - INTERVAL '60 days', v_now),

    -- 5. Powai studio — available, listed by Agent 3
    ('rebm_seed_prop_5', v_org_id,
      'Furnished Studio, Hiranandani Powai', 'PROP-POW-005',
      'Compact furnished studio near Hiranandani Gardens. Ideal for working professionals.',
      'RESIDENTIAL', 'STUDIO', 'AVAILABLE',
      'Hiranandani Gardens, Tower 4', 'Mumbai', 'Maharashtra', 'India', '400076',
      8500000, v_currency, 480, 'sqft', 1, 1,
      1, 2015, '["furnished","gym","pool","metro-access"]'::jsonb,
      'PERCENTAGE', 2, NULL,
      v_now - INTERVAL '7 days', NULL, NULL,
      v_user_3, 'https://picsum.photos/seed/powaistudio/1200/800',
      v_user_1, v_now - INTERVAL '7 days', v_now),

    -- 6. Bhiwandi warehouse — available, listed by Agent 4
    ('rebm_seed_prop_6', v_org_id,
      'Industrial Warehouse, Bhiwandi MIDC', 'PROP-BHI-006',
      '15000 sqft warehouse with truck-friendly access and 24x7 security.',
      'COMMERCIAL', 'WAREHOUSE', 'AVAILABLE',
      'Padgha MIDC Phase II', 'Bhiwandi', 'Maharashtra', 'India', '421302',
      30000000, v_currency, 15000, 'sqft', NULL, 2,
      6, 2017, '["truck-bay","cctv","loading-dock","fire-safety"]'::jsonb,
      'PERCENTAGE', 2, NULL,
      v_now - INTERVAL '30 days', NULL, NULL,
      v_user_4, 'https://picsum.photos/seed/bhiwandi/1200/800',
      v_user_1, v_now - INTERVAL '30 days', v_now),

    -- 7. Worli penthouse — available, listed by Agent 1, premium
    ('rebm_seed_prop_7', v_org_id,
      'Luxury Penthouse, Worli Sea Face', 'PROP-WOR-007',
      'Duplex penthouse with private terrace and unobstructed sea view.',
      'RESIDENTIAL', 'PENTHOUSE', 'AVAILABLE',
      'Worli Sea Face, Tower B', 'Mumbai', 'Maharashtra', 'India', '400018',
      150000000, v_currency, 5500, 'sqft', 4, 5,
      4, 2021, '["sea-view","terrace","jacuzzi","private-lift","smart-home"]'::jsonb,
      'PERCENTAGE', 2.5, NULL,
      v_now - INTERVAL '120 days', NULL, NULL,
      v_user_1, 'https://picsum.photos/seed/worlipenthouse/1200/800',
      v_user_1, v_now - INTERVAL '120 days', v_now),

    -- 8. Bandra retail — available, flat-fee commission, listed by Agent 2
    ('rebm_seed_prop_8', v_org_id,
      'High-Street Retail, Linking Road', 'PROP-BAN-008',
      '600 sqft high-street retail on Linking Road. Frontage 18 feet.',
      'COMMERCIAL', 'RETAIL', 'AVAILABLE',
      'Linking Road, near Holy Family', 'Mumbai', 'Maharashtra', 'India', '400050',
      20000000, v_currency, 600, 'sqft', NULL, 1,
      0, 2010, '["street-front","heavy-footfall"]'::jsonb,
      'FLAT_FEE', NULL, 250000,
      v_now - INTERVAL '5 days', NULL, NULL,
      v_user_2, 'https://picsum.photos/seed/bandrashop/1200/800',
      v_user_1, v_now - INTERVAL '5 days', v_now),

    -- 9. Lonavala farmhouse — available
    ('rebm_seed_prop_9', v_org_id,
      'Hilltop Farmhouse, Lonavala', 'PROP-LON-009',
      '2 acre farmhouse with private pool and orchard.',
      'AGRICULTURAL', 'FARM', 'AVAILABLE',
      'Pavna Lake Road', 'Lonavala', 'Maharashtra', 'India', '410401',
      45000000, v_currency, 2, 'acre', 4, 4,
      6, 2016, '["pool","orchard","mountain-view","caretaker-quarters"]'::jsonb,
      'PERCENTAGE', 3, NULL,
      v_now - INTERVAL '50 days', NULL, NULL,
      v_user_2, 'https://picsum.photos/seed/lonavala/1200/800',
      v_user_1, v_now - INTERVAL '50 days', v_now),

    -- 10. Goregaon townhouse — available
    ('rebm_seed_prop_10', v_org_id,
      '4 BHK Townhouse, Aarey Goregaon', 'PROP-GOR-010',
      'Independent 4 BHK townhouse with private garden.',
      'RESIDENTIAL', 'TOWNHOUSE', 'AVAILABLE',
      'Aarey Colony Road', 'Mumbai', 'Maharashtra', 'India', '400065',
      35000000, v_currency, 2400, 'sqft', 4, 4,
      2, 2014, '["garden","gated","power-backup"]'::jsonb,
      'PERCENTAGE', 2, NULL,
      v_now - INTERVAL '20 days', NULL, NULL,
      v_user_3, 'https://picsum.photos/seed/goregaon/1200/800',
      v_user_1, v_now - INTERVAL '20 days', v_now),

    -- 11. Thane plot — available
    ('rebm_seed_prop_11', v_org_id,
      'NA Plot, Thane Ghodbunder', 'PROP-THA-011',
      'NA plot suitable for residential development.',
      'LAND', 'PLOT', 'AVAILABLE',
      'Ghodbunder Road, Survey 142', 'Thane', 'Maharashtra', 'India', '400615',
      18000000, v_currency, 8000, 'sqft', NULL, NULL,
      NULL, NULL, '["main-road","NA-converted"]'::jsonb,
      'PERCENTAGE', 2, NULL,
      v_now - INTERVAL '70 days', NULL, NULL,
      v_user_4, 'https://picsum.photos/seed/thane/1200/800',
      v_user_1, v_now - INTERVAL '70 days', v_now),

    -- 12. Bandra apartment — under contract, listed by Agent 2
    ('rebm_seed_prop_12', v_org_id,
      '2 BHK Apartment, Bandra West', 'PROP-BAN-012',
      'Renovated 2 BHK in Pali Hill area with hill view.',
      'RESIDENTIAL', 'APARTMENT', 'UNDER_CONTRACT',
      'Pali Hill, Building 14', 'Mumbai', 'Maharashtra', 'India', '400050',
      32000000, v_currency, 1100, 'sqft', 2, 2,
      1, 2019, '["renovated","hill-view","gated"]'::jsonb,
      'PERCENTAGE', 2, NULL,
      v_now - INTERVAL '45 days', v_now + INTERVAL '21 days', NULL,
      v_user_2, 'https://picsum.photos/seed/bandra2bhk/1200/800',
      v_user_1, v_now - INTERVAL '45 days', v_now)
  ON CONFLICT (id) DO NOTHING;

  -- ─── 7. Property images (3 per property — 36 total) ───────────────────────

  INSERT INTO re_property_images (id, property_id, url, caption, is_primary, sort_order, created_at)
  SELECT
    'rebm_seed_img_' || p.id || '_' || g,
    p.id,
    'https://picsum.photos/seed/' || replace(p.id, 'rebm_seed_prop_', 'p') || '_' || g || '/1200/800',
    CASE g WHEN 1 THEN 'Living room' WHEN 2 THEN 'Kitchen' ELSE 'Master bedroom' END,
    g = 1,
    g - 1,
    v_now
  FROM re_properties p
  CROSS JOIN generate_series(1, 3) AS g
  WHERE p.organization_id = v_org_id AND p.id LIKE 'rebm_seed_prop_%'
  ON CONFLICT (id) DO NOTHING;

  -- ─── 8. Property documents (1 per property: title deed) ───────────────────

  INSERT INTO re_property_documents (id, property_id, type, name, url, uploaded_by_id, created_at)
  SELECT
    'rebm_seed_pdoc_' || p.id,
    p.id,
    'TITLE_DEED',
    'Title Deed — ' || p.code,
    'https://picsum.photos/seed/deed_' || replace(p.id, 'rebm_seed_prop_', '') || '/800/600',
    v_user_1,
    v_now
  FROM re_properties p
  WHERE p.organization_id = v_org_id AND p.id LIKE 'rebm_seed_prop_%'
  ON CONFLICT (id) DO NOTHING;

  -- ─── 9. Buyers ────────────────────────────────────────────────────────────

  INSERT INTO re_buyers (
    id, organization_id, name, email, phone, pan_or_tax_id,
    address_line_1, city, country, created_by_id, created_at, updated_at
  ) VALUES
    (v_buyer_1, v_org_id, 'Rajesh Kumar', 'rajesh.kumar@example.com', '+91-98200-11111',
      'ABCDE1234F', '14 MG Road, Lokhandwala', 'Mumbai', 'India',
      v_user_1, v_now - INTERVAL '40 days', v_now),
    (v_buyer_2, v_org_id, 'Sneha Reddy', 'sneha.reddy@example.com', '+91-98201-22222',
      'XYZAB5678G', '402 Hill View Apartments', 'Pune', 'India',
      v_user_1, v_now - INTERVAL '30 days', v_now),
    (v_buyer_3, v_org_id, 'Karthik Nair', 'karthik.nair@example.com', '+91-98202-33333',
      'PQRST9012H', '8 Marine Drive', 'Mumbai', 'India',
      v_user_1, v_now - INTERVAL '15 days', v_now)
  ON CONFLICT (id) DO NOTHING;

  -- ─── 10. Leads (every pipeline stage, multiple per stage) ─────────────────

  INSERT INTO re_leads (
    id, organization_id, name, email, phone,
    budget_min, budget_max, preferred_cities, property_types, bedrooms_min,
    status, score, source, source_details,
    assigned_agent_id, assigned_at, next_follow_up_at, last_contacted_at,
    converted_at, buyer_id, lost_reason, notes,
    created_by_id, created_at, updated_at
  ) VALUES
    -- NEW (2)
    ('rebm_seed_lead_new_1', v_org_id, 'Anita Desai', 'anita.desai@example.com', '+91-98300-00001',
      8000000, 12000000, '["Mumbai","Thane"]'::jsonb, '["RESIDENTIAL"]'::jsonb, 2,
      'NEW', 'WARM', 'WEBSITE', 'Homepage form',
      v_user_3, v_now - INTERVAL '1 day', v_now + INTERVAL '2 days', NULL,
      NULL, NULL, NULL, 'Looking for first home, 3-6 months timeline.',
      v_user_1, v_now - INTERVAL '1 day', v_now),
    ('rebm_seed_lead_new_2', v_org_id, 'Sandeep Rao', 'sandeep@example.com', '+91-98300-00002',
      15000000, 25000000, '["Mumbai"]'::jsonb, '["RESIDENTIAL"]'::jsonb, 3,
      'NEW', 'HOT', 'PORTAL', 'MagicBricks',
      v_user_2, v_now - INTERVAL '2 days', v_now + INTERVAL '1 day', NULL,
      NULL, NULL, NULL, 'Cash buyer; needs to close in 60 days.',
      v_user_1, v_now - INTERVAL '2 days', v_now),

    -- CONTACTED (2)
    ('rebm_seed_lead_cont_1', v_org_id, 'Vikram Mehta', 'vikram.mehta@example.com', '+91-98300-00003',
      30000000, 50000000, '["Mumbai"]'::jsonb, '["RESIDENTIAL","COMMERCIAL"]'::jsonb, 3,
      'CONTACTED', 'HOT', 'REFERRAL', 'Referred by Rajesh Kumar',
      v_user_2, v_now - INTERVAL '5 days', v_now + INTERVAL '1 day', v_now - INTERVAL '1 day',
      NULL, NULL, NULL, 'Investor; looking at high-end residential and Grade-A office.',
      v_user_1, v_now - INTERVAL '5 days', v_now),
    ('rebm_seed_lead_cont_2', v_org_id, 'Kavita Joshi', 'kavita@example.com', '+91-98300-00004',
      6000000, 9000000, '["Pune"]'::jsonb, '["RESIDENTIAL"]'::jsonb, 2,
      'CONTACTED', 'WARM', 'SOCIAL', 'Instagram ad',
      v_user_3, v_now - INTERVAL '4 days', v_now + INTERVAL '3 days', v_now - INTERVAL '2 days',
      NULL, NULL, NULL, 'First-time buyer, exploring Hinjewadi area.',
      v_user_1, v_now - INTERVAL '4 days', v_now),

    -- QUALIFIED (2)
    ('rebm_seed_lead_qual_1', v_org_id, 'Suresh Iyer', 'suresh.iyer@example.com', '+91-98300-00005',
      15000000, 20000000, '["Pune"]'::jsonb, '["RESIDENTIAL"]'::jsonb, 3,
      'QUALIFIED', 'HOT', 'PORTAL', 'MagicBricks',
      v_user_2, v_now - INTERVAL '8 days', v_now + INTERVAL '3 days', v_now - INTERVAL '2 days',
      NULL, NULL, NULL, 'Pre-approved loan with HDFC, ready to buy this quarter.',
      v_user_1, v_now - INTERVAL '8 days', v_now),
    ('rebm_seed_lead_qual_2', v_org_id, 'Divya Menon', 'divya@example.com', '+91-98300-00006',
      40000000, 60000000, '["Mumbai"]'::jsonb, '["RESIDENTIAL"]'::jsonb, 3,
      'QUALIFIED', 'HOT', 'REFERRAL', 'Referred by Vikram Mehta',
      v_user_2, v_now - INTERVAL '10 days', v_now + INTERVAL '2 days', v_now - INTERVAL '3 days',
      NULL, NULL, NULL, 'Looking for sea-facing 4BHK in Bandra/Worli.',
      v_user_1, v_now - INTERVAL '10 days', v_now),

    -- VIEWING_SCHEDULED (2)
    ('rebm_seed_lead_view_1', v_org_id, 'Neha Gupta', 'neha.gupta@example.com', '+91-98300-00007',
      90000000, 130000000, '["Mumbai"]'::jsonb, '["RESIDENTIAL"]'::jsonb, 4,
      'VIEWING_SCHEDULED', 'HOT', 'WALK_IN', NULL,
      v_user_1, v_now - INTERVAL '12 days', v_now + INTERVAL '5 days', v_now - INTERVAL '4 days',
      NULL, NULL, NULL, 'Penthouse buyer, viewing scheduled at Worli.',
      v_user_1, v_now - INTERVAL '12 days', v_now),
    ('rebm_seed_lead_view_2', v_org_id, 'Rohan Khanna', 'rohan@example.com', '+91-98300-00008',
      25000000, 35000000, '["Mumbai"]'::jsonb, '["RESIDENTIAL"]'::jsonb, 3,
      'VIEWING_SCHEDULED', 'WARM', 'WEBSITE', NULL,
      v_user_3, v_now - INTERVAL '6 days', v_now + INTERVAL '2 days', v_now - INTERVAL '2 days',
      NULL, NULL, NULL, 'Townhouse viewing at Goregaon scheduled.',
      v_user_1, v_now - INTERVAL '6 days', v_now),

    -- NEGOTIATING (1)
    ('rebm_seed_lead_neg_1', v_org_id, 'Amit Bhandari', 'amit.b@example.com', '+91-98300-00009',
      100000000, 130000000, '["Mumbai"]'::jsonb, '["COMMERCIAL"]'::jsonb, NULL,
      'NEGOTIATING', 'HOT', 'CAMPAIGN', 'Q1 Office Space campaign',
      v_user_1, v_now - INTERVAL '20 days', v_now + INTERVAL '2 days', v_now - INTERVAL '1 day',
      NULL, NULL, NULL, 'BKC office negotiation; counter at 11.5cr against 12cr listing.',
      v_user_1, v_now - INTERVAL '20 days', v_now),

    -- CONVERTED (2)
    ('rebm_seed_lead_conv_1', v_org_id, 'Rajesh Kumar', 'rajesh.kumar@example.com', '+91-98200-11111',
      25000000, 30000000, '["Mumbai"]'::jsonb, '["RESIDENTIAL"]'::jsonb, 3,
      'CONVERTED', 'HOT', 'REFERRAL', NULL,
      v_user_3, v_now - INTERVAL '60 days', NULL, v_now - INTERVAL '40 days',
      v_now - INTERVAL '40 days', v_buyer_1, NULL, 'Closed on Andheri 3 BHK.',
      v_user_1, v_now - INTERVAL '60 days', v_now),
    ('rebm_seed_lead_conv_2', v_org_id, 'Sneha Reddy', 'sneha.reddy@example.com', '+91-98201-22222',
      15000000, 18000000, '["Pune"]'::jsonb, '["LAND"]'::jsonb, NULL,
      'CONVERTED', 'WARM', 'PORTAL', NULL,
      v_user_2, v_now - INTERVAL '45 days', NULL, v_now - INTERVAL '30 days',
      v_now - INTERVAL '30 days', v_buyer_2, NULL, 'Plot purchase finalised.',
      v_user_1, v_now - INTERVAL '45 days', v_now),

    -- LOST (1)
    ('rebm_seed_lead_lost_1', v_org_id, 'Pooja Nair', 'pooja@example.com', '+91-98300-00011',
      5000000, 7000000, '["Mumbai"]'::jsonb, '["RESIDENTIAL"]'::jsonb, 1,
      'LOST', 'COLD', 'WEBSITE', NULL,
      v_user_3, v_now - INTERVAL '45 days', NULL, v_now - INTERVAL '30 days',
      NULL, NULL, 'Decided to rent for another year.', 'Budget did not match available stock.',
      v_user_1, v_now - INTERVAL '45 days', v_now)
  ON CONFLICT (id) DO NOTHING;

  -- ─── 11. Lead activities (rich timeline) ──────────────────────────────────

  INSERT INTO re_lead_activities (id, lead_id, type, agent_id, occurred_at, subject, content, outcome, data, created_at) VALUES
    ('rebm_seed_act_1', 'rebm_seed_lead_cont_1', 'ASSIGNMENT', v_user_2, v_now - INTERVAL '5 days',
      'Lead assigned', NULL, NULL,
      ('{"toAgentId":"' || v_user_2 || '"}')::jsonb, v_now - INTERVAL '5 days'),
    ('rebm_seed_act_2', 'rebm_seed_lead_cont_1', 'CALL', v_user_2, v_now - INTERVAL '5 days',
      'Intro call', 'Walked through portfolio. Sent BKC + Worli decks.', 'Sent docs', NULL, v_now - INTERVAL '5 days'),
    ('rebm_seed_act_3', 'rebm_seed_lead_cont_1', 'EMAIL', v_user_2, v_now - INTERVAL '4 days',
      'Brochure', 'Emailed BKC office and Worli penthouse decks.', NULL, NULL, v_now - INTERVAL '4 days'),
    ('rebm_seed_act_4', 'rebm_seed_lead_cont_1', 'CALL', v_user_2, v_now - INTERVAL '1 day',
      'Follow-up', 'Buyer interested in BKC office. Will visit next week.', 'Site visit pending', NULL, v_now - INTERVAL '1 day'),

    ('rebm_seed_act_5', 'rebm_seed_lead_qual_1', 'CALL', v_user_2, v_now - INTERVAL '8 days',
      'Initial call', 'Confirmed pre-approved loan from HDFC, budget aligned.', 'Qualified', NULL, v_now - INTERVAL '8 days'),
    ('rebm_seed_act_6', 'rebm_seed_lead_qual_1', 'STATUS_CHANGE', v_user_2, v_now - INTERVAL '7 days',
      'CONTACTED → QUALIFIED', NULL, NULL,
      '{"fromStatus":"CONTACTED","toStatus":"QUALIFIED"}'::jsonb, v_now - INTERVAL '7 days'),
    ('rebm_seed_act_7', 'rebm_seed_lead_qual_1', 'EMAIL', v_user_2, v_now - INTERVAL '2 days',
      'Pune shortlist', 'Sent 3 Hinjewadi options.', NULL, NULL, v_now - INTERVAL '2 days'),

    ('rebm_seed_act_8', 'rebm_seed_lead_view_1', 'CALL', v_user_1, v_now - INTERVAL '12 days',
      'Penthouse interest', 'Discussed Worli penthouse, set up viewing for next week.', 'Viewing scheduled', NULL, v_now - INTERVAL '12 days'),
    ('rebm_seed_act_9', 'rebm_seed_lead_view_1', 'MEETING', v_user_1, v_now - INTERVAL '5 days',
      'Site visit prep', 'Walked the floor plan, discussed amenities.', NULL, NULL, v_now - INTERVAL '5 days'),
    ('rebm_seed_act_10', 'rebm_seed_lead_view_1', 'VIEWING', v_user_1, v_now - INTERVAL '4 days',
      'Worli penthouse viewing', 'Buyer impressed; wants second visit with spouse.', 'Positive', NULL, v_now - INTERVAL '4 days'),

    ('rebm_seed_act_11', 'rebm_seed_lead_neg_1', 'CALL', v_user_1, v_now - INTERVAL '20 days',
      'BKC enquiry', 'Walked through office options. BKC Block G shortlisted.', NULL, NULL, v_now - INTERVAL '20 days'),
    ('rebm_seed_act_12', 'rebm_seed_lead_neg_1', 'VIEWING', v_user_1, v_now - INTERVAL '12 days',
      'BKC office viewing', 'Walked the 4500 sqft space. Buyer wants 5% off list.', 'Positive', NULL, v_now - INTERVAL '12 days'),
    ('rebm_seed_act_13', 'rebm_seed_lead_neg_1', 'STATUS_CHANGE', v_user_1, v_now - INTERVAL '10 days',
      'VIEWING_SCHEDULED → NEGOTIATING', NULL, NULL,
      '{"fromStatus":"VIEWING_SCHEDULED","toStatus":"NEGOTIATING"}'::jsonb, v_now - INTERVAL '10 days'),
    ('rebm_seed_act_14', 'rebm_seed_lead_neg_1', 'NOTE', v_user_1, v_now - INTERVAL '2 days',
      'Counter offer', 'Buyer counter at 11.5cr; seller open to 11.8cr. Mid-point likely.', NULL, NULL, v_now - INTERVAL '2 days'),

    ('rebm_seed_act_15', 'rebm_seed_lead_conv_1', 'CALL', v_user_3, v_now - INTERVAL '60 days',
      'Initial call', 'Andheri 3BHK buyer, urgency to close before Diwali.', NULL, NULL, v_now - INTERVAL '60 days'),
    ('rebm_seed_act_16', 'rebm_seed_lead_conv_1', 'VIEWING', v_user_3, v_now - INTERVAL '52 days',
      'Andheri viewing', 'Buyer loved the property.', 'Positive', NULL, v_now - INTERVAL '52 days'),
    ('rebm_seed_act_17', 'rebm_seed_lead_conv_1', 'STATUS_CHANGE', v_user_3, v_now - INTERVAL '40 days',
      'NEGOTIATING → CONVERTED', NULL, NULL,
      ('{"fromStatus":"NEGOTIATING","toStatus":"CONVERTED","buyerId":"' || v_buyer_1 || '"}')::jsonb,
      v_now - INTERVAL '40 days'),

    ('rebm_seed_act_18', 'rebm_seed_lead_lost_1', 'CALL', v_user_3, v_now - INTERVAL '40 days',
      'Initial call', 'Budget too tight for Mumbai 1 BHK options.', NULL, NULL, v_now - INTERVAL '40 days'),
    ('rebm_seed_act_19', 'rebm_seed_lead_lost_1', 'STATUS_CHANGE', v_user_3, v_now - INTERVAL '30 days',
      'CONTACTED → LOST', NULL, NULL,
      '{"fromStatus":"CONTACTED","toStatus":"LOST","reason":"Decided to rent"}'::jsonb,
      v_now - INTERVAL '30 days')
  ON CONFLICT (id) DO NOTHING;

  -- ─── 12. Property viewings ────────────────────────────────────────────────

  INSERT INTO re_property_viewings (
    id, organization_id, lead_id, property_id, agent_id, scheduled_at,
    duration_min, status, feedback, outcome_rating, created_at, updated_at
  ) VALUES
    ('rebm_seed_view_1', v_org_id, 'rebm_seed_lead_view_1', 'rebm_seed_prop_7', v_user_1,
      v_now + INTERVAL '5 days', 60, 'SCHEDULED', NULL, NULL,
      v_now - INTERVAL '4 days', v_now),
    ('rebm_seed_view_2', v_org_id, 'rebm_seed_lead_view_2', 'rebm_seed_prop_10', v_user_3,
      v_now + INTERVAL '2 days', 45, 'SCHEDULED', NULL, NULL,
      v_now - INTERVAL '2 days', v_now),
    ('rebm_seed_view_3', v_org_id, 'rebm_seed_lead_neg_1', 'rebm_seed_prop_3', v_user_1,
      v_now - INTERVAL '12 days', 60, 'COMPLETED',
      'Buyer impressed; price negotiation in progress.', 5,
      v_now - INTERVAL '14 days', v_now - INTERVAL '12 days'),
    ('rebm_seed_view_4', v_org_id, 'rebm_seed_lead_view_1', 'rebm_seed_prop_2', v_user_1,
      v_now + INTERVAL '8 days', 90, 'SCHEDULED', NULL, NULL,
      v_now - INTERVAL '1 day', v_now),
    ('rebm_seed_view_5', v_org_id, 'rebm_seed_lead_lost_1', 'rebm_seed_prop_5', v_user_3,
      v_now - INTERVAL '32 days', 30, 'NO_SHOW', 'Buyer did not arrive.', NULL,
      v_now - INTERVAL '34 days', v_now - INTERVAL '32 days')
  ON CONFLICT (id) DO NOTHING;

  -- ─── 13. Compliance documents ─────────────────────────────────────────────
  -- Agent 1: full set VERIFIED. Agent 2: VERIFIED set + one expiring soon.
  -- Agent 3: pending KYC items. Agent 4: pending + one rejected.

  INSERT INTO re_compliance_documents (
    id, organization_id, agent_profile_id, type, name, url,
    document_number, issued_by, issued_at, expiry_date,
    status, rejection_reason, verified_by_id, verified_at,
    uploaded_by_id, created_at, updated_at
  ) VALUES
    -- Agent 1 (Principal Broker) — full verified set
    ('rebm_seed_cdoc_a1_id', v_org_id, v_agent_1, 'GOVERNMENT_ID',
      'Aadhaar Card', 'https://picsum.photos/seed/aadhaar1/800/500',
      'XXXX-XXXX-1234', 'UIDAI', v_now - INTERVAL '8 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '5 years',
      v_user_1, v_now - INTERVAL '5 years', v_now - INTERVAL '5 years'),
    ('rebm_seed_cdoc_a1_lic', v_org_id, v_agent_1, 'REAL_ESTATE_LICENSE',
      'MahaRERA License', 'https://picsum.photos/seed/license1/800/500',
      'A52400012345', 'MahaRERA', v_now - INTERVAL '3 years', v_now + INTERVAL '2 years',
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '3 years',
      v_user_1, v_now - INTERVAL '3 years', v_now - INTERVAL '3 years'),
    ('rebm_seed_cdoc_a1_pan', v_org_id, v_agent_1, 'TAX_FORM',
      'PAN Card', 'https://picsum.photos/seed/pan1/800/500',
      'ABCDE1234F', 'Income Tax Department', v_now - INTERVAL '10 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '5 years',
      v_user_1, v_now - INTERVAL '5 years', v_now - INTERVAL '5 years'),
    ('rebm_seed_cdoc_a1_agr', v_org_id, v_agent_1, 'AGENCY_AGREEMENT',
      'Agency Agreement', 'https://picsum.photos/seed/agr1/800/500',
      'AGR-2024-001', 'Brokerage', v_now - INTERVAL '1 year', v_now + INTERVAL '4 years',
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '1 year',
      v_user_1, v_now - INTERVAL '1 year', v_now - INTERVAL '1 year'),

    -- Agent 2 (Senior) — verified, but license expiring in <30 days
    ('rebm_seed_cdoc_a2_id', v_org_id, v_agent_2, 'GOVERNMENT_ID',
      'Aadhaar Card', 'https://picsum.photos/seed/aadhaar2/800/500',
      'XXXX-XXXX-5678', 'UIDAI', v_now - INTERVAL '6 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '3 years',
      v_user_2, v_now - INTERVAL '3 years', v_now - INTERVAL '3 years'),
    ('rebm_seed_cdoc_a2_lic', v_org_id, v_agent_2, 'REAL_ESTATE_LICENSE',
      'MahaRERA License (expiring)', 'https://picsum.photos/seed/license2/800/500',
      'A52400067890', 'MahaRERA', v_now - INTERVAL '2 years', v_now + INTERVAL '20 days',
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '2 years',
      v_user_2, v_now - INTERVAL '2 years', v_now - INTERVAL '2 years'),
    ('rebm_seed_cdoc_a2_pan', v_org_id, v_agent_2, 'TAX_FORM',
      'PAN Card', 'https://picsum.photos/seed/pan2/800/500',
      'FGHIJ5678K', 'Income Tax Department', v_now - INTERVAL '8 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '3 years',
      v_user_2, v_now - INTERVAL '3 years', v_now - INTERVAL '3 years'),
    ('rebm_seed_cdoc_a2_agr', v_org_id, v_agent_2, 'AGENCY_AGREEMENT',
      'Agency Agreement', 'https://picsum.photos/seed/agr2/800/500',
      'AGR-2023-007', 'Brokerage', v_now - INTERVAL '18 months', v_now + INTERVAL '18 months',
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '18 months',
      v_user_2, v_now - INTERVAL '18 months', v_now - INTERVAL '18 months'),

    -- Agent 3 (Associate) — pending verification (queue work)
    ('rebm_seed_cdoc_a3_id', v_org_id, v_agent_3, 'GOVERNMENT_ID',
      'Aadhaar Card', 'https://picsum.photos/seed/aadhaar3/800/500',
      'XXXX-XXXX-3456', 'UIDAI', v_now - INTERVAL '5 years', NULL,
      'PENDING', NULL, NULL, NULL,
      v_user_3, v_now - INTERVAL '3 days', v_now - INTERVAL '3 days'),
    ('rebm_seed_cdoc_a3_lic', v_org_id, v_agent_3, 'REAL_ESTATE_LICENSE',
      'MahaRERA License application', 'https://picsum.photos/seed/license3/800/500',
      'PENDING-2024-0142', 'MahaRERA', v_now - INTERVAL '2 days', v_now + INTERVAL '5 years',
      'PENDING', NULL, NULL, NULL,
      v_user_3, v_now - INTERVAL '2 days', v_now - INTERVAL '2 days'),
    ('rebm_seed_cdoc_a3_pan', v_org_id, v_agent_3, 'TAX_FORM',
      'PAN Card', 'https://picsum.photos/seed/pan3/800/500',
      'LMNOP1234Q', 'Income Tax Department', v_now - INTERVAL '6 years', NULL,
      'PENDING', NULL, NULL, NULL,
      v_user_3, v_now - INTERVAL '4 days', v_now - INTERVAL '4 days'),

    -- Agent 4 (Trainee) — one rejected, one pending
    ('rebm_seed_cdoc_a4_id', v_org_id, v_agent_4, 'GOVERNMENT_ID',
      'Aadhaar Card (re-upload needed)', 'https://picsum.photos/seed/aadhaar4/800/500',
      'XXXX-XXXX-7890', 'UIDAI', v_now - INTERVAL '4 years', NULL,
      'REJECTED', 'Image is blurry. Please re-upload a clear scan with all four corners visible.',
      v_user_1, v_now - INTERVAL '5 days',
      v_user_4, v_now - INTERVAL '7 days', v_now - INTERVAL '5 days'),
    ('rebm_seed_cdoc_a4_pan', v_org_id, v_agent_4, 'TAX_FORM',
      'PAN Card', 'https://picsum.photos/seed/pan4/800/500',
      'RSTUV5678W', 'Income Tax Department', v_now - INTERVAL '5 years', NULL,
      'PENDING', NULL, NULL, NULL,
      v_user_4, v_now - INTERVAL '1 day', v_now - INTERVAL '1 day'),

    -- Agent 5 (Vikram) — fully verified set (mirrors Agent 1's profile)
    ('rebm_seed_cdoc_a5_id', v_org_id, v_agent_5, 'GOVERNMENT_ID',
      'Aadhaar Card', 'https://picsum.photos/seed/aadhaar5/800/500',
      'XXXX-XXXX-5501', 'UIDAI', v_now - INTERVAL '6 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '4 years',
      v_user_5, v_now - INTERVAL '4 years', v_now - INTERVAL '4 years'),
    ('rebm_seed_cdoc_a5_lic', v_org_id, v_agent_5, 'REAL_ESTATE_LICENSE',
      'MahaRERA License', 'https://picsum.photos/seed/license5/800/500',
      'A52400099001', 'MahaRERA', v_now - INTERVAL '24 months', v_now + INTERVAL '12 months',
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '24 months',
      v_user_5, v_now - INTERVAL '24 months', v_now - INTERVAL '24 months'),
    ('rebm_seed_cdoc_a5_pan', v_org_id, v_agent_5, 'TAX_FORM',
      'PAN Card', 'https://picsum.photos/seed/pan5/800/500',
      'VIKRA5501P', 'Income Tax Department', v_now - INTERVAL '7 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '4 years',
      v_user_5, v_now - INTERVAL '4 years', v_now - INTERVAL '4 years'),
    ('rebm_seed_cdoc_a5_agr', v_org_id, v_agent_5, 'AGENCY_AGREEMENT',
      'Agency Agreement', 'https://picsum.photos/seed/agr5/800/500',
      'AGR-2022-019', 'Brokerage', v_now - INTERVAL '4 years', v_now + INTERVAL '12 months',
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '4 years',
      v_user_5, v_now - INTERVAL '4 years', v_now - INTERVAL '4 years'),

    -- Agent 6 (Neha) — verified set, recently re-verified for Associate rank-up
    ('rebm_seed_cdoc_a6_id', v_org_id, v_agent_6, 'GOVERNMENT_ID',
      'Aadhaar Card', 'https://picsum.photos/seed/aadhaar6/800/500',
      'XXXX-XXXX-6212', 'UIDAI', v_now - INTERVAL '4 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '14 months',
      v_user_6, v_now - INTERVAL '14 months', v_now - INTERVAL '14 months'),
    ('rebm_seed_cdoc_a6_lic', v_org_id, v_agent_6, 'REAL_ESTATE_LICENSE',
      'MahaRERA License', 'https://picsum.photos/seed/license6/800/500',
      'A52400099157', 'MahaRERA', v_now - INTERVAL '10 months', v_now + INTERVAL '14 months',
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '10 months',
      v_user_6, v_now - INTERVAL '10 months', v_now - INTERVAL '10 months'),
    ('rebm_seed_cdoc_a6_pan', v_org_id, v_agent_6, 'TAX_FORM',
      'PAN Card', 'https://picsum.photos/seed/pan6/800/500',
      'NEHAB6212K', 'Income Tax Department', v_now - INTERVAL '5 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '14 months',
      v_user_6, v_now - INTERVAL '14 months', v_now - INTERVAL '14 months'),
    ('rebm_seed_cdoc_a6_agr', v_org_id, v_agent_6, 'AGENCY_AGREEMENT',
      'Agency Agreement (Associate)', 'https://picsum.photos/seed/agr6/800/500',
      'AGR-2025-004', 'Brokerage', v_now - INTERVAL '7 days', v_now + INTERVAL '23 months',
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '7 days',
      v_user_6, v_now - INTERVAL '7 days', v_now - INTERVAL '7 days'),

    -- Agent 7 (Rahul) — license EXPIRED (drives NON_COMPLIANT)
    ('rebm_seed_cdoc_a7_id', v_org_id, v_agent_7, 'GOVERNMENT_ID',
      'Aadhaar Card', 'https://picsum.photos/seed/aadhaar7/800/500',
      'XXXX-XXXX-7301', 'UIDAI', v_now - INTERVAL '3 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '13 months',
      v_user_7, v_now - INTERVAL '13 months', v_now - INTERVAL '13 months'),
    ('rebm_seed_cdoc_a7_lic', v_org_id, v_agent_7, 'REAL_ESTATE_LICENSE',
      'MahaRERA License (EXPIRED)', 'https://picsum.photos/seed/license7/800/500',
      'A52400099402', 'MahaRERA', v_now - INTERVAL '13 months', v_now - INTERVAL '30 days',
      'EXPIRED', NULL, v_user_1, v_now - INTERVAL '13 months',
      v_user_7, v_now - INTERVAL '13 months', v_now - INTERVAL '30 days'),
    ('rebm_seed_cdoc_a7_pan', v_org_id, v_agent_7, 'TAX_FORM',
      'PAN Card', 'https://picsum.photos/seed/pan7/800/500',
      'RAHUL7301L', 'Income Tax Department', v_now - INTERVAL '4 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '13 months',
      v_user_7, v_now - INTERVAL '13 months', v_now - INTERVAL '13 months'),

    -- Agent 8 (Aisha — SUSPENDED) — docs once verified, kept for history
    ('rebm_seed_cdoc_a8_id', v_org_id, v_agent_8, 'GOVERNMENT_ID',
      'Aadhaar Card', 'https://picsum.photos/seed/aadhaar8/800/500',
      'XXXX-XXXX-8417', 'UIDAI', v_now - INTERVAL '3 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '10 months',
      v_user_8, v_now - INTERVAL '10 months', v_now - INTERVAL '10 months'),
    ('rebm_seed_cdoc_a8_lic', v_org_id, v_agent_8, 'REAL_ESTATE_LICENSE',
      'MahaRERA License', 'https://picsum.photos/seed/license8/800/500',
      'A52400099510', 'MahaRERA', v_now - INTERVAL '8 months', v_now + INTERVAL '16 months',
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '8 months',
      v_user_8, v_now - INTERVAL '8 months', v_now - INTERVAL '8 months'),

    -- Agent 9 (Karan — TERMINATED) — historical record only
    ('rebm_seed_cdoc_a9_id', v_org_id, v_agent_9, 'GOVERNMENT_ID',
      'Aadhaar Card', 'https://picsum.photos/seed/aadhaar9/800/500',
      'XXXX-XXXX-9123', 'UIDAI', v_now - INTERVAL '4 years', NULL,
      'VERIFIED', NULL, v_user_1, v_now - INTERVAL '24 months',
      v_user_9, v_now - INTERVAL '24 months', v_now - INTERVAL '24 months'),

    -- Agent 10 (Sneha — PENDING_KYC) — fresh upload awaiting review
    ('rebm_seed_cdoc_a10_id', v_org_id, v_agent_10, 'GOVERNMENT_ID',
      'Aadhaar Card', 'https://picsum.photos/seed/aadhaar10/800/500',
      'XXXX-XXXX-1077', 'UIDAI', v_now - INTERVAL '2 years', NULL,
      'PENDING', NULL, NULL, NULL,
      v_user_10, v_now - INTERVAL '5 days', v_now - INTERVAL '5 days')
  ON CONFLICT (id) DO NOTHING;

  -- ─── 14. Wallets (zero balance — engine populates them on close) ──────────

  INSERT INTO re_wallets (
    id, organization_id, user_id, currency,
    available_balance, pending_balance, total_credits, total_debits,
    is_frozen, created_at, updated_at
  ) VALUES
    (v_wallet_1, v_org_id, v_user_1, v_currency, 0, 0, 0, 0, false,
      v_now - INTERVAL '5 years', v_now),
    (v_wallet_2, v_org_id, v_user_2, v_currency, 0, 0, 0, 0, false,
      v_now - INTERVAL '3 years', v_now),
    (v_wallet_3, v_org_id, v_user_3, v_currency, 0, 0, 0, 0, false,
      v_now - INTERVAL '8 months', v_now),
    (v_wallet_4, v_org_id, v_user_4, v_currency, 0, 0, 0, 0, false,
      v_now - INTERVAL '60 days', v_now),
    (v_wallet_5, v_org_id, v_user_5, v_currency, 0, 0, 0, 0, false,
      v_now - INTERVAL '4 years', v_now),
    (v_wallet_6, v_org_id, v_user_6, v_currency, 0, 0, 0, 0, false,
      v_now - INTERVAL '14 months', v_now),
    (v_wallet_7, v_org_id, v_user_7, v_currency, 0, 0, 0, 0, false,
      v_now - INTERVAL '13 months', v_now),
    -- Suspended / terminated agents keep their wallets but they are frozen.
    (v_wallet_8, v_org_id, v_user_8, v_currency, 0, 0, 0, 0, true,
      v_now - INTERVAL '10 months', v_now),
    (v_wallet_9, v_org_id, v_user_9, v_currency, 0, 0, 0, 0, true,
      v_now - INTERVAL '24 months', v_now)
  ON CONFLICT (id) DO NOTHING;

  -- Mirror freeze reason for the suspended/terminated wallets.
  UPDATE re_wallets SET freeze_reason = 'Agent suspended pending review.' WHERE id = v_wallet_8;
  UPDATE re_wallets SET freeze_reason = 'Agent terminated — payouts disabled.' WHERE id = v_wallet_9;

  -- ─── 15. Manual ledger adjustments (so wallet UI shows non-zero balances) ─
  -- Real-world equivalent: a one-time onboarding bonus. The corresponding
  -- wallet aggregates are fixed below with explicit UPDATE.

  INSERT INTO re_ledger_entries (
    id, organization_id, wallet_id, type, category, status,
    amount, balance_after, currency, description,
    transaction_id, split_id, withdrawal_id, reverses_entry_id,
    released_at, created_by_id, created_at
  ) VALUES
    ('rebm_seed_ledger_adj_1', v_org_id, v_wallet_1, 'CREDIT', 'ADJUSTMENT', 'RELEASED',
      50000, 50000, v_currency, 'Onboarding bonus (seed)',
      NULL, NULL, NULL, NULL,
      v_now - INTERVAL '90 days', v_user_1, v_now - INTERVAL '90 days'),
    ('rebm_seed_ledger_adj_2', v_org_id, v_wallet_2, 'CREDIT', 'ADJUSTMENT', 'RELEASED',
      30000, 30000, v_currency, 'Onboarding bonus (seed)',
      NULL, NULL, NULL, NULL,
      v_now - INTERVAL '60 days', v_user_1, v_now - INTERVAL '60 days'),
    ('rebm_seed_ledger_adj_3', v_org_id, v_wallet_3, 'CREDIT', 'BONUS', 'RELEASED',
      10000, 10000, v_currency, 'First-listing bonus (seed)',
      NULL, NULL, NULL, NULL,
      v_now - INTERVAL '14 days', v_user_1, v_now - INTERVAL '14 days'),
    ('rebm_seed_ledger_adj_5', v_org_id, v_wallet_5, 'CREDIT', 'ADJUSTMENT', 'RELEASED',
      40000, 40000, v_currency, 'Onboarding bonus (seed)',
      NULL, NULL, NULL, NULL,
      v_now - INTERVAL '120 days', v_user_1, v_now - INTERVAL '120 days'),
    ('rebm_seed_ledger_adj_6', v_org_id, v_wallet_6, 'CREDIT', 'RANK_UP_BONUS', 'RELEASED',
      5000, 5000, v_currency, 'Rank-up bonus: Trainee → Associate (seed)',
      NULL, NULL, NULL, NULL,
      v_now - INTERVAL '7 days', v_user_1, v_now - INTERVAL '7 days'),
    ('rebm_seed_ledger_adj_7', v_org_id, v_wallet_7, 'CREDIT', 'BONUS', 'RELEASED',
      8000, 8000, v_currency, 'First-listing bonus (seed)',
      NULL, NULL, NULL, NULL,
      v_now - INTERVAL '60 days', v_user_1, v_now - INTERVAL '60 days')
  ON CONFLICT (id) DO NOTHING;

  -- Reflect those credits on the wallet rows. Idempotent because we set
  -- absolute values, not deltas.
  UPDATE re_wallets SET available_balance = 50000, total_credits = 50000, updated_at = v_now WHERE id = v_wallet_1;
  UPDATE re_wallets SET available_balance = 30000, total_credits = 30000, updated_at = v_now WHERE id = v_wallet_2;
  UPDATE re_wallets SET available_balance = 10000, total_credits = 10000, updated_at = v_now WHERE id = v_wallet_3;
  UPDATE re_wallets SET available_balance = 40000, total_credits = 40000, updated_at = v_now WHERE id = v_wallet_5;
  UPDATE re_wallets SET available_balance = 5000,  total_credits = 5000,  updated_at = v_now WHERE id = v_wallet_6;
  UPDATE re_wallets SET available_balance = 8000,  total_credits = 8000,  updated_at = v_now WHERE id = v_wallet_7;

  -- ─── 16. Transactions (PENDING, ready to close) ──────────────────────────
  -- Each carries a CONTRACT document, so the close-engine accepts them.
  -- Open any one from /real-estate/transactions and click "Close & post
  -- commissions" to fire the engine end-to-end.
  --
  --   TXN-SEED-001 — Andheri 3 BHK (multi-agent, full override walk demo)
  --   TXN-SEED-002 — BKC office (single principal-broker deal, no overrides)
  --   TXN-SEED-003 — Bandra 2 BHK (Agent 2 listing + selling, single override)

  INSERT INTO re_transactions (
    id, organization_id, code, property_id, buyer_id,
    listing_agent_id, selling_agent_id,
    sale_price, currency, status, payment_terms,
    created_by_id, created_at, updated_at
  ) VALUES
    ('rebm_seed_txn_1', v_org_id, 'TXN-SEED-001', 'rebm_seed_prop_1', v_buyer_1,
      v_user_3, v_user_2, 24500000, v_currency, 'PENDING',
      'Token 10% on signing, 90% on possession (target 30 days).',
      v_user_1, v_now - INTERVAL '5 days', v_now),
    ('rebm_seed_txn_2', v_org_id, 'TXN-SEED-002', 'rebm_seed_prop_3', v_buyer_3,
      v_user_1, v_user_1, 115000000, v_currency, 'PENDING',
      'Token 5cr on signing, 5cr in 30 days, balance on registration.',
      v_user_1, v_now - INTERVAL '8 days', v_now),
    ('rebm_seed_txn_3', v_org_id, 'TXN-SEED-003', 'rebm_seed_prop_12', v_buyer_2,
      v_user_2, v_user_2, 31000000, v_currency, 'PENDING',
      'Full payment in 60 days; 10% advance now.',
      v_user_1, v_now - INTERVAL '3 days', v_now)
  ON CONFLICT (id) DO NOTHING;

  -- Property statuses — make sure the under-contract ones are set right.
  UPDATE re_properties SET status = 'UNDER_CONTRACT', updated_at = v_now
  WHERE id IN ('rebm_seed_prop_1', 'rebm_seed_prop_3', 'rebm_seed_prop_12');

  -- ─── 17. Transaction documents (CONTRACT for each PENDING txn) ───────────

  INSERT INTO re_transaction_documents (
    id, transaction_id, type, name, url, uploaded_by_id, created_at
  ) VALUES
    ('rebm_seed_txndoc_1', 'rebm_seed_txn_1', 'CONTRACT',
      'Sale Agreement (Andheri 3 BHK)',
      'https://picsum.photos/seed/contract1/800/500',
      v_user_1, v_now - INTERVAL '5 days'),
    ('rebm_seed_txndoc_2', 'rebm_seed_txn_2', 'CONTRACT',
      'Sale Agreement (BKC Office)',
      'https://picsum.photos/seed/contract2/800/500',
      v_user_1, v_now - INTERVAL '8 days'),
    ('rebm_seed_txndoc_3', 'rebm_seed_txn_3', 'CONTRACT',
      'Sale Agreement (Bandra 2 BHK)',
      'https://picsum.photos/seed/contract3/800/500',
      v_user_1, v_now - INTERVAL '3 days')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '[rebm-seed] Done. Visit /real-estate to explore.';
  RAISE NOTICE '[rebm-seed] To test the commission engine: open any TXN-SEED-* transaction and click "Close & post commissions".';
END
$REBM_SEED$;

COMMIT;

-- ============================================================================
-- UNINSTALL — uncomment and run to remove every seed row this script created.
-- Cascading deletes from parent tables handle children automatically.
-- The dummy users (emails ending in @brokerage.test) are removed last.
-- ============================================================================
-- BEGIN;
-- DELETE FROM re_transaction_documents WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_transactions          WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_ledger_entries        WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_wallets               WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_compliance_documents  WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_property_viewings     WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_lead_activities       WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_leads                 WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_buyers                WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_property_documents    WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_property_images       WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_properties            WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_rank_promotions       WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_agent_profiles        WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_commission_rules      WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM re_ranks                 WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM static_page_anchors      WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM form_modules             WHERE id LIKE 'rebm_seed_%';
-- DELETE FROM users                    WHERE email LIKE '%@brokerage.test';
-- COMMIT;
