# API Handlers Architecture

> **Scope:** Covers the handler layer introduced in `lib/api-handlers/`, the lib database layer it delegates to, and how all API routes are wired together.

---

## Table of Contents

1. [Overview](#overview)
2. [Folder Structure](#folder-structure)
3. [Layer Architecture](#layer-architecture)
4. [Database Library Layer (`lib/`)](#database-library-layer)
5. [API Handler Layer (`lib/api-handlers/`)](#api-handler-layer)
   - [form-builder.ts](#form-builderts)
   - [organization.ts](#organizationts)
   - [user-management.ts](#user-managementts)
6. [Route Pattern](#route-pattern)
7. [Handler Internals](#handler-internals)
8. [Route Reference Table](#route-reference-table)
9. [Adding New Handlers](#adding-new-handlers)
10. [What Uses Raw Prisma (and Why)](#what-uses-raw-prisma-and-why)

---

## Overview

The project follows a **3-layer API architecture**:

```
HTTP Request
    │
    ▼
app/api/**/route.ts          ← thin wrappers (import + call handler)
    │
    ▼
lib/api-handlers/*.ts        ← business logic (auth, validation, error handling)
    │
    ▼
lib/database-service.ts      ← DB operations via DatabaseService / DatabaseModules / etc.
    │
    ▼
lib/prisma.ts                ← Prisma client
```

**Goal:** Keep route files to under 20 lines. All real logic lives in handler files. All DB operations go through the lib layer.

---

## Folder Structure

```
lib/
├── api-handlers/                  ← NEW: business logic handlers
│   ├── form-builder.ts            ← modules, forms, sections, fields
│   ├── organization.ts            ← org units, roles, employee permissions
│   └── user-management.ts         ← users, employees
│
├── database-service.ts            ← main service facade (delegates to below)
├── DatabaseModules.ts             ← module/form/section/field CRUD
├── DatabaseRecords.ts             ← form record CRUD + user auth records
├── DatabaseTransforms.ts          ← data transformers + table routing
├── DatabaseRoles.ts               ← RBAC: roles, permissions, assignments
├── api-helpers.ts                 ← getAuthenticatedUser, logAudit, getRequestMeta
└── prisma.ts                      ← Prisma client singleton

app/api/
├── modules/
│   ├── route.ts                   ← GET (list), POST (create), DELETE (bulk)
│   ├── [moduleId]/route.ts        ← GET, PUT, DELETE
│   └── hierarchy/route.ts         ← GET hierarchy tree
├── forms/[formId]/
│   ├── route.ts                   ← GET, PUT, PATCH, DELETE
│   ├── full/route.ts              ← GET full structure
│   ├── submit/route.ts            ← POST submit record
│   ├── records/route.ts           ← GET records (enriched)
│   ├── records/[recordId]/route.ts← GET, PUT, DELETE single record
│   ├── publish/route.ts           ← POST publish, DELETE unpublish
│   ├── analytics/route.ts         ← GET analytics
│   ├── events/route.ts            ← POST track event
│   ├── count/route.ts             ← GET record count
│   ├── linked-records/route.ts    ← GET linked forms
│   ├── lookup-sources/route.ts    ← GET lookup source definitions
│   └── fields/[fieldId]/
│       ├── route.ts               ← GET, PUT, DELETE field
│       ├── formula/route.ts       ← GET formula config
│       └── calculate/route.ts     ← GET calculated value
├── sections/
│   ├── route.ts                   ← GET, POST
│   └── [sectionId]/route.ts       ← GET, PUT, DELETE
├── fields/
│   ├── route.ts                   ← GET, POST
│   └── [fieldId]/route.ts         ← GET, PUT, DELETE
├── users/
│   ├── route.ts                   ← GET, POST
│   └── [id]/route.ts              ← GET, PUT, DELETE
├── employees/
│   ├── route.ts                   ← GET
│   └── permissions/route.ts       ← GET, POST
├── roles/[id]/route.ts            ← DELETE
├── organization-units/route.ts    ← GET
└── ...
```

---

## Layer Architecture

### Why 3 Layers?

| Layer | Responsibility | Should contain |
|-------|---------------|----------------|
| **Route** (`app/api/`) | HTTP wiring | `export async function GET/POST/PUT/DELETE`, param extraction, call handler |
| **Handler** (`lib/api-handlers/`) | Business logic | Auth checks, input validation, error handling, audit logging, response shaping |
| **Service** (`lib/database-service.ts` + others) | Data access | Prisma queries, data transforms, table routing |

**Before this change:** Business logic was inline in each route file (200–300 lines each).
**After:** Route files are 8–20 lines. Logic is centralized and reusable.

---

## Database Library Layer

### `lib/database-service.ts`
The main facade. Delegates to `DatabaseModules`, `DatabaseRecords`, `DatabaseTransforms`, `DatabaseRoles`.

Key methods:
```typescript
// Modules
DatabaseService.getModuleHierarchy(userId?)
DatabaseService.getModule(id)
DatabaseService.createModule(data)
DatabaseService.updateModule(id, data)
DatabaseService.deleteModule(id)

// Forms
DatabaseService.getForm(id, userId?)
DatabaseService.getForms(moduleId?, userId?)
DatabaseService.updateForm(id, data)
DatabaseService.deleteForm(id)
DatabaseService.publishForm(id, options)
DatabaseService.unpublishForm(id)

// Sections
DatabaseService.createSection(data)
DatabaseService.updateSection(id, data)
DatabaseService.deleteSectionWithCleanup(id)

// Fields
DatabaseService.createField(data)
DatabaseService.updateField(id, data)
DatabaseService.deleteField(id)

// Records
DatabaseService.createFormRecord(formId, recordData, submittedBy, ...)
DatabaseService.getFormRecords(formId, options?)
DatabaseService.getFormRecord(recordId)
DatabaseService.updateFormRecord(recordId, data)
DatabaseService.deleteFormRecord(recordId)
DatabaseService.getFormSubmissionCount(formId, userId?)

// Analytics
DatabaseService.getFormAnalytics(formId)
DatabaseService.trackFormEvent(formId, eventType, payload?, ...)

// Lookups
DatabaseService.getLookupSources(formId)
DatabaseService.getLinkedRecords(formId)
```

### `lib/DatabaseTransforms.ts`
Transforms raw Prisma objects to frontend-friendly shapes. Also handles dynamic table routing.

```typescript
DatabaseTransforms.getFormRecordTable(formId)  // resolves which form_records_N table to use
DatabaseTransforms.transformModule(module)
DatabaseTransforms.transformForm(form)
DatabaseTransforms.transformSection(section)
DatabaseTransforms.transformField(field)
DatabaseTransforms.transformRecord(record)
```

### `lib/DatabaseRoles.ts`
RBAC operations.

```typescript
DatabaseRoles.getEmployeesWithPermissions()
DatabaseRoles.getModulesWithSubmodules()
DatabaseRoles.updateUserPermissionsBatch(userId, updates)
DatabaseRoles.getUserById(userId)
DatabaseRoles.getRoles()
DatabaseRoles.createRole(data)
DatabaseRoles.updateRole(id, data)
DatabaseRoles.deleteRole(id)
```

### `lib/api-helpers.ts`
HTTP-level helpers shared across all routes and handlers.

```typescript
getAuthenticatedUser(request)       // validates session cookie, returns user or null
getRequestMeta(request)             // extracts { ipAddress, userAgent }
logAudit({ userId, action, ... })   // writes to audit_logs table
```

---

## API Handler Layer

All handler files live in `lib/api-handlers/`. Each file:
- Exports one class of static handler methods
- Each method accepts `(request: NextRequest, ...params)` and returns `Promise<NextResponse>`
- Uses two private helpers: `requireAuth()` and `handle()`

### Shared Pattern (used in all 3 files)

```typescript
// Auth guard — throws a NextResponse if not authenticated
async function requireAuth(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) throw NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.organizationId) throw NextResponse.json({ error: "No org" }, { status: 403 });
  return user;
}

// Error wrapper — catches thrown NextResponse (from requireAuth) + unhandled errors
async function handle(fn: () => Promise<NextResponse>, label: string): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e: any) {
    if (e instanceof NextResponse) return e;   // auth short-circuit
    console.error(`[Handler] ${label}:`, e?.message);
    return NextResponse.json({ success: false, error: e?.message }, { status: 500 });
  }
}
```

---

### `form-builder.ts`

**Import:** `import { FormBuilderHandlers } from "@/lib/api-handlers/form-builder"`

#### Module Methods

| Method | HTTP | Route | Auth Required |
|--------|------|-------|---------------|
| `getModules(request)` | GET | `/api/modules` | ✅ + org |
| `createModule(request)` | POST | `/api/modules` | ✅ + org + audit |
| `deleteModule(request)` | DELETE | `/api/modules` (body id) | ✅ + org + audit |
| `getModule(request, moduleId)` | GET | `/api/modules/[moduleId]` | ❌ public |
| `updateModule(request, moduleId)` | PUT | `/api/modules/[moduleId]` | ✅ + audit |
| `deleteModuleById(request, moduleId)` | DELETE | `/api/modules/[moduleId]` | ✅ + audit |

#### Form Methods

| Method | HTTP | Route |
|--------|------|-------|
| `getForm(request, formId)` | GET | `/api/forms/[formId]` |
| `updateForm(request, formId)` | PUT | `/api/forms/[formId]` |
| `deleteForm(request, formId)` | DELETE | `/api/forms/[formId]` |

#### Section Methods

| Method | HTTP | Route |
|--------|------|-------|
| `createSection(request)` | POST | `/api/sections` |
| `updateSection(request, sectionId)` | PUT | `/api/sections/[sectionId]` |
| `deleteSection(request, sectionId)` | DELETE | `/api/sections/[sectionId]` |

#### Field Methods

| Method | HTTP | Route | Notes |
|--------|------|-------|-------|
| `createField(request)` | POST | `/api/fields` | Validates lookup config |
| `updateField(request, fieldId)` | PUT | `/api/fields/[fieldId]` | Full field update |
| `deleteField(request, fieldId)` | DELETE | `/api/fields/[fieldId]` | |

---

### `organization.ts`

**Import:** `import { OrganizationHandlers } from "@/lib/api-handlers/organization"`

| Method | HTTP | Route | Notes |
|--------|------|-------|-------|
| `getOrgUnits(request)` | GET | `/api/organization-units` | Auth + org scoped |
| `deleteRole(request, roleId)` | DELETE | `/api/roles/[id]` | Cascade deletes descendants in a transaction |
| `getEmployeePermissions(request)` | GET | `/api/employees/permissions` | No auth required |
| `updateEmployeePermissions(request)` | POST | `/api/employees/permissions` | Batch update |

**Role cascade delete** — `deleteRole` recursively collects the target role and all its child roles, then deletes in order:
1. `role_permissions` (FK cleanup)
2. `unit_role_assignments` (FK cleanup)
3. `user_unit_assignments` (FK cleanup)
4. `roles` (the actual rows)

All in a single `prisma.$transaction` to guarantee atomicity.

---

### `user-management.ts`

**Import:** `import { UserManagementHandlers } from "@/lib/api-handlers/user-management"`

| Method | HTTP | Route | Notes |
|--------|------|-------|-------|
| `getUsers(request)` | GET | `/api/users` | Org-scoped list |
| `createUser(request)` | POST | `/api/users` | bcrypt hash, auto unit/role assign |
| `getUser(request, userId)` | GET | `/api/users/[id]` | Admin or self only |
| `updateUser(request, userId)` | PUT | `/api/users/[id]` | Admin only; handles employee upsert |
| `deleteUser(request, userId)` | DELETE | `/api/users/[id]` | Admin only, org check |
| `getEmployees(request)` | GET | `/api/employees` | Admin sees all, non-admin sees self |

**`isAdmin()` helper** — checks `unitAssignments[].role.isAdmin` or `ownedOrganization`. Used in `getUser`, `updateUser`, `deleteUser`.

**`transformUser()` helper** — consistent user shape returned to all frontend callers:
```typescript
{
  id, email, first_name, last_name, avatar, department,
  unitAssignments, email_verified,
  employee?: { ...fields, totalSalary: number | null }
}
```

---

## Route Pattern

Every route that uses a handler looks like this:

```typescript
// app/api/modules/route.ts
import { type NextRequest } from "next/server";
import { FormBuilderHandlers as H } from "@/lib/api-handlers/form-builder";

export async function GET(request: NextRequest) {
  return H.getModules(request);
}

export async function POST(request: NextRequest) {
  return H.createModule(request);
}

export async function DELETE(request: NextRequest) {
  return H.deleteModule(request);
}
```

Routes with dynamic params:

```typescript
// app/api/users/[id]/route.ts
import { type NextRequest } from "next/server";
import { UserManagementHandlers as H } from "@/lib/api-handlers/user-management";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return H.getUser(request, params.id);
}
```

---

## Handler Internals

### Error Handling Flow

```
handler method called
    │
    ├─ requireAuth() throws NextResponse(401/403) if not authenticated
    │       └─ caught by handle() → returned as HTTP response
    │
    ├─ validation returns NextResponse(400) early
    │
    ├─ DB call throws → caught by handle() → NextResponse(500)
    │
    └─ success → NextResponse(200/201)
```

### Audit Logging

Module create/update/delete operations call `logAudit()` automatically inside the handler. The route file doesn't need to know about it.

```typescript
await logAudit({
  userId: user.id,
  organizationId: user.organizationId,
  performedBy: user.email,
  action: "Created" | "Updated" | "Deleted",
  module: "Form Modules",
  details: "...",
  ipAddress,
  userAgent,
  recordId: "...",
  recordName: "...",
});
```

---

## Route Reference Table

| Route | Handler File | Handler Method |
|-------|-------------|----------------|
| GET `/api/modules` | form-builder | `getModules` |
| POST `/api/modules` | form-builder | `createModule` |
| DELETE `/api/modules` | form-builder | `deleteModule` |
| GET `/api/modules/[id]` | form-builder | `getModule` |
| PUT `/api/modules/[id]` | form-builder | `updateModule` |
| DELETE `/api/modules/[id]` | form-builder | `deleteModuleById` |
| GET `/api/forms/[id]` | form-builder | `getForm` |
| PUT `/api/forms/[id]` | form-builder | `updateForm` |
| DELETE `/api/forms/[id]` | form-builder | `deleteForm` |
| POST `/api/sections` | form-builder | `createSection` |
| PUT `/api/sections/[id]` | form-builder | `updateSection` |
| DELETE `/api/sections/[id]` | form-builder | `deleteSection` |
| POST `/api/fields` | form-builder | `createField` |
| PUT `/api/fields/[id]` | form-builder | `updateField` |
| DELETE `/api/fields/[id]` | form-builder | `deleteField` |
| GET `/api/organization-units` | organization | `getOrgUnits` |
| DELETE `/api/roles/[id]` | organization | `deleteRole` |
| GET `/api/employees/permissions` | organization | `getEmployeePermissions` |
| POST `/api/employees/permissions` | organization | `updateEmployeePermissions` |
| GET `/api/users` | user-management | `getUsers` |
| POST `/api/users` | user-management | `createUser` |
| GET `/api/users/[id]` | user-management | `getUser` |
| PUT `/api/users/[id]` | user-management | `updateUser` |
| DELETE `/api/users/[id]` | user-management | `deleteUser` |
| GET `/api/employees` | user-management | `getEmployees` |

Routes **not** using handlers (standalone raw Prisma or DatabaseService calls):

| Route | Reason |
|-------|--------|
| `auth/*` | OTP/session/bcrypt — auth-specific, no DB service equivalent |
| `payroll/*` | Complex domain logic specific to payroll calculations |
| `chat/*`, `erp-chat` | Streaming AI responses, provider config |
| `forms/[id]/submit` | Complex structured-data transformation + unique ID generation |
| `forms/[id]/records` | Enriched subform processing beyond `DatabaseService.getFormRecords` |
| `forms/[id]/analytics` | Already a thin wrapper around `DatabaseService` |
| `forms/[id]/events` | Already a thin wrapper around `DatabaseService` |

---

## Adding New Handlers

### Step 1 — Add to the right handler file

Pick the handler file that best fits the domain:

- Form structure changes → `lib/api-handlers/form-builder.ts`
- Org / roles / permissions → `lib/api-handlers/organization.ts`
- Users / employees → `lib/api-handlers/user-management.ts`

If it doesn't fit any of those, create a new handler file (e.g. `lib/api-handlers/records.ts`).

### Step 2 — Write the handler method

```typescript
// Inside the exported object in the relevant handler file:
async myNewHandler(request: NextRequest, resourceId: string): Promise<NextResponse> {
  return handle(async () => {
    const user = await requireAuth(request);   // remove if public endpoint

    // 1. Input validation
    if (!resourceId)
      return NextResponse.json({ error: "ID required" }, { status: 400 });

    // 2. DB operation (always through DatabaseService or lib)
    const result = await DatabaseService.someMethod(resourceId);

    // 3. Not found guard
    if (!result)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 4. Return
    return NextResponse.json({ success: true, data: result });
  }, "myNewHandler");
},
```

### Step 3 — Wire the route

```typescript
// app/api/your-resource/[id]/route.ts
import { type NextRequest } from "next/server";
import { YourHandlers as H } from "@/lib/api-handlers/your-handler-file";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return H.myNewHandler(request, params.id);
}
```

### Step 4 — Add DB method if needed

If no existing `DatabaseService` method covers the operation, add it to:
- `lib/DatabaseModules.ts` — for form/module/section/field structure
- `lib/DatabaseRecords.ts` — for form record data
- `lib/DatabaseRoles.ts` — for roles/permissions
- Then re-export from `lib/database-service.ts`

---

## What Uses Raw Prisma (and Why)

Some routes bypass the handler layer entirely and use `prisma` directly. This is intentional for:

| Area | Why raw Prisma is acceptable |
|------|------------------------------|
| **Auth** (`/api/auth/*`) | OTP generation, session tokens, bcrypt hashing — no `DatabaseService` equivalent |
| **Payroll** (`/api/payroll/*`) | Multi-table aggregation, leave calculations, month/year filters — domain-specific |
| **Chat/AI** (`/api/chat/*`, `/api/erp-chat`) | Streaming responses, AI provider config stored in DB |
| **Subforms** (`/api/subforms/*`) | Schema uses `formId`-based model; `DatabaseModules.createSubform` uses `sectionId`-based model |
| **Form submit** (`/api/forms/[id]/submit`) | Unique ID generation, structured-data transform before record creation |
| **Form records list** (`/api/forms/[id]/records`) | Enriched field/subform lookup maps beyond what `DatabaseService.getFormRecords` provides |
| **Organizations** (`/api/organizations/*`) | Create-org flow with OTP email — org-bootstrap logic |
