"use client"

import PageBackLink from "@/components/shared/page-back-link"
import { RoleTemplateSetup } from "@/components/admin/role-template-setup"

export default function RoleTemplatesPage() {
  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <div className="mb-4">
        <PageBackLink href="/settings/permission" label="Permission Management" />
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Quick Setup · Role Templates</h1>
        <p className="text-muted-foreground">
          Set up a role for a job in one click. Pick a role, then apply a template (a ready-made
          bundle of pages + actions) or copy another role&apos;s access. Grants are added across the
          page and approval systems at once — nothing is ever removed.
        </p>
      </div>
      <RoleTemplateSetup />
    </div>
  )
}
