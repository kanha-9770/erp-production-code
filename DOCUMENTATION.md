# Complete API & Database Documentation

> A beginner-friendly walkthrough of every API and database query in this ERP, with real analogies, pros, and cons.

---

## How to read this document

This is a **teaching document**, not a reference manual. Read it in order. Part 1 explains the foundational patterns that show up in every API. Once you understand those, every endpoint in Parts 2+ is just a small variation on the same theme.

If you try to skip to a specific endpoint without reading Part 1, you will be confused about why certain lines appear in every route. Don't skip.

---

## Table of Contents

### Part 1 — Foundations (READ THIS FIRST)
- [1.1 What is a Next.js API route?](#11-what-is-a-nextjs-api-route)
- [1.2 Authentication — how the server knows who you are](#12-authentication--how-the-server-knows-who-you-are)
- [1.3 Multi-tenancy — keeping each company's data separate](#13-multi-tenancy--keeping-each-companys-data-separate)
- [1.4 Permissions — who is allowed to do what](#14-permissions--who-is-allowed-to-do-what)
- [1.5 Error handling — the try/catch shape](#15-error-handling--the-trycatch-shape)
- [1.6 Response shape — what the frontend gets back](#16-response-shape--what-the-frontend-gets-back)
- [1.7 Pagination — fetching data in chunks](#17-pagination--fetching-data-in-chunks)
- [1.8 Prisma query patterns — the 5 shapes you will see everywhere](#18-prisma-query-patterns--the-5-shapes-you-will-see-everywhere)
- [1.9 Soft delete & TrashBin — how deletes really work](#19-soft-delete--trashbin--how-deletes-really-work)
- [1.10 Audit logging — the "who did what when" trail](#110-audit-logging--the-who-did-what-when-trail)
- [1.11 Validation — manual guards, no schema library](#111-validation--manual-guards-no-schema-library)

### Part 2 — Auth APIs
- [2.1 `GET /api/auth/user` — who am I?](#21-get-apiauthuser--who-am-i)
- [2.2 `POST /api/auth/logout` — sign out](#22-post-apiauthlogout--sign-out)
- [2.3 `GET /api/auth/perm-version` — has my permission set changed?](#23-get-apiauthperm-version--has-my-permission-set-changed)

### Part 3 — Users & Permissions
- [3.1 `GET/POST /api/users` — list & create users](#31-getpost-apiusers--list--create-users)
- [3.2 `GET/PATCH/DELETE /api/users/[id]` — read, update, delete one user](#32-getpatchdelete-apiusersid--read-update-delete-one-user)
- [3.3 `GET/POST /api/permissions` — permission catalog](#33-getpost-apipermissions--permission-catalog)
- [3.4 `GET /api/user-permissions` — what can the current user do?](#34-get-apiuser-permissions--what-can-the-current-user-do)
- [3.5 `POST /api/user-permission-overrides` — explicit deny/allow](#35-post-apiuser-permission-overrides--explicit-denyallow)
- [3.6 `GET /api/user-role-permissions` — role-based resolved permissions](#36-get-apiuser-role-permissions--role-based-resolved-permissions)

### Part 4 — Forms (the biggest domain)
- [4.1 `GET/POST /api/forms/[formId]/records` — read & create records](#41-getpost-apiformsformidrecords--read--create-records)
- [4.2 `POST /api/forms/[formId]/submit` — public form submission](#42-post-apiformsformidsubmit--public-form-submission)
- [4.3 `GET /api/forms/[formId]/full` — load form + sections + fields + subforms in one request](#43-get-apiformsformidfull--load-form--sections--fields--subforms-in-one-request)
- [4.4 `GET/POST /api/forms/[formId]/fields` — manage fields](#44-getpost-apiformsformidfields--manage-fields)
- [4.5 `POST /api/forms/[formId]/move` & `/reorder` — drag-and-drop in the form builder](#45-post-apiformsformidmove--reorder--drag-and-drop-in-the-form-builder)
- [4.6 `GET /api/forms/[formId]/analytics` — counts & funnel](#46-get-apiformsformidanalytics--counts--funnel)
- [4.7 `POST /api/forms/[formId]/export` — CSV/XLSX download](#47-post-apiformsformidexport--csvxlsx-download)
- [4.8 Subforms — `GET/POST /api/subforms/[subformId]/records`](#48-subforms--getpost-apisubformssubformidrecords)

### Part 5 — Attendance
- [5.1 `POST /api/forms/[formId]/attendance/checkin` — punch in](#51-post-apiformsformidattendancecheckin--punch-in)
- [5.2 `POST /api/forms/[formId]/attendance/checkout` — punch out](#52-post-apiformsformidattendancecheckout--punch-out)
- [5.3 `GET /api/attendance/status` — am I currently checked in?](#53-get-apiattendancestatus--am-i-currently-checked-in)
- [5.4 `GET/PATCH /api/attendance-config` — org-wide attendance policy](#54-getpatch-apiattendance-config--org-wide-attendance-policy)

### Part 6 — Leaves & Payroll
- [6.1 `GET/POST /api/leaves` — apply for leave](#61-getpost-apileaves--apply-for-leave)
- [6.2 `GET/POST /api/payroll/leave-type` — leave type catalog](#62-getpost-apipayrollleave-type--leave-type-catalog)
- [6.3 `GET /api/payroll/records` — monthly payslips](#63-get-apipayrollrecords--monthly-payslips)
- [6.4 `GET/PATCH /api/payroll/config` — payroll engine settings](#64-getpatch-apipayrollconfig--payroll-engine-settings)
- [6.5 `GET /api/holidays` — public holiday calendar](#65-get-apiholidays--public-holiday-calendar)

### Part 7 — TO BE DOCUMENTED IN A FOLLOW-UP SESSION
> The remaining ~280 endpoints follow the same patterns you learned in Part 1. To keep this document readable, they will be added in follow-up sessions. The domains queued for future passes:
- Real estate (leads, properties, transactions, commissions, wallet) — ~60 endpoints
- Inventory & products — ~20 endpoints
- HR (employees, staffing, job openings, applications, offers, referrals) — ~40 endpoints
- Workflow rules & function bindings — ~25 endpoints
- Engagement (kaizen, suggestions, problems, initiatives) — ~20 endpoints
- AI / chat — ~15 endpoints
- Notifications & push — ~10 endpoints
- Trash & recovery — ~8 endpoints
- Org units, modules, sections, fields — ~50 endpoints (form-builder backbone)
- Master data, import/export, profile, dashboard, audit-log, stats — ~30 endpoints

---

# Part 1 — Foundations

## 1.1 What is a Next.js API route?

### Analogy: A receptionist at an office

Imagine a company office. Visitors arrive at the front desk and say "I want to talk to the sales team." The receptionist:
1. Checks the visitor's ID badge (authentication)
2. Decides if the visitor is allowed in (permissions)
3. Walks to the right department (database query)
4. Brings back the answer
5. Hands it to the visitor in a neat folder (response)

A Next.js API route does exactly that. It's a function on the server that the browser calls over HTTP.

### What it looks like in code

Every file under `app/api/.../route.ts` exports HTTP method functions:

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // 1. Authenticate
  // 2. Authorize
  // 3. Query the database
  // 4. Return a response
}

export async function POST(request: NextRequest) {
  // Same shape, but for creating data
}
```

The file path becomes the URL:
- [app/api/users/route.ts](app/api/users/route.ts) → `https://yourapp.com/api/users`
- [app/api/users/[id]/route.ts](app/api/users/%5Bid%5D/route.ts) → `https://yourapp.com/api/users/123`

The `[id]` in the folder name is a **dynamic segment** — anything in the URL at that position gets passed to your function.

### Pros of this pattern
- **One file = one URL.** Easy to find: "where does `/api/users` live?" → `app/api/users/route.ts`.
- **No separate routing config.** No `app.get("/users", handler)` boilerplate.
- **Per-route code splitting.** Your `/api/forms/[formId]/records` route doesn't load code from `/api/users` — keeps cold-start fast.

### Cons of this pattern
- **Lots of files.** This project has 328 of them. Finding a route by searching the file tree is slow without grep.
- **No automatic shared middleware.** Every route has to manually call `getAuthenticatedUser()`. If you forget, the route is unauthenticated and unsafe. There's no global "all `/api/*` routes are authenticated" switch.
- **Repetition.** The same 5-10 lines of auth-and-org-check appear at the top of every handler. (More on this in section 1.2.)

---

## 1.2 Authentication — how the server knows who you are

### Analogy: A wristband at a music festival

When you enter a festival, you get a wristband with a hidden code. Every time you walk into a sub-area (food court, VIP, backstage), a guard scans your wristband. The wristband doesn't tell the guard your name — it just tells them which festival database entry you are. The guard looks you up.

That's exactly what a **session cookie** does. When you log in, the server creates a row in `user_sessions` and gives your browser a cookie called `auth-token`. Every request your browser makes sends that cookie back. The server looks up the cookie value in `user_sessions`, sees which user owns the session, and now knows who you are.

### The code

Every route handler that needs a user starts with:

```typescript
import { getAuthenticatedUser } from "@/lib/api-helpers";

const authUser = await getAuthenticatedUser(request);
if (!authUser) {
  return NextResponse.json(
    { success: false, message: "Authentication required" },
    { status: 401 },
  );
}
```

Inside [lib/api-helpers.ts](lib/api-helpers.ts):

```typescript
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return null;
  const session = await validateSession(token);
  if (!session?.user) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, organizationId: true },
  });
  return user ?? null;
}
```

And inside `validateSession()` ([lib/auth.ts](lib/auth.ts)):

```typescript
const session = await prisma.userSession.findUnique({
  where: { token },
  include: { user: true },
});
if (!session || session.expiresAt < new Date()) return null;
return session;
```

So the chain is: **cookie → `user_sessions` row → `users` row.**

### Pros of session cookies in a database table
- **Easy to revoke.** Want to log out a user from every device? `DELETE FROM user_sessions WHERE userId = ?`. With JWTs, you can't do that without a denylist.
- **Easy to inspect.** "Who's currently logged in?" is one SQL query.
- **No secret-key issues.** A JWT signed with a leaked key is a permanent backdoor; a database session can be killed at any time.

### Cons of database sessions
- **Every request hits the database.** Twice (`userSession.findUnique`, then `user.findUnique`). With 1000 requests/second, that's 2000 reads/second just for auth.
  - **Mitigation:** the audit added an index on `UserSession.token` (which is already `@unique`, so it's covered). Fast lookup. Still: 2 round-trips per request.
- **No stateless scaling.** A request to one server can't be validated on another without sharing the DB. Fine for one Postgres, painful at multi-region scale.
- **The session table grows forever** if you never sweep expired rows. The schema audit recommended a partial index for this; see the raw-SQL block at the bottom of [schema.prisma](prisma/schema.prisma).

### Why this design was chosen here
Simplicity. Sessions in a table are the easiest correct design. Stateless JWTs sound nicer in tutorials but introduce real bugs (can't revoke, key rotation pain). For an ERP with <100k users this is the right call.

---

## 1.3 Multi-tenancy — keeping each company's data separate

### Analogy: A bank with shared computer servers

Imagine a single bank computer that handles accounts for **five different banks** (HDFC, SBI, ICICI, Axis, Kotak). The accounts table has rows from all five banks mixed together. The ONLY thing keeping HDFC's data away from SBI's is a column called `bankId`. Every query says `WHERE bankId = 'HDFC'`. If a programmer forgets that filter even ONCE, an HDFC customer sees SBI's accounts. Disaster.

That's exactly the situation in this ERP. The `organizations` table has one row per company. Every other tenant-scoped table (users, forms, employees, leads, etc.) has an `organizationId` column. **Every query must filter on it.**

### How it works in code

1. **The user is tied to an org** via `User.organizationId`. When `getAuthenticatedUser()` returns, you have `authUser.organizationId`.

2. **Every query is scoped to that org**:

```typescript
const users = await prisma.user.findMany({
  where: { organizationId: authUser.organizationId },
  // ...
});
```

3. **Creates set the org explicitly**:

```typescript
const newUser = await prisma.user.create({
  data: {
    email,
    organizationId: authUser.organizationId,  // pulled from the session, never from the request body
    // ...
  },
});
```

4. **Cross-tenant checks** appear before deeply nested reads. Example from [app/api/forms/[formId]/records/route.ts](app/api/forms/%5BformId%5D/records/route.ts):

```typescript
const formOrgId = (form.module as any)?.organizationId || null;
const userOrgId = authUser.organizationId;
if (formOrgId && userOrgId && formOrgId !== userOrgId) {
  return NextResponse.json(
    { success: false, message: "You do not have access to this form's records" },
    { status: 403 },
  );
}
```

### Pros of column-based multi-tenancy
- **One database to back up, one schema to migrate.** No per-tenant DB to provision.
- **Cheap.** You can host 10,000 small tenants on a single Postgres without separate infrastructure.
- **Cross-tenant analytics is trivial.** "How many forms exist across all tenants?" is one query.

### Cons of column-based multi-tenancy
- **One forgotten WHERE clause and customer A sees customer B's data.** This is THE most dangerous bug class in this kind of app. The schema audit flagged ~10 tables where `organizationId` is nullable, which makes this risk worse: if a row has `organizationId = NULL`, no `WHERE organizationId = X` query returns it, but a `WHERE organizationId IS NULL` query does. Bug magnet.
- **Indexes get heavier.** Every composite index needs `organizationId` as the first column to be useful.
- **Large tenants degrade small ones.** If one tenant has 50 million rows and another has 1000, queries for the small tenant might walk parts of the big tenant's data depending on the index. The fix is good composite indexes (which the schema audit added).
- **GDPR / "delete a tenant" is harder.** A separate DB per tenant lets you just drop the database. Here you have to cascade-delete from 30+ tables.

### Why this design was chosen here
For an ERP serving small-to-medium businesses, the cost savings dominate. A DB-per-tenant would mean operating dozens of databases. The compromise is: be extremely disciplined about always filtering by `organizationId`.

---

## 1.4 Permissions — who is allowed to do what

### Analogy: Office key cards

In a corporate building:
- The CEO's keycard opens every door (admin).
- Every employee has a default keycard tied to their **department** (role-based permissions).
- HR can manually disable a specific door for a specific person, even though their department allows it (user-level override — deny).
- HR can also manually grant a specific door to a specific person whose department doesn't normally allow it (user-level override — allow).

When a person taps their card on a door, the lock checks:
1. Are you the CEO? → open.
2. Is there an explicit personal rule for this door? → use that.
3. Otherwise, what does your department say? → use that.
4. Otherwise → deny.

That's exactly how `hasPermission()` works in this ERP.

### The code

```typescript
// lib/permissions/has-permission.ts
export async function hasPermission(
  authUserId: string,
  permissionName: string
): Promise<boolean> {
  // 1. Admin / organization owner → always allow
  // 2. Look for a UserPermissionOverride row for this user + permission
  //    - If explicit DENY → return false (overrides everything else)
  //    - If explicit ALLOW → return true
  // 3. Otherwise, walk the user's roles and check RolePermission
  // 4. Default → false
}
```

A route handler uses a wrapper like `canManageUsers()`:

```typescript
const canManage = await canManageUsers(authUser.id);
if (!canManage) {
  return NextResponse.json(
    { error: "Unauthorized: requires MANAGE_USERS permission" },
    { status: 403 }
  );
}
```

### Pros of this 3-tier model (admin → override → role)
- **Roles cover the 95% case.** Most people fit into a role and never need an override.
- **Overrides handle exceptions cleanly.** "Sales user X also needs invoice access" doesn't require creating a new role — just an override row.
- **Deny beats allow.** The strictest rule wins, which matches user intuition about security.

### Cons of this model
- **Permission checks hit the database every time.** Each call to `hasPermission()` is 1-3 SQL queries (admin check, override check, role check). For a page that calls 5 endpoints, that's 5-15 extra queries.
  - **Mitigation:** the app uses a "permission version" trick. When permissions change, a counter is bumped (`/api/auth/perm-version`). The frontend caches resolved permissions and refetches when the version changes. So in practice, most route calls don't fully re-resolve permissions.
- **No central audit of "what can user X do?"** To answer that you have to run the resolution algorithm in your head across roles + overrides + admin flags.
- **No row-level permissions.** "User X can edit ANY form" or "User X can edit NO forms" — there's no "User X can edit *these specific* forms" without writing custom code per resource. The `RolePermission.formId` field is an attempt at that but it's a polymorphic-via-nullable-FK design (audit flagged it).
- **Roles are per-organization unit.** A user assigned to multiple units (e.g., a manager in two departments) inherits the union of both roles' permissions. Easy to over-permission accidentally.

---

## 1.5 Error handling — the try/catch shape

### Analogy: A safety net under a trapeze

Every route handler wraps its main work in try/catch. If anything throws — Prisma failure, validation error, network blip — the catch block catches it and returns a safe error response instead of crashing.

Without try/catch, an uncaught error in a Next.js route returns a generic 500 with no useful message. With try/catch, you control the message and the status code.

### The canonical shape

```typescript
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 },
      );
    }

    // ... do the work ...

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("GET /api/something Error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}
```

### Status codes you'll see
| Code | Meaning | When it's returned |
|---|---|---|
| 200 | OK | Successful read or update |
| 201 | Created | Successful create (some routes use 200 instead — inconsistent) |
| 400 | Bad Request | Missing required field, invalid format |
| 401 | Unauthorized | No session cookie, or expired session |
| 403 | Forbidden | Logged in but lacking permission |
| 404 | Not Found | Resource doesn't exist OR exists but in another tenant |
| 409 | Conflict | Duplicate email, code already exists, etc. |
| 429 | Too Many Requests | Rate limit hit |
| 500 | Internal Server Error | Something blew up |

### Pros of this style
- **Consistent.** Frontend code can always rely on `{ success, message/error }` regardless of which endpoint it called.
- **Safe.** Even if Prisma throws an obscure error, the client never sees a database stack trace.
- **Logs are searchable.** `console.error("GET /api/something Error:", err)` produces grep-friendly logs.

### Cons
- **The error message returned to the client is generic.** "Internal server error" tells the user nothing actionable. The actual error is in the server logs only.
- **No structured error codes.** A 400 from "missing field" looks identical to a 400 from "invalid email format" to the client — both just `{ success: false, message: "..." }`. The frontend has to parse the message string, which is fragile.
- **`console.error` is the entire logging layer.** There's no Sentry / Datadog / structured logger. When something goes wrong in production, you're SSH-ing into the server and `grep`-ing logs.
- **404 ambiguity.** A 404 might mean "this form doesn't exist" or "this form exists but belongs to another tenant." For security that's intentional (don't reveal existence across tenants), but it can confuse developers debugging.

---

## 1.6 Response shape — what the frontend gets back

Every API response is JSON in one of these two shapes:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 100, "page": 1 }
}
```

Or, more commonly, the data is inlined under domain-specific keys:

```json
{
  "success": true,
  "records": [ ... ],
  "total": 100,
  "page": 1,
  "limit": 50,
  "totalPages": 2
}
```

**Error:**
```json
{
  "success": false,
  "message": "Authentication required"
}
```

Sometimes `error` is used instead of `message`. It's inconsistent across the codebase.

### Pros
- **Always wrapped.** Frontend can always check `response.success` before assuming `data` exists. No "is this a raw array or an error?" confusion.
- **Easy to extend.** Adding a new field is non-breaking.

### Cons
- **Inconsistent inner key names.** Sometimes the data is under `data`, sometimes `records`, sometimes `users`, sometimes inlined at the top level. The frontend can't write a generic API client — every endpoint needs custom parsing.
- **Inconsistent error key.** `message` vs `error` — both are used.
- **No machine-readable error codes.** A frontend can't write `if (err.code === "DUPLICATE_EMAIL")`. It has to grep the message string.

### Recommendation (not done yet)
Standardize on:
```json
{ "success": true, "data": ... }
{ "success": false, "error": { "code": "DUPLICATE_EMAIL", "message": "..." } }
```

This is a "Tier 3" refactor and not safe to do casually because the frontend depends on the current shapes.

---

## 1.7 Pagination — fetching data in chunks

### Analogy: Reading a 1000-page book

You don't read a 1000-page book in one sitting. You bookmark page 50, then come back tomorrow and read 50 more. The bookmark is your "page cursor."

When a user opens the "Employees" page, the app doesn't return all 5000 employees. It returns the first 50. The user clicks "next" → it returns the next 50.

### Two ways to paginate

**Offset-based (`skip` + `take`)** — what this ERP uses:

```typescript
const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
const skip = (page - 1) * limit;

const [records, totalCount] = await Promise.all([
  prisma.formRecord.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    skip,
    take: limit,
  }),
  prisma.formRecord.count({ where: whereClause }),
]);

return NextResponse.json({
  success: true,
  records,
  total: totalCount,
  page,
  limit,
  totalPages: Math.ceil(totalCount / limit),
});
```

**Cursor-based (`cursor: { id: lastSeenId }`)** — not used in this ERP, but better for huge tables:

```typescript
const records = await prisma.formRecord.findMany({
  take: 50,
  cursor: lastId ? { id: lastId } : undefined,
  skip: lastId ? 1 : 0,
  orderBy: { id: "desc" },
});
```

### Pros of offset pagination (what we use)
- **Simple URL format.** `?page=3&limit=50` is human-readable.
- **Random access.** User can jump to page 10 directly without scrolling through pages 1-9.
- **Easy to show "page 3 of 20".** You know the total.

### Cons of offset pagination
- **Slow on large offsets.** `OFFSET 100000` forces Postgres to scan and discard 100,000 rows before returning the page. On a 10M-row table, page 2000 takes seconds.
- **Inconsistent during inserts.** If a new row is inserted while you're on page 2, page 3 might show a row you already saw on page 2. ("Page tearing.")
- **Requires a COUNT.** To show "page 3 of 20", you have to count the entire matching set. On big tables, COUNT is expensive.

### When this matters here
The default limit is 50, max 200. With most tables holding <100k rows per tenant, offset works fine. The audit flagged FormRecord/Attendance/AuditLog as the tables that WILL exceed 1M per tenant — and those are where switching to cursor would help. For now, the new composite indexes (added in the recent audit fix) keep offset pagination fast enough.

---

## 1.8 Prisma query patterns — the 5 shapes you will see everywhere

Once you know these 5 shapes, you can read 90% of the Prisma queries in this codebase.

### Shape 1: `findUnique` — get one row by primary key (or unique field)

```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { id: true, email: true, organizationId: true },
});
```

**Use when:** You have the exact ID (or another `@unique` field like `email`).

**Returns:** A single object, or `null` if not found.

**Pros:**
- Fastest query type. Hits the primary key index directly. O(log n).
- Type-safe — Prisma generates a TypeScript type for the result.

**Cons:**
- Only works on `@unique` fields. You can't `findUnique` on `name`.
- Returns `null` on miss — you must check for it, or you'll get a runtime crash on `user.email`.

### Shape 2: `findFirst` — find one matching row by any criteria

```typescript
const recentLogin = await prisma.loginHistory.findFirst({
  where: { userId, success: true },
  orderBy: { createdAt: "desc" },
});
```

**Use when:** You want the "first one that matches" and don't care if there are more.

**Pros:**
- Flexible — any `where` clause works.
- Useful with `orderBy` to grab "the most recent."

**Cons:**
- Easy to misuse for queries that should return many rows. If you forget the result might be one of many, you can introduce subtle bugs.
- Stops at the first match, but Postgres still might scan many rows if the index doesn't match the order. Always check that your index supports the `orderBy` direction.

### Shape 3: `findMany` — get a list

```typescript
const users = await prisma.user.findMany({
  where: { organizationId: authUser.organizationId },
  include: {
    unitAssignments: { include: { unit: true, role: true } },
    organization: true,
  },
  orderBy: { createdAt: "desc" },
  skip,
  take: limit,
});
```

**Use when:** You want a list, possibly with related data.

**Pros:**
- One query, many results. With `include`, related rows come along for the ride — no N+1.
- Combines pagination, filtering, sorting in one place.

**Cons:**
- `include` can be expensive if you nest deeply. `User → unitAssignments → role → permissions → ...` four levels deep can produce a SQL query that joins 8 tables.
- **`include` returns ALL fields of related rows.** If you only need 2 fields from `unit`, use `select`, not `include`.
- Doesn't tell you the total count. For paginated UIs, you usually need a second `count()` call (see Shape 5).

### Shape 4: `create` (with nested writes)

```typescript
const user = await prisma.user.create({
  data: {
    email,
    password: hashedPassword,
    organizationId: authUser.organizationId,
    unitAssignments: unitId && roleId
      ? { create: { unitId, roleId } }
      : undefined,
  },
  include: {
    unitAssignments: { include: { unit: true, role: true } },
  },
});
```

**Use when:** Creating one parent + related children in one atomic operation.

**Pros:**
- Transactional. Either both rows are created or neither is.
- Type-safe nested writes.

**Cons:**
- Easy to over-nest. Creating 5 levels deep in one call produces a query plan that's hard to debug.
- If a unique constraint fails halfway through the nested writes, the error message points at the inner write but the rollback semantics aren't always obvious.

### Shape 5: Parallel queries with `Promise.all`

```typescript
const [records, totalCount] = await Promise.all([
  prisma.formRecord.findMany({ where, skip, take }),
  prisma.formRecord.count({ where }),
]);
```

**Use when:** Two queries are independent — neither needs the other's result.

**Pros:**
- Both queries run at the same time. Roundtrip time is `max(query1, query2)` instead of `query1 + query2`.
- Especially helpful for "list + total count" patterns where both hit the same `where` clause.

**Cons:**
- **Not transactional.** If one succeeds and the other fails, you've already done partial work. For reads this is usually fine; for writes, use `prisma.$transaction()` instead.
- **Doubles your DB load** when called in hot paths. If the page is slow because the DB is busy, parallelizing doesn't help and may hurt.

### Bonus shape: `prisma.$transaction()` — atomic multi-step writes

```typescript
await prisma.$transaction(async (tx) => {
  await tx.user.update({ where: { id }, data: { status: "INACTIVE" } });
  await tx.userSession.deleteMany({ where: { userId: id } });
  await tx.auditLog.create({ data: { ... } });
});
```

**Use when:** Several writes must succeed or all roll back.

**Pros:** All-or-nothing. No partial-state bugs.

**Cons:** Holds row locks for the duration of the callback. Don't put slow operations (network calls, big computes) inside the transaction.

### "Raw SQL is the escape hatch"

```typescript
const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
  SELECT COUNT(*) as count FROM form_records WHERE form_id = ${formId}
`;
```

Used rarely — for performance-critical aggregations Prisma can't express natively. The `${formId}` interpolation is **parameterized** (safe from SQL injection); concatenating with `+` would be unsafe.

---

## 1.9 Soft delete & TrashBin — how deletes really work

### Analogy: A Windows Recycle Bin

When you "delete" a file on Windows, it doesn't actually erase the bits — it moves to the Recycle Bin. You can restore it within 30 days. After 30 days, it's permanently gone.

That's exactly what `TrashBin` does in this ERP.

### Two delete patterns you'll see

**Pattern A: Hard delete + snapshot to TrashBin** — the standard pattern for most resources.

```typescript
// lib/trash.ts
export async function moveToTrash(resourceType, id, ctx) {
  // 1. Snapshot the row + related rows into JSON
  const snapshot = await defaultSerialize(cfg, id, db);

  // 2. Write the snapshot into TrashBin
  await prisma.trashBin.create({
    data: {
      resourceType,
      resourceId: id,
      organizationId: snapshot.organizationId,
      data: snapshot.data,           // full JSON blob
      deletedBy: ctx.userName,
      deletedAt: new Date(),
    },
  });

  // 3. Hard-delete from the primary table
  await (db as any)[cfg.model].delete({ where: { id } });
}
```

Restoring reverses the process: read the JSON snapshot, recreate the row(s).

**Pattern B: `isActive: false` flag** — used on a handful of models (Role, Permission, LeaveType, etc.).

```typescript
await prisma.leaveType.update({
  where: { id },
  data: { isActive: false },
});
```

Then every query adds `where: { isActive: true }`.

### Pros of Pattern A (TrashBin snapshot)
- **One central place for "recently deleted things."** UI can show a unified Recycle Bin across all resource types.
- **Restore brings back the full graph.** Subforms, fields, sections — everything.
- **Hard-deleted rows free up disk and don't bloat indexes.**
- **No need for `WHERE deletedAt IS NULL` on every query.** Cleaner SQL.

### Cons of Pattern A
- **Restore can fail.** If a foreign key has changed (e.g., the parent module was deleted), restoring the child fails. The transaction rolls back and the user sees an error.
- **JSON snapshots are frozen.** If the schema changes between delete and restore, the old JSON may not match the new columns. Migrations have to be careful.
- **Cascade-on-delete in Prisma still fires.** If you hard-delete a User, all their AuditLog rows cascade-delete too — and the snapshot only saves the User, not the audit history.
- **Polymorphic-ish.** `resourceType` is a string; type safety only at the application layer.

### Pros of Pattern B (`isActive` flag)
- **Simple.** One column toggle.
- **No data movement.** Faster than snapshotting.

### Cons of Pattern B
- **Every query must remember `where: { isActive: true }`.** Forget once → soft-deleted rows leak into the UI.
- **Unique constraints don't account for it.** If you soft-delete role "Manager" and try to create a new role "Manager", the unique constraint blocks you. (The schema audit flagged this as a real issue.)
- **No "who deleted it / when" trail.** The flag doesn't tell you who flipped it.

### Why two patterns coexist
Historical drift. Models that came later got the centralised TrashBin treatment; older models still use the `isActive` flag. The audit recommended consolidating on one approach. Not a current priority.

---

## 1.10 Audit logging — the "who did what when" trail

### Analogy: A bank's transaction ledger

Every time money moves at a bank, a separate ledger writes down: timestamp, who initiated, what happened, before/after balances. The ledger is **append-only**. You can never edit or delete a ledger entry — only add new ones (corrections are a new entry that reverses the old one).

The `audit_logs` table in this ERP is the same idea. Every important action (create form, delete employee, change permission) writes one row.

### The code

After a successful action:

```typescript
import { getRequestMeta, logAudit } from "@/lib/api-helpers";

const { ipAddress, userAgent } = getRequestMeta(request);

await logAudit({
  userId: user.id,
  organizationId: user.organizationId,
  performedBy: user.email,
  action: "Created",
  module: "Form Modules",
  details: `Created module "${name}"${parentId ? " as child module" : ""}`,
  ipAddress,
  userAgent,
  recordId: module.id,
  recordName: name,
});
```

Inside `logAudit()`:

```typescript
try {
  await prisma.auditLog.create({ data: { ... } });
  console.log(`Audit log: ${action} "${recordName}" by ${performedBy}`);
} catch (err) {
  console.error("Audit logging failed:", err);  // NEVER THROW — audit failure must not break the user's action
}
```

### Pros
- **Compliance-ready.** "Show me everything user X did last month" is one query.
- **Debugging gold.** When a customer complains "the form changed itself," you can prove who edited it.
- **Append-only by convention.** No `update` or `delete` on audit_logs from application code.

### Cons
- **Manual.** Every route handler has to remember to call `logAudit()`. Forget it = the action isn't logged. There's no AOP / middleware.
- **The "performedBy" is an email string, not a userId FK.** If the user changes their email later, the audit history shows the old email. (Schema audit flagged this.)
- **Write amplification.** Every business action writes one extra row. On a busy day, audit_logs grows fast — probably the third-biggest table after FormRecord and Attendance.
- **`organizationId` is nullable** on audit_logs. Rows without org leak across the tenant boundary in any "list all audit entries" query. (Audit flagged this.)
- **No retention policy.** Old audit entries live forever unless something sweeps them. At 1M+ rows the table will become a query bottleneck without partitioning.

### What the recent audit added
A composite index `@@index([organizationId, createdAt(sort: Desc)])` so the "show me this org's last 50 audit entries" query is fast even as the table grows.

---

## 1.11 Validation — manual guards, no schema library

### Analogy: A bouncer with a checklist

When you submit a form, the API checks the data before saving. Without checks, the database happily stores `email = "haha"` or `salary = -100`. With checks, those are rejected before the save.

This ERP doesn't use a validation library (no Zod, Yup, Joi). Every check is a manual `if (...) return 400`.

### Example

```typescript
const body = await request.json();

if (!body.email) {
  return NextResponse.json(
    { success: false, error: "Email is required" },
    { status: 400 }
  );
}

if (!/^\S+@\S+\.\S+$/.test(body.email)) {
  return NextResponse.json(
    { success: false, error: "Invalid email format" },
    { status: 400 }
  );
}

if (body.salary && body.salary < 0) {
  return NextResponse.json(
    { success: false, error: "Salary must be non-negative" },
    { status: 400 }
  );
}
```

### Pros
- **Zero dependencies.** No library to learn.
- **Custom logic mixes naturally.** "If type is `lookup`, then `sourceId` is required" — easy to express.

### Cons
- **Hugely repetitive.** Required fields, formats, ranges — the same checks appear in many handlers.
- **Easy to skip.** A new endpoint can simply forget to validate. The TypeScript type doesn't enforce runtime validation.
- **No auto-generated API docs.** With Zod + a tool like `zod-to-openapi`, you get OpenAPI specs for free. Here you have nothing.
- **Inconsistent error messages.** `"Email is required"` here, `"email field cannot be empty"` there. Frontend can't reliably parse them.

### What would be better
Adopt Zod for new endpoints:

```typescript
import { z } from "zod";

const Schema = z.object({
  email: z.string().email(),
  salary: z.number().nonnegative().optional(),
});

const result = Schema.safeParse(body);
if (!result.success) {
  return NextResponse.json(
    { success: false, error: result.error.format() },
    { status: 400 }
  );
}
```

Existing endpoints don't need to be rewritten all at once — Zod can be introduced gradually, route by route.

---

# Part 2 — Auth APIs

> This is the entry point of every user session. All other APIs depend on these working correctly.

---

## 2.1 `GET /api/auth/user` — who am I?

**File:** [app/api/auth/user/route.ts](app/api/auth/user/route.ts)

### What it does
Returns the currently logged-in user's basic profile + their organization + their unit assignments + their resolved permissions. Called once on app load, then cached client-side. If it returns 401, the frontend redirects to the login page.

### Request
- Method: `GET`
- Auth: cookie `auth-token`
- No body

### Response (success)
```json
{
  "success": true,
  "user": {
    "id": "cuid...",
    "email": "alice@example.com",
    "first_name": "Alice",
    "organizationId": "org_...",
    "organization": { "id": "...", "name": "Acme Inc" },
    "unitAssignments": [
      { "unit": { "name": "Sales" }, "role": { "name": "Manager" } }
    ]
  }
}
```

### Database queries used
1. `prisma.userSession.findUnique({ where: { token } })` — validate session.
2. `prisma.user.findUnique({ where: { id }, include: { organization, unitAssignments: { include: { unit, role } } } })` — load user graph.

### Pros
- **Single endpoint = single client-side cache.** The frontend stores this object in a React context and never has to refetch "who am I" within the same session.
- **Includes everything the UI needs to render the chrome** (org name, role name, avatar).

### Cons
- **Big payload.** Loads the full unit-assignment graph even if the current page doesn't need it. ~2-5 KB.
- **Couples auth to org structure.** If you add new unit-assignment fields, this endpoint's response changes — and every cache that depends on it has to be invalidated.
- **No `lastSeenAt` update.** Doesn't refresh the session's expiry; that lives elsewhere.

---

## 2.2 `POST /api/auth/logout` — sign out

**File:** [app/api/auth/logout/route.ts](app/api/auth/logout/route.ts)

### What it does
Deletes the user's current session row from `user_sessions` and clears the `auth-token` cookie on the response.

### Request
- Method: `POST`
- Auth: cookie `auth-token`
- No body

### Response
```json
{ "success": true }
```

### Database queries used
1. `prisma.userSession.delete({ where: { token } })` — kill the session row.

### Pros
- **Truly destroys the session.** Unlike JWT-based logout (which just clears the cookie but leaves the token technically valid until expiry), this one removes the server-side proof.
- **Idempotent.** If the token doesn't exist, the delete is wrapped in try/catch — returns success either way.

### Cons
- **Only kills the current device's session.** A user logged in on 3 devices and clicking "logout" only logs them out of one. There's no "logout everywhere" endpoint exposed (would need `deleteMany` by userId).
- **No audit log entry.** Logging out isn't recorded in `audit_logs`. For security forensics that's a gap.

---

## 2.3 `GET /api/auth/perm-version` — has my permission set changed?

**File:** [app/api/auth/perm-version/route.ts](app/api/auth/perm-version/route.ts)

### What it does
Returns an integer version number that increments every time the current user's permissions change (a role was reassigned, an override was added, etc.). The frontend polls this every few seconds. If the number is different from the last seen, the frontend refetches `/api/auth/user` and `/api/user-permissions`.

### Request
- Method: `GET`
- Auth: cookie `auth-token`

### Response
```json
{ "success": true, "version": 17 }
```

### Database queries used
1. `prisma.user.findUnique({ where: { id }, select: { permVersion: true } })` — read the counter.

### Pros
- **Cheap polling.** Reading one integer is nearly free. Lets the client cache permissions aggressively.
- **Eventual consistency without WebSockets.** If an admin revokes my access, my UI updates within a few seconds without needing pub/sub.
- **Single source of truth.** The number changes when permissions change anywhere in the chain (role, override, unit assignment).

### Cons
- **Polling load.** Multiply by number of logged-in users — even an integer read can hurt at scale (1000 users × 5-second polling = 200 reads/sec).
  - **Mitigation:** could be cached in Redis, but currently isn't.
- **Race window.** Between the version bump and the client's next poll (up to N seconds), the user can do things they no longer have permission for. For high-stakes actions, the server should re-check permissions, not trust the client cache.
- **A bumped version forces a full permission refetch.** Even tiny changes invalidate the whole cache. Could be optimized to send only the diff, but isn't.

---

# Part 3 — Users & Permissions

> The plumbing that lets admins control who exists and what they can do.

---

## 3.1 `GET/POST /api/users` — list & create users

**File:** [app/api/users/route.ts](app/api/users/route.ts) (delegates to [lib/api-handlers/user-management.ts](lib/api-handlers/user-management.ts))

### `GET /api/users` — list

#### What it does
Returns all users in the caller's organization, with their unit/role assignments.

#### Request
- Method: `GET`
- Auth required.
- No body. (Future: pagination query params not yet implemented here.)

#### Response
```json
{
  "success": true,
  "users": [
    { "id": "...", "email": "...", "organization": { ... }, "unitAssignments": [ ... ] }
  ]
}
```

#### Database queries used
```typescript
prisma.user.findMany({
  where: { organizationId: authUser.organizationId },
  include: {
    unitAssignments: { include: { unit: true, role: true } },
    organization: true,
  },
  orderBy: { createdAt: "desc" },
});
```

#### Pros
- **Multi-tenant safe.** The `where` clause locks the result to the caller's org.
- **One query returns the full graph.** No N+1 — `include` joins unit+role for every user in one SQL statement.

#### Cons
- **No pagination.** If an org has 5000 users, this returns all 5000 rows in one response. Slow. Memory-heavy on the client.
  - **Recommendation:** add `?page=&limit=` as a Tier 2 improvement.
- **`include` loads ALL columns of related rows.** `organization` includes 50+ columns even though the UI usually needs just `name`. Use `select` instead.
- **`orderBy: { createdAt: "desc" }` requires the `created_at` index** — Prisma creates this by default when the column is annotated with `@default(now())` so this is fine, but at multi-million rows you'd want a composite index `[organizationId, createdAt]` (recently added in the audit fix).

### `POST /api/users` — create

#### What it does
Creates a new user with optional unit + role assignment. Hashes the password. Requires `MANAGE_USERS` permission.

#### Request
```json
{
  "email": "bob@example.com",
  "password": "...",
  "first_name": "Bob",
  "last_name": "Jones",
  "unitId": "...",
  "roleId": "..."
}
```

#### Response
```json
{ "success": true, "user": { ... } }
```

Status: 201 on success, 409 on duplicate email, 403 on missing permission.

#### Database queries used
```typescript
// 1. Permission check
const canManage = await canManageUsers(authUser.id);

// 2. Duplicate check
const existing = await prisma.user.findUnique({ where: { email } });

// 3. Create + nested unit assignment
const user = await prisma.user.create({
  data: {
    email,
    password: hashedPassword,
    organizationId: authUser.organizationId,
    unitAssignments: unitId && roleId
      ? { create: { unitId, roleId } }
      : undefined,
  },
  include: { unitAssignments: { include: { unit: true, role: true } } },
});

// 4. Audit log
await logAudit({ ... });
```

#### Pros
- **Atomic.** Nested `create` puts user + assignment in one transaction.
- **Permission-gated.** Only users with `MANAGE_USERS` can create new users.
- **Email uniqueness enforced at the DB layer** (the `@unique` constraint on `User.email`).

#### Cons
- **`email` is GLOBALLY unique, not per-tenant.** Two organizations cannot have a user with the same email. For a multi-tenant SaaS that's a real limitation (a person who works at two client companies can't have an account at both). The schema audit flagged this implicitly — it's a design constraint baked in.
- **Password hashing is in the handler, not in a hook.** If you create a user via Prisma directly (not through this endpoint), the password is stored as plaintext. Fragile.
- **The duplicate check is racy.** Between `findUnique` and `create`, another request could insert the same email. The DB unique constraint catches it but the error message returned to the user is "Internal server error" instead of "Email already exists" — confusing UX.
  - **Fix:** wrap the `create` in try/catch and check for Prisma error code `P2002` (unique violation).

---

## 3.2 `GET/PATCH/DELETE /api/users/[id]` — read, update, delete one user

**File:** [app/api/users/[id]/route.ts](app/api/users/%5Bid%5D/route.ts)

### `GET` — fetch one user
Loads a single user by ID. Verifies the user belongs to the caller's org before returning.

#### Database query
```typescript
prisma.user.findUnique({
  where: { id: targetUserId },
  include: { unitAssignments: { include: { unit, role } }, organization: true },
});
// then: if (user.organizationId !== authUser.organizationId) return 404;
```

#### Pros
- Cross-tenant safe via the org check.

#### Cons
- **Returns 404 even when the user exists in another tenant.** Intentional (don't leak existence) but can confuse developers.

### `PATCH` — update profile
Updates the user's profile fields. Selectively updates only what's in the body. Requires `MANAGE_USERS` (or being the user yourself for self-updates — check the handler for the exact rule).

#### Database query
```typescript
prisma.user.update({
  where: { id },
  data: { first_name, last_name, phone, ... },
});
```

#### Pros
- **Partial updates.** Only the fields you send are touched.

#### Cons
- **No optimistic concurrency.** Two simultaneous PATCH requests will last-write-wins. For a fast-moving HR system, that can clobber data.
  - **Fix:** add a `version` column and check it on update.
- **No audit comparison.** The audit log says "Updated user X" but not "changed phone from A to B." Forensics is harder.

### `DELETE` — remove user
Soft-deletes via `moveToTrash("User", userId, ctx)`. The user's sessions are killed. The user's data is snapshotted into TrashBin.

#### Pros
- **Recoverable.** Admin can restore within the trash retention window.

#### Cons
- **Cascade chain on hard delete is destructive.** Deleting a user cascades to many tables (AuditLog, Activity, AgentProfile → Wallet → LedgerEntry, etc.). The schema audit flagged this — a financial wallet should never cascade-delete from a user. Currently it does.

---

## 3.3 `GET/POST /api/permissions` — permission catalog

**File:** [app/api/permissions/route.ts](app/api/permissions/route.ts)

### What it does
- `GET`: list all available permissions in the org (the catalog from which roles are built).
- `POST`: define a new permission (admin only).

### Database queries
```typescript
// GET
prisma.permission.findMany({
  where: { organizationId: authUser.organizationId, isActive: true },
  orderBy: { name: "asc" },
});

// POST
prisma.permission.create({
  data: { name, resource, category, organizationId, ... },
});
```

### Pros
- Permissions are first-class rows, not strings hardcoded in app code. New permissions can be defined without a code deploy.

### Cons
- **`Permission.name` is globally unique, not per-org** (schema audit flagged this). If org A defines a permission called "MANAGE_REPORTS", org B can never define their own.
  - **Status:** flagged for Tier 2 fix; not done yet because existing rows may collide.
- **No protection against deleting a permission that's referenced by a role.** Prisma's referential-action defaults may RESTRICT or SET NULL depending on schema definition — verify before deleting permissions in production.

---

## 3.4 `GET /api/user-permissions` — what can the current user do?

**File:** [app/api/user-permissions/route.ts](app/api/user-permissions/route.ts)

### What it does
Returns the **resolved** permission set for the current user — flattening admin status, role grants, and overrides into a single list of permission names the user holds.

### Response
```json
{
  "success": true,
  "permissions": ["READ_FORMS", "WRITE_FORMS", "MANAGE_USERS"]
}
```

### Database queries (the heavy one)
This endpoint runs the same algorithm as `hasPermission()` but returns the full list:
1. Check admin flag.
2. Load all `RolePermission` rows for the user's roles.
3. Load all `UserPermissionOverride` rows for the user.
4. Apply override-beats-grant resolution.

Roughly 3-4 queries per call.

### Pros
- **Resolves everything in one trip.** Frontend gets the final list, no client-side resolution needed.
- **Backs the version-counter pattern.** Combined with `/api/auth/perm-version` polling, the client cache stays correct.

### Cons
- **3-4 queries per call** is heavy if hit on every page load. The version-counter pattern softens this — most calls are cached.
- **No filtering.** Returns the full set even if the caller just needs to check one permission. Could be smaller.
- **The resolved list grows linearly with role complexity.** Users assigned to 5 units inheriting 30 permissions each will have a 150-item list. Mostly harmless but wasteful.

---

## 3.5 `POST /api/user-permission-overrides` — explicit deny/allow

**File:** [app/api/user-permission-overrides/route.ts](app/api/user-permission-overrides/route.ts)

### What it does
Creates a per-user override that wins over role grants. Used for exceptions ("Alice has the Sales role but also needs Reports access").

### Request
```json
{
  "userId": "...",
  "permissionId": "...",
  "type": "ALLOW" | "DENY"
}
```

### Database queries
```typescript
prisma.userPermissionOverride.create({
  data: { userId, permissionId, type, createdById: authUser.id },
});

// Bump permission version for affected user
prisma.user.update({
  where: { id: userId },
  data: { permVersion: { increment: 1 } },
});
```

### Pros
- **Bumps the version counter** so the target user's UI refreshes within a few seconds (next poll of `/api/auth/perm-version`).
- **Deny beats grant.** Strict-by-default — safe.

### Cons
- **No expiry.** "Give Alice temporary access for one day" requires manual cleanup. Should have an optional `expiresAt` column.
- **Two simultaneous overrides for the same user+permission can race.** The schema has no `@@unique([userId, permissionId])` enforced as a constraint here. Two clicks → two rows → unclear which one wins (probably the most recent).

---

## 3.6 `GET /api/user-role-permissions` — role-based resolved permissions

**File:** [app/api/user-role-permissions/route.ts](app/api/user-role-permissions/route.ts)

### What it does
Like `/api/user-permissions` but returns only the role-derived portion — skipping overrides. Used by the admin UI to show "what does this role grant by itself, before any user-specific tweaks?"

### Pros
- Helps admins reason about role design separately from per-user exceptions.

### Cons
- **Easy to confuse with `/api/user-permissions`** which returns the FULL resolved set. Naming convention could be better.

---

# Part 4 — Forms (the biggest domain)

> Forms are the heart of this ERP. Every business process — leave applications, payroll inputs, customer records, leads — is a Form with custom Fields. This domain is the most complex.

---

## 4.1 `GET/POST /api/forms/[formId]/records` — read & create records

**File:** [app/api/forms/[formId]/records/route.ts](app/api/forms/%5BformId%5D/records/route.ts) — 800+ lines, the most complex route in the codebase.

### What it does
- `GET`: list records for a form, paginated, with per-field permission filtering applied. Returns the form metadata + field definitions + records.
- `POST`: create a new record. Fires workflow rules. Writes to FormRecord + FormRecordField shadow table.

### `GET` — list records

#### Request
```
GET /api/forms/{formId}/records?page=1&limit=50
```

#### Response
```json
{
  "success": true,
  "form": { "id": "...", "name": "Leave Application" },
  "formFieldsWithSections": [ ... ],
  "records": [ ... ],
  "total": 123,
  "page": 1,
  "limit": 50,
  "totalPages": 3
}
```

#### Database queries used
```typescript
// 1. Load form structure (form + module + sections + fields + subforms + tableMapping)
const form = await prisma.form.findUnique({
  where: { id: formId },
  include: {
    module: { select: { organizationId: true } },
    sections: { include: { fields: { orderBy: { order: "asc" } } } },
    subforms: { ... deep nesting ... },
    tableMapping: true,
  },
});

// 2. Cross-tenant guard
if (form.module.organizationId !== authUser.organizationId) return 403;

// 3. Permission resolution — what fields can the user see?
const [rolePerms, userPerms] = await Promise.all([
  prisma.rolePermission.findMany({ where: { ... } }),
  prisma.userPermission.findMany({ where: { ... } }),
]);

// 4. Records + count (parallel)
const [records, totalCount] = await Promise.all([
  prisma[modelName].findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    skip, take: limit,
  }),
  prisma[modelName].count({ where: whereClause }),
]);

// 5. Per-field redaction loop (in-memory) before returning
```

Note `modelName` — this route dynamically picks between `formRecord` and `formRecord1..15` based on the form's `tableMapping`. The 15 sharded record tables are the schema audit's #1 flagged issue.

#### Pros
- **Permission-aware reads.** Fields the caller can't see are stripped from the response server-side. Frontend never sees what it shouldn't.
- **Single endpoint for both the schema (form definition) and the data (records).** Frontend can render the table in one fetch instead of two.
- **Parallel count + list.** `Promise.all([findMany, count])` is fast.

#### Cons
- **The most complex route in the codebase.** 800+ lines. Hard to maintain. Mixes responsibilities: load form, resolve perms, query records, redact fields, format response.
- **15 different record tables** (FormRecord, FormRecord1..15) → dynamic `prisma[modelName]` access bypasses Prisma's type safety. A typo or wrong table picks a different shard's data.
- **`include` of subforms is deeply nested.** Generates a SQL query joining many tables. Slow on big forms.
- **Per-field redaction is in JavaScript, not SQL.** The DB returns all fields; the server walks every record and strips disallowed ones. Bandwidth wasted, memory heavy on large pages.
- **No filtering or search in the URL.** Want "records where status = pending"? Not supported here — would need to be added as a `?filter=` param.

### `POST` — create record

#### Request
```json
{
  "recordData": {
    "fieldId1": "value",
    "fieldId2": 42,
    ...
  }
}
```

#### Database queries used
1. Load form structure (same as GET).
2. Per-field validation (required, type, range).
3. `prisma[modelName].create({ data: { recordData: ..., ... } })`.
4. For each "indexed" field, also write a row to `FormRecordField` (the EAV shadow table).
5. Fire workflow rules — may trigger notifications, function executions, audit log writes.
6. `logAudit()`.

#### Pros
- **Validation before persist.** Required + type + range checks catch bad input.
- **Workflow rules fire automatically.** Adding a record can email/notify the right people without code changes.

#### Cons
- **Steps 4-5 are best-effort.** If the FormRecordField write fails after the main record was created, the main record is still saved but the indexed-field shadow is inconsistent. No transaction wrapper.
  - **Fix:** wrap in `prisma.$transaction`.
- **Workflow execution is synchronous.** A slow workflow rule (e.g., one that calls an external API) blocks the user's submit response. Should be queued.
- **The chosen record table is dynamic.** A bug in routing logic could write to the wrong shard. Schema audit recommended consolidating to a single FormRecord.

---

## 4.2 `POST /api/forms/[formId]/submit` — public form submission

**File:** [app/api/forms/[formId]/submit/route.ts](app/api/forms/%5BformId%5D/submit/route.ts)

### What it does
Submits a form record without requiring login — used for public-facing forms like job applications or contact forms.

### Pros
- Lets you collect data from the public without forcing them to sign up.
- Skips the auth check, so frontend code can use a simple HTML form.

### Cons
- **`Form.allowAnonymous` defaults to `true`** (schema audit flagged this). Every new form is publicly submittable unless an admin explicitly locks it.
- **No CAPTCHA.** Vulnerable to spam submissions.
- **Rate limits aren't visible in the code.** If an attacker hammers `/submit`, the DB grows unbounded.
- **Date-past validation** (won't accept leave start dates in the past) is hardcoded by field-label substring matching — fragile. If someone renames a field, the rule silently breaks.

---

## 4.3 `GET /api/forms/[formId]/full` — load form + sections + fields + subforms in one request

**File:** [app/api/forms/[formId]/full/route.ts](app/api/forms/%5BformId%5D/full/route.ts)

### What it does
Returns the complete form schema — everything needed to render the form builder or the record-entry UI.

### Pros
- **One round-trip to render the form.** Avoids N+1 between sections, fields, subforms.

### Cons
- **Returns everything even if the caller only needs a portion.** No `?fields=` projection.
- **Big payload on complex forms.** A form with 200 fields and 5 subforms can be 50+ KB.

---

## 4.4 `GET/POST /api/forms/[formId]/fields` — manage fields

**Files:** [app/api/forms/[formId]/fields/route.ts](app/api/forms/%5BformId%5D/fields/route.ts), [app/api/forms/[formId]/fields/[fieldId]/route.ts](app/api/forms/%5BformId%5D/fields/%5BfieldId%5D/route.ts)

### What it does
CRUD on individual fields within a form. Used by the form builder UI.

### Pros
- Field-level operations don't require resending the entire form schema.

### Cons
- **Field operations don't validate the impact on existing records.** Deleting a field doesn't clean up existing record values referencing that field — orphan JSON keys live forever in `recordData`.
- **No transaction protection** when reordering many fields at once.

---

## 4.5 `POST /api/forms/[formId]/move` & `/reorder` — drag-and-drop in the form builder

**Files:** [app/api/forms/[formId]/move/route.ts](app/api/forms/%5BformId%5D/move/route.ts), [app/api/forms/[formId]/reorder/route.ts](app/api/forms/%5BformId%5D/reorder/route.ts)

### What it does
- `move`: move a form to a different module/parent.
- `reorder`: change the `order` integer on multiple forms in one call.

### Pros
- **Bulk reorder is one request.** Without it, dragging 10 forms = 10 PATCH calls.

### Cons
- **The `order` field uses integers** — moving an item between positions 3 and 4 forces renumbering all subsequent items. At thousands of forms, expensive.
  - **Better:** use a `position` decimal where you can pick `(3 + 4) / 2 = 3.5` without renumbering anything. Schema change required.

---

## 4.6 `GET /api/forms/[formId]/analytics` — counts & funnel

**File:** [app/api/forms/[formId]/analytics/route.ts](app/api/forms/%5BformId%5D/analytics/route.ts)

### What it does
Returns submission counts by status, by day, by source — for the form analytics dashboard.

### Pros
- Aggregates on the DB side (not the client), so the JS payload is small.

### Cons
- **Counts run on every request.** No caching. On a form with millions of records, the aggregate query is slow.
  - **Fix:** materialized view refreshed nightly, or Redis cache with a 60-second TTL.
- **No date-range filter in the URL.** Returns all-time stats; cannot ask "this week only."

---

## 4.7 `POST /api/forms/[formId]/export` — CSV/XLSX download

**File:** [app/api/forms/[formId]/export/route.ts](app/api/forms/%5BformId%5D/export/route.ts)

### What it does
Exports form records as CSV or Excel. For large forms, kicks off an async job (`ExportJob` table) and returns a job ID the client polls.

### Pros
- **Async for big exports.** A 100k-row export doesn't tie up the HTTP request.
- **Permission-aware.** Same field-redaction as the GET records endpoint.

### Cons
- **No streaming.** The whole CSV is built in memory before being written. A 500MB export uses 500MB of server RAM.
  - **Fix:** stream rows from Prisma to the response.
- **The job model doesn't carry an `organizationId` column** (schema audit flagged this for `ExportJob`/`ImportJob`) — cross-tenant safety relies on app-layer joins.

---

## 4.8 Subforms — `GET/POST /api/subforms/[subformId]/records`

**File:** [app/api/subforms/[subformId]/records/route.ts](app/api/subforms/%5BformId%5D/records/route.ts)

### What it does
Subforms are nested record tables inside a parent form (e.g., "Order" with a "Line Items" subform). This endpoint manages records in a subform.

### Pros
- Lets one form embed many-to-one relationships without a separate full Form.

### Cons
- **Subforms have their own record table (`SubformRecord`)** distinct from FormRecord, doubling the complexity of the data layer.
- **No `organizationId`** column on SubformRecord — cross-tenant safety again relies on joining through Subform → Form → Module.

---

# Part 5 — Attendance

> Punch-in / punch-out, geofencing, face match, half-day logic, auto-checkout. One of the most actively used domains.

---

## 5.1 `POST /api/forms/[formId]/attendance/checkin` — punch in

**File:** [app/api/forms/[formId]/attendance/checkin/route.ts](app/api/forms/%5BformId%5D/attendance/checkin/route.ts)

### What it does
Records a check-in for the current user. Checks: not already checked in today, within geofence, IP whitelist passes, face match succeeds (if enabled).

### Database queries used
1. Load `AttendanceConfiguration` for the org.
2. `prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } })` — already checked in?
3. Geofence + IP + face checks (validation, not DB).
4. `prisma.attendance.upsert` — create the row.
5. `logAudit`.

### Pros
- **Single source of truth.** One row per (user, date) — the `@@unique([userId, date])` constraint enforces it.
- **Policy-driven.** Geofence radius, allowed IPs, face-match threshold all configurable per org.

### Cons
- **Date is stored as a string** (`"2026-05-27"`). Date arithmetic is fragile. Schema audit flagged it.
- **Face match runs synchronously.** A slow ML inference call blocks the punch.
- **Auto-checkout from yesterday is handled by a separate cron job.** If the cron doesn't run, yesterday's row stays "checked in" and today's check-in conflict logic gets confused.

---

## 5.2 `POST /api/forms/[formId]/attendance/checkout` — punch out

**File:** [app/api/forms/[formId]/attendance/checkout/route.ts](app/api/forms/%5BformId%5D/attendance/checkout/route.ts)

### What it does
Updates today's attendance row with check-out time, computes worked hours, applies overtime rules.

### Pros
- Computes derived fields (hours, late, OT) at write time, so reads are fast.

### Cons
- **Computed fields are denormalized.** If the policy changes (e.g., overtime threshold drops from 9h to 8h), already-written rows still use the old computation. Need a backfill job.
- **One row per day, growing 30 columns wide.** Schema audit recommended splitting into Attendance (header) + AttendancePunch (one row per punch event).

---

## 5.3 `GET /api/attendance/status` — am I currently checked in?

**File:** [app/api/attendance/status/route.ts](app/api/attendance/status/route.ts)

### What it does
Returns the current user's attendance row for today. Used by the dashboard widget to show "Check In" or "Check Out" button.

### Pros
- One quick lookup. Cheap.

### Cons
- **Called frequently** — every page navigation often refetches. Should be cached.

---

## 5.4 `GET/PATCH /api/attendance-config` — org-wide attendance policy

**File:** [app/api/attendance-config/route.ts](app/api/attendance-config/route.ts)

### What it does
Read or update the org's `AttendanceConfiguration` row (40+ columns).

### Pros
- One row per org keeps lookups O(1).

### Cons
- **40+ columns in one table** (schema audit flagged this). Should be split into AttendanceCorePolicy + AttendanceFaceConfig + AttendanceReportConfig for clarity.
- **JSON columns for approver-role IDs and IP whitelist** — when a role is deleted, the JSON isn't updated.

---

# Part 6 — Leaves & Payroll

> Apply for leave, see your balance, see your monthly payslip. Tied to attendance (worked days = present + leave).

---

## 6.1 `GET/POST /api/leaves` — apply for leave

**File:** [app/api/leaves/route.ts](app/api/leaves/route.ts)

### What it does
- `GET`: list leave requests for the org (or for the current user if not admin).
- `POST`: apply for leave. Validates: dates in the future, enough balance, not overlapping with existing approved leaves.

### Pros
- Balance check + overlap check are server-side enforced, not just UI.
- Half-day support is built in.

### Cons
- **`startDate`/`endDate` are strings** — date arithmetic is hacky. Schema audit flagged this.
- **Overlap detection** scans all approved leaves for the user. Without a range index, this is slow.
- **Balance is denormalized** in `LeaveBalance` rows. If `LeaveAllocation` and `LeaveRequest` get out of sync, the balance is wrong. No reconciliation job.
- **No cancellation flow exposed here** — uses a separate `PATCH` to set `status: CANCELLED`.

---

## 6.2 `GET/POST /api/payroll/leave-type` — leave type catalog

**File:** [app/api/payroll/leave-type/route.ts](app/api/payroll/leave-type/route.ts)

### What it does
CRUD on LeaveType (Casual, Sick, etc.).

### Pros
- Custom leave types per org.

### Cons
- **`LeaveType.code` is globally unique** (schema audit flagged this). Two orgs can't both have a "CL" leave type code.

---

## 6.3 `GET /api/payroll/records` — monthly payslips

**File:** [app/api/payroll/records/route.ts](app/api/payroll/records/route.ts)

### What it does
Returns PayrollRecord rows for an employee or for the whole org for a month.

### Pros
- One row per (employee, month, year) — easy to look up.
- `@@unique([employeeId, month, year])` enforces idempotency.

### Cons
- **Allowances/deductions are JSON blobs.** Cannot query "how much PF was deducted org-wide this month" without parsing JSON.
- **Decimal precision is missing on amount fields** (schema audit flagged this). Default Decimal(65,30) is wasteful.

---

## 6.4 `GET/PATCH /api/payroll/config` — payroll engine settings

**File:** [app/api/payroll/config/route.ts](app/api/payroll/config/route.ts)

### What it does
Read/update the org's `PayrollConfiguration` — which forms feed payroll, field mappings, etc.

### Pros
- Centralized policy lives in one row.

### Cons
- **JSON-heavy.** Every config piece is a JSON column — no schema validation at the DB.
- **Changes don't auto-trigger payroll recomputation.** If you change the mapping, existing payslips stay stale until manually re-run.

---

## 6.5 `GET /api/holidays` — public holiday calendar

**File:** [app/api/holidays/route.ts](app/api/holidays/route.ts)

### What it does
Returns Holiday rows for the org. Read by attendance widget (skip punch on holidays) and payroll (count holidays as paid days).

### Pros
- One row per (org, date) — easy lookup.
- `@@unique([organizationId, date])` enforces no duplicates.

### Cons
- **Date is a string** (audit flagged).
- **No region/branch differentiation.** A multi-state company can't say "Diwali is a holiday in Mumbai office only."

---

# What's next

You've reached the end of **Session 1's installment**. What's covered:

1. **Part 1 — Foundations**: every cross-cutting pattern (auth, multi-tenant, Prisma, errors, responses, pagination, soft delete, audit, validation). Read these first; everything else builds on them.
2. **Part 2 — Auth APIs**: 3 endpoints — login state, logout, permission-version polling.
3. **Part 3 — Users & Permissions**: 6 endpoint groups covering user CRUD and the permission resolution chain.
4. **Part 4 — Forms**: 8 endpoint groups in the largest domain — records, submit, full form load, fields, drag-drop, analytics, export, subforms.
5. **Part 5 — Attendance**: 4 endpoints — checkin, checkout, status, config.
6. **Part 6 — Leaves & Payroll**: 5 endpoint groups.

**~30 endpoints documented in depth. ~298 remain.**

To continue documentation in a future session, ask me to "document the [DOMAIN] APIs" and I'll add the next part. Suggested order:
- Real estate (highest business value, complex commission logic)
- HR (employees, jobs, applications, offers — internal pipeline)
- Inventory & products (operational CRUD, simpler patterns)
- Workflow rules + function bindings (the most complex automation logic)
- Engagement, AI/chat, notifications, trash, master data, etc.

### Tip when reading the remaining 298 endpoints yourself
Every one of them is some combination of the patterns in Part 1. Look for:
1. `getAuthenticatedUser()` at the top → auth.
2. `authUser.organizationId` in the `where` clause → multi-tenancy.
3. `canX()` or `hasPermission()` calls → authorization.
4. `findMany` / `findUnique` / `create` shapes → standard CRUD.
5. `logAudit()` near the end → audit trail.

If you see all 5, the endpoint is "boring CRUD" and you can skim. If any are missing, that's where the interesting (or risky) logic lives.

---

# Appendix — Cache Architecture (Upstash + In-Process)

> Everything you need to know to add caching to a new endpoint or migrate a service to its own Upstash DB.

## Three-tier cache model

```
┌──────────────┐        ┌─────────────┐        ┌──────────────┐
│  L1: Process │────▶───│ L2: Upstash │────▶───│ L3: Postgres │
│  Map (~µs)   │        │  (~ms)      │        │  (truth)     │
└──────────────┘        └─────────────┘        └──────────────┘
        ▲                      ▲                       │
        │  populate            │  populate             │
        └──────────────────────┴───────────────────────┘
```

Reads check L1 → L2 → L3 in that order. Writes (`cacheSet`) populate L2; L1 is populated as a side effect of reads. Invalidations clear both L1 and L2.

## Namespaces — current production topology

Every cache key belongs to a namespace. The deployment is currently **Phase C** — heavy namespaces have dedicated Upstash DBs; light ones share the default.

| Namespace | Upstash DB hostname | What it caches |
|---|---|---|
| `auth` | `bright-alpaca-106958.upstash.io` | session tokens, user lookups, permission IDs |
| `forms` | `optimal-beetle-106975.upstash.io` | form schema, sections, fields, lookup-source data |
| `hr` | `workable-oyster-96710.upstash.io` | employee summary, payroll config, attendance config |
| `lookup` | `nearby-herring-80928.upstash.io` (default) | static lookup tables (rarely change) |
| `workflow` | `nearby-herring-80928.upstash.io` (default) | workflow rule definitions |
| *any new namespace* | `nearby-herring-80928.upstash.io` (default) | falls back to default until given its own URL |

**Failure isolation guarantee:** an outage on `bright-alpaca` only kills auth caching; HR and forms continue serving from their own DBs. An outage on `nearby-herring` only kills the default-fallback namespaces; auth/forms/hr keep working.

### Adding a new namespace

1. Add it to the `Namespace` union in [lib/redis.ts](lib/redis.ts).
2. Add a `NAMESPACES` entry with its `envVar`.
3. Use `buildKey("yourNamespace", "entity", id)` from [lib/cache.ts](lib/cache.ts).

## Key shape

```
erp:v1:auth:perm-id:VIEW
└─┬─┘ └┬┘ └─┬─┘ └──┬──┘ └─┬┘
 │   │    │     │    └─ id
 │   │    │     └─ entity
 │   │    └─ namespace
 │   └─ cache-version (bump in lib/cache.ts to invalidate everything)
 └─ app prefix (lets one Upstash DB serve multiple apps)
```

**Always use `buildKey(namespace, entity, id, variant?)`** — never concatenate by hand.

## The five operations you need

```typescript
import { buildKey, cached, cacheGet, cacheSet, cacheInvalidate, cachedSWR, cacheMget } from "@/lib/cache";

// 1. Get-or-compute (the 95% case)
const form = await cached("forms", buildKey("forms", "full", id), 600, () =>
  prisma.form.findUnique({ where: { id }, include: { ... } })
);

// 2. Explicit get/set when you need control
const cachedVal = await cacheGet<MyType>("hr", buildKey("hr", "employee", id));
await cacheSet("hr", buildKey("hr", "employee", id), value, 300);

// 3. Invalidate on write
await prisma.form.update({ where: { id }, data });
await cacheInvalidate("forms", buildKey("forms", "full", id));

// 4. Stale-while-revalidate (hot keys where instant > fresh)
const dashboard = await cachedSWR("hr", buildKey("hr", "dashboard", orgId),
  /* freshSeconds */ 30,
  /* staleSeconds */ 300,
  () => buildDashboard(orgId)
);

// 5. Batch read (one round-trip for many keys)
const keys = ids.map(id => buildKey("hr", "employee", id));
const employees = await cacheMget<Employee>("hr", keys);
```

## Best practices baked in

| Practice | Where it's enforced |
|---|---|
| Every cache error is swallowed — never crashes a request | `try/catch` in every `lib/cache.ts` op |
| Every `cacheSet` requires a TTL — no infinite keys | `if (ttlSeconds <= 0) return` guard |
| Big values (>256KB) log a warning | `MAX_VALUE_BYTES` check in `cacheSet` |
| Cache writes are fire-and-forget — never slow a request | `void cacheSet(...)` in `cached()` |
| Connections de-dupe by URL — namespaces sharing a DB share one TCP connection | `clientRegistry` keyed by URL in [lib/redis.ts](lib/redis.ts) |
| Pattern deletes use `SCAN`, not `KEYS` — safe on big keyspaces | `cacheInvalidatePattern` |
| App boot never blocks on Redis | `lazyConnect: true` |
| A single stuck command can't hang a request for >5s | `connectTimeout: 5000, maxRetriesPerRequest: 2` |
| No request stalls during a sustained Redis outage | `enableOfflineQueue: false` |
| Bumping the cache schema invalidates everything | `CACHE_VERSION` constant in `lib/cache.ts` |

## When to invalidate

| You did | You must invalidate |
|---|---|
| `prisma.X.update(...)` on a cached row | the row's cache key |
| `prisma.X.delete(...)` | the row's cache key (and any list-of-X keys) |
| `prisma.X.create(...)` | any list-of-X keys (the new row needs to appear in the list) |
| Permission name renamed | call `invalidatePermissionCache(oldName)` AND `invalidatePermissionCache(newName)` |
| Schema migration changes a cached value's shape | bump `CACHE_VERSION` in [lib/cache.ts](lib/cache.ts) |

**Rule of thumb:** if you can't write the invalidation in the same commit as the write, don't add the cache yet.

## When you can skip cache invalidation

- Values that are derived from immutable inputs (e.g., resolved formula output for a closed PayrollRecord).
- Values that are short-TTL (≤60s) AND staleness is acceptable.
- "Not found" results that should remain stale (returning "doesn't exist" is the safe direction).

## Failure modes & recovery

| Scenario | Behavior | Action |
|---|---|---|
| Upstash unreachable | Logs once. Reads return `null` (fall through to DB). App keeps working. | Check Upstash dashboard. |
| Single command times out | Logs once. Returns `null` to caller. | If frequent, raise `connectTimeout`. |
| Stale value served after write (forgot to invalidate) | User sees old data up to TTL seconds | Add invalidation in the write path; clear with `cacheInvalidatePattern`. |
| Cache poisoned / wrong shape | Reads succeed but consumers crash | Bump `CACHE_VERSION` in `lib/cache.ts` — instantly invalidates everything. |
| Hit rate < 80% | Cache isn't earning its cost | Profile what's being cached; consider TTL/key-shape tuning. |

## Operational checklist for production

- [ ] Rotate the Upstash token (already in this chat → treat as compromised)
- [ ] Use **different Upstash DBs per environment** (dev, staging, prod) — never share
- [ ] Set an alert on Upstash dashboard for command rate (defends against runaway loops caching too much)
- [ ] Watch the Redis `Used Memory` graph — if it climbs past 70% of the DB limit, tune TTLs down
- [ ] When you add a new namespace, also add it to `Namespace` in [lib/redis.ts](lib/redis.ts) — TypeScript won't let you misspell it
- [ ] Don't cache anything user-input-keyed without first sanitizing the input (cache-key collision / injection)
