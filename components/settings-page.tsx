// "use client"

// import { useState } from "react"
// import { Input } from "@/components/ui/input"
// import { Button } from "@/components/ui/button"
// import { Search } from "lucide-react"
// import Link from "next/link"

// interface SettingItem {
//   name: string
//   href: string
// }

// interface SettingCategory {
//   title: string
//   items: SettingItem[]
// }

// const settingsData: SettingCategory[] = [
//   {
//     title: "General",
//     items: [
//       { name: "Personal Settings", href: "/settings/personal" },
//       { name: "Users", href: "/settings/users" },
//       { name: "User Management", href: "/settings/users/user-management" },
//       { name: "Company Settings", href: "/settings/company" },
//       { name: "Masters", href: "/settings/masters" },
//       { name: "Motivator", href: "/settings/motivator" },
//     ],
//   },
//   {
//     title: "Security Control",
//     items: [
//       { name: "Profiles", href: "/settings/profiles" },
//       { name: "Roles and Sharing", href: "/settings/roles" },
//       { name: "Zoho Mail Add-on Users", href: "/settings/zoho-mail" },
//       { name: "Compliance Settings", href: "/settings/compliance" },
//       { name: "Territory Management", href: "/settings/territory" },
//       { name: "Trusted Domain", href: "/settings/trusted-domain" },
//       { name: "Support Access", href: "/settings/support-access" },
//       { name: "Single Sign-On(SAML)", href: "/settings/sso" },
//       { name: "Security Policies", href: "/settings/security-policies" },
//       { name: "Active Directory Sync", href: "/settings/active-directory" },
//       { name: "Login History", href: "/settings/login-history" },
//       { name: "Audit Log", href: "/settings/audit-log" },
//     ],
//   },
//   {
//     title: "Channels",
//     items: [
//       { name: "Email", href: "/settings/email" },
//       { name: "Telephony", href: "/settings/telephony" },
//       { name: "Business Messaging", href: "/settings/business-messaging" },
//       { name: "Notification SMS", href: "/settings/notification-sms" },
//       { name: "Webforms", href: "/settings/webforms" },
//       { name: "Social", href: "/settings/social" },
//       { name: "Chat", href: "/settings/chat" },
//       { name: "Portals", href: "/settings/portals" },
//     ],
//   },
//   {
//     title: "Customization",
//     items: [
//       { name: "Modules and Fields", href: "/admin/modules" },
//       { name: "Pipelines", href: "/settings/pipelines" },
//       { name: "Wizards", href: "/settings/wizards" },
//       { name: "Kiosk Studio", href: "/settings/kiosk-studio" },
//       { name: "Canvas", href: "/settings/canvas" },
//       { name: "Customize Home page", href: "/settings/customize-home" },
//       { name: "Translations", href: "/settings/translations" },
//       { name: "Templates", href: "/settings/templates" },
//       { name: "Teamspace", href: "/settings/teamspace" },
//     ],
//   },
//   {
//     title: "Automation",
//     items: [
//       { name: "Workflow Rules", href: "/settings/workflow-rules" },
//       { name: "Actions", href: "/settings/actions" },
//       { name: "Schedules", href: "/settings/schedules" },
//       { name: "Assignment", href: "/settings/assignment" },
//       { name: "Case Escalation Rules", href: "/settings/case-escalation" },
//       { name: "Scoring Rules", href: "/settings/scoring-rules" },
//       { name: "Cadences", href: "/settings/cadences" },
//     ],
//   },
  
//   {
//     title: "Experience Center",
//     items: [
//       { name: "Signals", href: "/settings/signals" },
//       { name: "Command Center", href: "/settings/command-center" },
//     ],
//   },
//   {
//     title: "Data Administration",
//     items: [
//       { name: "Import", href: "/settings/import" },
//       { name: "Export", href: "/settings/export" },
//     ],
//   },
//   {
//     title: "Developer Hub",
//     items: [
//       { name: "APIs and SDKs", href: "/settings/apis" },
//       { name: "Connections", href: "/settings/connections" },
//     ],
//   },
//   {
//     title: "Zia",
//     items: [
//       { name: "Data Enrichment", href: "/settings/data-enrichment" },
//       { name: "Predictions", href: "/settings/predictions" },
//     ],
//   },
// ]

// export function SettingsPage() {
//   const [searchQuery, setSearchQuery] = useState("")

//   const filteredData = settingsData
//     .map((category) => ({
//       ...category,
//       items: category.items.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase())),
//     }))
//     .filter((category) => category.items.length > 0)

//   return (
//     <div className="h-full bg-[oklch(0.96_0.005_250)]">
//       {/* Header */}
//       <div className="flex items-center justify-between px-6 py-4 bg-background border-b">
//         <div className="flex items-center gap-4">
//           <h1 className="text-xl font-semibold text-foreground">Setup</h1>
//           <div className="relative w-[320px]">
//             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
//             <Input
//               placeholder="Search"
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               className="pl-9 h-9 bg-background border-input"
//             />
//           </div>
//         </div>
//         <Button variant="outline" className="text-sm bg-transparent">
//           Customize Setup
//         </Button>
//       </div>

//       {/* Settings Grid */}
//       <div className="p-6">
//         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
//           {filteredData.map((category) => (
//             <div
//               key={category.title}
//               className="bg-background rounded-lg border border-border p-4 shadow-sm hover:shadow-md transition-shadow"
//             >
//               <h2 className="text-sm font-semibold text-foreground mb-3">{category.title}</h2>
//               <ul className="space-y-2">
//                 {category.items.map((item) => (
//                   <li key={item.name}>
//                     <Link
//                       href={item.href}
//                       className="text-sm text-foreground hover:text-primary hover:underline transition-colors block"
//                     >
//                       {item.name}
//                     </Link>
//                   </li>
//                 ))}
//               </ul>
//             </div>
//           ))}
//         </div>

//         {filteredData.length === 0 && (
//           <div className="text-center py-12">
//             <p className="text-muted-foreground">No settings found matching your search.</p>
//           </div>
//         )}
//       </div>
//     </div>
//   )
// }


"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import Link from "next/link"

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
      { name: "User Management", href: "/settings/users/user-management" },
      { name: "Company Settings", href: "/settings/company" },
      { name: "Masters", href: "/settings/masters" },
      { name: "Motivator", href: "/settings/motivator" },
    ],
  },
  {
    title: "Security Control",
    items: [
      { name: "Profiles", href: "/settings/profiles" },
      { name: "Roles and Sharing", href: "/settings/roles" },
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
      { name: "Chat", href: "/settings/chat" },
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
      { name: "Assignment", href: "/settings/assignment" },
      { name: "Case Escalation Rules", href: "/settings/case-escalation" },
      { name: "Scoring Rules", href: "/settings/scoring-rules" },
      { name: "Cadences", href: "/settings/cadences" },
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
]

export function SettingsPage() {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredData = settingsData
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase())),
    }))
    .filter((category) => category.items.length > 0)

  return (
    <div className="h-full bg-[oklch(0.96_0.005_250)]">
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
            <p className="text-muted-foreground">No settings found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  )
}