# ERP "Production" Audit — Brutal Verdict

**Repo:** `c:\Users\taman\erp-production-code`
**Stack:** Next.js 14 (App Router), Prisma 6, Postgres/Supabase, MongoDB, Redis, ~148 API routes, 1,917-line schema
**Method:** Static + behavioral audit of source. The live app at `localhost:5001` was not driven (no browser tooling available); where this report says "broken at runtime", the code path proves it.

---

## 1. Executive Summary

This is **not an ERP**. It is a moderately built, low-code form-builder (Zoho-Creator clone) with a bolted-on toy HR/Payroll demo, a fake dashboard, and a security posture that would not survive a 30-minute pentest. Calling it "production code" is a category error: the `.env` has live Supabase/MongoDB/Twilio/Gmail credentials, `lib/hostinger-upload.ts:3-9` has hardcoded FTP creds, the JWT secret literally falls back to the string `"your-fallback-secret-key"` in `lib/auth.ts:7`, `.env`'s `NEXTAUTH_SECRET` is the placeholder `"your-nextauth-secret-key-here"`, and roughly 70 of 148 API routes have **no server-side auth check at all**. Builds run with `ignoreDuringBuilds: true` and `ignoreBuildErrors: true` (`next.config.mjs`) — TypeScript and ESLint are silenced.

The form-builder engine itself is real and non-trivial (drag-drop fields, sections, subforms, formulas, lookups, workflow triggers). Everything around it is half-finished, fake, or actively dangerous.

## 2. What This ERP Actually Is

A **Zoho Creator / Kissflow clone** with:

- **Real:** dynamic form builder, sections, subforms, formula fields, lookup fields, workflow triggers (CRUD-event), permissions UI, multi-tenant RBAC schema.
- **Toy:** Payroll (single hardcoded rule: 12% PF, 5% tax, ₹500 insurance — see `app/api/payroll/auto-generate/route.ts:130-137`), attendance (date stored as `String`).
- **Fake:** the `/payroll` page renders `components/dashboard.tsx` which has hardcoded "Mark Zuckerberg" leave requests, "Jordan Belfort" employees, `$4,852,900` payroll, and `picsum.photos` avatars.
- **Missing entirely:** General Ledger, Chart of Accounts, Journal/Ledger entries, Invoice, Bill, Customer, Vendor, Item/SKU, Warehouse, Stock movement, Batch/Serial, GRN, Purchase Order, Sales Order, Quotation, Credit/Debit Note, Tax/GST/TDS, Bank reconciliation, Fiscal periods, Cost centers, Assets/Depreciation. **Zero finance code anywhere in the schema, app, or API.**

**Industry:** undefined — generic. **Maturity:** a form-builder MVP, not an ERP.

## 3. Biggest Risks (Ranked by Blast Radius)

