---
name: ERP project state and audit
description: What this "ERP" actually is, key gaps, and where the audit lives — so future sessions don't re-audit blind
type: project
---

This repo is branded "erp-production-code" but is really a **low-code form-builder** (Zoho-Creator clone) with a payroll module, fake dashboard, and security gaps. A full audit lives at [ERP_AUDIT_REPORT.md](ERP_AUDIT_REPORT.md) (written 2026-04-30, scored 27/100).

**Real / working:** form builder, sections/subforms, formulas, lookups, workflow CRUD triggers, multi-tenant RBAC schema, auth flows.

**Toy / partial:** Payroll (single hardcoded rule — 12% PF, 5% tax, ₹500 insurance), attendance, workflow scheduler (`scheduledExecute` field exists but **no cron/worker runs it** — confirmed still true on 2026-05-04).

**Missing entirely:** GL, Chart of Accounts, Invoice, Bill, Customer, Vendor, Item/SKU, Warehouse, Stock movement, PO/SO, Tax/GST, Bank rec, Fiscal periods. Zero finance code.

**Key still-unfixed risks (verified 2026-05-04):**
- `lib/hostinger-upload.ts:4-6` — hardcoded prod FTP creds (`Kafka@India1122`).
- `app/api/upload/route.ts` — fully unauthenticated, no MIME/size/path-traversal check.
- `middleware.ts:20-27` — middleware skips all `/api/*`.
- `lib/auth-middleware.ts:167` — `hasModulePermission` returns `true` unconditionally.
- `.env` baked into Docker image (`dockerfile:24`).
- No workflow scheduler runs `scheduledExecute`.
- Mock `components/dashboard.tsx` (Mark Zuckerberg, $4.8M payroll) still exists but `app/payroll/page.tsx` was rewritten and no longer renders it.

**Recently improved (post-audit):** `/api/payroll` GET/POST now checks auth + org scope (was unauth in audit). Payroll UI rewritten with real Tabs/Cards.

**Why:** The user keeps asking whether things are "working / automated" — they want a status check, not a re-audit. Point to the audit, then verify what changed.

**How to apply:** When asked broad "is X working / automated" questions, lean on the audit + spot-check the specific files mentioned above to see if they've been fixed since 2026-04-30. Don't pretend the ERP domain exists.
