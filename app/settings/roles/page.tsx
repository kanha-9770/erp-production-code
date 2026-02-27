"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Shield, Grid3x3, FileText } from "lucide-react"

import { UserRoleAssignments } from "@/components/admin/user-role-assignments"
import { UserPermissionOverrides } from "@/components/admin/user-permission-overrides"
import { FormsSidebar } from "@/components/admin/forms-sidebar"
import { FormsPermissionMatrix } from "@/components/admin/forms-permission-matrix"

interface Form {
  id: string
  name: string
  description?: string
  isEmployeeForm?: boolean
  isUserForm?: boolean
}

interface Module {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  level: number
  forms: Form[]
  children: Module[]
}

interface FormSelection {
  formId: string
  moduleId: string
  submoduleId?: string | null
}

const STAT_CARDS = [
  {
    key: "modules",
    title: "Modules",
    icon: Grid3x3,
    gradient: "from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950",
    border: "border-blue-200 dark:border-blue-800",
    textColor: "text-blue-900 dark:text-blue-100",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    key: "forms",
    title: "Forms",
    icon: FileText,
    gradient: "from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950",
    border: "border-green-200 dark:border-green-800",
    textColor: "text-green-900 dark:text-green-100",
    iconColor: "text-green-600 dark:text-green-400",
  },
  {
    key: "permissions",
    title: "Permissions",
    icon: Shield,
    gradient: "from-purple-50 to-violet-50 dark:from-purple-950 dark:to-violet-950",
    border: "border-purple-200 dark:border-purple-800",
    textColor: "text-purple-900 dark:text-purple-100",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
]

export default function RolesPermissionsPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [formSelection, setFormSelection] = useState<FormSelection | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const stats = useMemo(() => {
    const totalSubmodules = modules.reduce((acc, m) => acc + m.children.length, 0)
    const totalForms = modules.reduce((total, module) => {
      const moduleForms = module.forms?.length || 0
      const submoduleForms = module.children.reduce((subTotal, child) => subTotal + (child.forms?.length || 0), 0)
      return total + moduleForms + submoduleForms
    }, 0)

    return {
      modules: modules.length,
      submodules: totalSubmodules,
      forms: totalForms,
      hasSelection: !!formSelection?.formId,
    }
  }, [modules, formSelection])

  const handleFormSelect = useCallback((formId: string, moduleId: string, submoduleId?: string) => {
    setFormSelection({ formId, moduleId, submoduleId: submoduleId || null })
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchModules = async () => {
      try {
        const response = await fetch("/api/modules-permission")
        console.log("API Response akash:", response)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()

        if (isMounted) {
          if (result.success) {
            setModules(result.data)
            setError(null)
          } else {
            throw new Error(result.error || "Failed to load modules")
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unknown error occurred")
          setModules([])
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchModules()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="container mx-auto  space-y-6">

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">Error: {error}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="forms" className="space-y-4">

        <TabsContent value="forms" className="space-y-0">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 ">
            <div className="lg:col-span-1">
              <FormsSidebar
                searchTerm={searchTerm}
                onFormSelect={handleFormSelect}
                selectedForm={formSelection?.formId || null}
                loading={loading}
              />
            </div>

            <div className="lg:col-span-4">
              <FormsPermissionMatrix
                searchTerm={searchTerm}
                selectedForm={formSelection?.formId || null}
                selectedModule={formSelection?.moduleId || null}
                selectedSubmodule={formSelection?.submoduleId || null}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <UserRoleAssignments searchTerm={searchTerm} selectedRole={selectedRole} onRoleSelect={setSelectedRole} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overrides" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <UserPermissionOverrides
                searchTerm={searchTerm}
                selectedUser={selectedUser}
                onUserSelect={setSelectedUser}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
