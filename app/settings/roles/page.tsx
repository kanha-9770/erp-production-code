"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { FormsSidebar } from "@/components/admin/forms-sidebar"
import { FormsPermissionMatrix } from "@/components/admin/forms-permission-matrix"

interface FormSelection {
  formId: string
  moduleId: string
  submoduleId?: string | null
}

export default function RolesPermissionsPage() {
  const [formSelection, setFormSelection] = useState<FormSelection | null>(null)
  const [modules, setModules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleFormSelect = useCallback((formId: string, moduleId: string, submoduleId?: string) => {
    setFormSelection({ formId, moduleId, submoduleId: submoduleId || null })
  }, [])

  useEffect(() => {
    let isMounted = true
    const fetchModules = async () => {
      try {
        setLoading(true)
        const res = await fetch("/api/modules-permission")
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (isMounted) {
          if (json.success) setModules(json.data)
          else setError(json.error || "Failed to load modules")
        }
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchModules()
    return () => { isMounted = false }
  }, [])

  return (
    <div className="container mx-auto space-y-6">
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">Error: {error}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="forms" className="space-y-4">
        <TabsContent value="forms" className="space-y-0">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-1">
              <FormsSidebar
                onFormSelect={handleFormSelect}
                selectedForm={formSelection?.formId || null}
                loading={loading}
              />
            </div>

            <div className="lg:col-span-4">
              <FormsPermissionMatrix
                selectedForm={formSelection?.formId || null}
                selectedModule={formSelection?.moduleId || null}
                selectedSubmodule={formSelection?.submoduleId || null}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}