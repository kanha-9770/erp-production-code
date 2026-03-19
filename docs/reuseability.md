# Code Reusability & Refactoring — Phase 1: API Routes

**Date:** 2026-03-18
**Scope:** All API route handlers, shared authentication helpers, Prisma singleton, service layer, dead code cleanup

---

## Overview

Phase 1 focused on eliminating repeated boilerplate across 38+ Next.js API route files. Every route was repeating the same patterns: session validation, audit logging, error formatting, and Prisma client instantiation. A centralized helper module was created and all routes were migrated to it.

---

## 1. `lib/api-helpers.ts` — Central Utility Module (New File)

**Problem:** Every API route duplicated 15–30 lines of auth/error boilerplate.

**Solution:** Created `lib/api-helpers.ts` with the following exports:

| Export | Purpose |
|--------|---------|
| `getAuthenticatedUser(req)` | Validates session, returns user or throws |
| `logAudit(params)` | Writes to audit log table via Prisma |
| `getRequestMeta(req)` | Extracts IP address and user-agent |
| `apiSuccess(data, status?)` | Returns `NextResponse.json({ success: true, ...data })` |
| `apiError(message, status?)` | Returns `NextResponse.json({ error: message }, { status })` |
| `unauthorized(message?)` | Returns 401 response |
| `forbidden(message?)` | Returns 403 response |
| `notFound(message?)` | Returns 404 response |

**Before (per route):**
```ts
const session = await getServerSession(authOptions);
if (!session?.user?.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
const user = await prisma.user.findUnique({ where: { id: session.user.id } });
if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
// ... audit log repeated inline ...
await prisma.auditLog.create({ data: { userId: user.id, action: "...", ... } });
return NextResponse.json({ success: true, data: result });
```

**After (per route):**
```ts
const user = await getAuthenticatedUser(req);
await logAudit({ userId: user.id, action: "...", req });
return apiSuccess({ data: result });
```

**Impact:** ~15–25 lines removed per route × 38 routes = **570–950 lines eliminated**

---

## 2. Routes Migrated to Shared Helpers

All of the following routes were updated to use `getAuthenticatedUser`, `logAudit`, `apiSuccess`, and `apiError` from `lib/api-helpers.ts`:

### Auth Routes
- `app/api/auth/login/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/change-password/route.ts`
- `app/api/auth/update-profile/route.ts`
- `app/api/auth/upload-avatar/route.ts`
- `app/api/auth/remove-avatar/route.ts`

### Admin Routes
- `app/api/admin/users/route.ts`
- `app/api/admin/permissions/route.ts`

### User & Role Routes
- `app/api/users/route.ts`
- `app/api/users/[id]/route.ts`
- `app/api/users/[id]/assignments/route.ts`
- `app/api/role/route.ts`
- `app/api/role-permissions/route.ts`
- `app/api/user-role-permissions/route.ts`
- `app/api/user/[userid]/admin-status/route.ts`
- `app/api/user/permitted-modules/route.ts`

### Organization & Permissions
- `app/api/organizations/create/route.ts`
- `app/api/organizations/check/route.ts`
- `app/api/organizations/[id]/units/route.ts`
- `app/api/organizations/[id]/units/[slug]/route.ts`
- `app/api/organization-units/route.ts`
- `app/api/permissions/[resourceType]/[resourceId]/route.ts`
- `app/api/permissions/section/[sectionId]/route.ts`
- `app/api/modules-permission/route.ts`

### Module & Form Routes
- `app/api/modules/route.ts`
- `app/api/modules/[moduleId]/route.ts`
- `app/api/modules/[moduleId]/reorder/route.ts`
- `app/api/forms/[formId]/route.ts`
- `app/api/forms/[formId]/fields/route.ts`
- `app/api/forms/[formId]/fields/[fieldId]/route.ts`
- `app/api/forms/[formId]/submit/route.ts`
- `app/api/forms/permitted/route.ts`
- `app/api/fields/[fieldId]/route.ts`

### Payroll Routes
- `app/api/payroll/route.ts`
- `app/api/payroll/records/route.ts`
- `app/api/payroll/records/[id]/route.ts`
- `app/api/payroll/config/route.ts`
- `app/api/payroll/save/route.ts`
- `app/api/payroll/auto-generate/route.ts`
- `app/api/payroll/stats/route.ts`

