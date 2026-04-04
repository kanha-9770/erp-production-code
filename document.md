# Route-Based Permission System Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [How It Works](#how-it-works)
4. [File Reference](#file-reference)
5. [Route Permission Rules](#route-permission-rules)
6. [Three-Layer Defense System](#three-layer-defense-system)
7. [Cookie System](#cookie-system)
8. [Components & Hooks](#components--hooks)
9. [Adding New Protected Routes](#adding-new-protected-routes)
10. [Usage Examples](#usage-examples)
11. [Permission Resolution Flow](#permission-resolution-flow)
12. [Testing & Verification](#testing--verification)
13. [Troubleshooting](#troubleshooting)

---

## Overview

The ERP application implements a **three-layer route-based permission system** that controls access to pages based on user roles and permissions. It builds on top of the existing permission infrastructure (roles, permissions, user overrides) and adds route-level enforcement.

**Key Principles:**
- Admin users (`isAdmin: true` or role name `"ADMIN"`) bypass all permission checks
- Routes without explicit rules are open to all authenticated users
- Permission-denied users are redirected to `/unauthorized`
- Navigation items are filtered client-side to hide inaccessible routes

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Request Flow                                 │
│                                                                     │
│  User Request                                                       │
│      │                                                              │
│      ▼                                                              │
│  ┌──────────────────────────────────────────┐                       │
│  │  Layer 1: MIDDLEWARE (middleware.ts)     │   Fast / No DB calls  │
│  │  - Checks auth-token cookie exists       │                       │
│  │  - Reads auth-meta cookie (JSON)         │                       │
│  │  - Blocks admin-only routes for non-admin│                       │
│  │  - Forwards pathname via x-next-pathname │                       │
│  └──────────────────┬───────────────────────┘                       │
│                     │                                               │
│                     ▼                                               │
│  ┌──────────────────────────────────────────┐                       │
│  │  Layer 2: SERVER LAYOUTS                 │  Authoritative / DB   │
│  │  - admin/layout.tsx → admin role check   │                       │
│  │  - settings/layout.tsx → checkRoutePerms │                       │
│  │  - Queries DB for roles & permissions    │                       │
│  │  - Redirects to /unauthorized if denied  │                       │
│  └──────────────────┬───────────────────────┘                       │
│                     │                                               │
│                     ▼                                               │
│  ┌──────────────────────────────────────────┐                       │
│  │  Layer 3: CLIENT-SIDE (RouteGuard)       │  UX Polish            │
│  │  - RouteGuard component for dynamic pages│                       │
│  │  - Sidebar filters nav items             │                       │
│  │  - PermissionGate hides UI elements      │                       │
│  └──────────────────────────────────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## How It Works

### Step-by-step Request Lifecycle

1. **User navigates** to a protected route (e.g., `/admin/dashboard`)

2. **Middleware** (`middleware.ts`) intercepts the request:
   - Checks if route is public — if yes, allows through
   - Checks if `auth-token` cookie exists — if no, redirects to `/login`
   - Reads the `auth-meta` cookie (set at login) containing `{ isAdmin, roleNames }`
   - If the route matches an `requireAdmin: true` rule and `isAdmin` is `false`, redirects to `/unauthorized`
   - Sets `x-next-pathname` header for downstream server components

3. **Server Layout** renders:
   - `admin/layout.tsx` validates the session via DB, checks `unitAssignments` for admin role
   - `settings/layout.tsx` calls `checkRoutePermission()` which queries the DB for role permissions and user overrides
   - If not allowed, redirects to `/unauthorized`

4. **Client-Side** renders:
   - Sidebar filters navigation items (hides admin-only items for non-admin users)
   - `RouteGuard` component can wrap dynamic page content for additional checks
   - `PermissionGate` component hides specific UI elements

---

## File Reference

### New Files Created

| File | Type | Purpose |
|------|------|---------|
| `lib/route-permissions.ts` | Config | Route-to-permission mapping configuration and glob matcher |
| `lib/check-route-permission.ts` | Server Utility | DB-backed permission checker for server layouts |
| `app/unauthorized/page.tsx` | Page | 403 Access Denied page |
| `app/settings/layout.tsx` | Layout | Settings route permission enforcement |
| `components/guards/RouteGuard.tsx` | Component | Client-side route guard wrapper |

### Modified Files

| File | Changes |
|------|---------|
| `middleware.ts` | Added `auth-meta` cookie check, `matchRoute()` import, pathname forwarding header |
| `app/admin/layout.tsx` | Added admin role check after session validation |
| `app/api/auth/login/route.ts` | Sets `auth-meta` cookie with role info on successful login |
| `app/api/auth/logout/route.ts` | Clears `auth-meta` cookie on logout |
| `components/layout/sidebar.tsx` | Wired `usePermissionContext()`, filters nav items by permissions |

---

## Route Permission Rules

All rules are defined in `lib/route-permissions.ts`:

### Admin-Only Routes (`requireAdmin: true`)

| Route Pattern | Description |
|---------------|-------------|
| `/admin/**` | All admin pages (dashboard, analytics, intelligence, reports, chatbot, settings) |
| `/builder/**` | Form builder |
| `/data-migration/**` | Data import/export |
| `/settings/roles` | Role management |
| `/settings/users/**` | User management |
| `/settings/profiles` | Profile management |

### Permission-Gated Routes (`requiredPermissions`)

| Route Pattern | Required Permissions (any one) |
|---------------|-------------------------------|
| `/settings/audit-log` | `VIEW_AUDIT_LOG` |
| `/settings/company` | `MANAGE_COMPANY` |
| `/settings/import` | `IMPORT_DATA` |
| `/settings/masters` | `MANAGE_MASTERS` |
| `/settings/login-history` | `VIEW_LOGIN_HISTORY` |
| `/payroll` | `VIEW_PAYROLL` or `MANAGE_PAYROLL` |

### Open Routes (no rule = accessible to all authenticated users)

All routes not listed above are accessible to any authenticated user, including:
- `/` (Dashboard)
- `/forms/**`
- `/modules/**`
- `/chatbot`
- `/profile/**`
- `/settings` (root settings page)

---
  
## Three-Layer Defense System

### Layer 1: Middleware (`middleware.ts`)

**Purpose:** Fast, lightweight checks without database calls.

**How it works:**
- Reads the `auth-meta` cookie (JSON string containing `{ isAdmin: boolean, roleNames: string[] }`)
- Uses `matchRoute(pathname)` from `route-permissions.ts` to find a matching rule
- Only checks `requireAdmin` rules (admin-only routes)
- Does NOT check `requiredPermissions` rules (too expensive without DB)

**What it catches:**
- Non-admin users trying to access `/admin/**`, `/builder/**`, `/data-migration/**`, `/settings/roles`, `/settings/users/**`, `/settings/profiles`

**What it defers to layouts:**
- Permission-specific checks (e.g., `VIEW_AUDIT_LOG` for `/settings/audit-log`)

```typescript
// From middleware.ts
const authMetaRaw = request.cookies.get("auth-meta")?.value;
if (authMetaRaw) {
  const authMeta = JSON.parse(authMetaRaw);
  const rule = matchRoute(pathname);
  if (rule?.requireAdmin && !authMeta.isAdmin) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }
}
```

### Layer 2: Server Layouts

**Purpose:** Authoritative, DB-backed permission checks.

#### Admin Layout (`app/admin/layout.tsx`)

Validates session, then checks the user's `unitAssignments` for an admin role:

```typescript
const isAdmin = (session.user as any).unitAssignments?.some(
  (ua: any) => ua.role?.isAdmin || ua.role?.name?.toUpperCase() === 'ADMIN'
);
if (!isAdmin) {
  redirect('/unauthorized');
}
```

#### Settings Layout (`app/settings/layout.tsx`)

Validates session, reads the pathname from the `x-next-pathname` header, then calls `checkRoutePermission()`:

```typescript
const { allowed } = await checkRoutePermission(session.user.id, pathname);
if (!allowed) {
  redirect("/unauthorized");
}
```

#### `checkRoutePermission()` Function (`lib/check-route-permission.ts`)

The authoritative permission checker. Resolution order:

1. Fetch user's role assignments from DB (`unitAssignments` -> `role`)
2. If any role has `isAdmin: true` or name `"ADMIN"` -> **allowed**
3. Match pathname against `routePermissions` config
4. If no rule matches -> **allowed** (open by default)
5. If rule has `requireAdmin: true` and not admin -> **denied**
6. If rule has `requiredPermissions`:
   - Query `RolePermission` table for user's roles with matching permission names
   - If found -> **allowed**
   - Query `UserPermissionOverride` table for user-specific overrides (non-expired, granted)
   - If found -> **allowed**
   - Otherwise -> **denied**

### Layer 3: Client-Side

**Purpose:** UX polish — hide nav items, show loading states, guard dynamic routes.

#### RouteGuard Component (`components/guards/RouteGuard.tsx`)

A wrapper component for client-side permission gating:

```tsx
<RouteGuard requireAdmin>
  <AdminOnlyContent />
</RouteGuard>

<RouteGuard requiredPermissions={["VIEW_PAYROLL", "MANAGE_PAYROLL"]}>
  <PayrollDashboard />
</RouteGuard>

<RouteGuard
  requiredPermissions={["VIEW_FORM"]}
  moduleId="module-123"
  formId="form-456"
>
  <FormContent />
</RouteGuard>
```

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `requireAdmin` | `boolean` | Only admin users can see children |
| `requiredPermissions` | `string[]` | User needs at least one of these permissions |
| `moduleId` | `string` | Optional module scope for permission check |
| `formId` | `string` | Optional form scope for permission check |
| `loadingFallback` | `ReactNode` | Custom loading UI (defaults to spinner) |
| `redirectTo` | `string` | Redirect path on denial (defaults to `/unauthorized`) |

**Behavior:**
- While permissions load -> shows spinner (or custom `loadingFallback`)
- If denied -> redirects to `/unauthorized` (or custom `redirectTo`)
- If allowed -> renders children

#### Sidebar Filtering (`components/layout/sidebar.tsx`)

Navigation items are filtered based on the user's role:

```typescript
// Nav items with permission metadata
const allIconButtons = [
  { icon: Folder, view: "modules", label: "Modules" },
  { icon: Settings, route: "/settings", label: "Settings" },
  { icon: Sparkles, route: "/admin/chatbot", label: "AI Assistant", requireAdmin: true },
  // ...
];

// Filter based on permissions
const iconButtons = allIconButtons.filter((btn) => {
  if (btn.requireAdmin && !isAdmin) return false;
  return true;
});
```

The sidebar uses `usePermissionContext()` from `@/context/PermissionContext` for real permission data.

---

## Cookie System

### `auth-token` (existing)

| Property | Value |
|----------|-------|
| Purpose | Session authentication |
| Set at | Login (`/api/auth/login`) |
| Cleared at | Logout (`/api/auth/logout`) |
| HTTP-Only | Yes |
| Max Age | 7 days |
| Contains | Cryptographic session token |

### `auth-meta` (new)

| Property | Value |
|----------|-------|
| Purpose | Lightweight role data for middleware permission checks |
| Set at | Login (`/api/auth/login`) |
| Cleared at | Logout (`/api/auth/logout`) |
| HTTP-Only | Yes |
| Max Age | 7 days |
| Contains | JSON: `{ isAdmin: boolean, roleNames: string[] }` |

**Why a separate cookie?**
The middleware runs on every request and cannot perform database queries efficiently. The `auth-meta` cookie provides role information without DB overhead, enabling fast admin-only route checks.

**Important:** The `auth-meta` cookie is set only at login time. If a user's roles change (e.g., admin promoted/demoted) while they are logged in, the middleware check may be stale. However, the server layout (Layer 2) always performs a fresh DB check, so the authoritative enforcement remains correct. The user will need to re-login for the middleware layer to reflect role changes.

---

## Components & Hooks

### Existing Components Used

| Component/Hook | File | Role in Route Permissions |
|----------------|------|--------------------------|
| `PermissionProvider` | `context/PermissionContext.tsx` | Provides permission state to all client components |
| `usePermissionContext()` | `context/PermissionContext.tsx` | Access `hasPermission`, `hasAnyPermission`, `isLoading` |
| `PermissionGate` | `context/PermissionContext.tsx` | Conditionally render UI based on permissions |
| `usePermissions()` | `hooks/usePermissions.ts` | Core hook that fetches and builds permission map |
| `useFormPermissions()` | `hooks/use-form-permissions.ts` | Form-level `canView`, `canCreate`, `canEdit`, `canDelete` |
| `validateSession()` | `lib/auth.ts` | Server-side session validation with full user data |

### New Components

| Component/Function | File | Purpose |
|--------------------|------|---------|
| `RouteGuard` | `components/guards/RouteGuard.tsx` | Client-side route protection wrapper |
| `checkRoutePermission()` | `lib/check-route-permission.ts` | Server-side DB-backed permission check |
| `matchRoute()` | `lib/route-permissions.ts` | Match pathname against permission rules |
| `routePermissions` | `lib/route-permissions.ts` | Route permission configuration array |
| `UnauthorizedPage` | `app/unauthorized/page.tsx` | 403 Access Denied page |

---

## Adding New Protected Routes

### To add an admin-only route:

Add a new entry in `lib/route-permissions.ts`:

```typescript
export const routePermissions: RoutePermissionRule[] = [
  // ... existing rules
  { pattern: "/new-admin-page/**", requireAdmin: true },
];
```

This is automatically enforced by:
- **Middleware** (blocks non-admins via `auth-meta` cookie)
- **Server Layout** (if the route has a layout using `checkRoutePermission()`)

### To add a permission-gated route:

```typescript
export const routePermissions: RoutePermissionRule[] = [
  // ... existing rules
  { pattern: "/reports/financial", requiredPermissions: ["VIEW_FINANCIAL_REPORTS"] },
];
```

This is enforced by:
- **Server Layout** (if the route has a layout using `checkRoutePermission()`)
- **Middleware** does NOT check `requiredPermissions` (only `requireAdmin`)

For full enforcement, ensure the route's layout calls `checkRoutePermission()`.

### To protect a dynamic client-side route:

Wrap the page content with `RouteGuard`:

```tsx
// app/reports/[reportId]/page.tsx
import { RouteGuard } from "@/components/guards/RouteGuard";

export default function ReportPage({ params }) {
  return (
    <RouteGuard requiredPermissions={["VIEW_REPORTS"]} moduleId={params.moduleId}>
      <ReportContent reportId={params.reportId} />
    </RouteGuard>
  );
}
```

### To hide a sidebar navigation item:

Add `requireAdmin: true` to the item in `components/layout/sidebar.tsx`:

```typescript
const allIconButtons = [
  // ...
  { icon: MyIcon, route: "/my-route", label: "My Route", requireAdmin: true },
];
```

---

## Usage Examples

### Example 1: Protecting an entire section with a layout

```typescript
// app/reports/layout.tsx
import { validateSession } from "@/lib/auth";
import { checkRoutePermission } from "@/lib/check-route-permission";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportsLayout({ children }) {
  const cookieStore = cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) redirect("/login");

  const session = await validateSession(token);
  if (!session) redirect("/login");

  const headersList = headers();
  const pathname = headersList.get("x-next-pathname") || "/reports";

  const { allowed } = await checkRoutePermission(session.user.id, pathname);
  if (!allowed) redirect("/unauthorized");

  return <>{children}</>;
}
```

### Example 2: Using RouteGuard in a page component

```tsx
"use client";
import { RouteGuard } from "@/components/guards/RouteGuard";

export default function PayrollPage() {
  return (
    <RouteGuard requiredPermissions={["VIEW_PAYROLL", "MANAGE_PAYROLL"]}>
      <h1>Payroll Dashboard</h1>
      {/* Payroll content */}
    </RouteGuard>
  );
}
```

### Example 3: Using PermissionGate for fine-grained UI control

```tsx
import { PermissionGate } from "@/context/PermissionContext";

function SettingsPage() {
  return (
    <div>
      <h1>Settings</h1>

      <PermissionGate permission="MANAGE_COMPANY">
        <CompanySettings />
      </PermissionGate>

      <PermissionGate permissions={["VIEW_AUDIT_LOG"]} fallback={<p>No access to audit logs</p>}>
        <AuditLogViewer />
      </PermissionGate>
    </div>
  );
}
```

### Example 4: Using useFormPermissions for form-level checks

```tsx
import { useFormPermissions } from "@/hooks/use-form-permissions";

function FormPage({ formId }) {
  const { canView, canEdit, canDelete, isAdmin } = useFormPermissions(formId);

  if (!canView) return <p>You don't have access to this form.</p>;

  return (
    <div>
      <FormViewer formId={formId} />
      {canEdit && <EditButton />}
      {canDelete && <DeleteButton />}
    </div>
  );
}
```

---

## Permission Resolution Flow

```
User Request to /settings/audit-log
│
├── MIDDLEWARE (middleware.ts)
│   ├── Is route public? → No
│   ├── Has auth-token? → Yes
│   ├── Read auth-meta cookie → { isAdmin: false, roleNames: ["Manager"] }
│   ├── matchRoute("/settings/audit-log") → { requiredPermissions: ["VIEW_AUDIT_LOG"] }
│   ├── Rule has requireAdmin? → No (it has requiredPermissions)
│   └── PASS THROUGH (middleware doesn't check requiredPermissions)
│
├── SERVER LAYOUT (settings/layout.tsx)
│   ├── validateSession(token) → session with user data
│   ├── Read x-next-pathname header → "/settings/audit-log"
│   ├── checkRoutePermission(userId, "/settings/audit-log")
│   │   ├── Fetch user unitAssignments → [{ role: { id: "r1", name: "Manager", isAdmin: false } }]
│   │   ├── isAdmin? → No
│   │   ├── matchRoute("/settings/audit-log") → { requiredPermissions: ["VIEW_AUDIT_LOG"] }
│   │   ├── Query RolePermission where roleId="r1", permission.name="VIEW_AUDIT_LOG", granted=true
│   │   │   └── Found 1 result → ALLOWED
│   │   └── Return { allowed: true, isAdmin: false }
│   └── Render children
│
└── CLIENT RENDERS PAGE
    └── Sidebar shows filtered navigation items
```

---

## Testing & Verification

### Test Cases

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Non-admin navigates to `/admin/dashboard` | Redirected to `/unauthorized` |
| 2 | Non-admin navigates to `/builder/form-123` | Redirected to `/unauthorized` |
| 3 | Non-admin navigates to `/data-migration/import` | Redirected to `/unauthorized` |
| 4 | Non-admin navigates to `/settings/roles` | Redirected to `/unauthorized` |
| 5 | Non-admin navigates to `/settings/users` | Redirected to `/unauthorized` |
| 6 | User without `VIEW_AUDIT_LOG` navigates to `/settings/audit-log` | Redirected to `/unauthorized` |
| 7 | User with `VIEW_AUDIT_LOG` navigates to `/settings/audit-log` | Page renders normally |
| 8 | User without payroll permissions navigates to `/payroll` | Redirected to `/unauthorized` |
| 9 | User with `VIEW_PAYROLL` navigates to `/payroll` | Page renders normally |
| 10 | Admin user navigates to any route | All routes accessible |
| 11 | Non-admin user checks sidebar | "AI Assistant" nav item is hidden |
| 12 | Admin user checks sidebar | All nav items visible |
| 13 | After login, check cookies | Both `auth-token` and `auth-meta` cookies are set |
| 14 | After logout, check cookies | Both `auth-token` and `auth-meta` cookies are cleared |
| 15 | Unauthenticated user accesses protected route | Redirected to `/login?callbackUrl=/path` |
| 16 | User on `/unauthorized` page clicks "Go Back" | Navigates to previous page |
| 17 | User on `/unauthorized` page clicks "Go to Dashboard" | Navigates to `/` |

### Manual Testing Steps

1. **Test Admin Blocking:**
   - Log in as a non-admin user
   - Try navigating to `/admin/dashboard` directly via URL bar
   - Verify you see the "Access Denied" page

2. **Test Permission-Based Access:**
   - Log in as a user with `VIEW_AUDIT_LOG` permission
   - Navigate to `/settings/audit-log` — should work
   - Navigate to `/settings/company` — should be blocked (unless you also have `MANAGE_COMPANY`)

3. **Test Admin Bypass:**
   - Log in as an admin user
   - Navigate to every route — all should be accessible

4. **Test Cookie Lifecycle:**
   - Log in and check browser cookies for `auth-meta`
   - Verify it contains `{ "isAdmin": true/false, "roleNames": [...] }`
   - Log out and verify `auth-meta` is cleared

5. **Test Sidebar Filtering:**
   - Log in as non-admin — "AI Assistant" should not appear in sidebar
   - Log in as admin — "AI Assistant" should appear

---

## Troubleshooting

### User can access admin routes despite not being admin

**Possible causes:**
1. `auth-meta` cookie is stale (was set when user was admin). Solution: User needs to log out and log back in.
2. The server layout check should still catch this. If it doesn't, verify the user's `unitAssignments` in the database.

### User gets blocked from a route they should have access to

**Check these in order:**
1. Does the user's role have the required permission in `RolePermission` table with `granted: true`?
2. Is there a `UserPermissionOverride` that explicitly denies access (`granted: false`)?
3. Is the route pattern correctly defined in `lib/route-permissions.ts`?
4. For settings routes: is the `x-next-pathname` header being set correctly by middleware?

### `auth-meta` cookie not being set

**Check:**
1. Is the login going through the password login flow (not OTP)? The `auth-meta` cookie is set after successful password login. For OTP flow, it's set during the temporary session phase.
2. Check the login API route (`app/api/auth/login/route.ts`) for the `auth-meta` cookie set call.

### Sidebar still shows all items for non-admin

**Check:**
1. Is `usePermissionContext()` correctly imported in `sidebar.tsx`?
2. Is the `PermissionProvider` wrapping the layout? (It's in `ConditionalLayout.tsx`)
3. Is the user data loading correctly? Check `useGetUserQuery()` response.

### Permission changes not taking effect immediately

The `auth-meta` cookie is only set at login time. If roles/permissions are changed via the admin panel:
- **Middleware layer** (Layer 1): Won't reflect changes until re-login
- **Server layout** (Layer 2): Reflects changes immediately (queries DB on each request)
- **Client-side** (Layer 3): Reflects changes after `refreshPermissions()` is called or page is refreshed

---

## Glob Pattern Reference

The route permission system uses glob-style patterns:

| Pattern | Matches | Does NOT Match |
|---------|---------|----------------|
| `/admin/**` | `/admin/dashboard`, `/admin/analytics`, `/admin/a/b/c` | `/admin` (no trailing segment) |
| `/settings/users/**` | `/settings/users`, `/settings/users/user-management` | `/settings/profiles` |
| `/settings/roles` | `/settings/roles` | `/settings/roles/edit`, `/settings/roles-page` |
| `/payroll` | `/payroll` | `/payroll/details`, `/payroll-settings` |

**Supported wildcards:**
- `**` — Matches any number of path segments (including zero)
- `*` — Matches exactly one path segment

---

## Database Models Involved

### Permission Check Flow Queries

```
User (id)
  └── UserUnitAssignment (userId)
        └── Role (isAdmin, name)
              └── RolePermission (roleId, granted)
                    └── Permission (name)

User (id)
  └── UserPermissionOverride (userId, granted, expiresAt)
        └── Permission (name)
```

### Key Tables

| Table | Role in Route Permissions |
|-------|--------------------------|
| `User` | Base user record |
| `UserUnitAssignment` | Links user to organization unit and role |
| `Role` | Defines roles with `isAdmin` flag |
| `RolePermission` | Maps roles to permissions with `granted` flag |
| `Permission` | Permission definitions (`name`, `category`, `resource`) |
| `UserPermissionOverride` | Direct user permission overrides with optional expiry |
| `UserSession` | Session validation for server-side checks |