1. **Hardcoded production FTP credentials in source** — `lib/hostinger-upload.ts:3-9`: host, user, password (`Kafka@India1122`), plain FTP (`secure: false`). The `.env` `HOSTINGER_*` keys are **completely ignored**. Anyone with repo read or `.git` exposure owns the Hostinger account.
2. **`/api/upload` is unauthenticated** (`app/api/upload/route.ts:4-35`). No login. No MIME, extension, size, or path-traversal check. Filename interpolates user-controlled `image.name`. Anonymous internet → arbitrary write into `https://businesscard.nesscoglobal.com/businesscard/` — perfect host for malware/phishing.
3. **Middleware skips all of `/api`** (`middleware.ts:21`) AND `AuthMiddleware.hasModulePermission` returns `true` unconditionally (`lib/auth-middleware.ts:167`). The whole RBAC/permissions UI is **theatre** for ~95% of routes. Field-level / section-level `RolePermission` rows exist in the DB but are checked in roughly 2 routes.
4. **`auth-meta` cookie is `httpOnly: false`, unsigned, JSON** (`app/api/auth/login/route.ts:346-356`) and middleware trusts `authMeta.isAdmin` to bypass everything (`middleware.ts:109`). Any logged-in user can edit `document.cookie` and become admin for page rendering. The DB-checked APIs aren't fooled, but admin pages render and may leak.
5. **`/api/forms/[formId]` GET/PUT/PATCH/DELETE and `/api/forms/[formId]/records/[recordId]` are unauthenticated and not tenant-scoped** — the central data store of the entire app. Anonymous request reads, edits, or deletes any form / any record across all tenants.
6. **OTP brute-force end-to-end.** `generateOTP` uses `Math.random()` (`lib/auth.ts:33`) — not CSPRNG. Login increments `login_attempts` but **never locks** (`app/api/auth/login/route.ts:172-176`). Verify-OTP / reset-password increment `attempts` but never check. No rate limiter, no captcha, anywhere in the repo.
7. **Login user enumeration**: returns `"User not found"` (404) vs `"Invalid email or password"` (400) — perfect oracle (`app/api/auth/login/route.ts:86, 177`). `forgot-password` does the same.
8. **`/api/init`, `/api/payroll`, `/api/payroll/save`, `/api/payroll/auto-generate`, `/api/payroll/stats`, `/api/modules/hierarchy`** — **fully unauthenticated**. Salary data is readable and writable to anonymous attackers.
9. **`/api/create-user-from-employee`** authenticates the caller but lets the body specify any `roleId`/`unitId` and never verifies they belong to the caller's org → cross-tenant privilege escalation.
10. **Dockerfile bakes `.env` into the production image** (`dockerfile:24`) — image consumers get every secret.
11. **Build-time safety nets disabled** — `ignoreDuringBuilds: true` (ESLint), `ignoreBuildErrors: true` (TypeScript) in `next.config.mjs`. Type errors ship.
12. **AI route prompt-injection + bill-running** — `app/api/chat/route.ts` accepts `body.model`/`body.providerId` and concatenates user `system` messages with the org context. No per-user token quota. Tenant-A user can drain tenant-A's API key on the most expensive model.
13. **`vm` "sandbox"** — `lib/functions/executor.ts` explicitly states Node `vm` is NOT a security boundary; if function authorship is ever opened beyond org owners, it is server-side RCE.
14. **`eval()` + `new Function()`** in `lib/formula/evaluator.ts:431-437`. Currently appears client-side, but if it ever runs server-side it becomes RCE.

## 4. Hidden Future Problems

- **Dual-write disaster waiting**: 16 record tables — 15 sharded `FormRecord1..15` + a "unified" `FormRecord` (`prisma/schema.prisma:666-1088, 1615`). No discriminator key, sharding logic in `DatabaseTransforms` reads `FormTableMapping`. The day a form's mapping flips or two paths disagree, half the records vanish from queries.
- **No soft-delete, no version column, no createdBy/updatedBy** on any business table. Every delete is hard, cascading. There is no recovery.
- **`PayrollRecord.employeeId`, `FormRecordField.formId/fieldId`, `FormRecord14.organizationId`** are loose strings with no FK. Orphans accumulate silently.
- **`Attendance.date` is `String`** (`prisma/schema.prisma:1402`) — date-range scans become lexicographic. Reports will miss rows.
- **`UniqueIdCounter`** has no tenant — single global counter. **Numbering collisions guaranteed in multi-tenant.**
- **`Decimal` columns lack explicit precision** (`@db.Decimal(p,s)`) anywhere. Postgres defaults to unbounded `numeric`. `parseFloat` is used for `totalSalary` (`lib/api-handlers/user-management.ts:274`) — **money via Float**.
- **`/api/stats` calls `fetch(baseUrl + "/api/payroll")`** — server makes HTTP requests to itself with `NEXT_PUBLIC_APP_URL` (which is `https://erp.nesscoglobal.com/` in `.env`). Half the time this loops through the public internet from the prod box. Also: `/api/forms/testing` is hardcoded (`app/api/stats/route.ts:11`) — a leftover dev string.
- **No backups, no DR, no retention** modeled. No `Notification`/`EmailQueue`/`SMSLog`/`Webhook`/`File` tables despite the recent "webhook configuration" commit.
- **Bcrypt mixed**: both `bcrypt` (native) and `bcryptjs` (pure JS) are dependencies; salt rounds vary (`12` in `lib/auth.ts:25`, `10` in `lib/api-handlers/user-management.ts:152`). Inconsistent verification cost.
- **`moment` AND `date-fns`** both pulled — bundle bloat + format drift.
- **`@tanstack/react-table` is in deps but imported zero times.** Dead weight.

