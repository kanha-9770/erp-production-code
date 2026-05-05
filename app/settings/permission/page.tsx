"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ShieldCheck, Route, Anchor } from "lucide-react"
import { useRouteAccess } from "@/hooks/use-route-access"

export default function PermissionPage() {
  const { isPermitted } = useRouteAccess()

  const canAccessRoles = isPermitted("/settings/permission/roles")
  const canAccessRoutes = isPermitted("/settings/permission/route")
  const canAccessStaticPages = isPermitted("/settings/permission/static-pages")

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-4">Permission Management</h1>
            <p className="text-lg text-muted-foreground">
              Configure access control for your organization using role-based or route-based permissions
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {canAccessRoles && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                    <ShieldCheck className="w-6 h-6 text-blue-600" />
                  </div>
                  <CardTitle>Role Based Permission</CardTitle>
                  <CardDescription>
                    Manage permissions by assigning roles to users and controlling access to modules, forms, and sections
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/settings/permission/roles">
                    <Button className="w-full">Manage Roles</Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {canAccessRoutes && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                    <Route className="w-6 h-6 text-green-600" />
                  </div>
                  <CardTitle>Route Based Permission</CardTitle>
                  <CardDescription>
                    Control access to specific routes and pages within the application for different user groups
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/settings/permission/route">
                    <Button variant="outline" className="w-full bg-transparent">
                      Manage Routes
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {canAccessStaticPages && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center mb-4">
                    <Anchor className="w-6 h-6 text-purple-600" />
                  </div>
                  <CardTitle>Static Page Placement</CardTitle>
                  <CardDescription>
                    Anchor system pages (Leaves, Attendance, Payroll, Holidays&hellip;) under any of your dynamic modules so they appear inside the sidebar where they belong.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/settings/permission/static-pages">
                    <Button variant="outline" className="w-full bg-transparent">
                      Place Pages
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {!canAccessRoles && !canAccessRoutes && !canAccessStaticPages && (
              <div className="col-span-full text-center py-12">
                <p className="text-muted-foreground">
                  You don't have permission to access any permission management features.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
