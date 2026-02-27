"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Eye, Settings } from "lucide-react"
import { DynamicDataTable } from "@/components/dynamic-data-table"
import { DynamicForm } from "@/components/dynamic-form"

interface Module {
  id: number
  moduleName: string
  route?: string | null
  icon?: string | null
  settings?: {
    autoApproval: boolean
    emailNotifications: boolean
    integrationEnabled: boolean
    customSettings?: any
  } | null
  features?: Array<{
    featureName: string
    isEnabled: boolean
    description?: string | null
  }>
}

interface Submodule {
  id: number
  submoduleName: string
  moduleId: number
  route?: string | null
}

interface Permissions {
  view: boolean
  create: boolean
  edit: boolean
  delete: boolean
}

interface User {
  id: string
  name?: string
  role?: string
}

interface DynamicModulePageProps {
  module: Module
  submodule: Submodule
  permissions: Permissions
  user: User
}

export function DynamicModulePage({ module, submodule, permissions, user }: DynamicModulePageProps) {
  const [activeTab, setActiveTab] = useState("overview")
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetchModuleData()
  }, [module.id, submodule.id])

  const fetchModuleData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/modules/${module.id}/submodules/${submodule.id}/data`)
      const result = await response.json()

      if (result.success) {
        setData(result.data || [])
      }
    } catch (error) {
      console.error("Error fetching module data:", error)
    } finally {
      setLoading(false)
    }
  }

  const getPermissionBadges = () => {
    const badges = []
    if (permissions.view) badges.push({ label: "View", variant: "default" as const })
    if (permissions.create) badges.push({ label: "Create", variant: "secondary" as const })
    if (permissions.edit) badges.push({ label: "Edit", variant: "outline" as const })
    if (permissions.delete) badges.push({ label: "Delete", variant: "destructive" as const })
    return badges
  }

  const renderModuleContent = () => {
    const moduleKey = module.moduleName.toLowerCase().replace(/\s+/g, "_")
    const submoduleKey = submodule.submoduleName.toLowerCase().replace(/\s+/g, "_")

    // Handle specific module types with custom components
    switch (moduleKey) {
      case "hr":
      case "human_resources":
        return renderHRModule(submoduleKey)
      case "sales":
        return renderSalesModule(submoduleKey)
      case "inventory":
        return renderInventoryModule(submoduleKey)
      case "production":
        return renderProductionModule(submoduleKey)
      default:
        return renderGenericModule()
    }
  }

  const renderHRModule = (submoduleKey: string) => {
    switch (submoduleKey) {
      case "employee_management":
        return (
          <DynamicDataTable
            title="Employee Management"
            data={data}
            permissions={permissions}
            onRefresh={fetchModuleData}
            columns={[
              { key: "employeeName", label: "Name" },
              { key: "email", label: "Email" },
              { key: "department", label: "Department" },
              { key: "role", label: "Role" },
              { key: "status", label: "Status" },
            ]}
          />
        )
      case "payroll":
        return (
          <DynamicDataTable
            title="Payroll Management"
            data={data}
            permissions={permissions}
            onRefresh={fetchModuleData}
            columns={[
              { key: "employee", label: "Employee" },
              { key: "salary", label: "Salary" },
              { key: "month", label: "Month" },
              { key: "status", label: "Status" },
            ]}
          />
        )
      default:
        return renderGenericModule()
    }
  }

  const renderSalesModule = (submoduleKey: string) => {
    switch (submoduleKey) {
      case "customers":
        return (
          <DynamicDataTable
            title="Customer Management"
            data={data}
            permissions={permissions}
            onRefresh={fetchModuleData}
            columns={[
              { key: "name", label: "Customer Name" },
              { key: "email", label: "Email" },
              { key: "phone", label: "Phone" },
              { key: "company", label: "Company" },
              { key: "status", label: "Status" },
            ]}
          />
        )
      case "orders":
        return (
          <DynamicDataTable
            title="Order Management"
            data={data}
            permissions={permissions}
            onRefresh={fetchModuleData}
            columns={[
              { key: "orderNumber", label: "Order #" },
              { key: "customer", label: "Customer" },
              { key: "amount", label: "Amount" },
              { key: "status", label: "Status" },
              { key: "date", label: "Date" },
            ]}
          />
        )
      default:
        return renderGenericModule()
    }
  }

  const renderInventoryModule = (submoduleKey: string) => {
    switch (submoduleKey) {
      case "products":
        return (
          <DynamicDataTable
            title="Product Management"
            data={data}
            permissions={permissions}
            onRefresh={fetchModuleData}
            columns={[
              { key: "name", label: "Product Name" },
              { key: "sku", label: "SKU" },
              { key: "category", label: "Category" },
              { key: "stock", label: "Stock" },
              { key: "price", label: "Price" },
            ]}
          />
        )
      default:
        return renderGenericModule()
    }
  }

  const renderProductionModule = (submoduleKey: string) => {
    return renderGenericModule()
  }

  const renderGenericModule = () => {
    return (
      <DynamicDataTable
        title={`${submodule.submoduleName} Data`}
        data={data}
        permissions={permissions}
        onRefresh={fetchModuleData}
        columns={[
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" },
        ]}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{submodule.submoduleName}</h1>
          <p className="text-gray-600">{module.moduleName} Module</p>
          {submodule.route && <p className="text-sm text-gray-500">Route: {submodule.route}</p>}
          {module.route && <p className="text-sm text-gray-500">Module Route: {module.route}</p>}
        </div>
        <div className="flex items-center gap-2">
          {getPermissionBadges().map((badge, index) => (
            <Badge key={index} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {permissions.create && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add New
          </Button>
        )}
        <Button variant="outline" onClick={fetchModuleData}>
          <Eye className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        {permissions.edit && (
          <Button variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        )}
      </div>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          {permissions.edit && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Module Overview</CardTitle>
              <CardDescription>
                Overview of {submodule.submoduleName} in {module.moduleName}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{data.length}</div>
                  <div className="text-sm text-gray-600">Total Records</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {data.filter((item) => item.status === "active" || item.status === "Active").length}
                  </div>
                  <div className="text-sm text-gray-600">Active Records</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {Object.keys(permissions).filter((key) => permissions[key as keyof Permissions]).length}
                  </div>
                  <div className="text-sm text-gray-600">Permissions</div>
                </div>
              </div>

              {/* Module Features */}
              {module.features && module.features.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium mb-3">Available Features</h4>
                  <div className="flex flex-wrap gap-2">
                    {module.features.map((feature, index) => (
                      <Badge key={index} variant="outline">
                        {feature.featureName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Route Information */}
              <div className="mt-6">
                <h4 className="font-medium mb-3">Route Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm font-medium">Module Route</div>
                    <div className="text-sm text-gray-600">{module.route || "Not set"}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm font-medium">Submodule Route</div>
                    <div className="text-sm text-gray-600">{submodule.route || "Not set"}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          {renderModuleContent()}
        </TabsContent>

        {permissions.edit && (
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Module Settings</CardTitle>
                <CardDescription>Configure settings for {submodule.submoduleName}</CardDescription>
              </CardHeader>
              <CardContent>
                {module.settings && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 border rounded-lg">
                        <h5 className="font-medium">Auto Approval</h5>
                        <p className="text-sm text-gray-600">{module.settings.autoApproval ? "Enabled" : "Disabled"}</p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <h5 className="font-medium">Email Notifications</h5>
                        <p className="text-sm text-gray-600">
                          {module.settings.emailNotifications ? "Enabled" : "Disabled"}
                        </p>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <h5 className="font-medium">API Integration</h5>
                        <p className="text-sm text-gray-600">
                          {module.settings.integrationEnabled ? "Enabled" : "Disabled"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Dynamic Form Modal */}
      {showForm && permissions.create && (
        <DynamicForm
          module={module}
          submodule={submodule}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false)
            fetchModuleData()
          }}
        />
      )}
    </div>
  )
}