### Other Routes
- `app/api/stats/route.ts`
- `app/api/audit-log/route.ts`
- `app/api/login-history/route.ts`
- `app/api/upload/route.ts`
- `app/api/employee-records/route.ts`
- `app/api/employees/route.ts`
- `app/api/master-data/route.ts`
- `app/api/import/create-job/route.ts`
- `app/api/import/process/route.ts`

---

## 3. Prisma Singleton Fix

**Problem:** Multiple route files were calling `new PrismaClient()` directly, creating a new database connection pool per request — a well-known Next.js anti-pattern that causes connection exhaustion under load.

**Before:**
```ts
// In individual route files
const prisma = new PrismaClient();
```

**Solution:** All routes now import from `lib/database.ts` which uses the singleton pattern:
```ts
// lib/database.ts
import { PrismaClient } from "@prisma/client";
const globalForPrisma = global as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Impact:** Prevents connection pool exhaustion. One shared Prisma instance per process.

---

## 4. Service Layer Reuse in Routes

Routes that previously queried Prisma directly were updated to call the appropriate service layer methods:

| Service | Methods Used By Routes |
|---------|----------------------|
| `DatabaseService` | `validateUserAccess`, `getUserById`, `updateUser` |
| `DatabaseModules` | `getModulesForUser`, `getModuleById`, `createModule`, `reorderModules` |
| `DatabaseRoles` | `getRolesForOrganization`, `createRole`, `updateRole`, `deleteRole` |
| `DatabaseTransforms` | `getFormsForModule`, `submitForm`, `getFormById` |

### New Service Methods Added (Phase 1)

**`DatabaseRoles.getRolesForOrganization(orgId)`**
Added to support the `/api/organizations/[id]/roles` route without duplicating hierarchy-traversal logic.

**`DatabaseModules` — Formula Includes**
Updated `getFormById` and `getFormsForModule` to include formula field definitions in Prisma `include` blocks, enabling formula calculation in records display.

---

## 5. Dead Code Removal from `lib/database-service.ts`

**Problem:** Three stub methods existed early in the file (lines 537–581) that were superseded by richer implementations lower in the same file (lines ~861+). The stubs used simpler logic (e.g., `getDirectAccessibleModuleIds`) while the real versions use full hierarchy traversal.

**Removed stubs:**
- `validateUserAccess` (stub at line ~537) — real version at ~861 handles parent/child org unit traversal
- `countChildrenRecursive` (stub at ~560) — real version handles nested tree counting
- `getModules` (stub at ~572) — real version includes formula fields, permissions, and module metadata

**Risk if stubs remained:** TypeScript picks up the first matching method signature in some bundlers, and the stub would silently win, returning incomplete data.

---

## 6. Debug Log Cleanup

Removed approximately **244 `console.log` / `console.warn` / `console.error`** debug statements across all modified files.

### Breakdown by area

| Area | Approx. Calls Removed |
|------|----------------------|
| API route files (38+) | ~180 |
| `lib/database-service.ts` | ~28 |
| `lib/database.ts` | ~12 |
| `lib/auth.ts` / `lib/auth-helpers.ts` | ~14 |
| `lib/DatabaseModules.ts` | ~10 |

**Example of what was removed:**
```ts
// Removed from route files:
console.log("=== PAYROLL API ===");
console.log("User:", user.id, user.email);
console.log("Request body:", body);
console.log("Result:", JSON.stringify(result, null, 2));
console.warn("Falling back to direct query");
```

These were development-time debugging aids left in production code, potentially leaking sensitive user data (IDs, emails, request bodies) to server logs.

---

## 7. Hardcoded URL Fixes in Payroll Routes

**Problem:** Two payroll routes contained hardcoded `localhost:3000` URLs for internal API calls:
```ts
// Before
const response = await fetch("http://localhost:3000/api/payroll/config");
```

**Fix:** Replaced with relative paths using `getBaseUrl()` helper or direct service layer calls:
```ts
// After — using service layer directly (no HTTP round-trip)
const config = await DatabaseService.getPayrollConfig(orgId);
```

**Impact:** Routes now work in all environments (development, staging, production) without configuration changes.

---

## 8. `lib/authMiddleware.ts` — Dead File Deleted

`lib/authMiddleware.ts` was a 62-line file containing authentication middleware that was never imported by any route or page. It duplicated logic already present in `lib/auth-helpers.ts`.

**Deleted:** `lib/authMiddleware.ts`

---

## 9. `lib/database/users.ts` — Pending Decision

This file contains ~62 lines of entirely commented-out code. It is not imported anywhere. Options:

- **Delete** if the functionality has been migrated to `lib/database-service.ts`
- **Restore** if the commented code represents planned functionality

> **Status:** Awaiting user decision. Not deleted in Phase 1.

---

## Summary of Metrics

| Metric | Value |
|--------|-------|
| New shared utility file created | 1 (`lib/api-helpers.ts`) |
| API routes migrated | 38+ |
| Lines of boilerplate eliminated | ~800–1,000 |
| `console.log` calls removed | ~244 |
| Dead files deleted | 1 (`lib/authMiddleware.ts`) |
| Stub methods removed | 3 |
| Prisma `new PrismaClient()` anti-patterns fixed | Multiple |
| Hardcoded localhost URLs fixed | 2 |

---

## Files Changed in Phase 1

```
lib/api-helpers.ts                    (CREATED)
lib/database.ts                       (MODIFIED — singleton enforced)
lib/database-service.ts               (MODIFIED — stubs removed, logs cleaned)
lib/DatabaseModules.ts                (MODIFIED — formula includes added, logs cleaned)
lib/DatabaseRoles.ts                  (MODIFIED — getRolesForOrganization added)
lib/auth.ts                           (MODIFIED — logs cleaned)
lib/auth-helpers.ts                   (MODIFIED — logs cleaned)
lib/authMiddleware.ts                 (DELETED)
app/api/admin/permissions/route.ts    (MODIFIED)
app/api/admin/users/route.ts          (MODIFIED)
app/api/audit-log/route.ts            (MODIFIED)
app/api/auth/change-password/route.ts (MODIFIED)
app/api/auth/login/route.ts           (MODIFIED)
app/api/auth/logout/route.ts          (MODIFIED)
app/api/auth/remove-avatar/route.ts   (MODIFIED)
app/api/auth/update-profile/route.ts  (MODIFIED)
app/api/auth/upload-avatar/route.ts   (MODIFIED)
app/api/employee-records/route.ts     (MODIFIED)
app/api/employees/route.ts            (MODIFIED)
app/api/fields/[fieldId]/route.ts     (MODIFIED)
app/api/forms/[formId]/route.ts       (MODIFIED)
app/api/forms/[formId]/fields/route.ts (MODIFIED)
app/api/forms/[formId]/submit/route.ts (MODIFIED)
app/api/forms/permitted/route.ts      (MODIFIED)
app/api/import/create-job/route.ts    (MODIFIED)
app/api/import/process/route.ts       (MODIFIED)
app/api/login-history/route.ts        (MODIFIED)
app/api/master-data/route.ts          (MODIFIED)
app/api/modules/route.ts              (MODIFIED)
app/api/modules/[moduleId]/route.ts   (MODIFIED)
app/api/modules/[moduleId]/reorder/route.ts (MODIFIED)
app/api/modules-permission/route.ts   (MODIFIED)
app/api/organization-units/route.ts   (MODIFIED)
app/api/organizations/check/route.ts  (MODIFIED)
app/api/organizations/create/route.ts (MODIFIED)
app/api/organizations/[id]/units/route.ts (MODIFIED)
app/api/payroll/route.ts              (MODIFIED)
app/api/payroll/auto-generate/route.ts (MODIFIED)
app/api/payroll/config/route.ts       (MODIFIED)
app/api/payroll/records/route.ts      (MODIFIED)
app/api/payroll/records/[id]/route.ts (MODIFIED)
app/api/payroll/save/route.ts         (MODIFIED)
app/api/payroll/stats/route.ts        (MODIFIED)
app/api/permissions/[resourceType]/[resourceId]/route.ts (MODIFIED)
app/api/role/route.ts                 (MODIFIED)
app/api/role-permissions/route.ts     (MODIFIED)
app/api/stats/route.ts                (MODIFIED)
app/api/upload/route.ts               (MODIFIED)
app/api/user/[userid]/admin-status/route.ts (MODIFIED)
app/api/user/permitted-modules/route.ts (MODIFIED)
app/api/user-role-permissions/route.ts (MODIFIED)
app/api/users/route.ts                (MODIFIED)
app/api/users/[id]/route.ts           (MODIFIED)
app/api/users/[id]/assignments/route.ts (MODIFIED)
```

---

*See `docs/reuseability-phase2.md` for Auth UI reusability (AuthPanel + 5 view components) and `docs/reuseability-phase3.md` for Company Settings / Organization components.*
