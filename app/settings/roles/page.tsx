"use client"

import { useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { FormsSidebar } from "@/components/admin/forms-sidebar"
import { FormsPermissionMatrix } from "@/components/admin/forms-permission-matrix"
import { useModules } from "@/hooks/use-modules"
import type { FormSelection } from "@/types/permissions"

export default function RolesPermissionsPage() {
  const [formSelection, setFormSelection] = useState<FormSelection | null>(null)
  const { modules, loading, error } = useModules()

  const handleFormSelect = useCallback(
    (formId: string, moduleId: string, submoduleId?: string) => {
      setFormSelection({ formId, moduleId, submoduleId: submoduleId ?? null })
    },
    [],
  )

  return (
    <div className="container mx-auto space-y-6">
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">Error: {error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-1">
          <FormsSidebar
            modules={modules}
            loading={loading}
            onFormSelect={handleFormSelect}
            selectedForm={formSelection?.formId ?? null}
          />
        </div>

        <div className="lg:col-span-4">
          <FormsPermissionMatrix
            modules={modules}
            selectedForm={formSelection?.formId ?? null}
          />
        </div>
      </div>
    </div>
  )
}
