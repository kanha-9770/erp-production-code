# Performance Audit — ERP Production Code

**Date:** 2026-06-01
**Scope:** Whole application — DB/Prisma layer, API routes, React rendering, client data-fetching (RTK Query), Redis/auth/middleware, and bundle/Next.js config.
**Method:** Six parallel domain audits over the real codebase. Every finding cites `path:line`, a severity, the actual evidence, the impact, and a concrete fix. No generic advice.

> Stack context that shapes the findings: Next.js App Router, Prisma + **remote** Supabase Postgres (every query is a network round-trip), Upstash Redis (4 DBs, **drops idle connections**), RTK Query on the client, PM2 cluster on a VPS. Records live in **15 partitioned `FormRecord` tables** (`form_records_1..15`); app users are JSON inside `form_records_15`.

---

## Executive summary — the real red flags

The single biggest systemic cost is the **15/16-partition `FormRecord` design**: many hot read paths either probe up to 15 tables sequentially, run a 13-way `COUNT(*)`, or select a 16-way `_count` per form. The second systemic cost is **recomputing auth/permission state from the DB on nearly every request** instead of reading the already-cached session/cookie. The third is **app-wide React re-renders** from unmemoized context values, and **client fetches that bypass the RTK cache**.

### Critical findings (fix first)

| # | Finding | Location | Why it's critical |
|---|---------|----------|-------------------|
| C1 | 13× `COUNT(*)` to pick a shard on form first-write | `lib/database/DatabaseTransforms.ts:293` | 13 full seq-scans on the create path; grows with data |
| C2 | `getFormRecords` legacy fallback: full scan + search applied *after* `take` | `lib/database/DatabaseRecords.ts:366` | Double query per list; search silently wrong + scans JSON in Node |
| C3 | `getLinkedRecords` loads **all** forms (no `where`) + per-form count N+1 | `lib/database/DatabaseRecords.ts:974,1121` | Multi-second, timeout-prone; scales with forms × partitions |
| C4 | `getEmployeesWithPermissions` nested N+1 (per-user + per-permission module lookups) + unbounded user scan | `lib/database/DatabaseRoles.ts:1025` | ~U×(2+P×2) round-trips; hang risk |
| C5 | `/api/modules` loads full module/form/section/field tree + 16-way `_count`, **unscoped by org**, uncached | `lib/database/DatabaseModules.ts:129` | ~16·N count subqueries per app load; cross-tenant scan |
| C6 | `PermissionContext` value is a new object every render → re-renders every consumer app-wide | `context/PermissionContext.tsx:12` / `hooks/usePermissions.ts:392` | Cascading re-renders across the whole shell |
| C7 | `renderFieldEditor` non-memoized prop defeats `RecordCell` memo → every cell re-renders | `components/modules/recordsDisplay.tsx:595` | Whole grid re-renders on every keystroke/selection |
| C8 | App-wide permission fetch uses raw `fetch()` in `useEffect`, bypassing RTK cache | `hooks/usePermissions.ts:155` | No dedup/cache; re-fires on every provider remount |
| C9 | `isUserAdmin` runs 2 uncached DB queries, called from ~90 sites | `lib/api-helpers.ts:99` | Largest avoidable Postgres load; data already in session/cookie |

### Cross-cutting themes
1. **Partition fan-out** (C1, C2, C3, C5, DB §3/§8) — the dominant DB cost. A form lives in exactly one shard, yet code repeatedly probes/counts all 15–16.
2. **Auth recomputed per request** (C9, API §1/§10, Redis §5.1/§5.7/§5.11) — `isUserAdmin`, `computeRouteMeta`, and `buildAuthMeta` re-query data already on the cached session or `auth-meta` cookie.
3. **Unmemoized context → re-render storms** (C6, React §2).
4. **Raw `fetch` + over-broad RTK tag invalidation** (C8, RTK §2/§6/§7/§8/§9).
5. **Hot-path `console.log`** (Redis §5.2/§5.3, API §1) — synchronous blocking I/O per request/row on PM2.
6. **Unbounded `findMany` (no `where`/`take`), often cross-tenant** (DB §7, API §3/§8).
7. **Polling stampedes** — `perm-version` every 15s/tab (API §5, Redis §5.4), attendance every 60s ×N mounts (RTK §3).
8. **Client-heavy bundle** — 437 `"use client"` files, eager recharts/jspdf, image optimization disabled (Bundle §1/§2/§3/§6).

**Severity legend:** Critical = can hang/timeout or scales badly with tenant size · High = significant cost on hot paths · Medium = noticeable, bounded · Low = polish.

---

## 1. Database / Prisma

