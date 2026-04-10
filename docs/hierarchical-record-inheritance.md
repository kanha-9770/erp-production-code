# Hierarchical Record Inheritance — Permission Changes

## What this feature does

When any user submits a form record, every role **above** that user in the
organization role tree (their direct manager, their manager's manager, etc.)
automatically sees that record in the records list — without anyone manually
sharing it. The form owner can opt out per-form, and individual sections can
be hidden from inherited views even when sharing is enabled.

This is a **read-only** inheritance: ancestors gain visibility but the original
creator remains the only person who can edit or delete their own row (existing
write permissions are unchanged).

## Decisions baked in

| Decision | Choice | Why |
|---|---|---|
| **Inheritance scope** | Unit-scoped | A Sales Head only inherits records from descendants who share at least one `OrganizationUnit`. Prevents cross-team leaks (a Sales Head shouldn't see Dev team submissions just because both report to Admin). |
| **Sharing OFF behavior** | Own records only | When the form-level toggle is off, non-admin viewers see only the rows they personally submitted. |
| **Form-level flag storage** | `Form.settings` JSON | Zero schema migration, missing key defaults to `true` (sharing on). |
| **Section-level flag storage** | New `FormSection.excludeFromInheritance` column | Consistent with existing per-section flags (`visible`, `collapsible`, `collapsed`). |
| **Admin bypass** | Always on | Any caller whose `Role.isAdmin = true` skips all inheritance filtering and sees every record in the form, regardless of toggles. |
| **Cache TTL** | ~60 seconds | Role re-parenting and unit changes propagate within 60 s. Kept short enough to feel responsive, long enough to amortize the cost across multi-form dashboard pages. |

---

## Schema changes ([prisma/schema.prisma](../prisma/schema.prisma))

### `FormSection` — new column
```prisma
excludeFromInheritance Boolean @default(false) @map("exclude_from_inheritance")
```
When `true`, the fields inside this section are stripped from any record that
the viewer is seeing through inheritance. The original creator always sees
the full row.

### `FormRecord1` … `FormRecord15` — new composite index
```prisma
@@index([formId, userId])
```
Added to all 15 sharded record tables. The new records-list query is
`WHERE formId = ? AND userId IN (...)`; without this index Postgres falls back
to the single-column `formId` index plus an in-memory userId filter, which is
slow on the wider shards (e.g. `form_records_14`).

### `Form.inheritsToAncestors` — **NOT** a column
The form-level flag lives in the existing `Form.settings JSON` column under
the key `inheritsToAncestors`. A missing key is treated as `true`. This was
deliberate: zero migration risk on a live system and we never need to
WHERE-filter on it.

### Migration note
For the 15 composite indexes on production data, write a raw SQL migration
using `CREATE INDEX CONCURRENTLY IF NOT EXISTS` so the live tables aren't
locked. Run it during a quiet window and reconcile with
`prisma migrate resolve --applied`. The auto-generated `prisma migrate dev`
output is fine for local/dev, where the tables are small.

---

## Backend helpers ([lib/database/roles.ts](../lib/database/roles.ts))

Three new exported functions plus an internal cache layer.

### `CallerRoleContext` interface
```ts
interface CallerRoleContext {
  roleIds: string[];   // every role assigned to the caller
  unitIds: string[];   // every unit they belong to
  isAdmin: boolean;    // true if any of their roles has isAdmin = true
}
```

### `getCallerRoleContext(userId, organizationId)` → `Promise<CallerRoleContext>`
Single query joining `UserUnitAssignment` → `Role` (filtered by org). Returns
the union of all the caller's role/unit assignments. Cached per
`${userId}:${organizationId}` for ~60 s.

### `getDescendantRoleIds(organizationId, rootRoleIds)` → `Promise<string[]>`
PostgreSQL recursive CTE walks downward from `rootRoleIds` and returns every
**active** descendant role id. Excludes the roots themselves (the caller
already sees their own role's records). Depth-capped at 20 for cycle safety.

```sql
WITH RECURSIVE descendants AS (
  SELECT id, parent_id, 0 AS depth
  FROM roles
  WHERE parent_id = ANY($1) AND organization_id = $2 AND is_active = true
  UNION ALL
  SELECT r.id, r.parent_id, d.depth + 1
  FROM roles r
  JOIN descendants d ON r.parent_id = d.id
  WHERE r.organization_id = $2
    AND r.is_active = true
    AND d.depth < 20
)
SELECT id FROM descendants
```

### `getInheritedUserIds(organizationId, callerCtx)` → `Promise<string[] | null>`
The composition layer the records endpoint actually calls.

- Returns **`null`** if `callerCtx.isAdmin === true` (sentinel = "no filter").
- Returns `[]` if the caller has no role assignments or no unit assignments.
- Otherwise:
  1. `descendantRoleIds = getDescendantRoleIds(orgId, callerCtx.roleIds)`
  2. Query `UserUnitAssignment` for users in those roles **whose `unitId`
     overlaps `callerCtx.unitIds`** — this is the unit-scope filter that
     prevents cross-team leaks.
  3. Returns the distinct `userId[]`.

Cached per `${orgId}:${sortedRoleIds}:${sortedUnitIds}` for ~60 s.

### Internal: TTL cache
A pair of in-memory `Map<string, { value, expiresAt }>` with a 60 000 ms TTL.
No external dependency (`lru-cache` is not installed). The bound is the active
user count per server instance, which is small.

**Trade-off documented in code:** up to ~60 s of staleness on role
re-parenting or unit changes. Acceptable because both events are rare.

---

## Records list endpoint ([app/api/forms/[formId]/records/route.ts](../app/api/forms/[formId]/records/route.ts))

Three modifications to the existing `GET` handler.

### 1. Compute the inheritance filter (after the existing org check)

```ts
let inheritanceUserIdFilter: string[] | null = null;
if (userOrgId) {
  const callerCtx = await getCallerRoleContext(authUser.id, userOrgId);
  if (!callerCtx.isAdmin) {
    const formInherits = (form.settings as any)?.inheritsToAncestors !== false;
    if (formInherits) {
      const inheritedUserIds = await getInheritedUserIds(userOrgId, callerCtx);
      inheritanceUserIdFilter = Array.from(
        new Set([authUser.id, ...(inheritedUserIds ?? [])])
      );
    } else {
      inheritanceUserIdFilter = [authUser.id]; // sharing off
    }
  }
}
```

### 2. Build the excluded-field set during the existing section walk
```ts
const inheritanceExcludedFieldIds = new Set<string>();
form.sections.forEach((section: any) => {
  section.fields.forEach((f: any) => {
    /* ...existing lookups... */
    if (section.excludeFromInheritance) {
      inheritanceExcludedFieldIds.add(f.id);
    }
  });
});
```

### 3. Merge into the WHERE clause and redact during processing
```ts
if (inheritanceUserIdFilter !== null) {
  whereClause.userId = { in: inheritanceUserIdFilter };
}
```

After fetching, for each row whose `record.userId !== authUser.id` (and the
caller is not admin), strip every excluded field from `transformedData` and
stamp two markers the UI uses:

```ts
record._inherited = true;
record._inheritedFromUserId = record.userId;
```

### Effect on visibility

| Caller | Form sharing toggle | Section opt-out | What they see |
|---|---|---|---|
| Admin | any | any | **Every** record in the form (org-scoped) |
| Creator of the row | any | any | The full row, all sections |
| Ancestor of the creator (same unit) | ON (default) | none | The full row, marked `_inherited` |
| Ancestor of the creator (same unit) | ON (default) | section X excluded | The row with section X fields stripped |
| Ancestor of the creator (same unit) | OFF | any | Not visible |
| Non-ancestor in same org | any | any | Not visible (unless they happen to be in another inherited subtree) |
| Ancestor in a different unit | any | any | Not visible (unit isolation) |

---

## API surface changes

### `PATCH /api/forms/[formId]` ([app/api/forms/[formId]/route.ts](../app/api/forms/[formId]/route.ts))
Now accepts an optional `inheritsToAncestors: boolean` field in the body. The
handler reads the existing `Form.settings`, spreads it, sets the single key,
and writes it back — so other JSON keys are never clobbered.

Existing fields (`isUserForm`, `isEmployeeForm`, `name`, `description`)
continue to work unchanged.

### `PUT /api/sections/[sectionId]` ([lib/api-handlers/form-builder.ts](../lib/api-handlers/form-builder.ts))
The `updateSection` handler now accepts an optional
`excludeFromInheritance: boolean` field. Wired through `DatabaseService.updateSection`
→ `DatabaseModules.updateSection` → `prisma.formSection.update`.

`DatabaseTransforms.transformSection` now surfaces the field on the read path
so the section settings dialog can read its current value.

### RTK mutations ([lib/api/forms.ts](../lib/api/forms.ts))
`patchFormSettings` mutation:
- Input shape now has all three flags optional and adds `inheritsToAncestors?: boolean`
- `invalidatesTags` now includes `"Records"` so toggling sharing busts cached record lists across the app

`updateSection` mutation in [lib/services/form-builder-api.ts](../lib/services/form-builder-api.ts):
- Already typed as `Partial<FormSection>`, no change needed — automatically picks up `excludeFromInheritance` because the `FormSection` interface in [types/form-builder.ts](../types/form-builder.ts) was extended with `excludeFromInheritance?: boolean`.

---

## UI changes

### Form-level toggle ([components/form-builder/user-form-settings-dialog.tsx](../components/form-builder/user-form-settings-dialog.tsx))
New "Sharing & Inheritance" card with a `Switch`:

> **Share submissions with parent roles**
> When enabled, every role above the submitter in the organization
> hierarchy can view their records (limited to users in the same
> organization unit). Disable this to keep records private to each
> submitter.

State:
- Reads `form.settings?.inheritsToAncestors` (default `true`)
- Included in `hasChanges` so the Save button enables when toggled
- Reset on cancel and on save failure

### Section-level toggle ([components/form-builder/section-settings.tsx](../components/form-builder/section-settings.tsx))
New `Switch` in the General → Visibility & Behavior card:

> **Hide from inherited views**
> When a parent role views a record they did not create, this section's
> fields will be hidden. The original creator always sees the full row.

Wired through the existing `formData` useState bag with proper sync, save,
and cancel paths.

### Inherited badge in records list ([components/modules/recordsDisplay.tsx](../components/modules/recordsDisplay.tsx))
Each record row checks for the `_inherited` marker. When true:

- The row gets a **2px amber left border** (`border-l-2 border-l-amber-400`)
- The row-index cell switches from gray to amber, gets a `Share2` icon, and
  carries an HTML `title` tooltip:
  > Inherited from {creator name} — you can view this record because they
  > report to your role.

The badge gracefully falls back to `submittedBy` → `_inheritedFromUserId` →
`"another user"` for the display name.

---

## Files touched

| File | Change |
|---|---|
| [prisma/schema.prisma](../prisma/schema.prisma) | `FormSection.excludeFromInheritance` column + 15× `[formId, userId]` indexes |
| [lib/database/roles.ts](../lib/database/roles.ts) | `getCallerRoleContext`, `getDescendantRoleIds`, `getInheritedUserIds`, TTL cache |
| [app/api/forms/[formId]/records/route.ts](../app/api/forms/[formId]/records/route.ts) | Inheritance WHERE clause + section redaction + `_inherited` markers |
| [app/api/forms/[formId]/route.ts](../app/api/forms/[formId]/route.ts) | PATCH accepts `inheritsToAncestors` and merges into `Form.settings` |
| [lib/api-handlers/form-builder.ts](../lib/api-handlers/form-builder.ts) | `updateSection` accepts `excludeFromInheritance` |
| [lib/database/DatabaseModules.ts](../lib/database/DatabaseModules.ts) | `updateSection` writes the new column |
| [lib/database/DatabaseTransforms.ts](../lib/database/DatabaseTransforms.ts) | `transformSection` surfaces `excludeFromInheritance` |
| [types/form-builder.ts](../types/form-builder.ts) | `FormSection` interface adds `excludeFromInheritance?: boolean` |
| [lib/api/forms.ts](../lib/api/forms.ts) | `patchFormSettings` types + invalidates `Records` tag |
| [components/form-builder/user-form-settings-dialog.tsx](../components/form-builder/user-form-settings-dialog.tsx) | Form-level Switch UI |
| [components/form-builder/section-settings.tsx](../components/form-builder/section-settings.tsx) | Section-level Switch UI |
| [components/modules/recordsDisplay.tsx](../components/modules/recordsDisplay.tsx) | Amber accent + tooltip on inherited rows |

---

## Backwards compatibility

- **Existing records** flow into ancestor views automatically because the rule
  is purely "creator userId ∈ descendants of caller's role" — no backfill
  needed and no `inheritedFrom` field on records.
- **Existing forms** behave identically until someone toggles the sharing
  switch off, because the missing `Form.settings.inheritsToAncestors` key
  defaults to `true`.
- **Existing permissions** (`RolePermission`, `UserPermissionOverride`,
  `RoutePermission`, etc.) are completely untouched. This feature only
  affects record-row visibility on the records list endpoint.
- **Anonymous form submissions** (where `userId IS NULL`) are not visible
  through inheritance — the `userId IN (...)` clause only matches non-null
  ids. They're only visible via the admin bypass path.

---

## Verification walkthrough

1. **Seed**: one org, one unit, role tree `Admin → Manager → Staff`, one user
   per role.
2. **Submit a record as Staff** on a test form with three sections.
3. Log in as **Manager** → records list shows the Staff record with the amber
   accent and "Inherited from..." tooltip.
4. Log in as **Admin** → same record appears.
5. Toggle **"Hide from inherited views"** on Section 2, refresh as Manager →
   Section 2 fields are stripped from the row but remain visible to Staff.
6. Toggle the form-level **"Share with parent roles"** OFF → Manager and
   Admin no longer see the Staff record. Staff still sees it.
7. **Multi-unit isolation**: add a second unit, assign a second Manager
   there, submit a new record from Staff in unit 1 → the unit-2 Manager does
   **not** see it.
8. **Admin bypass**: turn the form-level toggle off again, log in as a user
   whose role has `isAdmin = true` → still sees everything in the org for
   that form.
9. **Re-parenting**: move Staff under a new Manager → wait ~60 s for cache
   TTL; the new Manager sees the record and the old Manager stops seeing it.
10. **Performance**: load a module dashboard with ~10 forms in one render →
    inspect the Postgres query log; the recursive CTE should be computed at
    most twice (once per call to the cached helper), not 10×.

---

## What was deliberately NOT changed

- `RolePermission`, `UserPermissionOverride`, `RoutePermission`, `Permission`
  models — untouched.
- The route-permission middleware and `check-route-permission.ts` —
  untouched.
- Write/edit/delete permissions on records — `canEditRecord` /
  `canDeleteRecord` continue to gate edits, so an inheriting ancestor can
  view but not modify a descendant's row unless they had explicit edit
  rights anyway.
- The `RolePermission.inheritedFrom` field — exists in the schema but
  unused. This feature does not write to it.
- The `DataSharingRule` model — exists in the schema but not wired into
  records visibility. Could be repurposed in a future iteration if the
  product needs cross-org or unit-to-unit sharing rules.
