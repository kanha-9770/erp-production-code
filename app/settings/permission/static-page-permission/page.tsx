"use client"

/**
 * /settings/permission/static-page-permission
 *
 * Mirror of /settings/permission/roles, but the resource being permissioned
 * is every entry in the static-page registry (lib/static-pages.ts) instead
 * of dynamic form modules.
 *
 * Pick a role on the left rail, then:
 *   • Permissions — every static page grouped by area with a granular
 *                   View / Create / Edit / Delete / Import / Export / Print /
 *                   Approval grid, backed by the SAME RolePermission engine as
 *                   form modules (scoped by pagePath). Granting View makes the
 *                   page appear in that role's sidebar.
 *   • Users       — the users assigned to the role (via the shared
 *                   RoleDetailTabs "Users" tab).
 *
 * Static pages have no form/section/field hierarchy, so those matrices are
 * omitted — the role page's structure is otherwise preserved.
 */

"use client"

import { useState } from "react"
import { Globe } from "lucide-react"
import { ByRoleView } from "@/components/admin/permission-page/by-role-view"
import { RoleStaticPagesMatrix } from "@/components/admin/static-page-permission/role-static-pages-matrix"
import { ByPageMatrix } from "@/components/admin/static-page-permission/by-page-matrix"
import PageBackLink from "@/components/shared/page-back-link"
import { cn } from "@/lib/utils"

type Mode = "by-page" | "by-role"

export default function StaticPagePermissionPage() {
  // Default to the page-centric view (pick a page → grant each user) — the
  // primary workflow. "By Role" (pick a role → grant every page) stays one
  // click away for the inverse pivot.
  const [mode, setMode] = useState<Mode>("by-page")

  return (
    <div className="w-full px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
      <PageHeader />

      <ModeToggle mode={mode} onChange={setMode} />

      {mode === "by-page" ? (
        <ByPageMatrix />
      ) : (
        <ByRoleView
          renderPermissionsSlot={(role) => (
            <RoleStaticPagesMatrix roleId={role.id} roleName={role.name} />
          )}
        />
      )}
    </div>
  )
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode
  onChange: (m: Mode) => void
}) {
  const tabs: Array<{ id: Mode; label: string; hint: string }> = [
    { id: "by-page", label: "By Page", hint: "Pick a page → grant each user" },
    { id: "by-role", label: "By Role", hint: "Pick a role → grant every page" },
  ]
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          title={t.hint}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode === t.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function PageHeader() {
  return (
    <div className="space-y-2">
      <PageBackLink href="/settings/permission" label="Permission Management" />
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
          <Globe className="h-4.5 w-4.5" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-semibold leading-tight">
            Static Page Permission
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-tight">
            Grant system pages (Leaves, Attendance, Payroll, …) per role with the
            same granular actions as modules and forms.
          </p>
        </div>
      </div>
    </div>
  )
}
