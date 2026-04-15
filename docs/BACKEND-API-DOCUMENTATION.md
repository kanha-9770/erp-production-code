# ERP Backend API Documentation

> Complete reference for all backend API endpoints, their purpose, request/response formats, and underlying logic.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication APIs](#authentication-apis)
3. [User Management APIs](#user-management-apis)
4. [Organization & Units APIs](#organization--units-apis)
5. [Role & Permission APIs](#role--permission-apis)
6. [Module APIs](#module-apis)
7. [Form Builder APIs](#form-builder-apis)
8. [Section APIs](#section-apis)
9. [Field APIs](#field-apis)
10. [Subform APIs](#subform-apis)
11. [Form Record APIs](#form-record-apis)
12. [Lookup APIs](#lookup-apis)
13. [Employee APIs](#employee-apis)
14. [Attendance APIs](#attendance-apis)
15. [Payroll APIs](#payroll-apis)
16. [Import / Export APIs](#import--export-apis)
17. [Audit & System APIs](#audit--system-apis)
18. [Shared Utilities & Patterns](#shared-utilities--patterns)

---

## Architecture Overview

### Tech Stack

| Layer        | Technology                    |
| ------------ | ----------------------------- |
| Framework    | Next.js (App Router)          |
| Database     | PostgreSQL via Prisma ORM     |
| Auth         | Token-based (cookie sessions) |
| API Style    | REST (JSON request/response)  |
| File Storage | Local upload endpoint         |

### Key Architectural Patterns

- **Shared API Handlers** — Business logic lives in `lib/api-handlers/` (form-builder, organization, user-management). Route files are thin wrappers that delegate to these handlers.
- **Database Service Layer** — `lib/database-service.ts` orchestrates complex queries via helper classes: `DatabaseModules`, `DatabaseRecords`, `DatabaseRoles`, `DatabaseTransforms`.
- **Common API Helpers** — `lib/api-helpers.ts` provides `getAuthenticatedUser()`, `logAudit()`, standard response helpers (`apiSuccess`, `apiError`, `unauthorized`, `forbidden`, `notFound`).
- **Dynamic Record Tables** — Form submissions are stored in 15 pre-created tables (`form_records_1` through `form_records_15`). Each form maps to one table via `FormTableMapping`.
- **Hierarchical Data** — Modules, roles, and org units all support parent → child nesting with `level` tracking.
- **Permission Model** — Three layers: Role permissions + User permissions + User permission overrides. Scoped to modules, forms, sections, and individual fields.

### Authentication Flow

```
1. Client POST /api/auth/login  →  validates credentials
2. Server creates UserSession    →  generates token
3. Token set in "auth-token" cookie
4. Middleware checks cookie on every protected route
5. getAuthenticatedUser() retrieves user from token
6. 401 if no valid token, 403 if no organization
```

### Middleware (`middleware.ts`)

**Public routes (no auth needed):**
`/login`, `/register`, `/signup`, `/verify-otp`, `/forgot-password`, `/reset-password`, `/auth/*`, `/api/*`, `/form/*`, `/_next/*`

**Protected routes:** All others — redirects to `/login?callbackUrl=...` if no `auth-token` cookie.

---

## Authentication APIs

Base path: `/api/auth`

### POST `/api/auth/register`

**Purpose:** Register a new user account.

| Field      | Type   | Required | Description       |
| ---------- | ------ | -------- | ----------------- |
| `name`     | string | Yes      | User display name |
| `email`    | string | Yes      | Email address     |
| `password` | string | Yes      | Account password  |

**Response:** `{ userId, message: "Registration successful" }`

**Logic:**
- Hashes password with bcryptjs
- Creates User record with status `PENDING_VERIFICATION`
- Generates and sends OTP for email verification

---

### POST `/api/auth/login`

**Purpose:** Authenticate user with email/password or passwordless login.

| Field      | Type   | Required | Description                        |
| ---------- | ------ | -------- | ---------------------------------- |
| `email`    | string | Yes      | Email address                      |
| `password` | string | No       | Password (omit for passwordless)   |

**Response:** `{ token, user, requiresOTP }` or OTP sent for passwordless.

**Logic:**
- Validates credentials against stored hash
- Creates `UserSession` with token
- Sets `auth-token` cookie (httpOnly, secure)
- Records entry in `LoginHistory`
- If passwordless: sends OTP instead of returning token

---

### POST `/api/auth/verify-otp`

**Purpose:** Verify OTP code for login, registration, or password reset.

| Field    | Type   | Required | Description                                  |
| -------- | ------ | -------- | -------------------------------------------- |
| `userId` | string | Yes      | User ID                                      |
| `otp`    | string | Yes      | OTP code                                     |
| `type`   | string | Yes      | `EMAIL_VERIFICATION`, `LOGIN`, `PASSWORD_RESET`, etc. |

**Response:** `{ token, user }` (creates session on success)

---

### POST `/api/auth/logout`

**Purpose:** End user session.

**Auth:** Required (reads `auth-token` cookie).

**Logic:** Invalidates the `UserSession` record, clears cookie.

---

### GET `/api/auth/me`

**Purpose:** Get the currently authenticated user's profile.

**Auth:** Required.

**Response:** Full user object including roles, employee data, organization, unit assignments.

---

### GET `/api/auth/user`

**Purpose:** Get a user's masked email by ID.

| Query Param | Type   | Description |
| ----------- | ------ | ----------- |
| `userId`    | string | User ID     |

**Response:** `{ email: "j***@example.com" }`

---

### POST `/api/auth/change-password`

**Purpose:** Change password for the authenticated user.

| Field             | Type   | Required |
| ----------------- | ------ | -------- |
| `currentPassword` | string | Yes      |
| `newPassword`     | string | Yes      |

**Auth:** Required.

---

### POST `/api/auth/forgot-password`

**Purpose:** Initiate password reset flow.

| Field   | Type   | Required |
| ------- | ------ | -------- |
| `email` | string | Yes      |

**Logic:** Generates OTP, sends to email. Returns `userId` for the next step.

---

### POST `/api/auth/reset-password`

**Purpose:** Complete password reset using OTP.

| Field         | Type   | Required |
| ------------- | ------ | -------- |
| `userId`      | string | Yes      |
| `otp`         | string | Yes      |
| `newPassword` | string | Yes      |

---

### POST `/api/auth/resend-otp`

**Purpose:** Resend an OTP code.

| Field    | Type   | Required |
| -------- | ------ | -------- |
| `userId` | string | Yes      |
| `type`   | string | Yes      |

---

### POST `/api/auth/update-profile`

**Purpose:** Update user profile fields.

| Field        | Type   | Required |
| ------------ | ------ | -------- |
| `first_name` | string | No       |
| `last_name`  | string | No       |
| `avatar`     | string | No       |
| ...other     | any    | No       |

**Auth:** Required.

---

### POST `/api/auth/upload-avatar`

**Purpose:** Upload a profile avatar image.

**Body:** `multipart/form-data` with file.

**Response:** `{ avatarUrl }`

---

### POST `/api/auth/remove-avatar`

**Purpose:** Remove the user's avatar.

**Auth:** Required.

---

## User Management APIs

Base path: `/api/users`

**Handler:** `UserManagementHandlers` in `lib/api-handlers/user-management.ts`

### GET `/api/users`

**Purpose:** List all users in the authenticated user's organization.

**Auth:** Required.

**Response:** Array of user objects with unit assignments and roles.

**Logic:** Fetches all users where `organizationId` matches the caller's org. Includes related `userUnitAssignment` with role details.

---

### POST `/api/users`

**Purpose:** Create a new user (admin only).

| Field            | Type   | Required | Description                 |
| ---------------- | ------ | -------- | --------------------------- |
| `name`           | string | Yes      | Display name                |
| `email`          | string | Yes      | Email address               |
| `password`       | string | No       | Password (auto-generated if omitted) |
| `unitId`         | string | No       | Assign to org unit          |
| `roleId`         | string | No       | Assign role                 |
| `employeeData`   | object | No       | Create linked employee      |

**Auth:** Required (admin check).

**Logic:**
- Creates `User` with hashed password
- Optionally creates `Employee` record
- Optionally creates `UserUnitAssignment`
- Logs audit event

---

### GET `/api/users/[id]`

**Purpose:** Get a single user's profile.

**Auth:** Required (admin or self-access).

**Response:** User object with employee data, unit assignments, organization details.

---

### PUT `/api/users/[id]`

**Purpose:** Update user profile and/or employee data.

**Auth:** Required (admin or self-access).

**Logic:** Updates user fields, upserts employee data if provided, updates unit assignments.

---

### DELETE `/api/users/[id]`

**Purpose:** Delete a user.

**Auth:** Required (admin only).

**Logic:** Cascade-deletes user and related records.

---

### GET `/api/users/[id]/assignments`

**Purpose:** Get a user's organizational unit assignments.

**Response:** Array of `UserUnitAssignment` records with unit and role details.

---

### GET `/api/user`

**Purpose:** Get the authenticated user (alternate endpoint).

**Auth:** Required.

---

### GET `/api/user/[userid]/admin-status`

**Purpose:** Check whether a user has admin privileges.

**Response:** `{ isAdmin: boolean }`

**Logic:** Checks if the user has any `UserUnitAssignment` where the linked role has `isAdmin: true`.

---

### GET `/api/user/permitted-modules`

**Purpose:** Get modules the authenticated user has access to.

**Auth:** Required.

**Logic:** Admin users get all modules. Non-admin users get modules where they have `RolePermission` with `granted: true`.

---

### GET `/api/user/attendance-user`

**Purpose:** Get the authenticated user's attendance status.

**Auth:** Required.

---

### POST `/api/create-user-from-employee`

**Purpose:** Create a user account from an existing employee record.

**Logic:** Links the new user to the employee record, optionally assigns unit/role.

---

### GET `/api/admin/users`

**Purpose:** Admin-level user listing.

---

### POST `/api/admin/users`

**Purpose:** Admin-level user creation.

---

## Organization & Units APIs

### POST `/api/organizations/create`

**Purpose:** Create a new organization.

**Logic:**
- Creates `Organization` with the current user as owner
- Creates a default root `OrganizationUnit`
- Creates a default admin `Role`
- Assigns the creator to the root unit with admin role

---

### POST `/api/organizations/ensure`

**Purpose:** Idempotent organization creation — creates only if one doesn't exist for the user.

---

### GET `/api/organizations/check`

**Purpose:** Check if the user has an organization.

**Response:** `{ hasOrganization: boolean, organization?: {...} }`

---

### GET `/api/organizations/[id]/units`

**Purpose:** List all units in an organization.

**Response:** Array of `OrganizationUnit` with hierarchy (parent-child).

---

### POST `/api/organizations/[id]/units`

**Purpose:** Create a new unit in the organization.

| Field      | Type   | Required | Description             |
| ---------- | ------ | -------- | ----------------------- |
| `name`     | string | Yes      | Unit name               |
| `parentId` | string | No       | Parent unit ID          |
| `slug`     | string | No       | URL-friendly identifier |

---

### GET `/api/organizations/[id]/units/[slug]`

**Purpose:** Get a unit by its slug.

---

### PUT `/api/organizations/[id]/units/[slug]`

**Purpose:** Update a unit.

---

### DELETE `/api/organizations/[id]/units/[slug]`

**Purpose:** Delete a unit.

---

### GET `/api/organizations/[id]/roles`

**Purpose:** Get all roles in the organization.

---

### GET `/api/organization-units`

**Purpose:** List org units for the authenticated user's organization.

**Auth:** Required.

**Handler:** `OrganizationHandlers.getOrgUnits()`

---

### GET/PUT/DELETE `/api/units/[id]`

**Purpose:** CRUD operations on individual units by ID.

---

## Role & Permission APIs

### GET/POST `/api/role`

**Purpose:** List or create roles.

---

### DELETE `/api/roles/[id]`

**Purpose:** Delete a role with cascade.

**Handler:** `OrganizationHandlers.deleteRole()`

**Logic:**
- Finds the role and all descendant roles (child hierarchy)
- Deletes in order: `RolePermission` → `UnitRoleAssignment` → `UserUnitAssignment` → `Role`
- Prevents orphaned references

---

### GET `/api/permissions`

**Purpose:** List all permissions in the system.

---

### GET/POST/DELETE `/api/permissions/[resourceType]/[resourceId]`

**Purpose:** Manage permissions on a specific resource (module, form, etc.).

---

### GET/POST `/api/permissions/section/[sectionId]`

**Purpose:** Manage section-level permissions.

---

### GET `/api/user-permissions?userId=X`

**Purpose:** Get all permissions for a specific user.

---

### PUT `/api/user-permissions`

**Purpose:** Batch update user permissions.

---

### GET `/api/user-permission-overrides`

**Purpose:** Get user-level permission overrides (exceptions to role permissions).

---

### POST `/api/user-permission-overrides`

**Purpose:** Create a permission override for a user.

| Field          | Type    | Required | Description                 |
| -------------- | ------- | -------- | --------------------------- |
| `userId`       | string  | Yes      | Target user                 |
| `permissionId` | string  | Yes      | Permission to override      |
| `granted`      | boolean | Yes      | Grant or deny               |
| `expiresAt`    | date    | No       | Optional expiry             |

---

### GET `/api/user-role-permissions`

**Purpose:** Get role-based permissions for the user.

---

### GET/POST `/api/user-unit-assignments`

**Purpose:** Manage user-to-unit-to-role assignments.

---

### GET `/api/role-permissions`

**Purpose:** List all role permissions.

---

### GET `/api/modules-permission`

**Purpose:** Get module-level permission definitions.

---

### GET `/api/employees/permissions`

**Purpose:** Get all employees with their module permissions.

**Handler:** `OrganizationHandlers.getEmployeePermissions()`

---

### POST `/api/employees/permissions`

**Purpose:** Batch update employee/role permissions.

**Handler:** `OrganizationHandlers.updateEmployeePermissions()`

**Logic:** Updates `RolePermission` records — sets `granted` flag for each module per role.

---

## Module APIs

Base path: `/api/modules`

**Handler:** `FormBuilderHandlers` in `lib/api-handlers/form-builder.ts`

### GET `/api/modules`

**Purpose:** Fetch all modules the user can access, organized hierarchically.

**Auth:** Required.

**Response:** Array of modules with nested children, forms, and metadata.

**Logic:**
- Admin: returns all modules in organization
- Non-admin: filters by `RolePermission` where `granted: true`
- Includes form count per module

---

### POST `/api/modules`

**Purpose:** Create a new module.

| Field       | Type   | Required | Description                   |
| ----------- | ------ | -------- | ----------------------------- |
| `name`      | string | Yes      | Module name                   |
| `parentId`  | string | No       | Parent module (for nesting)   |
| `type`      | string | No       | `master` or `child`           |
| `icon`      | string | No       | Icon identifier               |

**Auth:** Required.

**Logic:** Creates `FormModule` with calculated `level`, logs audit.

---

### DELETE `/api/modules`

**Purpose:** Delete a module (ID sent in request body).

| Field      | Type   | Required |
| ---------- | ------ | -------- |
| `id` or `moduleId` | string | Yes      |

---

### GET `/api/modules/[moduleId]`

**Purpose:** Fetch a single module with its forms.

---

### PUT `/api/modules/[moduleId]`

**Purpose:** Update module metadata (name, icon, etc.).

---

### DELETE `/api/modules/[moduleId]`

**Purpose:** Delete a module by ID.

**Logic:** Validates no child modules exist before deletion.

---

### GET `/api/modules/hierarchy`

**Purpose:** Get the full module tree structure.

**Response:** Nested module hierarchy with parent-child relationships.

---

### GET `/api/modules/[moduleId]/forms`

**Purpose:** Get all forms belonging to a module.

---

### PATCH `/api/modules/[moduleId]/move`

**Purpose:** Move a module to a new parent.

| Field          | Type   | Required |
| -------------- | ------ | -------- |
| `newParentId`  | string | Yes      |

---

### PATCH `/api/modules/[moduleId]/reorder`

**Purpose:** Reorder items within a module.

---

### GET `/api/modules/[moduleId]/lookup`

**Purpose:** Get lookup sources available in a module.

---

## Form Builder APIs

Base path: `/api/forms`

### GET `/api/forms/[formId]`

**Purpose:** Fetch a form's complete structure.

**Query Params:**

| Param       | Type    | Description                          |
| ----------- | ------- | ------------------------------------ |
| `published` | boolean | If `true`, returns published version |

**Response:** Form with sections, fields, subforms, conditional logic, styling.

---

### PUT `/api/forms/[formId]`

**Purpose:** Update form configuration.

**Handler:** `FormBuilderHandlers.updateForm()`

---

### PATCH `/api/forms/[formId]`

**Purpose:** Partial update (name, description, isEmployeeForm, isUserForm).

**Special Logic:**
- Setting `isEmployeeForm: true` maps the form to `form_records_14`
- Setting `isUserForm: true` maps the form to `form_records_15`

---

### DELETE `/api/forms/[formId]`

**Purpose:** Delete a form and all its sections/fields.

---

### GET `/api/forms/[formId]/full`

**Purpose:** Get the complete form structure with all nested data (sections, fields, subforms, conditions).

---

### POST `/api/forms/[formId]/publish`

**Purpose:** Publish a form version.

**Logic:** Sets `isPublished: true`, generates public URL if needed.

---

### PATCH `/api/forms/[formId]/move`

**Purpose:** Move a form to a different module.

| Field      | Type   | Required |
| ---------- | ------ | -------- |
| `moduleId` | string | Yes      |

---

### PATCH `/api/forms/[formId]/reorder`

**Purpose:** Reorder fields and sections within a form.

---

### GET `/api/forms/permitted`

**Purpose:** Get forms the authenticated user has permission to access.

**Logic:** Filters based on role permissions and user permission overrides.

---

### GET `/api/forms/[formId]/count`

**Purpose:** Get the total record count for a form.

**Response:** `{ count: number }`

---

### GET `/api/forms/[formId]/total`

**Purpose:** Get aggregate totals for numeric fields in a form.

**Response:** Sum/totals of numeric field values across all records.

---

### GET `/api/forms/[formId]/analytics`

**Purpose:** Get analytics and insights for a form's data.

---

### GET `/api/forms/[formId]/events`

**Purpose:** Get form events and activity log.

---

### GET `/api/forms/[formId]/export`

**Purpose:** Export form records.

| Query Param | Type   | Values          |
| ----------- | ------ | --------------- |
| `format`    | string | `csv`, `json`   |

---

### GET `/api/forms/[formId]/linked-records`

**Purpose:** Get records from other forms that are linked/related to this form.

---

### GET `/api/forms/[formId]/lookup-sources`

**Purpose:** Get lookup source definitions available for this form.

---

## Section APIs

Base path: `/api/sections`

**Handler:** `FormBuilderHandlers` in `lib/api-handlers/form-builder.ts`

### GET `/api/sections`

**Purpose:** List sections (filtered by formId if provided).

---

### POST `/api/sections`

**Purpose:** Create a new section in a form.

| Field         | Type    | Required | Description              |
| ------------- | ------- | -------- | ------------------------ |
| `formId`      | string  | Yes      | Parent form              |
| `title`       | string  | Yes      | Section title            |
| `order`       | number  | No       | Display order            |
| `columns`     | number  | No       | Column layout (1-4)      |
| `collapsible` | boolean | No       | Can be collapsed         |
| `conditional` | JSON    | No       | Conditional visibility   |
| `styling`     | JSON    | No       | Custom styling           |

---

### GET `/api/sections/[sectionId]`

**Purpose:** Get a single section with its fields.

---

### PUT `/api/sections/[sectionId]`

**Purpose:** Update section properties.

---

### DELETE `/api/sections/[sectionId]`

**Purpose:** Delete a section and clean up its fields.

**Logic:** Removes fields belonging to the section, cleans up lookup references, logs audit.

---

## Field APIs

Base path: `/api/fields`

**Handler:** `FormBuilderHandlers` in `lib/api-handlers/form-builder.ts`

### GET `/api/fields`

**Purpose:** List fields.

| Query Param  | Type   | Description                |
| ------------ | ------ | -------------------------- |
| `sectionId`  | string | Filter by section          |
| `subformId`  | string | Filter by subform          |

---

### POST `/api/fields`

**Purpose:** Create a new field.

| Field             | Type    | Required | Description                    |
| ----------------- | ------- | -------- | ------------------------------ |
| `sectionId`       | string  | Yes*     | Parent section (*or subformId) |
| `subformId`       | string  | Yes*     | Parent subform (*or sectionId) |
| `label`           | string  | Yes      | Field label                    |
| `type`            | string  | Yes      | Field type (text, number, dropdown, etc.) |
| `required`        | boolean | No       | Validation requirement         |
| `defaultValue`    | string  | No       | Default value                  |
| `validation`      | JSON    | No       | Validation rules               |
| `options`         | JSON    | No       | Options for dropdown/radio/checkbox |
| `formula`         | string  | No       | Formula expression             |
| `lookupSourceId`  | string  | No       | Lookup source reference        |
| `decimalPlaces`   | number  | No       | Decimal precision              |
| `width`           | string  | No       | Display width                  |
| `order`           | number  | No       | Display order                  |
| `readonly`        | boolean | No       | Read-only flag                 |
| `visible`         | boolean | No       | Visibility flag                |
| `conditional`     | JSON    | No       | Conditional display logic      |
| `styling`         | JSON    | No       | Custom styling                 |

---

### GET `/api/fields/[fieldId]`

**Purpose:** Get a single field.

---

### PUT `/api/fields/[fieldId]`

**Purpose:** Update a field.

**Logic:** Handles special cases for dependent fields (cascade dropdowns), formula fields, and lookup field relations.

---

### DELETE `/api/fields/[fieldId]`

**Purpose:** Delete a field.

---

### GET `/api/forms/[formId]/fields`

**Purpose:** Get all fields in a form (optionally filtered by section or subform).

---

### POST `/api/forms/[formId]/fields`

**Purpose:** Create a field within a specific form.

---

### GET/PUT/DELETE `/api/forms/[formId]/fields/[fieldId]`

**Purpose:** CRUD operations on fields within a form context.

---

### POST `/api/forms/[formId]/fields/[fieldId]/calculate`

**Purpose:** Execute a formula calculation for a field.

**Logic:** Evaluates the formula expression using the current record data, returns computed value.

---

### GET `/api/forms/[formId]/fields/[fieldId]/formula`

**Purpose:** Get the formula definition for a field.

---

### GET `/api/field-types`

**Purpose:** Get all available field types (text, number, date, dropdown, etc.).

---

### GET `/api/generate-unique-id/[fieldId]`

**Purpose:** Generate a unique auto-incremented ID for a field.

**Logic:** Uses `UniqueIdCounter` table to maintain sequence per field.

---

## Subform APIs

Base path: `/api/subforms`

### POST `/api/subforms`

**Purpose:** Create a nested subform (repeating section).

| Field              | Type    | Required | Description                 |
| ------------------ | ------- | -------- | --------------------------- |
| `formId`           | string  | No*      | Parent form                 |
| `parentSubformId`  | string  | No*      | Parent subform (for nesting)|
| `name`             | string  | Yes      | Subform name                |
| `description`      | string  | No       | Description                 |
| `order`            | number  | No       | Display order               |
| `level`            | number  | No       | Nesting level               |
| `columns`          | number  | No       | Column layout               |
| `visible`          | boolean | No       | Visibility                  |
| `collapsible`      | boolean | No       | Can be collapsed            |
| `collapsed`        | boolean | No       | Default collapsed state     |

*One of `formId` or `parentSubformId` required.

**Logic:** Calculates path (e.g., "1.2.3") and level automatically for nested subforms.

---

### GET `/api/subforms`

**Purpose:** List subforms.

| Query Param        | Type    | Description                |
| ------------------ | ------- | -------------------------- |
| `formId`           | string  | Filter by parent form      |
| `parentSubformId`  | string  | Filter by parent subform   |
| `includeNested`    | boolean | Include nested children    |

---

### GET `/api/subforms/[subformId]`

**Purpose:** Get a subform with its fields and child subforms.

---

### PUT `/api/subforms/[subformId]`

**Purpose:** Update a subform.

---

### DELETE `/api/subforms/[subformId]`

**Purpose:** Delete a subform and its contents.

---

### GET `/api/subforms/[subformId]/records`

**Purpose:** Get records within a subform.

| Query Param | Type   | Description       |
| ----------- | ------ | ----------------- |
| `formId`    | string | Form context      |
| `recordId`  | string | Parent record ID  |

---

### POST `/api/subforms/[subformId]/records`

**Purpose:** Create a record within a subform.

---

## Form Record APIs

Base path: `/api/forms/[formId]/records` and `/api/forms/[formId]/submit`

### How Record Storage Works

Each form is mapped to one of 15 pre-created tables (`form_records_1` through `form_records_15`) via the `FormTableMapping` table. Special mappings:
- **Employee forms** (`isEmployeeForm: true`) → `form_records_14`
- **User forms** (`isUserForm: true`) → `form_records_15`

Records store form data as JSON in the `recordData` column.

---

### GET `/api/forms/[formId]/records`

**Purpose:** Fetch all records for a form.

| Query Param       | Type   | Description           |
| ----------------- | ------ | --------------------- |
| `userId`          | string | Filter by submitter   |
| `organizationId`  | string | Filter by org         |

**Response:** Array of records with `id`, `recordData`, `submittedBy`, `submittedAt`, `status`.

---

### POST `/api/forms/[formId]/records`

**Purpose:** Create a new form record.

**Body:** Form data structure (JSON object matching the form's field definitions).

**Logic:**
- Determines target table via `FormTableMapping`
- Stores data as JSON in `recordData`
- Sets `submittedBy`, `submittedAt`, `userId`
- Captures `ipAddress` and `userAgent`

---

### GET `/api/forms/[formId]/records/[recordId]`

**Purpose:** Fetch a single record.

---

### PUT `/api/forms/[formId]/records/[recordId]`

**Purpose:** Update an existing record.

---

### DELETE `/api/forms/[formId]/records/[recordId]`

**Purpose:** Delete a record.

---

### POST `/api/forms/[formId]/submit`

**Purpose:** Submit a form with full validation and workflow processing.

**Logic:**
- Validates required fields
- Processes conditional logic
- Executes any form event triggers
- Stores the record
- Logs audit event with full metadata

**Record Data Structure:**
```json
{
  "sections": {
    "<sectionId>": {
      "fields": {
        "<fieldId>": {
          "label": "Field Name",
          "value": "field value",
          "type": "text"
        }
      }
    }
  },
  "subforms": {
    "<subformId>": {
      "fields": { ... },
      "rows": [ ... ],
      "childSubforms": { ... }
    }
  },
  "metadata": { ... }
}
```

---

### GET `/api/employee-records`

**Purpose:** Get submitted employee form records (from `form_records_14`).

---

## Lookup APIs

Lookups allow forms to reference data from other forms.

### GET `/api/lookup-form?sourceId=X`

**Purpose:** Get the form structure for a lookup source.

---

### GET `/api/lookup/data`

**Purpose:** Fetch lookup values with search and pagination.

| Query Param | Type   | Default | Description              |
| ----------- | ------ | ------- | ------------------------ |
| `sourceId`  | string | —       | Lookup source ID         |
| `search`    | string | —       | Search filter            |
| `limit`     | number | 50      | Page size                |
| `offset`    | number | 0       | Pagination offset        |

---

### GET `/api/lookup/fields?sourceId=X`

**Purpose:** Get the list of fields available for lookup mapping.

---

### GET `/api/lookup/sections?sourceId=X`

**Purpose:** Get sections available in the lookup source.

---

### GET `/api/lookup/sources`

**Purpose:** Get all lookup sources in the system.

---

## Employee APIs

### GET `/api/employees`

**Purpose:** List employees in the organization.

**Handler:** `UserManagementHandlers.getEmployees()`

**Auth:** Required.

**Logic:** Filters by organization. Role-based filtering for non-admin users.

**Response:** Array of employee objects with:
- `employeeName`, `department`, `designation`
- `totalSalary`, `givenSalary`, `bonusAmount`
- `nightAllowance`, `overTime`, `oneHourExtra`
- `status` (ACTIVE, INACTIVE, ON_LEAVE, TERMINATED)
- Linked `User` data

---

## Attendance APIs

### GET `/api/attendance?userId=X`

**Purpose:** Get attendance records for a user.

---

### POST `/api/attendance`

**Purpose:** Record check-in or check-out.

| Field    | Type   | Required | Values               |
| -------- | ------ | -------- | -------------------- |
| `userId` | string | Yes      | User ID              |
| `action` | string | Yes      | `checkin`, `checkout` |

---

### GET `/api/attendance/status?userId=X&formId=Y`

**Purpose:** Get current attendance status.

---

### POST `/api/forms/[formId]/attendance/checkin`

**Purpose:** Check in within a form context.

---

### POST `/api/forms/[formId]/attendance/checkout`

**Purpose:** Check out within a form context.

---

### GET `/api/forms/[formId]/attendance/status`

**Purpose:** Get attendance status within form context.

---

## Payroll APIs

Base path: `/api/payroll`

### GET `/api/payroll`

**Purpose:** Get payroll configuration.

---

### POST `/api/payroll`

**Purpose:** Create or update payroll configuration.

---

### GET/POST/PUT `/api/payroll/config`

**Purpose:** Manage payroll configuration settings.

---

### GET `/api/payroll/records`

**Purpose:** Get payroll records.

| Query Param | Type   | Description |
| ----------- | ------ | ----------- |
| `month`     | number | Month (1-12)|
| `year`      | number | Year        |

---

### POST `/api/payroll/records`

**Purpose:** Create a payroll record.

| Field          | Type   | Required |
| -------------- | ------ | -------- |
| `employeeId`   | string | Yes      |
| `month`        | number | Yes      |
| `year`         | number | Yes      |
| `presentDays`  | number | Yes      |
| `leaveDays`    | number | Yes      |
| `grossSalary`  | number | Yes      |
| `deductions`   | number | Yes      |
| `status`       | string | Yes      |

---

### GET/PUT/DELETE `/api/payroll/records/[id]`

**Purpose:** CRUD operations on individual payroll records.

---

### POST `/api/payroll/auto-generate`

**Purpose:** Auto-generate payroll records for all employees.

| Field   | Type   | Required |
| ------- | ------ | -------- |
| `month` | number | Yes      |
| `year`  | number | Yes      |

**Logic:** Pulls attendance data and employee salary info to compute payroll for each employee automatically.

---

### GET `/api/payroll/forms`

**Purpose:** Get forms linked to payroll processing.

---

### GET `/api/payroll/form-fields`

**Purpose:** Get form fields available for payroll mapping.

---

### GET `/api/payroll/stats`

**Purpose:** Get payroll statistics.

| Query Param | Type   |
| ----------- | ------ |
| `month`     | number |
| `year`      | number |

**Response:** Aggregated stats (total salary, deductions, employee counts, etc.).

---

### POST `/api/payroll/save`

**Purpose:** Bulk save payroll data.

---

### GET/POST `/api/payroll/leave-type`

**Purpose:** Manage leave types (FULL_DAY, HALF_DAY, SHORT_LEAVE, HOURLY).

---

### GET/POST `/api/payroll/leave-rules`

**Purpose:** Manage leave rules and policies.

---

## Import / Export APIs

### POST `/api/import/create-job`

**Purpose:** Create a new import job.

| Field                | Type   | Required | Description            |
| -------------------- | ------ | -------- | ---------------------- |
| `moduleId`           | string | Yes      | Target module          |
| `formId`             | string | Yes      | Target form            |
| `fileName`           | string | Yes      | Source file name       |
| `fileSize`           | number | No       | File size in bytes     |
| `duplicateHandling`  | string | Yes      | `INSERT_ONLY`, `UPDATE_ONLY`, `UPSERT` |
| `importOptions`      | JSON   | No       | Additional options     |

**Response:** `{ importJobId, success: true }`

---

### POST `/api/import/add-mapping`

**Purpose:** Map source file columns to form fields.

**Body:** Mapping configuration (source column → target field).

---

### POST `/api/import/process`

**Purpose:** Execute the import job.

| Field   | Type   | Required |
| ------- | ------ | -------- |
| `jobId` | string | Yes      |

**Logic:** Reads mapped data, applies duplicate handling strategy, inserts/updates records.

---

### POST `/api/export/create-job`

**Purpose:** Create an export job.

| Field     | Type   | Required | Values                  |
| --------- | ------ | -------- | ----------------------- |
| `formId`  | string | Yes      | Form to export          |
| `fields`  | array  | No       | Specific fields to include |
| `format`  | string | Yes      | `CSV`, `XLSX`, `JSON`   |
| `filters` | JSON   | No       | Filter criteria         |

---

### GET `/api/export/[jobId]/download`

**Purpose:** Download the exported file.

**Response:** File stream in the requested format.

---

### GET `/api/master-data`

**Purpose:** Get master/seed data.

---

## Audit & System APIs

### GET `/api/audit-log`

**Purpose:** Get audit logs.

**Auth:** Required.

**Logic:**
- Admin users: see all logs in the organization
- Regular users: see only their own logs

**Response:** Array of audit entries with `action`, `module`, `details`, `performedBy`, `ipAddress`, `userAgent`, `createdAt`.

---

### GET `/api/login-history`

**Purpose:** Get login history for the user.

**Auth:** Required.

---

### GET `/api/stats`

**Purpose:** Get system dashboard statistics.

**Auth:** Required.

**Response:** Aggregated counts and metrics (users, forms, records, etc.).

---

### POST `/api/init`

**Purpose:** Initialize the database with seed data (field types, etc.).

**Logic:** Seeds `FieldType` table with all available field types if they don't exist.

---

### GET `/api/system-time`

**Purpose:** Get the current server time.

**Response:** `{ time: "ISO timestamp" }`

---

### POST `/api/upload`

**Purpose:** Generic file upload endpoint.

**Body:** `multipart/form-data` with file.

**Response:** `{ url: "uploaded file path" }`

---

## Shared Utilities & Patterns

### API Helpers (`lib/api-helpers.ts`)

| Function                       | Purpose                                    |
| ------------------------------ | ------------------------------------------ |
| `getAuthenticatedUser(request)` | Validates `auth-token` cookie, returns user |
| `getRequestMeta(request)`      | Extracts IP address and User-Agent         |
| `logAudit(params)`             | Writes to AuditLog (never throws)          |
| `apiSuccess(data, meta?)`      | Standard 200 response                      |
| `apiError(message, status)`    | Standard error response                    |
| `unauthorized()`               | 401 response                               |
| `forbidden(message)`           | 403 response                               |
| `notFound(message)`            | 404 response                               |

### Standard Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message"
}
```

### Audit Log Entry

Every significant API operation logs:

| Field            | Description                       |
| ---------------- | --------------------------------- |
| `userId`         | Who performed the action          |
| `performedBy`    | User email                        |
| `action`         | What happened (CREATE, UPDATE, DELETE, etc.) |
| `module`         | Which module/area                 |
| `details`        | Human-readable description        |
| `recordId`       | Affected record ID                |
| `recordName`     | Affected record name              |
| `organizationId` | Organization context              |
| `ipAddress`      | Client IP                         |
| `userAgent`      | Client browser/agent              |
| `createdAt`      | Timestamp                         |

### Employee Data Parser (`lib/employeeDataParser.ts`)

**Purpose:** Flattens nested `StructuredRecordData` from form submissions into a flat key-value structure.

**Functions:**
- `parseEmployeeData(recordData)` — Main entry point, returns `ParsedEmployeeData`
- `analyzeRecordDataStructure(recordData)` — Debug helper showing field extraction
- Handles sections → fields, subforms → rows → child subforms recursively

### Database Service Layer

```
lib/database-service.ts          → Main orchestrator
lib/DatabaseModules.ts           → Module/Form/Section/Subform CRUD
lib/DatabaseRecords.ts           → Form record operations
lib/DatabaseRoles.ts             → Role and permission queries
lib/DatabaseTransforms.ts        → Data serialization
```

### Permission Check Flow

```
1. getAuthenticatedUser() → get userId, organizationId
2. Check isAdmin via UserUnitAssignment → Role.isAdmin
3. If admin: full access
4. If not admin:
   a. Check RolePermission (granted = true)
   b. Check UserPermission (direct grants)
   c. Check UserPermissionOverride (exceptions, with expiry)
   d. Union of all = effective permissions
```

---

## Database Model Quick Reference

| Category               | Tables                                                        |
| ---------------------- | ------------------------------------------------------------- |
| **Auth & Users**       | User, UserSession, OTPCode, LoginHistory                      |
| **Organization**       | Organization, OrganizationUnit, DataSharingRule               |
| **Roles & Permissions**| Role, Permission, RolePermission, UserPermission, UserPermissionOverride, UserUnitAssignment, UnitRoleAssignment |
| **Form Builder**       | FormModule, Form, FormSection, FormField, Subform, FieldType, FormTableMapping |
| **Advanced Fields**    | FormulaField, LookupSource, LookupFieldRelation               |
| **Records**            | FormRecord1–15, SubformRecord                                 |
| **Employees**          | Employee, Attendance                                          |
| **Payroll**            | PayrollConfiguration, PayrollRecord, LeaveType, LeaveRule      |
| **Import/Export**      | ImportJob, ImportFieldMapping, ImportRow, ExportJob            |
| **System**             | AuditLog, Activity, UniqueIdCounter, FormEvent |