### 1.1 `getFormRecordTable` runs 13 full-table `COUNT(*)`s on every new-form first write — **Critical**
- **Location:** `lib/database/DatabaseTransforms.ts:293-307` (also `createFormRecord:194`)
- **Evidence:** `const tableCounts = await Promise.all([prisma.formRecord1.count(), … prisma.formRecord13.count()]); const minCount = Math.min(...)`
- **Impact:** Counts every row in 13 partitions (each a full seq-scan on Postgres) just to pick the "least used" shard. Scales to multi-second as partitions grow.
- **Fix:** Pick the shard by a cheap deterministic hash of `formId` (`hash(formId) % 13 + 1`); the mapping is created once and cached in `formTableMapping` anyway. Or maintain a running counter table.

### 1.2 `getFormRecords` ignores pagination on the legacy fallback and searches *after* `take` — **Critical**
- **Location:** `lib/database/DatabaseRecords.ts:366-402`
- **Impact:** (a) Unified query returns 0 → legacy query runs too (two round-trips/list). (b) `search` filters in Node *after* `take: limit`, so it only searches the current page of 50 — wrong results AND full JSON serialization per row.
- **Fix:** Resolve the storage table once from `formTableMapping` and query only it. Push `search` into SQL (`ilike` / JSONB) so filter + pagination happen in Postgres.

### 1.3 `getFormRecord`/`updateFormRecord`/`deleteFormRecord` probe up to 15 tables sequentially — **High**
- **Location:** `lib/database/DatabaseRecords.ts:455,510,715`
- **Evidence:** `for (let i=1;i<=15;i++){ record = await prisma['formRecord'+i].findUnique({where:{id}}); if(record) break }`
- **Impact:** Up to 15 serial RTTs to locate one record; `deleteFormRecord` does it unconditionally. ~0.5–1.2s before any work at typical RTT.
- **Fix:** Resolve the shard from `formId`/`tableMapping` and hit one table. If you must probe, `Promise.all` the 15 (1 RTT instead of 15).

### 1.4 `getLinkedRecords`/`getLookupSources` — all-forms scan + per-form count N+1 — **Critical**
- **Location:** `lib/database/DatabaseRecords.ts:974,1018,1121`
- **Impact:** Loads *all forms in the tenant* with nested sections/fields (no `where`), then a submission-count per form, each possibly triggering the 13-COUNT fallback (§1.1). N×(1..14) round-trips; timeout-prone on mature tenants.
- **Fix:** `where` the form query to lookup-bearing forms only; batch counts with one `GROUP BY` query; cache `totalRecords` on the form row.

### 1.5 `getEmployeesWithPermissions` — nested N+1 + unbounded user scan — **Critical**
- **Location:** `lib/database/DatabaseRoles.ts:1025-1166`
- **Impact:** `formRecord15.findMany()` with no `where`/`take` (all users), then per-user permission queries, then per-permission `formModule` lookups (same modules re-fetched). ~U×(2+P×2) round-trips.
- **Fix:** Drop the per-loop existence probe; one `userPermission.findMany({where:{userId:{in:ids}}})`; load referenced modules once into a Map; paginate users.

### 1.6 `getUserPermissions` (Roles) issues 2 queries per permission — **High**
- **Location:** `lib/database/DatabaseRoles.ts:234-278`
- **Impact:** `Promise.all(map(async perm => findUnique(...)))` — one DB query per permission row, duplicate ids re-fetched. The optimized twin `getUserPermissionsWithResources:363` already batches with `in`.
- **Fix:** Use the batched twin; delete the per-row version.

### 1.7 Unbounded `findMany` with no `where`/`take`, returning full relation graphs — **High**
- **Location:** `lib/database/database.ts:233` (`getRolesWithUsers`), `280` (`getUsers`), `422` (`getUserPermissionOverrides`); `lib/database/DatabaseModules.ts:132` (`getModuleHierarchy`), `488` (`getForms`)
- **Impact:** Load the entire users/roles/forms graph for the whole DB (cross-tenant — ignores `organizationId`). `getForms`/`getModuleHierarchy` also request the 16-way `_count` per form.
- **Fix:** Add `where:{organizationId}` + pagination everywhere; count only the mapped shard.

### 1.8 The 16-way `_count` on form includes is duplicated across 6+ read paths — **High**
- **Location:** `lib/database/DatabaseModules.ts:144,246,309,379,502,550,706`; consumed in `DatabaseTransforms.transformForm:69`
- **Impact:** Prisma emits ~16 correlated COUNT subqueries per form row. `getModuleHierarchy` (nav, most page loads) does this for every form. One of the heaviest repeated costs.
- **Fix:** A form lives in one shard — count only the mapped shard (or just the unified table). Better: denormalize a `totalRecords` column updated on write.

### 1.9 `getModuleHierarchy` runs 4–5 sequential raw queries that should be parallel — **Medium**
- **Location:** `lib/database/database-service.ts:243-319`
- **Fix:** `Promise.all([roleBased, userBased, getAnchorHostModuleIds()])`; merge the two permission queries with `UNION`.

