"use client"

import PageBackLink from "@/components/shared/page-back-link"
import { ActionPermissionMatrix } from "@/components/admin/action-permission-matrix"

export default function ApprovalsPermissionPage() {
  return (
    <div className="container mx-auto px-6 py-8 max-w-7xl">
      <div className="mb-4">
        <PageBackLink href="/settings/permission" label="Permission Management" />
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Approvals &amp; Permissions</h1>
        <p className="text-muted-foreground">
          Grant each module&apos;s privileged functionalities — approvals, stock posting, payments — to roles and
          users. Changes are enforced server-side by the same engine as the rest of the permission system.
        </p>
      </div>
      <ActionPermissionMatrix />
    </div>
  )
}