## 5. UX Problems Hurting Users

- **Fake `/payroll` page**: `components/dashboard.tsx:62-76, 305` renders "Mark Zuckerberg leave request, Jordan Belfort employee, $4,852,900 payroll, picsum.photos avatars" — wired into `app/payroll/page.tsx`. Demo data shipped as production.
- **Bulk-select checkboxes with no handler** in `app/admin/users/page.tsx:210, 246` — visible UI lying to the user.
- **"Module name is required" red error shown before user types** — `components/layout/sidebar.tsx:644-653`.
- **Hand-rolled `useState` forms with no validation** in `components/forms/dynamic-form.tsx:30-110`; errors swallowed by `console.error`.
- **No loading skeletons** — most list pages show raw "Loading users..." text.
- **No bulk actions, no column visibility, no virtualization** anywhere in tables. >5,000-row lists will hang the browser (client-side sort/filter/pagination).
- **"Something went wrong"** is the literal fallback in 9+ files.
- **Accessibility is poor**: icon buttons rely on `title=` instead of `aria-label`; `text-gray-400` on white labels fail WCAG AA in 76+ places.
- **No i18n infrastructure at all** — every string is hardcoded English.
- **Mobile**: hamburger only on `admin-nav`; the main sidebar uses fixed pixel widths and `hooks/use-mobile.tsx` is only used by an unused shadcn primitive.
- **Auth flows are the only polished part** — `components/auth/LoginView.tsx` uses zod + react-hook-form + server-error mapping. The rest of the app does not.

## 6. Security Vulnerabilities (Concrete CVE-class Findings)

| # | Severity | Issue | File:Line |
|---|---|---|---|
| 1 | Critical | Hardcoded prod FTP creds + plain FTP | `lib/hostinger-upload.ts:3-9` |
| 2 | Critical | Unauth file upload, no MIME/size/traversal check | `app/api/upload/route.ts` |
| 3 | Critical | Live `.env` with Supabase/Mongo/Twilio/Gmail secrets in working tree, baked into Docker image | `.env`, `dockerfile` |
| 4 | Critical | JWT fallback secret = `"your-fallback-secret-key"`; `NEXTAUTH_SECRET="your-nextauth-secret-key-here"` | `lib/auth.ts:7`, `.env:9` |
| 5 | Critical | Middleware skips `/api`, `AuthMiddleware.hasModulePermission` returns `true` unconditionally | `middleware.ts:21`, `lib/auth-middleware.ts:167` |
| 6 | Critical | `/api/forms/[formId]` and `/api/forms/[formId]/records/[recordId]` — unauth, no tenant scope | `app/api/forms/[formId]/route.ts:115-338` |
| 7 | Critical | `/api/payroll/*` (5 endpoints), `/api/init`, `/api/modules/hierarchy` unauth | multiple |
| 8 | High | OTP via `Math.random()`, brute-forceable, no lockout, no rate-limit, no captcha | `lib/auth.ts:33`, `app/api/auth/verify-otp/route.ts:50` |
| 9 | High | `auth-meta` cookie is `httpOnly:false` + unsigned + trusted for `isAdmin` | `middleware.ts:109` |
| 10 | High | Cross-tenant privilege escalation in `create-user-from-employee` (caller picks any roleId) | `app/api/create-user-from-employee/route.ts` |
| 11 | High | Login + forgot-password user enumeration (404 vs 400) | `app/api/auth/login/route.ts:86` |
| 12 | High | Prompt injection + unbounded LLM cost via client-controlled model/providerId | `app/api/chat/route.ts` |
| 13 | High | `vm`-based "sandbox" admitted not a boundary; `eval()` + `new Function()` in formula evaluator | `lib/functions/executor.ts`, `lib/formula/evaluator.ts:431-437` |
| 14 | Medium | `next.config.mjs` ignores TS errors and ESLint at build | `next.config.mjs` |
| 15 | Medium | Mass assignment via `prisma.employee.upsert({ ...employeeData })` | `lib/api-handlers/user-management.ts:270` |
| 16 | Medium | <10% of API routes use zod / any input validator | repo-wide |
| 17 | Medium | Float for money (`parseFloat(totalSalary)`); `Decimal` lacks `@db.Decimal(p,s)` | multiple |
| 18 | Medium | `UniqueIdCounter` has no tenant — global counter | `prisma/schema.prisma:1600` |
| 19 | Low | Console.logs print PII (email, IDs, role IDs) on every request | `lib/auth-middleware.ts` |
| 20 | Low | `bcrypt` and `bcryptjs` both installed; salt rounds inconsistent (10 vs 12) | `package.json` |

