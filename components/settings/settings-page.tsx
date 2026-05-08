"use client"

import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import Link from "next/link"
import { useRouteAccess } from "@/hooks/use-route-access"

interface SettingItem {
  name: string
  href: string
}

interface SettingCategory {
  title: string
  items: SettingItem[]
}

const settingsData: SettingCategory[] = [
  {
    title: "General",
    items: [
      { name: "Personal Settings", href: "/settings/personal" },
      { name: "Users", href: "/settings/users" },
      { name: "Company Settings", href: "/settings/company" },
      { name: "Role Creation", href: "/settings/company" },
      { name: "Masters", href: "/settings/masters" },
      { name: "Motivator", href: "/settings/motivator" },
    ],
  },
  {
    title: "Security Control",
    items: [
      { name: "Profiles", href: "/settings/profiles" },
      { name: "Permissions", href: "/settings/permission" },
      { name: "Zoho Mail Add-on Users", href: "/settings/zoho-mail" },
      { name: "Compliance Settings", href: "/settings/compliance" },
      { name: "Territory Management", href: "/settings/territory" },
      { name: "Trusted Domain", href: "/settings/trusted-domain" },
      { name: "Support Access", href: "/settings/support-access" },
      { name: "Single Sign-On(SAML)", href: "/settings/sso" },
      { name: "Security Policies", href: "/settings/security-policies" },
      { name: "Active Directory Sync", href: "/settings/active-directory" },
      { name: "Login History", href: "/settings/login-history" },
      { name: "Audit Log", href: "/settings/audit-log" },
    ],
  },
  {
    title: "Channels",
    items: [
      { name: "Email", href: "/settings/email" },
      { name: "Telephony", href: "/settings/telephony" },
      { name: "Business Messaging", href: "/settings/business-messaging" },
      { name: "Notification SMS", href: "/settings/notification-sms" },
      { name: "Webforms", href: "/settings/webforms" },
      { name: "Social", href: "/settings/social" },
      { name: "Portals", href: "/settings/portals" },
    ],
  },
  {
    title: "Customization",
    items: [
      { name: "Modules and Fields", href: "/admin/modules" },
      { name: "Pipelines", href: "/settings/pipelines" },
      { name: "Wizards", href: "/settings/wizards" },
      { name: "Kiosk Studio", href: "/settings/kiosk-studio" },
      { name: "Canvas", href: "/settings/canvas" },
      { name: "Customize Home page", href: "/settings/customize-home" },
      { name: "Translations", href: "/settings/translations" },
      { name: "Templates", href: "/settings/templates" },
      { name: "Teamspace", href: "/settings/teamspace" },
    ],
  },
  {
    title: "Automation",
    items: [
      { name: "Workflow Rules", href: "/settings/workflow-rules" },
      { name: "Actions", href: "/settings/actions" },
      { name: "Schedules", href: "/settings/schedules" },
      { name: "Functions", href: "/settings/functions" },
      { name: "Assignment", href: "/settings/assignment" },
      { name: "Case Escalation Rules", href: "/settings/case-escalation" },
      { name: "Scoring Rules", href: "/settings/scoring-rules" },
      { name: "Cadences", href: "/settings/cadences" },
    ],
  },
  {
    title: "HR & Attendance",
    items: [
      { name: "My Attendance", href: "/attendance" },
      { name: "Team Attendance", href: "/attendance/team" },
      { name: "Regularizations", href: "/attendance/regularizations" },
      { name: "Attendance Configuration", href: "/settings/attendance-config" },
    ],
  },
  {
    title: "Experience Center",
    items: [
      { name: "Signals", href: "/settings/signals" },
      { name: "Command Center", href: "/settings/command-center" },
    ],
  },
  {
    title: "Data Administration",
    items: [
      { name: "Import", href: "/settings/import" },
      { name: "Export", href: "/settings/export" },
      { name: "Recycle Bin", href: "/settings/trash" },
    ],
  },
  {
    title: "Developer Hub",
    items: [
      { name: "APIs and SDKs", href: "/settings/apis" },
      { name: "Connections", href: "/settings/connections" },
    ],
  },
  {
    title: "Zia",
    items: [
      { name: "Data Enrichment", href: "/settings/data-enrichment" },
      { name: "Predictions", href: "/settings/predictions" },
    ],
  },
  {
    title: "AI & Chatbot",
    items: [
      { name: "Chatbot", href: "/chatbot" },
      { name: "AI Providers", href: "/admin/ai" },
    ],
  },
  {
    title: "Documentation",
    items: [
      { name: "All Guides", href: "/settings/docs" },
      { name: "Start — Create a Module", href: "/settings/docs/create-your-first-module" },
      { name: "Start — Add a Form", href: "/settings/docs/create-your-first-form" },
      { name: "Start — Design Fields", href: "/settings/docs/design-form-with-fields" },
      { name: "Start — Find apiNames", href: "/settings/docs/discover-api-names" },
      { name: "Start — Hello World Function", href: "/settings/docs/hello-world-function" },
      { name: "Start — First Workflow Rule", href: "/settings/docs/first-workflow-rule" },
      { name: "Example — Duplicate Leads", href: "/settings/docs/duplicate-leads" },
      { name: "Example — Lead Scoring", href: "/settings/docs/lead-scoring" },
      { name: "Example — Round-robin", href: "/settings/docs/round-robin-assignment" },
      { name: "Example — Convert to Contact", href: "/settings/docs/convert-lead-to-contact" },
    ],
  },
]

export function SettingsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const { isPermitted } = useRouteAccess()

  // Filter by: 1) explicit route permission, then 2) search query.
  // Only shows items whose route is explicitly granted in the DB.
  // Entire categories are hidden when none of their items are permitted.
  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    return settingsData
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          // Must have an explicit route permission grant
          if (!isPermitted(item.href)) return false
          // Then: must match search query (if any)
          if (q && !item.name.toLowerCase().includes(q)) return false
          return true
        }),
      }))
      .filter((category) => category.items.length > 0)
  }, [searchQuery, isPermitted])

  return (
    <div className="h-full bg-muted/30 dark:bg-gray-950">
      {/* Header - made responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 bg-background border-b gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-foreground">Setup</h1>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-background border-input w-full"
            />
          </div>
        </div>
        <Button variant="outline" className="text-sm bg-transparent w-full sm:w-auto">
          Customize Setup
        </Button>
      </div>

      {/* Settings Grid - responsive columns */}
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {filteredData.map((category) => (
            <div
              key={category.title}
              className="bg-background rounded-lg border border-border p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <h2 className="text-sm font-semibold text-foreground mb-3">{category.title}</h2>
              <ul className="space-y-2">
                {category.items.map((item) => (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className="text-sm text-foreground hover:text-primary hover:underline transition-colors block"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {filteredData.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery
                ? "No settings found matching your search."
                : "No settings available for your account."}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
