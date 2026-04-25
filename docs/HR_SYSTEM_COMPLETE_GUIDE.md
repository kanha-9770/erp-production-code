# HR System — Complete End-to-End Guide

> **Audience:** Anyone who wants to understand the HR module from the ground up — business analyst, new engineer, QA, support, or product owner.
> **Scope:** Every module, every form, every field-driven automation, every back-end calculation engine that ships with the HR system in this repo.
> **Source of truth:** [`scripts/create-hr-module.sql`](../scripts/create-hr-module.sql), [`scripts/create-hr-automations.sql`](../scripts/create-hr-automations.sql), the live `payroll/*` Next.js API routes, and the in-app reference page at [`app/settings/docs/hr-system/page.tsx`](../app/settings/docs/hr-system/page.tsx).

---

## Table of Contents

1. [What the HR System Is](#1-what-the-hr-system-is)
2. [The Data Model — Modules → Forms → Sections → Fields](#2-the-data-model--modules--forms--sections--fields)
3. [Module Map (5 modules, 19 sub-modules, 20 forms, 241 fields)](#3-module-map)
4. [The 20 HR Forms — Field-by-Field](#4-the-20-hr-forms--field-by-field)
5. [The 3-Layer Automation Fabric](#5-the-3-layer-automation-fabric)
6. [All 16 Automation Functions](#6-all-16-automation-functions)
7. [All 36 Workflow Rules](#7-all-36-workflow-rules)
8. [All 22 Function Bindings](#8-all-22-function-bindings)
9. [Employee Auto-Fill — Deep Dive](#9-employee-auto-fill--deep-dive)
10. [Attendance Subsystem — Two-Surface Design](#10-attendance-subsystem--two-surface-design)
11. [Leave Management Subsystem](#11-leave-management-subsystem)
12. [Payroll Engine — End-to-End](#12-payroll-engine--end-to-end)
13. [Recruitment Lifecycle](#13-recruitment-lifecycle)
14. [Performance & Engagement Subsystems](#14-performance--engagement-subsystems)
15. [Asset & SIM Lifecycle](#15-asset--sim-lifecycle)
16. [Permissions & Routes](#16-permissions--routes)
17. [Bootstrap & Seeding (How To Stand It Up From Scratch)](#17-bootstrap--seeding)
18. [API Reference](#18-api-reference)
19. [File Inventory (Where Everything Lives)](#19-file-inventory-where-everything-lives)
20. [Glossary](#20-glossary)

---

## 1. What the HR System Is

The HR system is a **form-driven, low-code module** that runs on top of the same generic form/record engine used by every other module in this ERP. There is no hand-written "Employee" page or "Leave" page; every screen the user sees is a generic form renderer reading metadata from the database.

What you get out of the box:

| Layer | Count | Notes |
|---|---|---|
| Top-level modules | **5** | HR Core, Recruitment, Performance, Engagement, Asset & Admin |
| Sub-modules | **19** | One per business process |
| Forms | **20** | Each form lives under a sub-module |
| Sections | **31** | Forms can be split into collapsible sections |
| Fields | **241** | Mix of text, date, file, formula, lookup, etc. |
| Automation Functions | **16** | Sandboxed JavaScript snippets |
| Workflow Rules | **36** | 26 module-specific + 10 employee auto-fill safety nets |
| Function Bindings | **22** | 12 calc/lifecycle + 10 employee auto-fill |
| Permissions | **5** | HR Admin / View / Create / Edit / Delete |
| Route permissions | **25** | One per module path under `/hr/...` |
| Leave Types | **3** seeded (Full Day, Half Day, Short Leave) — extensible |
| Leave Rules | **4** seeded (Sick, Casual, Half-Day, Short) — extensible |

Two SQL files build the entire system:

1. [`scripts/create-hr-module.sql`](../scripts/create-hr-module.sql) — Wipes and rebuilds the **structure** (modules, forms, sections, fields, permissions, route permissions, admin role, user permissions).
2. [`scripts/create-hr-automations.sql`](../scripts/create-hr-automations.sql) — Wipes and rebuilds the **automation layer** (functions, workflow rules, function bindings).

Both are **idempotent** (`DELETE … WHERE` then `INSERT … ON CONFLICT DO UPDATE`), so they can be re-run safely.

---

## 2. The Data Model — Modules → Forms → Sections → Fields

```
┌─────────────────────────────────────────────────────────────────┐
│  form_modules (HR root)                                         │
│   ├── form_modules (top-level: HR Core, Recruitment, …)         │
│   │    └── form_modules (sub-module: Employee Master, …)        │
│   │         └── forms (e.g. Employee Master)                    │
│   │              └── form_sections (Personal Info, Contact, …)  │
│   │                   └── form_fields (Salutation, First Name…) │
│   │                        └── formula_fields (computed)        │
│   │                                                             │
│   └── records (form submissions: each row = one filled-in form) │
│        ▲                                                        │
│        │ written by /api/forms/:formId  +  workflow engine      │
└─────────────────────────────────────────────────────────────────┘
```

Key tables (Postgres / Prisma):

| Table | Purpose | Defined in |
|---|---|---|
| `form_modules` | Hierarchy of modules. `parent_id` lets sub-modules nest under parents. | `prisma/schema.prisma` |
| `forms` | One per business form. Holds `module_id`, `is_published`, `isEmployeeForm`. | `prisma/schema.prisma` |
| `form_sections` | Section header inside a form. Has `order`, `columns`, `collapsible`. | `prisma/schema.prisma` |
| `form_fields` | Individual input. Has `type`, `validation`, `options`, `width`, `order`. | `prisma/schema.prisma` |
| `formula_fields` | Computed fields tied to a `form_field` of type `formula`. | `prisma/schema.prisma` |
| `crm_functions` | JavaScript snippets executed in a VM sandbox. | `prisma/schema.prisma` |
| `workflow_rules` | Rules fired on `Create`/`Edit`/`Delete` of records. | `prisma/schema.prisma` |
| `function_bindings` | Wires a function to a form/field event (`onFieldChange`, `beforeSubmit`, …). | `prisma/schema.prisma` |
| `payroll_configurations` | Tells the payroll engine which forms to read attendance/leave from. | [`prisma/schema.prisma:1305`](../prisma/schema.prisma#L1305) |
| `payroll_records` | Output of payroll runs (one row per employee per month). | [`prisma/schema.prisma:1366`](../prisma/schema.prisma#L1366) |
| `attendance_records` | Lightweight check-in/out log keyed by `(userId, date)`. | [`prisma/schema.prisma:1398`](../prisma/schema.prisma#L1398) |
| `leave_types` / `leave_rules` | Master + rule rows for leave categorisation. | [`prisma/schema.prisma:1321`](../prisma/schema.prisma#L1321) |
| `employees` | Optional canonical employee row (linked to `User`). Most data lives in form records. | [`prisma/schema.prisma:1230`](../prisma/schema.prisma#L1230) |

> **Why both `employees` table AND `Employee Master` form?**
> The `employees` Prisma table is the legacy/canonical row used by `User`-linked features (auth, attendance widget, payroll fallback). The `Employee Master` **form** is the operational source — every HR sub-module reads from it via the `fn_hr_lookup_employee` function. New deployments rely on the form; the table is kept for FK relationships.

---

## 3. Module Map

Every module ID, name, path, and order is seeded in [`scripts/create-hr-module.sql:170-202`](../scripts/create-hr-module.sql#L170-L202). The hierarchy:

```
HR  (mod_hr_root, /hr)
├── HR Core              (mod_hrcore,   /hr/core)               5 forms
│   ├── Employee Master         (form_hr_employee_master,    52 fields)
│   ├── Check In                (form_hr_checkin,             9 fields)
│   ├── Check Out               (form_hr_checkout,            6 fields)
│   ├── Leave Application       (form_hr_leave_application,  10 fields)
│   └── Holiday List            (form_hr_holiday_list,        5 fields)
│
├── Recruitment          (mod_hrrec,    /hr/recruitment)        6 forms
│   ├── Staffing Plan           (form_hr_staffing_plan,       9 fields)
│   ├── Job Opening             (form_hr_job_opening,        11 fields)
│   ├── Job Application         (form_hr_job_application,    15 fields)
│   ├── Job Offer               (form_hr_job_offer,          10 fields)
│   ├── Appointment Letter      (form_hr_appointment_letter,  8 fields)
│   └── Employee Referral       (form_hr_employee_referral,  10 fields)
│
├── Performance          (mod_hrperf,   /hr/performance)        2 forms
│   ├── KRA Master              (form_hr_kra_master,          4 fields)
│   └── Performance Appraisal   (form_hr_performance_appraisal, 7 fields)
│
├── Employee Engagement  (mod_hreng,    /hr/engagement)         5 forms
│   ├── Self Target             (form_hr_self_target,         8 fields)
│   ├── Self Initiative         (form_hr_self_initiative,     9 fields)
│   ├── Problem Registration    (form_hr_problem_registration, 12 fields)
│   ├── Kaizen                  (form_hr_kaizen,             19 fields)
│   └── Employee Suggestion     (form_hr_employee_suggestion, 11 fields)
│
└── Asset & Admin        (mod_hradm,    /hr/admin)              2 forms
    ├── Asset Management        (form_hr_asset_management,   11 fields)
    └── SIM Management          (form_hr_sim_management,     15 fields)
```

**Field-count check (sums to 241):** `52 + 9 + 6 + 10 + 5 + 9 + 11 + 15 + 10 + 8 + 10 + 4 + 7 + 8 + 9 + 12 + 19 + 11 + 11 + 15 = 241` ✅

---

## 4. The 20 HR Forms — Field-by-Field

Each form below lists its sections and the fields inside them, in **display order**. Field IDs (`fld_*`) are stable across deployments — workflow rules and bindings reference them directly. See the SQL file for full validation/options JSON.

### 4.1 `Employee Master` — central source of truth (52 fields, 7 sections)

> Form ID `form_hr_employee_master` · Module `mod_hrcore_emp` · Path `/hr/core/employee-master` · Defined at [SQL line 217](../scripts/create-hr-module.sql#L217) and fields starting at [line 332](../scripts/create-hr-module.sql#L332).

| Section | Fields (label · type) |
|---|---|
| **A. Personal Information** (10) | Salutation (select) · First Name (text, required) · Last Name (text, required) · Gender (select, required) · Date of Birth (date, required) · Place of Birth (text) · Blood Group (select) · Nationality (text, default `Indian`) · Marital Status (select) · Employee Image (image) |
| **B. Contact Information** (10) | Personal Email (email, required) · Company Email (email) · Cell Number (tel, required, regex) · Current Address (textarea, required) · Permanent Address (textarea, required) · Current Accommodation Type (select) · Permanent Accommodation Type (select) · Emergency Contact Name (text, required) · Emergency Phone (tel, required) · Relation (text) |
| **C. Employment Details** (13) | Employee ID (text, required, **unique**) · Employment Type (select, required) · Company (text, required) · Branch (text) · Department (select, required) · Date of Joining (date, required) · Shift Type (select) · In Time (time) · Out Time (time) · Total Working Hours (number, default `8`) · Employee Engagement Team Name (text) · Status (select, default `ACTIVE`) · Years of Agreement (number) |
| **D. Document Uploads** (3) | Passport Upload · Aadhar Card Upload · PAN Card Upload (all `file`, accepts image/pdf, 5 MB max) |
| **E. Salary & Compensation** (9) | Salary Mode (select, default `BANK_TRANSFER`) · Salary Amount (number) · Total Salary (number, CTC) · Per Hour Salary (number) · Overtime (checkbox) · Overtime Rate (number) · Bonus Amount (number) · Bonus After How Many Years (number) · Increment Month (select 1–12) |
| **F. Bank Details** (2) | Bank Account No (text, regex `^[0-9]{6,20}$`) · IFSC Code (text, regex `^[A-Z]{4}0[A-Z0-9]{6}$`) |
| **G. Exit / Resignation** (5) | Resignation Letter Date · Relieving Date · Reason of Leaving (textarea) · Notice Served (checkbox) · New Workplace (text) |

**Why `Employee ID` matters:** every other form has an `Employee ID` field. The auto-fill function `fn_hr_lookup_employee` matches on this exact label and copies First Name / Last Name / Department over.

### 4.2 `Check In` (9 fields, 1 section) — `form_hr_checkin`

| # | Field | Type | Required | Notes |
|---|---|---|---|---|
| 0 | Employee ID | text | ✓ | triggers auto-fill |
| 1 | First Name | text | ✓ | auto-filled |
| 2 | Last Name | text | ✓ | auto-filled |
| 3 | Department | select | — | auto-filled |
| 4 | Shift Type | select | — | |
| 5 | In Date | date | ✓ | defaulted to today by `fn_hr_attendance_stamp` |
| 6 | In Time | time | ✓ | |
| 7 | Location | textarea | — | "Auto-captured from GPS" |
| 8 | Camera | file | ✓ | front-camera selfie (`capture: user`) |

### 4.3 `Check Out` (6 fields, 1 section) — `form_hr_checkout`

Employee ID · Shift Type · Out Date · Out Time · Location · Camera. Same pattern as Check In; same auto-fill + stamp behaviour.

### 4.4 `Leave Application` (10 fields, 2 sections) — `form_hr_leave_application`

| Section | Field | Type | Notes |
|---|---|---|---|
| Leave Request | Employee ID, First Name, Last Name, Department, Leave Reason, Leave Start Date, Leave End Date, **Total Leave Days** | text/select/textarea/date/**formula** | "Total Leave Days" auto-calculates as `end − start + 1` via [`fn_hr_leave_calc_days`](../scripts/create-hr-automations.sql#L122) |
| Approval | Reporting Manager Approval, HR Approval | select | both default `PENDING`. 1-day leaves get `mgr_approval=APPROVED` instantly via [`fn_hr_leave_auto_approve_short`](../scripts/create-hr-automations.sql#L152) |

### 4.5 `Holiday List` (5 fields) — `form_hr_holiday_list`

Holiday List Name · Total No. of Holidays (auto-defaults to 1) · Date · Holiday Type (`NATIONAL/RELIGIOUS/REGIONAL/COMPANY/OPTIONAL/RESTRICTED`) · Description.

### 4.6 `Staffing Plan` (9 fields) — `form_hr_staffing_plan`

Plan ID (unique) · Profile Name · Company · Department · Designation · Employment Type · No. of Vacancies (default 1) · Estimated Cost Per Person · **Total Estimated Cost** (formula: `vacancies × cost_per`).

### 4.7 `Job Opening` (11 fields) — `form_hr_job_opening`

Plan ID (lookup) · Profile Name · Company · Department · Designation · Employment Type · Vacancies (default 1) · Status (`DRAFT/OPEN/HOLD/CLOSED/FILLED/CANCELLED`, default `OPEN`) · Publish on Website (checkbox) · Salary Approx · Job Description (required).

This form is anonymous-accessible (`allow_anonymous=TRUE`) so it can power a public careers page.

### 4.8 `Job Application` (15 fields, 2 sections) — `form_hr_job_application`

| Section | Fields |
|---|---|
| Candidate | Plan ID (lookup) · Job Opening ID (lookup, required) · Applicant Name · Applicant Source (`WEBSITE/LINKEDIN/REFERRAL/JOB_PORTAL/AGENCY/WALK_IN/CAMPUS/OTHER`) · Applicant Email · Applicant Mobile · Department · Designation · Employment Type · Resume (file pdf/doc) · Cover Letter · Job Description (auto-copied, readonly) · Salary Expectation |
| Status | Applicant Rating (1–5 stars) · Status (`APPLIED/SCREENING/SHORTLISTED/INTERVIEW/OFFER/HIRED/REJECTED/HOLD/WITHDRAWN`, default `APPLIED`) |

Anonymous-accessible — the public can submit applications without logging in.

### 4.9 `Job Offer` (10 fields) — `form_hr_job_offer`

Plan ID · Opening ID · Applicant Name · Applicant Mobile · Applicant Email · **Offer Date** (auto-defaults to today) · Status (`DRAFT/SENT/ACCEPTED/REJECTED/EXPIRED/WITHDRAWN`, default `DRAFT`) · Job Offer Term · Value/Description · Terms & Condition Template.

### 4.10 `Appointment Letter` (8 fields) — `form_hr_appointment_letter`

Job Applicant Name · Company · Appointment Date · Appointment Letter Template (`STANDARD/INTERN/CONTRACT/CONSULTANT`) · Introduction · Title · Description · Closing Notes.

### 4.11 `Employee Referral` (10 fields) — `form_hr_employee_referral`

Applicant info (Name · Email · Mobile · Date · Resume · Designation) + referrer info (Employee ID → triggers auto-fill of First Name + Department) + Remark.

### 4.12 `KRA Master` (4 fields) — `form_hr_kra_master`

Department · Designation · Goal Name · Weightage (0–100). KRA = Key Result Area; this is the goal template used during appraisals.

### 4.13 `Performance Appraisal` (7 fields) — `form_hr_performance_appraisal`

Employee Name · Department · Designation · Goal Name · Weightage · Score (0–10) · **Score Earned** (formula: `weightage × score / 10`).

### 4.14 `Self Target` (8 fields) — `form_hr_self_target`

Employee ID + auto-fill fields · Target Month (Jan–Dec) · Target (textarea) · Employee Engagement Points (defaults to 50 via `fn_hr_suggestion_points`).

### 4.15 `Self Initiative` (9 fields) — `form_hr_self_initiative`

Employee ID + auto-fill fields · Self Initiative Category (`COST_SAVING/PRODUCTIVITY/QUALITY/SAFETY/CUSTOMER/TEAM/INNOVATION/OTHER`) · Define Initiative · Initiative Benefits · Engagement Points (defaults to 40).

### 4.16 `Problem Registration` (12 fields, 2 sections) — `form_hr_problem_registration`

| Section | Fields |
|---|---|
| Problem | Employee ID + auto-fill fields · Problem (textarea) · Problem Media (file image/video, 10 MB) · Impact |
| Solution | Solution (textarea) · Solution Media · Selfie (front-camera) · Engagement Points (defaults to 30) |

### 4.17 `Kaizen` (19 fields, 3 sections) — `form_hr_kaizen`

| Section | Fields |
|---|---|
| Kaizen Info | Employee ID + auto-fill (incl. Middle Name) · Kaizen Area (`SAFETY/QUALITY/COST/DELIVERY/PRODUCTIVITY/MORALE/ENVIRONMENT/OTHER`) · Start Date · Theme |
| Problem & Analysis | Problem · Before Media · After Media · Why Analysis (5-why) |
| Result & Benefits | Result · Benefits · Employee Contributor · Signature (signature pad) · Selfie · Engagement Points (auto: SAFETY=100, QUALITY/COST=80, DELIVERY/PRODUCTIVITY=70, MORALE/ENVIRONMENT=60, else 50) |

### 4.18 `Employee Suggestion` (11 fields) — `form_hr_employee_suggestion`

Employee ID + auto-fill (incl. Middle Name) · Suggestion · Benefits · Suggestion Given By · Media · Engagement Points (defaults to 20).

### 4.19 `Asset Management` (11 fields) — `form_hr_asset_management`

Asset ID (unique) · Employee ID (when filled, status auto-flips to `ASSIGNED`; when blank, `IN_STOCK`) + auto-fill fields · Asset Type (Laptop/Desktop/Mobile/etc., 14 options) · Asset Serial No · Asset Model · Configuration · Asset Status · Remarks.

### 4.20 `SIM Management` (15 fields, 2 sections) — `form_hr_sim_management`

| Section | Fields |
|---|---|
| SIM Details | Mobile No · IMSI Number · (and provider/plan/etc. — see [SQL line 887+](../scripts/create-hr-module.sql#L887)) |
| User & Recharge | Employee ID + auto-fill fields · recharge history · status |

Status auto-flips: Employee filled ⇒ `ACTIVE`; blank ⇒ `INACTIVE`. If marked `LOST`, it auto-becomes `BLOCKED`.

---

## 5. The 3-Layer Automation Fabric

Every reactive behaviour in HR is one of three things. Knowing which layer a behaviour lives in tells you when it fires.

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — CrmFunction (the verb)                               │
│  A single sandboxed JavaScript snippet. Receives ctx.input.     │
│  Returns an object → keys become field updates.                 │
│  Example: fn_hr_leave_calc_days computes total leave days.      │
└─────────────────────────────────────────────────────────────────┘
        ▲                                    ▲
        │ called by                          │ called by
        │                                    │
┌──────────────────────────┐    ┌──────────────────────────────┐
│  LAYER 2 — WorkflowRule  │    │  LAYER 3 — FunctionBinding   │
│  Server-side, fires AFTER│    │  Client-side, fires DURING   │
│  Create / Edit / Delete. │    │  user typing (onFieldChange) │
│  Evaluates conditions,   │    │  or just before submit.      │
│  then runs Field Updates │    │  Powers live-recalc UX.      │
│  or Functions.           │    │                              │
└──────────────────────────┘    └──────────────────────────────┘
        │                                    │
        ▼                                    ▼
   record saved                     field updates in real time
```

| Layer | Where it runs | When it fires | Best for |
|---|---|---|---|
| **CrmFunction** | VM sandbox in Node | When a Rule or Binding calls it | The reusable verb |
| **WorkflowRule** | Server, after a DB write | After Create / Edit / Delete | Server-of-truth, safety-net behaviour |
| **FunctionBinding** | Client (`<FunctionBindingRunner>`) | `onFieldChange` (debounced 300 ms) or `beforeSubmit` | Live UX (auto-fill, formula recalc) |

**The runtime engine** lives in [`lib/workflow/trigger.ts`](../lib/workflow/trigger.ts):

```ts
triggerWorkflowsForRecord({
  moduleName: 'Leave Management',
  action: 'Create',
  organizationId,
  userId,
  recordId,
  recordData,
})
```

It is **fire-and-forget** by design — failures are swallowed and logged so a buggy automation can never break a record save. It supports three action types:

- `"Field Update"` — set a field on the saved record to a literal value
- `"Function"` — run a CrmFunction; its return object is auto-merged into the record (keys can be `fieldId`, `apiName`, or `label`)
- `"Email Notification"` — render a templated email (`{{Field Label}}` placeholders) and send it via [`lib/email`](../lib/email)

The auto-output mechanism in `executeFunction` is what makes the same `fn_hr_lookup_employee` work across **10 different forms** — it doesn't care which form is calling it; it returns `{ "First Name": "...", "Department": "..." }` and the runner matches keys to whatever fields exist on the current form.

---

## 6. All 16 Automation Functions

All functions are seeded in [`scripts/create-hr-automations.sql:87-621`](../scripts/create-hr-automations.sql#L87) and listed in the in-app docs at [`app/settings/docs/hr-system/page.tsx:62-243`](../app/settings/docs/hr-system/page.tsx#L62).

| # | ID | Display Name | Category | Used by Modules | What It Does |
|---|---|---|---|---|---|
| 1 | `fn_hr_employee_onboarding` | Employee Onboarding Defaults | Defaults | Employee Master | If blank: Status→`ACTIVE`, Total Working Hours→`8`, Nationality→`Indian`. Never overwrites. |
| 2 | `fn_hr_leave_calc_days` | Calculate Leave Days | Calculation | Leave Management | `total_days = (end − start) + 1` (inclusive). Returns `{ok:false}` if dates invalid. |
| 3 | `fn_hr_leave_auto_approve_short` | Auto-Approve Short Leave | Lifecycle | Leave Management | If `total_days === 1`, sets `mgr_approval = APPROVED`. HR approval still pending. |
| 4 | `fn_hr_appraisal_score` | Compute Appraisal Score Earned | Calculation | Performance Appraisal | `score_earned = round(weightage × score / 10, 2)` |
| 5 | `fn_hr_staff_total_cost` | Compute Staffing Total Cost | Calculation | Staffing Plan | `total_cost = vacancies × cost_per_person`. No rounding. |
| 6 | `fn_hr_job_app_copy_desc` | Copy JD from Opening | Defaults | Job Application | Copies `fld_open_job_desc` → `fld_app_job_desc`, only if blank. |
| 7 | `fn_hr_kaizen_points` | Kaizen Engagement Points | Points | Kaizen | Area-based: SAFETY=100, QUALITY/COST=80, DELIVERY/PRODUCTIVITY=70, MORALE/ENVIRONMENT=60, else 50. Skips if existing > 0. |
| 8 | `fn_hr_problem_points` | Problem Registration Points | Points | Problem Registration | Awards 30 points if blank. Idempotent. |
| 9 | `fn_hr_suggestion_points` | Suggestion / Initiative Points | Points | Suggestion + Initiative + Self Target | **Polymorphic**: detects which source field is filled. Suggestion=20, Initiative=40, Target=50. |
| 10 | `fn_hr_asset_auto_status` | Asset Auto-Assign Status | Lifecycle | Asset Management | Employee filled → `ASSIGNED`; blank → `IN_STOCK`. |
| 11 | `fn_hr_sim_auto_status` | SIM Auto-Assign Status | Lifecycle | SIM Management | Employee filled → `ACTIVE`; blank → `INACTIVE`. |
| 12 | `fn_hr_offer_populate` | Offer Populate from Application | Defaults | Job Offer | Stamps `Offer Date = today` and `Status = DRAFT` if blank. |
| 13 | `fn_hr_attendance_stamp` | Attendance Timestamp Stamp | Defaults | Attendance | If In/Out date blank, stamps today. Dispatches on `moduleName === 'Attendance'`. |
| 14 | `fn_hr_holiday_count` | Holiday Count | Defaults | Holiday List | Defaults `Total No. of Holidays = 1` when blank. |
| 15 | `fn_hr_leave_apply_status` | Apply Leave Status on Approval | Lifecycle | Leave Management | When Manager AND HR both `APPROVED`: console-logs (hook point for future emails). |
| 16 | `fn_hr_lookup_employee` | Lookup Employee by ID | Lookup | **10 modules** | The star of the show. Fuzzy-matches Employee ID against Employee Master and returns First/Middle/Last Name + Department. See [§9](#9-employee-auto-fill--deep-dive). |

**Function I/O contract:**

```js
// Inputs
ctx.input.recordData  // { sections: { sid: { fields: { fid: value | {value} } } } }  OR flat
ctx.input.moduleName  // string
ctx.records.list(moduleName, { limit, skip })  // helper to read other forms' records

// Outputs (return object)
{ 'fld_some_id': 'new value' }     // sets field by ID
{ 'First Name': 'Alice' }          // OR by label (auto-output mode)
{ ok: true }                       // side-effect only
{ ok: false, error: 'reason' }     // skip, with reason
```

---

## 7. All 36 Workflow Rules

26 module rules + 10 employee auto-fill safety-net rules. All seeded in [`scripts/create-hr-automations.sql:635-925`](../scripts/create-hr-automations.sql#L635).

### Module Rules (26)

| Rule ID | Module | Trigger | Condition | Action |
|---|---|---|---|---|
| `wfr_hr_emp_onboarding` | Employee Master | Create | (none) | Function `fn_hr_employee_onboarding` |
| `wfr_hr_emp_resigned` | Employee Master | Edit | `status = RESIGNED` | Field Update: `fld_emp_company_email = ''` |
| `wfr_hr_emp_terminated` | Employee Master | Edit | `status = TERMINATED` | Field Update: `fld_emp_notice_served = true` |
| `wfr_hr_attendance_stamp` | Attendance | Create | (none) | Function `fn_hr_attendance_stamp` |
| `wfr_hr_leave_calc` | Leave Management | Create or Edit | (none) | Function `fn_hr_leave_calc_days` |
| `wfr_hr_leave_auto_approve_short` | Leave Management | Create | (none) | Function `fn_hr_leave_auto_approve_short` |
| `wfr_hr_leave_mgr_rejected` | Leave Management | Edit | `mgr_approval = REJECTED` | Field Update: `fld_leave_hr_approval = REJECTED` |
| `wfr_hr_leave_fully_approved` | Leave Management | Edit | `hr_approval = APPROVED` | Function `fn_hr_leave_apply_status` (logger) |
| `wfr_hr_holiday_count` | Holiday List | Create | (none) | Function `fn_hr_holiday_count` |
| `wfr_hr_staff_total_cost` | Staffing Plan | Create or Edit | (none) | Function `fn_hr_staff_total_cost` |
| `wfr_hr_opening_filled_close` | Job Opening | Edit | `status = FILLED` | Field Update: `fld_open_publish = false` |
| `wfr_hr_app_copy_desc` | Job Application | Create | (none) | Function `fn_hr_job_app_copy_desc` |
| `wfr_hr_app_hired_status` | Job Application | Edit | `status = HIRED` | Field Update: `fld_app_rating = 5` |
| `wfr_hr_app_rejected_note` | Job Application | Edit | `status = REJECTED` | Field Update: `fld_app_rating = 0` |
| `wfr_hr_offer_create` | Job Offer | Create | (none) | Function `fn_hr_offer_populate` |
| `wfr_hr_offer_accepted` | Job Offer | Edit | `status = ACCEPTED` | Field Update: `fld_offer_term = 'Accepted by applicant'` |
| `wfr_hr_appraisal_score` | Performance Appraisal | Create or Edit | (none) | Function `fn_hr_appraisal_score` |
| `wfr_hr_tgt_default_points` | Self Target | Create | (none) | Function `fn_hr_suggestion_points` |
| `wfr_hr_init_default_points` | Self Initiative | Create | (none) | Function `fn_hr_suggestion_points` |
| `wfr_hr_prob_default_points` | Problem Registration | Create | (none) | Function `fn_hr_problem_points` |
| `wfr_hr_kaizen_points` | Kaizen | Create | (none) | Function `fn_hr_kaizen_points` |
| `wfr_hr_sug_default_points` | Employee Suggestion | Create | (none) | Function `fn_hr_suggestion_points` |
| `wfr_hr_asset_auto_status` | Asset Management | Create or Edit | (none) | Function `fn_hr_asset_auto_status` |
| `wfr_hr_asset_lost` | Asset Management | Edit | `status = LOST` | Field Update: clear `fld_asset_employee_id` |
| `wfr_hr_sim_auto_status` | SIM Management | Create or Edit | (none) | Function `fn_hr_sim_auto_status` |
| `wfr_hr_sim_lost_block` | SIM Management | Edit | `status = LOST` | Field Update: `fld_sim_status = BLOCKED` |

### Auto-Fill Safety-Net Rules (10)

These are **server-side backstops** for the `onFieldChange` bindings. If the live debounced auto-fill misses (slow network, race condition), the rule fires on save and **always** populates the employee info.

| Rule ID | Module | Trigger | Action |
|---|---|---|---|
| `wfr_hr_autofill_attendance` | Attendance | Create or Edit | Function `fn_hr_lookup_employee` |
| `wfr_hr_autofill_leave` | Leave Management | Create or Edit | ↓ same |
| `wfr_hr_autofill_ref` | Employee Referral | Create or Edit | ↓ same |
| `wfr_hr_autofill_tgt` | Self Target | Create or Edit | ↓ same |
| `wfr_hr_autofill_init` | Self Initiative | Create or Edit | ↓ same |
| `wfr_hr_autofill_prob` | Problem Registration | Create or Edit | ↓ same |
| `wfr_hr_autofill_kz` | Kaizen | Create or Edit | ↓ same |
| `wfr_hr_autofill_sug` | Employee Suggestion | Create or Edit | ↓ same |
| `wfr_hr_autofill_asset` | Asset Management | Create or Edit | ↓ same |
| `wfr_hr_autofill_sim` | SIM Management | Create or Edit | ↓ same |

> **Why both client + server auto-fill?** The client binding gives instant UX. The server rule guarantees data integrity even when the client misfires. **Defence in depth.**

---

## 8. All 22 Function Bindings

Bindings live in [`scripts/create-hr-automations.sql:947-1122`](../scripts/create-hr-automations.sql#L947). They are read at form-render time by `<FunctionBindingRunner>` and dispatched on field-change events (debounced 300 ms) or `beforeSubmit`.

### Calculation & Lifecycle Bindings (12)

| Form | Field | Event | Function | Purpose |
|---|---|---|---|---|
| Leave Application | Leave End Date | `onFieldChange` | `fn_hr_leave_calc_days` | Live recalc total days |
| Leave Application | Leave Start Date | `onFieldChange` | `fn_hr_leave_calc_days` | Live recalc total days |
| Staffing Plan | No. of Vacancies | `onFieldChange` | `fn_hr_staff_total_cost` | Live recalc total cost |
| Staffing Plan | Estimated Cost / Person | `onFieldChange` | `fn_hr_staff_total_cost` | Live recalc total cost |
| Performance Appraisal | Weightage | `onFieldChange` | `fn_hr_appraisal_score` | Live recalc score earned |
| Performance Appraisal | Score | `onFieldChange` | `fn_hr_appraisal_score` | Live recalc score earned |
| Asset Management | Employee ID | `onFieldChange` | `fn_hr_asset_auto_status` | Flip status on assignment |
| SIM Management | Employee ID | `onFieldChange` | `fn_hr_sim_auto_status` | Flip status on assignment |
| Kaizen | Area | `onFieldChange` | `fn_hr_kaizen_points` | Set points on area select |
| Employee Master | (form) | `beforeSubmit` | `fn_hr_employee_onboarding` | Stamp defaults |
| Job Application | (form) | `beforeSubmit` | `fn_hr_job_app_copy_desc` | Copy JD from opening |
| Job Offer | (form) | `beforeSubmit` | `fn_hr_offer_populate` | Stamp date+status defaults |

### Employee Auto-Fill Bindings (10)

All bound to `fn_hr_lookup_employee` with `event = onFieldChange` on the **Employee ID** field of each module:

| Form | Field | Order |
|---|---|---|
| Check In / Check Out | `fld_ci_employee_id` | 5 |
| Leave Application | `fld_leave_employee_id` | 5 |
| Employee Referral | `fld_ref_employee_id` | 5 |
| Self Target | `fld_tgt_employee_id` | 5 |
| Self Initiative | `fld_init_employee_id` | 5 |
| Problem Registration | `fld_prob_employee_id` | 5 |
| Kaizen | `fld_kz_employee_id` | 5 |
| Employee Suggestion | `fld_sug_employee_id` | 5 |
| Asset Management | `fld_asset_employee_id` | 5 |
| SIM Management | `fld_sim_employee_id` | 5 |

> **Note:** The system uses `onFieldChange` (not `onFieldBlur`) — `<FunctionBindingRunner>` listens for change events with a 300 ms debounce so the lookup fires once the user pauses typing.

---

## 9. Employee Auto-Fill — Deep Dive

This is the most-leveraged piece of the HR system: **one function powers ten forms.**

### The user-visible behaviour

1. User opens any auto-fill form (e.g. Kaizen).
2. Types `EMP-001` (or `emp 1`, or `EMP-0001` — all match) in **Employee ID**.
3. After 300 ms of pause, **First Name**, **Middle Name** (if present), **Last Name**, and **Department** populate themselves.
4. User saves. Even if step 3 raced and missed, the server-side rule re-runs the lookup and writes the values into the saved record.

### How the matcher works

```js
function norm(s) {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    // Strip leading zeros in every digit run: "EMP-0001" → "EMP-1"
    .replace(/(\d+)/g, n => String(Number(n)));
}
```

So `"EMP-001"`, `"EMP-0001"`, `"emp 1"`, and `" EMP-1 "` all normalise to `"EMP-1"` and match.

### The lookup path

1. **Pull the Employee ID** from `ctx.input` — supports both binding shape (flat-keyed by label) and rule shape (nested under `recordData.sections`). 4 fallbacks for robustness.
2. **List Employee Master records** via `ctx.records.list('Employee Master', { limit: 50 })` — the small first page covers the vast majority of cases.
3. If no match in 50 rows, **fall through** to a 500-row page (`{ limit: 500, skip: 50 }`).
4. **Match by normalised Employee ID**.
5. **Return only the labels present on Employee Master** (`First Name`, `Middle Name`, `Last Name`, `Department`). The runner's auto-output mode matches these keys against the **current form's field labels** — forms without "Middle Name" silently skip it.

### Why this design

- **One source of truth** — every form reads from Employee Master.
- **One function** — adding a new form that needs auto-fill = add one binding row, no JS to write.
- **Tolerant matching** — humans don't always type IDs identically.
- **Defence in depth** — `onFieldChange` binding for live UX + `Create or Edit` workflow rule as server-side safety net.

---

## 10. Attendance Subsystem — Two-Surface Design

There are **two parallel attendance surfaces** in this codebase, and you need to know when each applies:

### Surface A — The form-driven Check In / Check Out forms

- Forms `form_hr_checkin` and `form_hr_checkout`.
- Records go into the generic `records` table via `/api/forms/[formId]/records`.
- Triggers `fn_hr_attendance_stamp` and `fn_hr_lookup_employee`.
- Captures location (textarea, GPS-prompted) and a selfie (front camera).
- This is the **operational record** used by the Payroll Engine.

### Surface B — The legacy Attendance widget (User-linked)

- Backed by the `attendance_records` Prisma table ([`prisma/schema.prisma:1398`](../prisma/schema.prisma#L1398)).
- Routes: `/api/attendance` (list), `/api/attendance/status` (current status), and form-scoped `/api/forms/[formId]/attendance/{checkin,checkout,status}`.
- One row per `(userId, date)` with `checkInTime`, `checkOutTime`, `ipAddress`.
- Used by the dashboard widget and "can I check in right now?" UI.

> The auto-generated payroll endpoint reads from **Surface A** (form records under `/api/forms/testing` grouped by `Check-In` and `Check-Out`). Surface B is for live UI status only.

---

## 11. Leave Management Subsystem

### Master data

Defined in [`prisma/schema.prisma:1321`](../prisma/schema.prisma#L1321) (`LeaveType` + `LeaveRule`) and seeded by [`scripts/seed-leave-types.ts`](../scripts/seed-leave-types.ts):

| Leave Type | Code | Category | Default Rule | `deductionPercentage` | `isPaid` | `affectsAttendance` |
|---|---|---|---|---|---|---|
| Full Day Leave | `FULL_DAY_LEAVE` | `FULL_DAY` | Sick Leave | 0% (paid) | true | true |
| Full Day Leave | (same type) | `FULL_DAY` | Casual Leave | 100% (unpaid) | false | true |
| Half Day Leave | `HALF_DAY_LEAVE` | `HALF_DAY` | Half Day Leave (4 hrs) | 100% | false | true |
| Short Leave | `SHORT_LEAVE` | `SHORT_LEAVE` | Short Leave (2 hrs) | 100% | false | false |

`LeaveRule` knobs available per rule: `requiresApproval`, `maxConsecutiveDays`, `minNoticeDays`, `accrualRate`, `carryForward`, `maxCarryForwardDays`, `hoursEquivalent`.

### The end-to-end flow

```
Employee opens     ┌─────────────────────────────────────┐
"Leave Application"│  fld_leave_employee_id   (typed)    │
                   │  fld_leave_first_name    (auto-fill)│  ← onFieldChange binding fires
                   │  fld_leave_last_name     (auto-fill)│    fn_hr_lookup_employee
                   │  fld_leave_department    (auto-fill)│
                   │  fld_leave_reason        (typed)    │
                   │  fld_leave_start_date    (typed)    │
                   │  fld_leave_end_date      (typed)    │  ← onFieldChange binding fires
                   │  fld_leave_total_days    (formula)  │    fn_hr_leave_calc_days
                   │  fld_leave_mgr_approval = PENDING   │
                   │  fld_leave_hr_approval  = PENDING   │
                   └─────────────────┬───────────────────┘
                                     │ submit
                                     ▼
                       /api/forms/:formId/records
                                     │
              ┌──────────────────────┼─────────────────────────┐
              ▼                      ▼                         ▼
     wfr_hr_leave_calc       wfr_hr_leave_auto_      wfr_hr_autofill_leave
     (re-runs days calc)     approve_short           (server-side safety net)
                             (if days===1, sets
                              mgr_approval=APPROVED)
                                     │
                                     ▼
                             Manager opens record
                                     │
                            sets mgr_approval = REJECTED?
                                     ├─ YES ─► wfr_hr_leave_mgr_rejected
                                     │            cascades hr_approval = REJECTED
                                     │
                            sets hr_approval = APPROVED?
                                     └─ YES ─► wfr_hr_leave_fully_approved
                                                  fn_hr_leave_apply_status
                                                  console-logs (future hook for email/Slack)
```

### Payroll integration

Leave records feed payroll via the `payroll_configurations.leaveFormIds` + `leaveFieldMappings` JSON columns. The payroll engine reads form records from configured leave forms and applies `LeaveRule.deductionPercentage` to compute deductions. Configuration UI: [`components/payroll/payroll-config-dialog.tsx`](../components/payroll/payroll-config-dialog.tsx).

---

## 12. Payroll Engine — End-to-End

### Data model

| Model | Role |
|---|---|
| `PayrollConfiguration` | "Where do I read attendance/leave data from?" — stores `attendanceFormIds`, `leaveFormIds`, and the field mappings (which form field = check-in time, etc.). |
| `PayrollRecord` | "What did this employee earn this month?" — one row per `(employeeId, month, year)`, with present days, leave days, gross/net salary, deduction breakdown. |
| `Employee` | Source for base salary (`totalSalary`), shift, and overtime config. |

### The auto-generation flow

> Lives in [`app/api/payroll/auto-generate/route.ts`](../app/api/payroll/auto-generate/route.ts) — called from the **Auto-Payroll Generator** card in [`components/payroll/payroll-engine.tsx`](../components/payroll/payroll-engine.tsx).

```
1. User picks a month (YYYY-MM) in the UI.
2. POST /api/payroll/auto-generate { month }
3. Engine fetches /api/forms/testing  → { grouped: { 'Employee Profile': [...], 'Check-In': [...], 'Check-Out': [...] } }
4. Build employeeProfiles map keyed by email  → { employeeId, employeeName, totalSalary }
5. Pair each Check-In with the same-day Check-Out for that email
6. Filter to records inside the requested month
7. For each employee with attendance:
       baseSalary  = profile.totalSalary
       hourlyRate  = baseSalary / (22 × 8)         ← 22 working days × 8 hours assumed
       grossSalary = hourlyRate × totalWorkedHours
       pf          = floor(gross × 12%)             ← Provident Fund
       taxable     = gross − pf
       tax         = floor(taxable × 5%)            ← simplified income tax
       insurance   = 500                            ← flat monthly
       net         = max(0, gross − pf − tax − insurance)
8. POST /api/payroll/save { payrolls, month, year }   ← persists to PayrollRecord table
9. Return { success, payrolls, savedResult }
```

### The UI surface — `app/payroll/page.tsx`

A single page with three tabs:

| Tab | Component | Reads From | Writes To |
|---|---|---|---|
| Dashboard | `payroll-analytics.tsx` + `payroll-summary-card.tsx` | `/api/payroll/stats` | (read-only) |
| Attendance | `employee-manager.tsx` | Attendance form records + `Employee` table | (read-only) |
| Payroll | `payroll-engine.tsx` + `editable-payroll-table.tsx` | `/api/payroll/records` | `/api/payroll/auto-generate`, `/api/payroll/save`, `/api/payroll/records/[id]` |
| Payslips | `payslip-preview.tsx` | `/api/payroll/records/[id]` | (PDF/print) |

### Configuration

Before auto-generate works, an admin must:

1. Open the Payroll tab → click the config dialog ([`payroll-config-dialog.tsx`](../components/payroll/payroll-config-dialog.tsx)).
2. Pick which form is the **Attendance** form (typically `Check In` + `Check Out`).
3. Pick which form is the **Leave** form (typically `Leave Application`).
4. Map the form fields (e.g. "which field stores the check-in time?").

The config is saved to `payroll_configurations` (one per organisation). Without it, the banner [`payroll-config-banner.tsx`](../components/payroll/payroll-config-banner.tsx) shows a warning and auto-generation refuses to run.

---

## 13. Recruitment Lifecycle

```
Staffing Plan ──► Job Opening ──► Job Application ──► Job Offer ──► Appointment Letter
   (manpower      (publish        (candidate          (offer          (formal
    + budget)      vacancy)        applies)            extended)       letter)
       │              │                │                  │                │
       │              │                │                  │                │
       │              │                │                  │                │
       │              │                │                  │                │
   compute       on FILLED         on Create:        on Create:        formatted
   total cost    auto-unpublish    copy JD from      stamp date+       from template
   (formula)     from website      Opening           DRAFT status      (4 templates)
                                       │                  │
                              on HIRED → rating=5    on ACCEPTED →
                              on REJECTED → rating=0  fld_offer_term =
                                                      "Accepted by applicant"
```

The **lookup chain**:

- `Job Opening.fld_open_plan_id` → lookups into Staffing Plan
- `Job Application.fld_app_opening_id` → lookups into Job Opening (required)
- `Job Application.fld_app_plan_id` → lookups into Staffing Plan (optional)
- `Job Offer.fld_offer_opening_id` → lookups into Job Opening (required)
- `Job Offer.fld_offer_plan_id` → lookups into Staffing Plan

**Public submission**: Job Opening and Job Application have `allow_anonymous = TRUE` and `require_login = FALSE` — they can be embedded on a public careers page.

**Employee Referral** is a side-channel into the same pipeline: an existing employee (auto-filled by Employee ID) refers a candidate; the record can later be linked to a Job Application.

---

## 14. Performance & Engagement Subsystems

### Performance

**KRA Master** is a template library (Department + Designation + Goal Name + Weightage). HR defines the scoring criteria once.

**Performance Appraisal** is the per-employee, per-cycle scoring form. Filling Weightage (0–100) + Score (0–10) auto-populates **Score Earned = `weightage × score / 10`** via the `fn_hr_appraisal_score` binding (live as you type).

### Engagement (the gamification layer)

All five Engagement forms award **Employee Engagement Points** when a record is created:

| Form | Default Points | Logic |
|---|---|---|
| Self Target | 50 | `fn_hr_suggestion_points` (polymorphic — fires on `fld_tgt_target` filled) |
| Self Initiative | 40 | `fn_hr_suggestion_points` (fires on `fld_init_define` filled) |
| Problem Registration | 30 | `fn_hr_problem_points` |
| Kaizen | **Area-based**: SAFETY=100, QUALITY=80, COST=80, DELIVERY/PRODUCTIVITY=70, MORALE/ENVIRONMENT=60, else 50 | `fn_hr_kaizen_points` (live binding on Area field) |
| Employee Suggestion | 20 | `fn_hr_suggestion_points` (fires on `fld_sug_suggestion` filled) |

Points are stored per-record in the `fld_*_points` field. Aggregating them across an employee for a leaderboard would be a generic-records query — there is no dedicated leaderboard view in the codebase yet (a future addition).

---

## 15. Asset & SIM Lifecycle

### Asset Management

```
fld_asset_employee_id (typed/cleared)
        │
        ▼
fn_hr_asset_auto_status (live binding + workflow safety net)
        │
        ├── filled ───► fld_asset_status = 'ASSIGNED'
        └── blank  ───► fld_asset_status = 'IN_STOCK'

Manual override of fld_asset_status to 'LOST'
        │
        ▼
wfr_hr_asset_lost ─► clears fld_asset_employee_id
```

Asset Types: `LAPTOP, DESKTOP, MOBILE, TABLET, MONITOR, HEADPHONE, KEYBOARD, MOUSE, PRINTER, CAMERA, VEHICLE, FURNITURE, ID_CARD, OTHER`.

Statuses: `IN_STOCK, ASSIGNED, REPAIR, LOST, DAMAGED, RETIRED, RETURNED`.

### SIM Management

Same pattern as Asset, but with three statuses: `ACTIVE / INACTIVE / BLOCKED`.

```
fld_sim_employee_id (typed/cleared)
        │
        ▼
fn_hr_sim_auto_status
        │
        ├── filled ───► ACTIVE
        └── blank  ───► INACTIVE

Manual set to LOST ─► wfr_hr_sim_lost_block ─► forces BLOCKED for carrier
```

---

## 16. Permissions & Routes

### Route permissions (25)

One per HR module path — seeded in [`scripts/create-hr-module.sql:1083-1113`](../scripts/create-hr-module.sql#L1083). Examples: `/hr`, `/hr/core`, `/hr/core/employee-master`, `/hr/recruitment/job-application`, `/hr/admin/sim-management`, etc. The middleware checks these against the current user's grants.

### Permissions (5)

| ID | Name | Category | Resource |
|---|---|---|---|
| `perm_hr_admin` | HR Admin | ADMIN | `*` |
| `perm_hr_view` | HR View | READ | `hr` |
| `perm_hr_create` | HR Create | WRITE | `hr` |
| `perm_hr_edit` | HR Edit | WRITE | `hr` |
| `perm_hr_delete` | HR Delete | DELETE | `hr` |

### Role + assignments

The bootstrap script creates:

- `unit_hq` — top-level "Headquarters" organization unit
- `role_admin` — single Administrator role (`is_admin = TRUE`)
- `ura_admin_hq` — assigns `role_admin` to `unit_hq`
- `uua_admin_user` — assigns the bootstrap user to `unit_hq` with `role_admin`
- 45 `user_permissions` rows — granting the bootstrap user `HR Admin` on every HR module (25) and every HR form (20) with full CRUD + `is_system_admin = TRUE`.

> **For non-admin users**, you'd add their own `user_permissions` rows pointing at `perm_hr_view` (or `perm_hr_create`/`_edit`/`_delete`) scoped to specific `module_id` or `form_id` values. The middleware checks form-level grants before allowing record CRUD.

---

## 17. Bootstrap & Seeding

### Standing it up from scratch

```bash
# 1. Pre-requisite: an `organizations` row and a `users` row already exist.
#    The IDs are hard-coded in the SQL files; either match them or edit
#    v_org_id / v_user_id at the top of each script.
#
#    Default IDs:
#      v_org_id  = 'cmo9uk3440005u7ngdg652eoq'
#      v_user_id = 'cmo9uhu660000u7ngr51zv3wv'

# 2. Build the structure (modules / forms / sections / fields / permissions)
psql $DATABASE_URL -f scripts/create-hr-module.sql

# 3. Build the automation layer (functions / rules / bindings)
psql $DATABASE_URL -f scripts/create-hr-automations.sql

# 4. Seed leave master data
pnpm tsx scripts/seed-leave-types.ts

# 5. (Optional) Insert demo employees for testing
psql $DATABASE_URL -f scripts/insert-dummy-employees.sql

# 6. (Optional) Relax field requirements during demo / development
psql $DATABASE_URL -f scripts/relax-hr-required-fields.sql
```

Both SQL scripts print a `RAISE NOTICE` summary at the end so you can see exactly what was seeded.

### Verification queries (in the SQL footer)

```sql
-- Field count per form (should match: 52,9,6,10,5,9,11,15,10,8,10,4,7,8,9,12,19,11,11,15 = 241)
SELECT f.name, COUNT(ff.id) AS field_count
  FROM forms f
  JOIN form_sections s ON s.form_id = f.id
  JOIN form_fields ff  ON ff.section_id = s.id
  JOIN form_modules m  ON m.id = f.module_id
 WHERE m.organization_id = 'cmo9uk3440005u7ngdg652eoq'
 GROUP BY f.name
 ORDER BY f.name;

-- All HR functions
SELECT id, display_name, category FROM crm_functions WHERE id LIKE 'fn_hr_%' ORDER BY id;

-- Workflow rules per module
SELECT module_name, name, record_action, active
  FROM workflow_rules
 WHERE id LIKE 'wfr_hr_%'
 ORDER BY module_name, name;
```

---

## 18. API Reference

| Method · Path | File | Purpose |
|---|---|---|
| `GET /api/payroll` | [`app/api/payroll/route.ts`](../app/api/payroll/route.ts) | List payroll records |
| `GET/POST /api/payroll/config` | [`app/api/payroll/config/route.ts`](../app/api/payroll/config/route.ts) | Read/write `PayrollConfiguration` |
| `GET /api/payroll/forms` | [`app/api/payroll/forms/route.ts`](../app/api/payroll/forms/route.ts) | List forms eligible for payroll mapping |
| `GET /api/payroll/form-fields` | [`app/api/payroll/form-fields/route.ts`](../app/api/payroll/form-fields/route.ts) | Field metadata for mapping UI |
| `GET/POST /api/payroll/leave-type` | [`app/api/payroll/leave-type/route.ts`](../app/api/payroll/leave-type/route.ts) | CRUD for `LeaveType` |
| `GET/POST/PUT /api/payroll/leave-rules` | [`app/api/payroll/leave-rules/route.ts`](../app/api/payroll/leave-rules/route.ts) | CRUD for `LeaveRule` |
| `GET /api/payroll/records` | [`app/api/payroll/records/route.ts`](../app/api/payroll/records/route.ts) | List `PayrollRecord` rows |
| `GET/PUT /api/payroll/records/[id]` | [`app/api/payroll/records/[id]/route.ts`](../app/api/payroll/records/[id]/route.ts) | Single record CRUD |
| `POST /api/payroll/auto-generate` | [`app/api/payroll/auto-generate/route.ts`](../app/api/payroll/auto-generate/route.ts) | Auto-build payroll for a month |
| `POST /api/payroll/save` | [`app/api/payroll/save/route.ts`](../app/api/payroll/save/route.ts) | Persist edited payroll |
| `GET /api/payroll/stats` | [`app/api/payroll/stats/route.ts`](../app/api/payroll/stats/route.ts) | KPIs for dashboard |
| `GET /api/attendance` | [`app/api/attendance/route.ts`](../app/api/attendance/route.ts) | List `attendance_records` |
| `GET /api/attendance/status` | [`app/api/attendance/status/route.ts`](../app/api/attendance/status/route.ts) | "Can I check in right now?" |
| `POST /api/forms/[formId]/attendance/checkin` | [`app/api/forms/[formId]/attendance/checkin/route.ts`](../app/api/forms/[formId]/attendance/checkin/route.ts) | Form-scoped check-in |
| `POST /api/forms/[formId]/attendance/checkout` | [`app/api/forms/[formId]/attendance/checkout/route.ts`](../app/api/forms/[formId]/attendance/checkout/route.ts) | Form-scoped check-out |
| `GET /api/forms/[formId]/attendance/status` | [`app/api/forms/[formId]/attendance/status/route.ts`](../app/api/forms/[formId]/attendance/status/route.ts) | Status for a form user |
| `GET /api/employees` | [`app/api/employees/route.ts`](../app/api/employees/route.ts) | List employees from `Employee` table |
| `GET /api/employees/permissions` | [`app/api/employees/permissions/route.ts`](../app/api/employees/permissions/route.ts) | Per-employee permissions |
| `GET /api/employee-records` | [`app/api/employee-records/route.ts`](../app/api/employee-records/route.ts) | Form records linked to Employee Master |
| `POST /api/create-user-from-employee` | [`app/api/create-user-from-employee/route.ts`](../app/api/create-user-from-employee/route.ts) | Promote employee to system user |

---

## 19. File Inventory (Where Everything Lives)

### SQL & seed scripts ([`scripts/`](../scripts/))

| File | Role |
|---|---|
| `create-hr-module.sql` | Modules, forms, sections, fields, permissions, routes, admin role |
| `create-hr-automations.sql` | Functions, workflow rules, function bindings |
| `seed-leave-types.ts` | `LeaveType` + `LeaveRule` seeds |
| `insert-dummy-employees.sql` | Demo data |
| `relax-hr-required-fields.sql` | Loosens required-field validation for demos |
| `fix-hr-form-mappings.sql` | Repair payroll-config field mappings |

### Pages ([`app/`](../app/))

| Path | File | Purpose |
|---|---|---|
| `/payroll` | [`app/payroll/page.tsx`](../app/payroll/page.tsx) | Payroll dashboard (Dashboard / Attendance / Payroll / Payslips tabs) |
| `/forms/[formId]` | [`app/forms/[formId]/page.tsx`](../app/forms/[formId]/page.tsx) | Generic form renderer (used by all 20 HR forms) |
| `/forms/[formId]/records` | [`app/forms/[formId]/records/page.tsx`](../app/forms/[formId]/records/page.tsx) | Record list view |
| `/[module_name]/[module_Id]/[[...slug]]` | [`app/[module_name]/[module_Id]/[[...slug]]/page.tsx`](../app/[module_name]/[module_Id]/[[...slug]]/page.tsx) | Dynamic module router (Excel/Table/Grid/List views) |
| `/settings/docs/hr-system` | [`app/settings/docs/hr-system/page.tsx`](../app/settings/docs/hr-system/page.tsx) | In-app HR reference (animated, illustrated) |

### Components ([`components/`](../components/))

| Component | Purpose |
|---|---|
| [`components/payroll/payroll-dashboard.tsx`](../components/payroll/payroll-dashboard.tsx) | Main payroll page layout |
| [`components/payroll/payroll-engine.tsx`](../components/payroll/payroll-engine.tsx) | Auto-generate UI + export CSV/JSON |
| [`components/payroll/payroll-form.tsx`](../components/payroll/payroll-form.tsx) | Manual payroll entry |
| [`components/payroll/payroll-table.tsx`](../components/payroll/payroll-table.tsx) | Read-only payroll list |
| [`components/payroll/editable-payroll-table.tsx`](../components/payroll/editable-payroll-table.tsx) | In-place editing with optimistic updates |
| [`components/payroll/payroll-records-list.tsx`](../components/payroll/payroll-records-list.tsx) | Paginated records list |
| [`components/payroll/payroll-analytics.tsx`](../components/payroll/payroll-analytics.tsx) | KPI dashboard |
| [`components/payroll/payroll-config-dialog.tsx`](../components/payroll/payroll-config-dialog.tsx) | Form-mapping config UI |
| [`components/payroll/payroll-config-banner.tsx`](../components/payroll/payroll-config-banner.tsx) | "Please configure payroll" warning |
| [`components/payroll/leave-rules-manager.tsx`](../components/payroll/leave-rules-manager.tsx) | Leave-rule CRUD UI |
| [`components/payroll/calculation-editor.tsx`](../components/payroll/calculation-editor.tsx) | Custom payroll formula editor |
| [`components/payroll/payslip-preview.tsx`](../components/payroll/payslip-preview.tsx) | Payslip generation/print |
| [`components/payroll/bulk-operations-bar.tsx`](../components/payroll/bulk-operations-bar.tsx) | Multi-select actions |
| [`components/forms/attendance-form-dialog.tsx`](../components/forms/attendance-form-dialog.tsx) | Modal check-in/out form |
| [`components/employee-manager.tsx`](../components/employee-manager.tsx) | Employee daily attendance tracker |

### Library code ([`lib/`](../lib/))

| File | Purpose |
|---|---|
| [`lib/workflow/trigger.ts`](../lib/workflow/trigger.ts) | Workflow rule engine (entry: `triggerWorkflowsForRecord`) |
| [`lib/functions/executor.ts`](../lib/functions/executor.ts) | VM sandbox for `crm_functions` |
| [`lib/functions/apiName.ts`](../lib/functions/apiName.ts) | Stamps `apiName` on records for placeholder substitution |
| [`lib/api/payroll.ts`](../lib/api/payroll.ts) | RTK Query hooks for payroll endpoints |
| [`lib/attendance.ts`](../lib/attendance.ts) | Helpers: check-in/out, fetch-by-date-range |
| [`lib/utils/payroll-utils.ts`](../lib/utils/payroll-utils.ts) | Payroll math (gross/net, deductions) |
| [`lib/utils/employeeDataParser.ts`](../lib/utils/employeeDataParser.ts) | Parse imported employee data |
| [`lib/database/DatabaseModules.ts`](../lib/database/DatabaseModules.ts) | Module CRUD service |
| [`lib/database/DatabaseRecords.ts`](../lib/database/DatabaseRecords.ts) | Record CRUD service |
| [`lib/email`](../lib/email) | Email sender used by workflow `Email Notification` actions |

### Hooks ([`hooks/`](../hooks/))

| Hook | Purpose |
|---|---|
| `useCurrentUser.ts` | Current logged-in user context |
| `usePermissions.ts` | RBAC checks |
| `use-form-permissions.ts` | Form-level grants |
| `use-records-display.ts` | Display mode + pagination |
| `use-modules.ts` | Module metadata cache |

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **Form** | A record template defined entirely in the database (modules → forms → sections → fields). |
| **Field** | A single input on a form. Stable IDs like `fld_emp_first_name`. |
| **Section** | A visual grouping of fields inside a form. May be collapsible. |
| **Formula field** | A read-only field that evaluates an expression (e.g. `vacancies × cost_per`). |
| **Lookup field** | A field that references another form's records (e.g. Job Application's `Opening ID`). |
| **CrmFunction** | Sandboxed JavaScript snippet stored in `crm_functions`. Runs in a Node VM. |
| **WorkflowRule** | Server-side rule that fires after a record is Created / Edited / Deleted. |
| **FunctionBinding** | Client-side binding that fires a function on a UI event (`onFieldChange`, `beforeSubmit`). |
| **Auto-output mode** | Function return-value behaviour: keys are matched against current form's field IDs / API names / labels and written into the record. |
| **KRA** | Key Result Area — a goal template used during appraisals. |
| **Kaizen** | Japanese: "continuous improvement". A logged improvement project with before/after media. |
| **Engagement Points** | Gamification score awarded by the Engagement forms (Self Target, Initiative, Problem, Kaizen, Suggestion). |
| **Surface A / Surface B (Attendance)** | Two parallel attendance subsystems — form-driven records (A) used by payroll, vs the `attendance_records` table (B) used by the live "can I check in?" widget. |

---

### Counts at a glance

```
                                ┌────────────────────────────┐
   5 top-level modules          │ HR Core                  5 │
   19 sub-modules               │ Recruitment              6 │
   20 forms                     │ Performance              2 │
   31 sections                  │ Engagement               5 │
   241 fields                   │ Asset & Admin            2 │
                                ├────────────────────────────┤
                                │ Forms total             20 │
                                └────────────────────────────┘

   16 CrmFunctions  (15 module-specific + 1 employee lookup)
   36 WorkflowRules (26 module-specific + 10 auto-fill safety nets)
   22 FunctionBindings (12 calc/lifecycle + 10 employee auto-fill)
   ───
   74 automation rows in total
```

---

**End of guide.** For interactive exploration with animations, open `/settings/docs/hr-system` in the running app — it's the source of much of the data in this document and stays in sync with the SQL automation file.