**OWASP Top 10 hits:** A01 Broken Access Control, A02 Crypto Failures, A03 Injection (formula), A04 Insecure Design, A05 Security Misconfig, A07 Identification/Auth Failures, A08 Integrity Failures, A09 Logging/Monitoring Failures, A10 SSRF (`/api/stats` self-fetch). **Nine of ten in one codebase.**

## 7. Static vs Dynamic ERP Verdict

Neither — it's a **dynamic form platform mislabeled as ERP**. On the dynamic-ERP scorecard:

| Capability | Status |
|---|---|
| User-defined modules / fields / forms | ✅ Real (`app/builder`, `components/form-builder`) |
| Custom layouts (sections/subforms) | ✅ Real |
| Formulas / lookups | ✅ Real (with `eval` smell) |
| Workflow rules (CRUD-triggered) | ⚠️ Partial — fire-and-forget, no scheduler runs `scheduledExecute`, no approvals/SLA |
| Role-configurable permissions | ⚠️ Schema yes, enforcement no |
| Multi-branch / org-units | ✅ Schema only |
| Multi-tenant ready | ❌ Broken — most tables lack `organizationId`, counters are global |
| APIs for integration | ⚠️ Internal only, no API keys/webhooks |
| Real-time dashboards | ❌ Hardcoded mocks |
| Reports user-definable | ❌ Hardcoded section types |
| Automation rules | ⚠️ Limited (3 action types, no scheduler) |
| Plug-in integrations | ❌ None |

This is a **dynamic form platform** with strong scaffolding for a custom-app builder. It is **not** a dynamic ERP because there is no ERP domain underneath the dynamic layer.

## 8. Missing Features

**Finance:** GL, Chart of Accounts, Journal, Ledger, Trial Balance, Period close, Fiscal year, Currency, Exchange rate, Tax codes (GST/VAT/TDS), Invoice, Bill, Credit Note, Debit Note, Payment, Receipt, Bank account, Bank reconciliation, P&L, Balance Sheet, Cash flow.
**Inventory:** Item/SKU, UOM, Warehouse, Bin, Stock movement, Batch, Serial, Reorder level, GRN, Delivery note, Stock valuation (FIFO/Avg).
**Sales/Purchase:** Customer, Vendor, Quotation, Sales Order, Purchase Order, Requisition, RFQ.
**HR/Payroll (real):** Salary structure, Earnings/Deductions components, PF/ESI/TDS slabs, Professional tax, Gratuity, LWF, Form 16/24Q, PDF payslip (current "download" writes a JSON file at `components/payroll/payslip-preview.tsx:44-60`), Holidays, Shift schedules.
**CRM:** Lead, Customer, Contact, Activity, Follow-up reminders, Pipeline.
**Platform:** Notification queue, Email queue, SMS log, Webhook + WebhookDelivery, File/Attachment table with hash + size + retention, Approval engine (ApprovalRequest/Step), Workflow execution log, Audit diff (before/after JSON), Soft-delete + version columns, API keys, Multi-currency, Multi-language, Mobile app.

