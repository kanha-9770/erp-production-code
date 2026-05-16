# Real Estate MLM — End-to-End Test Plan

> **Purpose:** A reproducible, step-by-step script to verify the complete MLM
> brokerage system actually works — from agent onboarding through commission
> payout. Run this after any significant change to the real-estate module, or
> as a smoke test on a fresh environment.
>
> **Time required:** ~45 minutes for a full pass; ~10 minutes for the smoke subset (Phases 0, 3, 5, 6).
>
> **Companion docs:**
> - [`REAL_ESTATE_USAGE_GUIDE.md`](./REAL_ESTATE_USAGE_GUIDE.md) — how the UI behaves
> - [`REAL_ESTATE_COMMISSION_GUIDE.md`](./REAL_ESTATE_COMMISSION_GUIDE.md) — what the engine computes
> - [`REAL_ESTATE_SEED_TEAM.md`](./REAL_ESTATE_SEED_TEAM.md) — the 30-agent seed tree

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Phase 0 — Bootstrap the test environment](#phase-0--bootstrap-the-test-environment)
- [Phase 1 — Verify the MLM hierarchy](#phase-1--verify-the-mlm-hierarchy)
- [Phase 2 — Compliance & rank gating](#phase-2--compliance--rank-gating)
- [Phase 3 — Property listing & visibility](#phase-3--property-listing--visibility)
- [Phase 4 — Lead intake & assignment](#phase-4--lead-intake--assignment)
- [Phase 5 — The transaction lifecycle](#phase-5--the-transaction-lifecycle)
- [Phase 6 — Commission split & wallet credit](#phase-6--commission-split--wallet-credit)
- [Phase 7 — Withdrawal & payout](#phase-7--withdrawal--payout)
- [Phase 8 — Rank promotion](#phase-8--rank-promotion)
- [Phase 9 — Referral / sponsor flow](#phase-9--referral--sponsor-flow)
- [Phase 10 — Reports & dashboards](#phase-10--reports--dashboards)
- [Phase 11 — Edge cases & negative tests](#phase-11--edge-cases--negative-tests)
- [Cleanup / reset](#cleanup--reset)
- [Pass/Fail checklist (one-page)](#passfail-checklist-one-page)

---

## Prerequisites

| Requirement | How to verify |
|---|---|
| Postgres running, `DATABASE_URL` set | `npx prisma db pull` succeeds |
| Schema up to date | `npx prisma db push` is a no-op |
| Default org + root user exist | `SEED_ORG_ID` and `SEED_ROOT_USER_ID` env vars match real rows |
| Dev server runs | `npm run dev` starts without errors on port 5001 |
| Browser logged in as the **root user** (admin) | sidebar shows "Real Estate" group |

If any of these fail, fix before continuing — every later phase depends on them.

---

## Phase 0 — Bootstrap the test environment

Goal: a clean, deterministic dataset to run every later phase against.

```powershell
# 1. Install module + sidebar entry (one-time, idempotent)
npm run seed:routes

# 2. Build the 30-agent MLM tree (3 leaders, 8 sub-leaders, 18 agents, 1 direct)
npm run seed:re-team

# 3. Seed commission ranks + plan
npm run seed:re-comp-plan

# 4. Seed inventory — 33 properties across LAND/PLOT, residential, commercial,
#    industrial, agricultural; spread across the agents from step 2.
npm run seed:re-properties
```

### ✅ Verify

| Check | Expected | How |
|---|---|---|
| Agent count | 30 seed agents + 1 root = **31** | `SELECT COUNT(*) FROM re_agent_profiles WHERE organization_id = '<orgId>';` |
| Property count | **33** | `SELECT COUNT(*) FROM re_properties WHERE organization_id = '<orgId>';` |
| Property categories all present | LAND, RESIDENTIAL, COMMERCIAL, INDUSTRIAL, AGRICULTURAL | `SELECT type, COUNT(*) FROM re_properties GROUP BY type;` |
| LAND/PLOT count | ≥ 6 | `SELECT COUNT(*) FROM re_properties WHERE type='LAND' AND sub_type='PLOT';` |
| Sidebar | "Real Estate" group renders with sub-pages | Refresh app, look at left rail |

> **If any count is 0:** rerun the seed script for that step and re-check. All seeds are idempotent — safe to rerun.

---

## Phase 1 — Verify the MLM hierarchy

Goal: confirm the parent/sponsor/level wiring is correct — the entire commission engine relies on it.

### Steps

1. Navigate to **`/real-estate/agents`**.
2. Switch to **tree view** (toggle in the toolbar).
3. Expand the root user → you should see 3 team leaders (Aarav, Diya, Rohan).
4. Expand each leader → 3 sub-leaders.
5. Expand each sub-leader → 2–3 agents.

### ✅ Verify

| Check | Expected |
|---|---|
| Tree root | Single root user with 3 direct children |
| Total descendants under root | 30 |
| Levels visible | Root (L0) → Leader (L1) → Sub-leader (L2) → Agent (L3) |
| Tara Bhat | Reports directly to Rohan (skips sub-leader level — intentional edge case) |
| Sponsor codes | Each leaf agent shows a `RE-XXXX-XXXX` code |

### SQL spot-check

```sql
-- Every node should have parent_id pointing at someone in the same org
SELECT COUNT(*) AS orphans
FROM re_agent_profiles a
LEFT JOIN re_agent_profiles p ON p.id = a.parent_id
WHERE a.organization_id = '<orgId>'
  AND a.parent_id IS NOT NULL
  AND p.id IS NULL;
-- Expected: 0
```

---

## Phase 2 — Compliance & rank gating

Goal: confirm KYC docs gate transaction eligibility, and that ranks load.

### Steps

1. Sign in as the **root user**.
2. Open **`/real-estate/admin/compliance`** — expect 30 agents in PENDING (the seed leaves docs unverified by default).
3. Pick any one agent (e.g. Aarav Sharma) → click **Approve** on each doc.
4. Open **`/real-estate/admin/ranks`** — confirm at least one rank ladder is loaded (Trainee → Associate → Senior → MD or your custom plan).

### ✅ Verify

- Approving a doc updates `verifiedAt` + `verifiedById` (visible in the row).
- The agent's status badge changes from PENDING → ACTIVE on the agents page.
- Ranks page shows rank thresholds (sales target, team size, etc.) with non-zero values.

> **Why this matters:** `TransactionHandlers.close()` short-circuits if the listing agent is not compliance-verified. If you skip this phase, Phase 5 will fail with a confusing error.

---

## Phase 3 — Property listing & visibility

Goal: properties from the seed appear correctly across UI and APIs.

### Steps

1. Open **`/real-estate/properties`** → expect 33 cards.
2. Filter by **type = LAND** → expect 8 (6 PLOT + 2 FARM).
3. Filter by **status = AVAILABLE** → expect 32 (one is `UNDER_CONTRACT`).
4. Open any LAND/PLOT card (e.g. "Residential Plot, Hinjewadi Phase III"):
   - Title, price (₹1,20,00,000), area (5,000 sqft), commission terms (2%), all visible.
   - 3 images render.
   - Listing agent is shown (one of the seed agents).

### ✅ Verify via API

```powershell
# Auth required — grab cookies from your browser session first
curl http://localhost:5001/api/real-estate/properties?type=LAND
```

Expected: JSON array, length ≥ 8, every entry has `listingAgentId`, `commissionPercentage` or `commissionFlatFee`, `primaryImageUrl`.

---

## Phase 4 — Lead intake & assignment

Goal: a buyer enquiry routes to the right agent and shows in the kanban.

### Steps

1. Open **`/real-estate/leads/new`**.
2. Fill: name = "Test Buyer", phone = `+91 9999900001`, email = `test.buyer@example.com`.
3. Pick the Hinjewadi plot from Phase 3 as the property of interest.
4. Assign to the **listing agent** of that property.
5. Save → you land on the lead detail page.
6. Open **`/real-estate/leads`** kanban → the new lead appears in the **NEW** column.
7. Drag it to **CONTACTED** → status updates.

### ✅ Verify

- The agent (Aarav, etc.) sees this lead under **`/real-estate/my-team`** → "My leads".
- A **lead activity** is logged on stage change (visible on the lead detail page).
- Schedule a viewing (click "Schedule viewing" on the lead) → row appears in `re_property_viewings`.

---

## Phase 5 — The transaction lifecycle

Goal: open → preview commission → upload contract → close → posts splits.

### Steps

#### 5a. Create a transaction

1. Open **`/real-estate/transactions/new`**.
2. Pick the Hinjewadi plot (LAND/PLOT).
3. Buyer = the lead from Phase 4.
4. Closing price = ₹1,18,00,000 (98.3% of listing — well above the 90% BR-12 floor).
5. Save → status = PENDING.

#### 5b. Preview commission

1. On the transaction page, click **"Preview commission"**.
2. Inspect the breakdown:
   - **Pool**: 2% × ₹1.18 Cr = **₹2,36,000**.
   - Splits go to listing agent + their upline (sub-leader, leader, root) per the comp-plan from Phase 0.

```powershell
# Same data via API
curl -X GET http://localhost:5001/api/real-estate/transactions/<txId>/preview-commission
```

Expected JSON shape:

```json
{
  "totalPool": 236000,
  "splits": [
    { "agentId": "...", "role": "listing", "amount": 141600 },
    { "agentId": "...", "role": "sub-leader-override", "amount": 47200 },
    { "agentId": "...", "role": "leader-override", "amount": 35400 },
    { "agentId": "...", "role": "house-share", "amount": 11800 }
  ]
}
```

> Exact numbers depend on your comp-plan; what matters is **sum(splits) === totalPool** and that every level of the upline appears.

#### 5c. Upload the signed contract

1. Click **"Upload contract"** → pick any PDF.
2. Verify a `re_transaction_documents` row is created with `type = CONTRACT`.

#### 5d. Close the transaction

1. Click **"Close & post commissions"**.
2. Status transitions: PENDING → CLOSED.

```powershell
curl -X POST http://localhost:5001/api/real-estate/transactions/<txId>/close
```

### ✅ Verify

| Check | SQL |
|---|---|
| Transaction closed | `SELECT status, final_closing_at FROM re_transactions WHERE id='<txId>';` → `CLOSED`, non-null timestamp |
| Property auto-marked SOLD | `SELECT status FROM re_properties WHERE id='<propId>';` → `SOLD` |
| Splits recorded | `SELECT COUNT(*) FROM re_commission_splits WHERE transaction_id='<txId>';` → matches preview count |
| Splits sum to pool | `SELECT SUM(amount) FROM re_commission_splits WHERE transaction_id='<txId>';` → equals `totalPool` |

---

## Phase 6 — Commission split & wallet credit

Goal: each agent in the upline sees their cut land in their wallet.

### Steps

1. Sign in as the **listing agent** (e.g. Aarav). Default password is `Demo@2025`.
2. Open **`/real-estate/wallet`**.
3. The pool % allocated to "listing" appears as a **PENDING** ledger entry tied to the transaction.
4. Sign in as Aarav's **sub-leader** → wallet should show the override entry.
5. Repeat for the leader and the root user.

### ✅ Verify

```sql
-- One ledger entry per split, all in PENDING until the release rule fires
SELECT le.id, w.user_id, le.amount, le.status, le.transaction_id
  FROM re_wallet_ledger_entries le
  JOIN re_wallets w ON w.id = le.wallet_id
 WHERE le.transaction_id = '<txId>'
 ORDER BY le.amount DESC;
```

Expected: N rows (one per split), all `status = PENDING`.

#### 6b. Release pending → available

The `release-due` job promotes PENDING entries past their hold window (typically 7 days) into AVAILABLE.

```powershell
curl -X POST http://localhost:5001/api/real-estate/commissions/release-due
```

For testing, manually fast-forward by updating one entry:

```sql
UPDATE re_wallet_ledger_entries
   SET available_at = NOW() - INTERVAL '1 minute'
 WHERE transaction_id = '<txId>';
```

Re-hit the release endpoint → entries flip to `AVAILABLE` and the wallet's available balance jumps.

---

## Phase 7 — Withdrawal & payout

Goal: an agent requests a payout, admin approves, money moves out.

### Steps

1. Sign in as Aarav.
2. On **`/real-estate/wallet`**, click **"Withdraw"** → enter ₹50,000 (≤ available balance).
3. Submit → withdrawal request status = PENDING.
4. Sign back in as the **root admin**.
5. Open **`/real-estate/admin/payouts`** → the request appears.
6. Click **Approve** → status = APPROVED.
7. Click **Mark as paid** → enter a UTR / reference → status = PAID.

```powershell
# Equivalent API path
curl -X POST http://localhost:5001/api/real-estate/withdrawals/<reqId>/approve
curl -X POST http://localhost:5001/api/real-estate/withdrawals/<reqId>/mark-paid -d '{"reference":"UTR-TEST-001"}'
```

### ✅ Verify

| Check | Expected |
|---|---|
| `re_withdrawal_requests.status` | `PAID` |
| Wallet balance | Reduced by ₹50,000 |
| Ledger entry created | `type = WITHDRAWAL`, `amount = -50000` |
| Audit | `paidAt`, `paidById`, `reference` all populated |

#### Negative path (rejection)

1. Create a second withdrawal for ₹10,000.
2. Click **Reject** with reason "Insufficient KYC".
3. Wallet balance should **not** decrease; a `REJECTED` audit row is added.

---

## Phase 8 — Rank promotion

Goal: an agent's cumulative GMV crosses a threshold → rank advances.

### Steps

1. Note Aarav's current rank on **`/real-estate/agents`** (likely Trainee or Associate).
2. Close 2–3 more high-value transactions where Aarav is the listing agent (use other LAND/PLOT properties).
3. Open **`/real-estate/admin/rank-promotions`**.
4. Click **"Run promotion check"** (or hit the API).

```powershell
curl -X POST http://localhost:5001/api/real-estate/admin/rank-promotions/run
```

### ✅ Verify

| Check | SQL |
|---|---|
| Promotion log row | `SELECT * FROM re_agent_rank_promotions WHERE agent_id='<aaravAgentId>' ORDER BY created_at DESC LIMIT 1;` |
| Agent's current rank | Updated on `re_agent_profiles.rank_id` |
| UI badge | Aarav's row on agents page shows the new rank |

> **If no promotion fires:** check that the rank thresholds in `seed:re-comp-plan` are realistic for the GMV you've generated. Lower the threshold or close more deals.

---

## Phase 9 — Referral / sponsor flow

Goal: a fresh recruit signs up via a sponsor's invite and lands under them in the tree.

### Steps

1. As Aarav, open **`/real-estate/agents`** → copy your sponsor code (`RE-XXXX-XXXX`).
2. Sign out.
3. Visit **`/real-estate/join/<sponsor-code>`** in an incognito window.
4. Fill the join form: name = "Recruit Test", email = `recruit.test@example.com`, phone, password.
5. Submit.
6. Sign in as the new recruit → they land in the agent dashboard.

### ✅ Verify

| Check | Expected |
|---|---|
| New `users` row | Created with the email above |
| New `re_agent_profiles` row | `parent_id` = Aarav's agent profile ID |
| `sponsor_id` | Same as parent (for direct join) |
| `level` | One deeper than Aarav |
| Tree view | Recruit appears as a child of Aarav |

#### Sponsor commission test

Have the recruit close a sale → preview-commission should now show **Aarav** in the upline override list (one level above the recruit).

---

## Phase 10 — Reports & dashboards

Goal: aggregations match the underlying ledger / transactions.

| Page | What to verify |
|---|---|
| `/real-estate/dashboards/sales` | Total GMV = SUM(closed transactions). Top properties chart includes the Hinjewadi plot. |
| `/real-estate/dashboards/network` | Tree depth = 4. Active vs pending agents counts match `re_agent_profiles` filtered by status. |
| `/real-estate/reports/top-earners` | Aarav (and his upline) appear; amounts match `re_wallet_ledger_entries` sums. |
| `/real-estate/reports/joining` | The Phase 9 recruit shows in this month's joinings. |
| `/real-estate/reports/payouts` | The Phase 7 paid withdrawal appears with UTR reference. |
| `/real-estate/reports/member-income` | Per-agent income roll-up sums to total commission pool released. |

### Cross-check SQL

```sql
-- Top earner total should equal SUM of available + paid ledger entries per agent
SELECT u.email,
       SUM(le.amount) FILTER (WHERE le.status IN ('AVAILABLE','PAID')) AS earned
  FROM re_wallet_ledger_entries le
  JOIN re_wallets w ON w.id = le.wallet_id
  JOIN users u      ON u.id = w.user_id
 WHERE w.organization_id = '<orgId>'
 GROUP BY u.email
 ORDER BY earned DESC NULLS LAST
 LIMIT 5;
```

Cross-check this list against `/real-estate/reports/top-earners`. They must match exactly.

---

## Phase 11 — Edge cases & negative tests

These catch the bugs that integration tests usually miss.

| # | Scenario | Expected behaviour |
|---|---|---|
| 1 | Try to close a transaction at 80% of listing price (below BR-12 floor of 90%) | Close button disabled or API returns 422 with rule violation |
| 2 | Try to withdraw more than available balance | Form rejects; API returns 400 |
| 3 | Reject a transaction's compliance docs after splits are posted | Splits remain (already paid is irreversible); future txns from that agent are blocked |
| 4 | Create a duplicate lead (same phone, same property) | `/real-estate/admin/duplicates` flags it |
| 5 | Cancel a PENDING transaction | Status = CANCELLED; no splits posted; property back to AVAILABLE |
| 6 | Cancel a CLOSED transaction | UI prevents it; API returns 409 Conflict |
| 7 | Delete an agent who has children | Blocked — must reparent children first |
| 8 | Self-referral (Aarav uses his own code) | Join form rejects with "Cannot sponsor yourself" |
| 9 | A sub-leader's commission rule overrides the leader's | The more-specific rule wins (verify in preview-commission) |
| 10 | Close a transaction with FLAT_FEE commission (Bandra retail seed) | Pool = ₹2,50,000 flat, splits ratio same as percentage txns |

For each: record PASS/FAIL with a one-line note.

---

## Cleanup / reset

Re-running the seeds wipes and rebuilds the org's real-estate data. They are scoped to `SEED_ORG_ID` only — other orgs are untouched.

```powershell
npm run seed:re-team           # wipes + rebuilds tree, properties, transactions, leads
npm run seed:re-properties     # repopulates inventory
```

To wipe **only** the test transactions you created during this run (without touching seed data):

```sql
BEGIN;
DELETE FROM re_wallet_ledger_entries WHERE transaction_id LIKE 'tx_test_%';
DELETE FROM re_commission_splits     WHERE transaction_id LIKE 'tx_test_%';
DELETE FROM re_transaction_documents WHERE transaction_id LIKE 'tx_test_%';
DELETE FROM re_transactions          WHERE id              LIKE 'tx_test_%';
COMMIT;
```

(Prefix your test transaction codes with `TX-TEST-` so they're easy to find.)

---

## Pass/Fail checklist (one-page)

Copy this into a tracking doc / spreadsheet for each test pass:

```
Phase 0 — Bootstrap
  [ ] seed:re-team             ran clean, tree of 30 visible
  [ ] seed:re-comp-plan        ran clean, ranks visible in admin
  [ ] seed:re-properties       33 properties created, all 5 types present
  [ ] LAND/PLOT count >= 6

Phase 1 — Hierarchy
  [ ] Tree view shows 4 levels under root
  [ ] No orphan agents (SQL check)
  [ ] Sponsor codes generated for every leaf agent

Phase 2 — Compliance
  [ ] Compliance queue shows 30 PENDING agents
  [ ] Approving a doc updates verified_at + verified_by
  [ ] Ranks loaded with thresholds

Phase 3 — Properties
  [ ] 33 cards on listing page
  [ ] Filter by LAND returns 8
  [ ] Property detail shows price, area, commission, listing agent, 3 images

Phase 4 — Leads
  [ ] New lead lands in NEW column on kanban
  [ ] Drag to CONTACTED updates status + activity log
  [ ] Viewing scheduled creates re_property_viewings row

Phase 5 — Transactions
  [ ] Created at PENDING
  [ ] Preview-commission API returns splits summing to pool
  [ ] Contract upload creates document row
  [ ] Close → CLOSED, property → SOLD, splits posted

Phase 6 — Wallet
  [ ] Each upline agent sees a PENDING ledger entry
  [ ] Sum of ledger entries = total commission pool
  [ ] release-due flips eligible entries to AVAILABLE

Phase 7 — Withdrawal
  [ ] Request created with PENDING status
  [ ] Approve → APPROVED
  [ ] Mark paid + UTR → PAID, balance reduced
  [ ] Reject path leaves balance untouched

Phase 8 — Rank promotion
  [ ] Promotion job creates re_agent_rank_promotions row
  [ ] Agent's rank_id updated
  [ ] UI badge reflects new rank

Phase 9 — Referral
  [ ] /join/<code> creates user + agent profile under sponsor
  [ ] Recruit's first sale credits sponsor in upline

Phase 10 — Reports
  [ ] Sales dashboard GMV matches SQL sum
  [ ] Top-earners report matches ledger SQL
  [ ] Network dashboard shows correct depth + counts

Phase 11 — Edge cases
  [ ] All 10 negative scenarios behave as documented
```

---

**Sign-off line:**
`Tester _________  Date _________  Build SHA _________  Result: PASS / PASS-WITH-NOTES / FAIL`