### 1.10 `getUserContext` computes `getModuleHierarchy` 2–3× per request — **High**
- **Location:** `lib/database/database-service.ts:808-815`, `getForms:576`, `validateUserAccess:847`
- **Fix:** Compute once; pass the accessible-module-id set into `getForms`/validation; filter forms in SQL with `moduleId:{in:accessibleIds}`.

### 1.11 `getUserRecords` — JSON-path `findMany` on the login path, no index, no `take` — **High**
- **Location:** `lib/database/DatabaseRecords.ts:16-24`
- **Evidence:** `prisma.formRecord15.findMany({where:{recordData:{path:['email'],equals:email}}, orderBy:{createdAt:'desc'}})`
- **Impact:** Full seq-scan of all app users on every login, no `LIMIT`. (`getUserByEmail:966` was already fixed to raw SQL `LIMIT 1` — this one wasn't.)
- **Fix:** `CREATE INDEX ON form_records_15 ((lower(record_data->>'email')))` + `take:1`, or route auth through `getUserByEmail`.

### 1.12 `deleteRole` counts role usage via unindexed JSON-path scan — **Medium**
- **Location:** `lib/database/DatabaseRoles.ts:133-140`
- **Fix:** Expression index on `(record_data->>'roleId')`, or `EXISTS … LIMIT 1` instead of full `count`.

### 1.13 `updateRolePermissions` still does a per-row `upsert` loop in a transaction — **High**
- **Location:** `lib/database/database.ts:617-647` (validation reads at `559-562` have no `where`)
- **Impact:** The exact pattern already fixed for *user* permissions, still present for *roles*: N serial round-trips in one transaction → P2028 timeout risk on big matrix saves.
- **Fix:** Apply the same bulk strategy used in `updateUserPermissions` (bulk read → `createMany` + grouped `updateMany`); scope validation reads with `where:{id:{in:refIds}}`.

### 1.14 `deleteSectionWithCleanup` — per-record `updateFormRecord` loop — **High** (latent)
- **Location:** `lib/database/DatabaseModules.ts:938-988`
- **Impact:** Read-modify-write per record, each `updateFormRecord` being the 15-table probe (§1.3) → O(records×15). Currently no-ops because the local helpers are stubs (`:1769`), but becomes a hotspot once wired.
- **Fix:** Batch read (paginated) → compute in memory → `updateMany`/raw JSONB; resolve shard once.

### 1.15 Per-record dual-write doubles write round-trips — **Medium**
- **Location:** `lib/database/DatabaseRecords.ts:277-292` (create), `647-694` (update: up to 3 writes)
- **Fix:** Pick one source-of-truth table or do mirror writes in `Promise.all`; longer-term retire the 15-shard scheme for unified + native partitioning.

> Already good: `app/api/import/process/route.ts` (batched `createMany` of 200), `getUserByEmail` and `updateUserPermissions` (already bulk + id-scoped).

---

## 2. API Routes

### 2.1 `withAuth` re-queries role assignments per request + logs PII — **High**
- **Location:** `lib/auth-middleware.ts:35-73`
- **Impact:** `validateSession` already loads `unitAssignments.role` from cache, but `withAuth` fires a fresh `userUnitAssignment.findMany` + 5 `console.log`s (incl. email) per request.
- **Fix:** Derive roles from `session.user.unitAssignments`; remove/gate the logs.

### 2.2 `/api/modules` — full tree + 16-partition counts, unscoped, uncached — **Critical** (see C5)
- **Location:** `lib/database/DatabaseModules.ts:129-168` via `lib/api-handlers/form-builder.ts:56`
- **Impact:** ~16·N count subqueries; `getModuleHierarchy(user.id)` ignores its param → no org filter (scans all tenants). Hit on app load by `getOrgModules`.
- **Fix:** Filter by `organizationId`; drop per-partition `_count`; cache in the `forms` Redis namespace with write-invalidation.

### 2.3 Payroll `readRecords` loads the whole partition then aggregates in JS — **High**
- **Location:** `lib/utils/payroll-store.ts:1386-1443` (`/api/payroll/stats`, `/records`, `/api/payroll`)
- **Impact:** No `take`; loads every employee record (full JSON) and `reduce`s totals in Node (`stats/route.ts:37`). Megabytes per stats call on large orgs.
- **Fix:** Push `SUM/COUNT/AVG` into SQL; drop the `user` include when only counting; paginate.

### 2.4 Lookup "search" fetches `limit*2` then filters in JS — **High**
- **Location:** `lib/lookup-service.ts:549-558` (`/api/lookup/data`)
- **Impact:** Dropdown search only sees the 100 most-recent rows; matches outside are never found; cache disabled (`route.ts:24`). Cost per keystroke.
- **Fix:** Push search into the DB; re-enable caching for the no-search case.

### 2.5 `/api/auth/perm-version` polled every 15s/tab, 2 uncached joined queries — **High** (see Redis §5.4)
- **Location:** `app/api/auth/perm-version/route.ts:34-49`
- **Fix:** Cache the org's max permission timestamp in Redis, invalidate on the rare write; raise poll interval.

### 2.6 `/api/route-permissions/discover` walks the filesystem synchronously per request — **Medium**
- **Location:** `app/api/route-permissions/discover/route.ts:25-89`
- **Impact:** `fs.readdirSync` recursion over all of `app/` blocks the event loop; route set is static between deploys.
- **Fix:** Memoize at module load / build; or cache in Redis with long TTL; use `fs.promises` if it must run at request time.

### 2.7 `/api/user` ships the entire Employee record (PII) on every load — **Medium**
- **Location:** `app/api/user/route.ts:54-103`
- **Fix:** Return only the shell fields; load full profile lazily; short private cache header.

### 2.8 `/api/users` and `/api/admin/users` — full org users, deep includes, no pagination — **Medium**
- **Location:** `lib/api-handlers/user-management.ts:131-147`; `app/api/admin/users/route.ts:24-58`
- **Fix:** Paginate; select only rendered columns; don't repeat `organization` per row.

### 2.9 `/api/audit-log` — redundant admin lookup + `take:500` with user join — **Medium**
- **Location:** `app/api/audit-log/route.ts:24-56`
- **Fix:** Use cached session/`isUserAdmin` for the admin check; paginate.

### 2.10 `isUserAdmin` runs raw SQL + org lookup every call; many handlers call it redundantly — **Medium** (see C9 / Redis §5.1)
- **Location:** `lib/api-helpers.ts:99-127`; callers e.g. `app/api/forms/permitted/route.ts:23`, `app/api/modules-permission/route.ts:23`
- **Fix:** Derive from the cached session graph or memoize per-request via the `WeakMap` pattern already used for the auth user.

### 2.11 `validateSession` TTL only 60s for the gate of every authed route — **Low**
- **Location:** `lib/auth.ts:62,96`
- **Fix:** Raise to 5–15 min — logout/role-change already invalidate explicitly.

### 2.12 Blanket `force-dynamic` on read-heavy routes, no revalidation — **Medium**
- **Location:** pervasive — `app/api/modules-permission`, `user/permitted-modules`, `forms/permitted`, `audit-log`, `notifications`, `lookup/data`
- **Fix:** Back stable per-org reads with the Redis cache layer keyed by org/user, invalidate on writes.

> Template to copy: `app/api/forms/[formId]/records/route.ts` — real pagination, cached form structure, parallel permission queries, single composite-index `IN`, parallel `findMany`+`count`.

---

## 3. React Rendering

### 3.1 `PermissionContext` value identity changes every render → app-wide re-renders — **Critical** (C6)
- **Location:** `context/PermissionContext.tsx:12` / `hooks/usePermissions.ts:392-403`
- **Fix:** `useMemo` the returned object (inner fns are already `useCallback`-stable).

### 3.2 `RoleProvider` context value is a new object literal every render — **High**
- **Location:** `context/role-context.tsx:371`
- **Fix:** `const value = useMemo(() => ({state,dispatch,refreshData}), [state,refreshData])`.

### 3.3 `renderFieldEditor` non-memoized → defeats `RecordCell` memo, all cells re-render — **Critical** (C7)
- **Location:** `components/modules/recordsDisplay.tsx:595` (consumed `:1296,1327,1385`)
- **Fix:** `useCallback` it with real deps; audit other inline-function props to `RecordCell`.

### 3.4 Per-row rebuild of `hierarchyGroups.flatMap(...)` inside the records `.map` — **High**
- **Location:** `components/modules/recordsDisplay.tsx:1215-1338`
- **Fix:** Precompute the flat ordered field list once (`useMemo`); map rows over it.

### 3.5 `useEffect` data-fetch waterfall on the records page — **High**
- **Location:** `app/forms/[formId]/records/page.tsx:1363-1380`
- **Impact:** Fetch form → then (separate effect) fetch records/lookups/linked. Two serial client hops before records render.
- **Fix:** Kick off records fetch as soon as `formId` is known (parallel), or move to server/RTK.

### 3.6 Sidebar `renderModule` recursion not memoized — **Medium**
- **Location:** `components/layout/sidebar.tsx:721-835` (rendered `:1428`)
- **Fix:** Extract a `memo()` `SidebarNode` with stable props (`isExpanded` boolean + `useCallback` handlers).

### 3.7 `expandedModules` Set forces full-tree re-render on any toggle — **Medium**
- **Location:** `components/layout/sidebar.tsx:740,618`
- **Fix:** Per §3.6 — memoized node + boolean `isExpanded` + stable `onToggle`.

### 3.8 `iconButtons` array rebuilt every render; `canAccess` called in render — **Low**
- **Location:** `components/layout/sidebar.tsx:1162-1177`
- **Fix:** `useMemo([...].filter(...), [canAccess])`.

### 3.9 `RoleProvider` runs four state-sync effects that each dispatch on RTK settle — **Medium**
- **Location:** `context/role-context.tsx:296-348`
- **Fix:** Consolidate the RTK→reducer sync; derive `loading` instead of mirroring.

### 3.10 `recalculateFormulasForRecord` does O(fields) `find` per entry inside a `map` — **Medium**
- **Location:** `hooks/use-records-display.ts:711-861,865-882`
- **Fix:** Build a `Map` keyed by field id once; O(1) lookups.

### 3.11 `numDummyRows` effect re-runs full sort+filter+slice on a timer — **Medium**
- **Location:** `hooks/use-records-display.ts:1791-1814`
- **Fix:** Derive length from the already-memoized `filteredRecords`/`paginatedRecords`.

### 3.12 Verbose `console.log` of mapped field arrays on every fields change (prod) — **Low**
- **Location:** `hooks/use-records-display.ts:196-291`
- **Fix:** Remove / gate behind a debug flag.

### 3.13 Records `useEffect` refetches on `searchTerm` with no debounce/abort — **Low/Medium**
- **Location:** `app/forms/[formId]/records/page.tsx:1376-1380`
- **Fix:** Debounce search; move to RTK (cached/deduped/cancelable).

> Already good: sidebar tree *data* builders are `useMemo`'d; records are paginated; `RecordCell` is `memo()` (problem is unstable props); attendance 1 Hz tick is scoped to the widget.

---

## 4. Data Fetching & Caching (RTK Query)

### 4.1 App-wide permission matrix uses raw `fetch()` in `useEffect`, bypassing RTK — **Critical** (C8)
- **Location:** `hooks/usePermissions.ts:155-166` (mounted app-wide via `ConditionalLayout.tsx:74`)
- **Impact:** No dedup/cache/tag-invalidation; re-fires on every provider remount; duplicates `useGetUserPermissionsQuery`/`getRolePermissions` that already exist.
- **Fix:** Replace with the RTK hooks (add a `roleIds` CSV variant) — gains dedup + auto-refetch on the `RolePermissions`/`UserPermissions` tags.

### 4.2 Static-page permission matrix re-fetches the action list per role switch via raw `fetch()` — **High**
- **Location:** `components/admin/static-page-permission/role-static-pages-matrix.tsx:98-138`
- **Fix:** Move to RTK; tag the static actions with `Permissions` (cached 600s) and grants with `RolePermissions`.

### 4.3 Attendance widget polls `/api/attendance/today` every 60s, ×N mounts — **High**
- **Location:** `components/attendance/attendance-widget.tsx:107,467` (mounted in sidebar + dashboard + mobile nav)
- **Impact:** Each instance runs its own `setInterval` + raw `fetch` → duplicate polling for identical data.
- **Fix:** RTK Query endpoint with `pollingInterval` — one shared cache entry dedups all subscribers.

### 4.4 `getModuleRecords` sequential fetch waterfall across forms — **High**
- **Location:** `lib/api/records.ts:64-80`
- **Fix:** `Promise.all(formIds.map(...))` then merge.

### 4.5 `getFormRecords` pulls the entire record set, no pagination — **High**
- **Location:** `lib/api/records.ts:52-58` (a paginated `getFormRecordsWithParams:163` already exists)
- **Fix:** Default a page size; standardize callers on the paginated query; raise `keepUnusedDataFor`.

### 4.6 Bare `"Records"` tag invalidation refetches every form's records — **Medium**
- **Location:** `lib/api/records.ts:113-176`
- **Fix:** Keep only `{type:"Records", id:formId}`; thread `formId` through update/delete args.

### 4.7 Permission mutations invalidate the global `"Permissions"` tag — **Medium**
- **Location:** `lib/api/permissions.ts:73,85`
- **Fix:** Drop `"Permissions"` (static defs, ~never change); scope `RolePermissions`/`UserPermissions` to the affected `formId`/`roleId`.

### 4.8 Module mutations invalidate entire `"Module"`/`"OrgModules"` tag types — **Medium**
- **Location:** `lib/api/modules.ts:197,220,247,293,302`; `lib/api/forms.ts:340`
- **Fix:** Scope single-edits to `{type:"Module", id:moduleId}`; keep broad invalidation only for create/delete/reparent.

### 4.9 `getAdminUsers`/`getUsers` share the `AdminUsers` tag, cross-invalidating big lists — **Medium**
- **Location:** `lib/api/users.ts:39-102`
- **Fix:** Distinct tags; a lite users endpoint for the matrix; raise `keepUnusedDataFor`.

### 4.10 `notification-bell` forces refetch on every open/mount — **Low**
- **Location:** `components/layout/notification-bell.tsx:76-83`
- **Fix:** Drop `refetchOnMountOrArgChange` on the count query (60s poll + optimistic patches suffice).

### 4.11 `keepUnusedDataFor: 30` churns the most expensive list caches — **Low**
- **Location:** `lib/api/records.ts:57,95`
- **Fix:** Raise to ~120–300s; rely on tag invalidation for freshness.

### 4.12 Form-builder mutations with `invalidatesTags: () => []` leave caches stale — **Low**
- **Location:** `lib/api/forms.ts:121,130,139,159`
- **Fix:** Invalidate `{type:"FormDetail", id:formId}`; then remove the compensating `refetchOnMountOrArgChange` flags elsewhere.

---

## 5. Redis / Auth / Middleware

### 5.1 `isUserAdmin` — 2 uncached DB queries on nearly every authed request (~90 call sites) — **Critical** (C9)
- **Location:** `lib/api-helpers.ts:99-127`
- **Impact:** Called from 66 files / 90 sites; zero caching; the data is already in the `auth-meta` cookie (`isAdmin`) and the cached session (`unitAssignments[].role.isAdmin`).
- **Fix:** Cache by `userId` (auth namespace, ~60s, mirror `getPermissionIdByName`), invalidate on role-assignment change. Better: derive from the session/`getAuthenticatedUser` result; add a request-scoped `WeakMap` memo.

### 5.2 `computeRouteMeta` emits one `console.log` per RoutePermission row — **High**
- **Location:** `lib/auth/route-meta.ts:61,85,96,105,108,119,124,144,164,177`
- **Impact:** 80+ blocking synchronous logs per invocation; runs in `buildAuthMeta`, login, and every static-page API gate.
- **Fix:** Delete the per-row logs or gate behind `DEBUG_ROUTE_META`; keep one RESULT line.

### 5.3 Heavy `console.log` in the middleware hot path — **Medium**
- **Location:** `middleware.ts:101-103,168-170`; `lib/api-helpers.ts:316`; `lib/redis.ts:132`
- **Fix:** Remove hot-path logs; consider refreshing the cookie in-place rather than the redirect bounce (§5.11).

### 5.4 `/api/auth/perm-version` polled every 15s/tab → 2 uncached ordered queries — **High**
- **Location:** `components/guards/route-permission-guard.tsx:13,134`; `app/api/auth/perm-version/route.ts:34-49`
- **Impact:** 100 tabs = 400 queries/min for data that rarely changes.
- **Fix:** Cache the per-org version in Redis (~10s TTL), invalidate on route-permission writes; raise interval; back off on hidden tabs.

### 5.5 `validateSession` has no in-flight dedup / negative caching → stampede on cold token — **Medium**
- **Location:** `lib/auth.ts:64-125`
- **Impact:** 60s TTL + a page firing 5–10 parallel calls = simultaneous misses each running the deep joined query; worsened during Upstash idle-drop (errors read as miss).
- **Fix:** Process-level in-flight `Map<token, Promise>` (like `swrInflight`); consider `cachedSWR`; briefly negative-cache invalid tokens.

### 5.6 `/api/auth/me` returns a huge PII payload; primary client user fetch — **Medium**
- **Location:** `app/api/auth/me/route.ts:7-137`
- **Fix:** Split into a lightweight `me` (id, email, isAdmin, allowed/deniedRoutes, org summary) for the guard + a separate profile endpoint.

### 5.7 `buildAuthMeta` re-queries the user that `validateSession` already loaded — **Medium**
- **Location:** `app/api/auth/refresh-meta/route.ts:12-31`; `app/api/auth/login/route.ts:329-340`
- **Fix:** Reuse `session.user`; only `organization.selectedModules` may need a tiny supplemental select (or add to the session include once).

### 5.8 In-memory per-IP rate limiter is per-PM2-worker → real limit = max × instances — **Medium**
- **Location:** `lib/auth/rate-limit.ts:36-59`
- **Fix:** Move the counter to Redis (`INCR`+`EXPIRE`) so it's shared across workers.

### 5.9 `getPermissionIdByName` L2 miss not stampede-protected; re-queries on Redis blips — **Low**
- **Location:** `lib/api-helpers.ts:155-183`
- **Fix:** Acceptable; if tightened, add per-name in-flight dedup. (Flags the shared "Redis error == miss" pattern.)

### 5.10 Redis `error` log is one-shot per client, hiding sustained idle-drops — **Low**
- **Location:** `lib/redis.ts:123-133`
- **Fix:** Throttled reconnect counter/metric so idle-drop frequency stays observable.

### 5.11 Middleware redirect-to-refresh doubles request volume + stampede risk — **Medium**
- **Location:** `middleware.ts:86-107`; `app/api/auth/refresh-meta/route.ts:97`
- **Impact:** Stale cookie → a full extra request cycle; after a perm change all users stampede `refresh-meta`, each recomputing `computeRouteMeta` with no shared cache.
- **Fix:** Cache the computed `RouteMetaResult` in Redis keyed by `userId` + org `perm-version`; refresh the cookie on the in-flight response instead of a redirect.

> Already good: signed `auth-meta` cookie keeps the middleware path DB-free; two-tier permission-id cache; 60s Redis heartbeat for idle-drop.

---

## 6. Bundle & Next.js Config

### 6.1 `images.unoptimized: true` disables all image optimization — **High**
- **Location:** `next.config.mjs:26-28`
- **Fix:** Remove the global flag; configure a loader + `remotePatterns`; if unavoidable, do per-image `unoptimized` with explicit `width/height/sizes`.

### 6.2 Docs pages are `"use client"` and ship a 2,462-line data module — **High**
- **Location:** `app/settings/docs/page.tsx:1`, `app/settings/docs/[slug]/page.tsx:1`, `lib/docs/guides.ts`; also `hr-system` (2,015 lines), `hr-complete-guide` (1,417)
- **Fix:** Make docs pages server components; keep `guides.ts` server-only; move search/checkbox bits into small client islands.

### 6.3 Recharts imported eagerly into the landing-route bundle — **High**
- **Location:** `components/dashboard/dashboard-content.tsx:1` (via `app/page.tsx:9`); also `dashboard.tsx`, `user-dashboard-content.tsx`, `payroll/*`
- **Fix:** `next/dynamic(() => import(...), {ssr:false, loading:<Skeleton/>})` — the repo already does this for `@xyflow/react` in `flowmap-renderer.tsx:19`.

### 6.4 `jspdf` + `jspdf-autotable` in a dead `"use client"` module — **Medium**
- **Location:** `lib/report-engine.ts:1-9` (no importers anywhere)
- **Fix:** Delete the module (or make it a server route); remove the deps.

### 6.5 Unused heavy dependencies — **Medium**
- **Location:** `package.json` — `moment`, `markmap-common/lib/view`, `react-big-calendar` (zero source imports)
- **Fix:** Remove after a final confirmation grep.

### 6.6 ~437 `"use client"` files — pervasive client-first architecture — **High**
- **Location:** project-wide (438 occurrences); huge static pages are client (`workflow-rules/create` 5,005 lines, `kaizen` 1,859)
- **Fix:** Split large pages into thin server page + small client islands; start with docs/reference and read-only list shells.

### 6.7 Only 6 uses of `next/dynamic` across the app — **Medium**
- **Location:** project-wide
- **Fix:** Lazy-load chart panels, form-builder canvas, plan-designer, chatbot UI (1,796-line `chatbot-ui.tsx`).

### 6.8 No explicit prod source-map / compression control — **Low**
- **Location:** `next.config.mjs:22-62`
- **Fix:** Set `compress: true` (or confirm nginx brotli on `_next/static` + RSC); pin `productionBrowserSourceMaps: false`.

### 6.9 `framer-motion` eager in large static doc pages — **Low/Medium**
- **Location:** `app/settings/docs/hr-system/page.tsx:22`, `hr-forms-flow`, `components/chatbot/*`
- **Fix:** CSS animations for decorative docs motion, or dynamic-import the animated sections.

> Already good: `optimizePackageImports` for lucide/date-fns/recharts; `serverExternalPackages` for xlsx/pdf/mammoth/nodemailer; lazy `face-api.js`; `next/font` subsetted Inter.

---

## Prioritized remediation roadmap

### Phase 0 — Quick wins (low risk, high impact) — ✅ DONE (2026-06-01)
- ✅ Removed hot-path `console.log`: `route-meta.ts` per-row logs (§5.2), `withAuth` + its redundant query (§2.1/§5.3), `middleware.ts` (§5.3), `use-records-display.ts` (§3.12).
- ✅ `useMemo` the `PermissionContext` value (C6/§3.1) and `RoleProvider` value (§3.2).
- ✅ `renderFieldEditor` stabilized via latest-ref wrapper, not a deps[] (C7/§3.3).
- ✅ Two-tier cache for `isUserAdmin` + `invalidateAdminCache` (C9/§5.1/§2.10).
- ✅ Removed dead deps `moment`, `markmap*`, `react-big-calendar`; deleted `lib/report-engine.ts`. NOTE: `jspdf`/`jspdf-autotable` were **kept** — the audit was wrong, they're used via dynamic import in 5 files (§6.4/§6.5).
- ✅ `validateSession` TTL 60s→300s (§2.11); `perm-version` poll 15s→60s (§5.4).
- ↪ Follow-up: wire `invalidateAdminCache(userId)` into role-assignment/ownership-transfer handlers for instant (vs ≤60s) propagation.

### Phase 1 — DB hot paths (the partition tax) — ✅ named items DONE (2026-06-01)
- ✅ Replaced 13-COUNT shard pick with an FNV-1a hash (§1.1).
- ✅ Dropped 15 of the 16 `_count`s → unified `records` count only, across all 10 sites (`DatabaseModules` ×7, `dashboard/modules` route, `analytics.ts` ×2 + consumers) (§1.8). **Assumes unified table is complete via dual-write** — backfill unified for any pre-dual-write legacy data.
- ✅ 15-table record probe parallelized (1 RTT, not up to 15) in `getFormRecord`/`updateFormRecord`; `deleteFormRecord` parallelized while keeping shards-first for dual-cleanup correctness (§1.3, §1.4).
- ✅ JSONB indexes — `scripts/sql/jsonb_indexes_form_records_15.sql` (email + roleId expression btree + GIN); `deleteRole` count rewritten to the matching `->>'roleId'` expression. **ACTION: run the SQL against the DB.** (§1.11, §1.12)
- ✅ `updateRolePermissions` (§1.13): was **DEAD CODE** (no server caller; live path is the bulk `PUT /api/role-permissions`). **Deleted** — also cleared its pre-existing broken 3-field-key tsc error.
- ✅ `analytics.ts`: both 15-shard loops (`mySubmissions` count + `timeSeries` findMany) collapsed to a single unified-table query each (indexed on userId/formId/submittedAt).
- ⬜ TODO: `getUserRecords` should route through the raw `->>'email'` path to actually use the email index (left to avoid reshaping `transformRecord` on the login path) (§1.11).
- ⬜ TODO: `where:{organizationId}` + pagination on unbounded `findMany`s — `getUsers`/`getRolesWithUsers`/`getUserPermissionOverrides` (signature changes + caller updates) (§1.7, §1.5, §1.10).

### Phase 2 — API & caching — 🟡 PARTIAL (2026-06-01)
- ✅ Per-org `perm-version` cached in Redis (`cachedSWR`, 10s fresh / 60s stale) — collapses the per-tab polling into ~1 DB read per org per window (§5.4).
- ✅ **C5/§2.2 was a FALSE ALARM**: the live `/api/modules` (`DatabaseService.getModuleHierarchy`) is already fully org-scoped (every query filters `organization_id`). The audit conflated it with `DatabaseModules.getModuleHierarchy` (unscoped) — which has **zero callers** (dead). No cross-tenant scan on any live path.
- ✅ Parallelized the sequential `roleBased`/`userBased` queries in the live module path (§1.9).
- ⬜ TODO: per-user `RouteMetaResult` Redis cache keyed by org perm-version to kill the refresh-meta stampede (§5.11) — needs careful auth-correctness + invalidation.
- ⬜ TODO: Paginate `/api/users`, `/api/admin/users`, `/api/audit-log`, payroll — **coordinated FE+BE change** (the permission matrix loads the full user list) (§2.3, §2.8, §2.9).
- ⬜ TODO: Lite `/api/auth/me` + `/api/user` (§2.7, §5.6); memoize `discover` (§2.6).

### Phase 3 — Client data-fetching & rendering
- Move app-wide permission fetch + attendance polling + static-page matrix into RTK (C8/§4.1, §4.2, §4.3).
- Scope tag invalidations (`Records`, `Permissions`, `Module`, `AdminUsers`) (§4.6–§4.9).
- Fix the records fetch waterfall + debounce search (§3.5, §3.13).
- Memoize sidebar nodes (§3.6/§3.7) and the records grid field list (§3.4).

### Phase 4 — Bundle
- Re-enable image optimization (§6.1).
- Dynamic-import recharts and other heavy widgets (§6.3, §6.7).
- Convert docs/reference pages to server components; shrink the `"use client"` surface (§6.2, §6.6).

---

## Measurement (do this alongside fixes)
- **DB:** enable Prisma query logging / `pg_stat_statements`; watch query count per request before/after (expect `/api/modules` and login to drop dramatically).
- **API:** add a timing log (or APM) on `getAuthenticatedUser`/`isUserAdmin`/`computeRouteMeta`.
- **Client:** React DevTools Profiler on the records grid and sidebar (re-render counts on keystroke); Lighthouse + `@next/bundle-analyzer` for bundle size before/after Phase 4.
- **Redis:** track the reconnect counter (§5.10) to confirm idle-drop is contained.

*Generated by a six-domain parallel code audit. Findings reference real `path:line` locations in this repo as of 2026-06-01.*