## 9. Priority Improvements (Roadmap)

### A. Immediate (within 1 week — these are bleeding)

1. **Rotate every secret in `.env`** — Supabase passwords, MongoDB password, Twilio token, Gmail app password, FTP password. Assume all are compromised; they're in the working tree and Dockerfile.
2. **Delete hardcoded creds** from `lib/hostinger-upload.ts:3-9`. Move to env vars. Switch to FTPS or S3.
3. **Add auth + MIME/size/extension allowlist + path-traversal sanitization** to `/api/upload`. Consider switching to S3 presigned URLs.
4. **Add server-side auth to every route handler** under `app/api/payroll/*`, `app/api/init`, `app/api/forms/[formId]/*`, `app/api/modules/hierarchy`, plus tenant scoping (`organizationId` filter on every find/update/delete).
5. **Fix the JWT fallback** — fail fast if `JWT_SECRET` / `NEXTAUTH_SECRET` are missing or are placeholders. Same for `auth-meta`: HMAC-sign the JSON or stop trusting it for `isAdmin`. The simplest fix is to re-fetch admin status on every middleware run via a signed JWT in `auth-token` instead of relying on a JSON cookie.
6. **Stop returning "User not found"** on login/forgot-password. Single message: "If the credentials are valid, you'll receive…".
7. **Add rate limiting** (Redis-backed; you already pull `ioredis`) to `/api/auth/*`. Hard 5-attempt lockout on login + OTP. Replace `Math.random()` with `crypto.randomInt()`.
8. **Remove `ignoreBuildErrors`/`ignoreDuringBuilds`** from `next.config.mjs`. Fix the resulting compile errors.
9. **Remove the fake `components/dashboard.tsx`** from `app/payroll/page.tsx`, or clearly mark "DEMO" — do not ship "Mark Zuckerberg" payroll to a real customer.
10. **Repo hygiene**: `git rm --cached .env` and `git filter-repo` to scrub history.

### B. Important (30 days)

- Implement real RBAC enforcement in API handlers — wrap every route in a single `withAuthZ(resource, action)` HOF that validates the cookie token, scopes by org, and consults `RolePermission`/`UserPermissionOverride`. Delete `lib/auth-middleware.ts:167-178` (the always-true checks).
- Migrate every record table to a single `FormRecord` (drop `FormRecord1..15`) or finish the unification. Right now you have a live dual-write hazard.
- Add `organizationId` + compound unique indexes (`@@unique([organizationId, name])`) to every business model. Tenant-scope `UniqueIdCounter`.
- Switch all money columns to `Decimal @db.Decimal(19,4)` + cents-as-int where possible. Stop calling `parseFloat` on money. Consolidate to `bcryptjs` (or `bcrypt`), one rounds value.
- Add zod input validation to every route. A single `safeParse` per handler.
- Soft-delete (`deletedAt`) + `version` columns + audit diff (`before`/`after` JSON) in `AuditLog`.
- Replace mock `/payroll` page with real KPIs from server actions (the real `dashboard-content.tsx` shows you have the pattern).
- Add CAPTCHA on `register`, `forgot-password`, `verify-otp` (hCaptcha or Cloudflare Turnstile — 2 hours of work).
- Audit and harden the workflow scheduler: `WorkflowRule.scheduledExecute` is referenced but **no scheduler runs it**. Either remove the field or add a cron/queue worker.
- Wire `@tanstack/react-table` everywhere or drop the dependency.

### C. Scale-up (90 days)

- Build the actual ERP domain on top of the form-builder: real `Account`, `Journal`, `Ledger`, `Invoice`, `Item`, `StockMovement`, `Customer`, `Vendor` tables — not as form records, as first-class relational tables. Without this, you cannot post even a single accurate trial balance.
- Add a job/queue system (BullMQ + Redis — you already have `ioredis`) for: email/SMS, exports, scheduled workflows, payroll runs.
- Add a real reporting engine: server-side query builder + saved views + PDF/Excel generation worker. Implement the empty `app/api/export/create-job/route.ts` (currently 0 bytes).
- Multi-tenancy hardening: row-level security via Supabase RLS as a defence-in-depth layer underneath app-level filters.
- Observability: structured logs (replace `console.log` PII spew), error tracking (Sentry), metrics, tracing.
- Backups + PITR + restore drill.

### D. Enterprise features

- Real approvals engine (ApprovalRequest/Step/State with maker-checker + delegations + SLAs).
- API keys + signed webhooks (the recent commit hints at it; no schema yet).
- SSO (SAML/OIDC), MFA (TOTP via app, push via Twilio Verify), SCIM provisioning.
- Audit immutability (append-only log, signed entries).
- Row-level + column-level security.
- Multi-currency + multi-language (i18n is currently zero).
- Mobile app or PWA-quality responsive layout.
- SOC2-relevant: secrets manager, key rotation, encrypted backups, vendor risk reviews.

## 10. Final Brutal Verdict — Scorecard & Ship Status

| Dimension | Score / 10 | Why |
|---|---|---|
| UI Design | 5 | Auth screens polished; everything else hand-rolled, inconsistent |
| UX Efficiency | 3 | Hand-rolled forms, no skeletons, bulk-select doesn't work, fake demo data shipped |
| Security | 1 | Live secrets in repo, hardcoded FTP creds, RBAC is theatre, ~70 unauth routes, brute-force OTP |
| ERP Logic | 1 | No finance/inventory/sales/purchase. Toy payroll. Mislabeled product. |
| Code Quality | 4 | TS errors silenced at build, console.log PII, dead deps, dual record tables, mixed bcrypt |
| Scalability | 3 | Internal HTTP self-fetch in `/api/stats`, no caching, no queue, sharded record tables, missing indexes |
| Performance | 4 | Heavy DB joins on every login, no pagination on most lists, client-side filter on huge sets |
| Data Safety | 2 | No soft-delete, no version, hard cascades, Float for money, no backups, global counter |
| Production Readiness | 1 | Env in image, fallback secrets, ignoreBuildErrors, fake dashboard live, /api/upload anonymous |
| Commercial Value | 3 | The form-builder engine itself has real value. The "ERP" framing has none until the domain is built. |

**Overall: 27 / 100.**

### Final ship status

- **Hobby project / internal tool**: ❌ Above this — there is real engineering in the form-builder.
- **Small business ready**: ❌ Not until the security findings 1–9 are fixed and the fake `/payroll` is removed. Shipping today exposes Hostinger creds, payroll PII, and the entire database.
- **Sellable SaaS**: ❌ Two reasons. (a) Multi-tenant isolation is broken at the schema level (most tables missing `organizationId`, global `UniqueIdCounter`). (b) There is no ERP domain — you'd be selling a Zoho Creator clone branded as "ERP", which is a churn machine the moment a customer asks for an invoice or a stock report.
- **Enterprise capable**: ❌ Not even close. No approvals, no audit immutability, no SSO/SAML, no encrypted backups, no observability, no SOC2 controls.

### Bottom line

This is **a half-finished low-code platform pretending to be an ERP, leaking credentials, with a mock dashboard live in production**. The right moves are:

1. Immediate secret rotation + repo hygiene.
2. Plug the unauthenticated routes and the fake `auth-meta` admin trust.
3. Decide honestly whether you are building a low-code platform (in which case rename it and double down on the form builder, lookups, workflow, and reports) or a real ERP (in which case 6–12 months of building the finance/inventory/sales/purchase domain on top).

Trying to be both is how this becomes a Frankenstein that loses customer data the day it gets a real customer.
