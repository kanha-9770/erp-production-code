"use client"

import { Fragment, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useGetFormSectionsQuery } from "@/lib/api/permissions"
import { useSectionPermissionMatrix } from "@/hooks/use-section-permission-matrix"
import type { Permission, PermissionUser } from "@/types/permissions"

interface SectionsPermissionMatrixProps {
  selectedFormId: string | null
}

interface SectionInfo {
  id: string
  title: string
  order: number
  description?: string
}

export function SectionsPermissionMatrix({
  selectedFormId,
}: SectionsPermissionMatrixProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const {
    data: sectionsData,
    isLoading: sectionsLoading,
  } = useGetFormSectionsQuery(selectedFormId!, { skip: !selectedFormId })

  const sections: SectionInfo[] = sectionsData?.success ? sectionsData.data : []

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId)
      return next
    })
  }

  if (!selectedFormId) return null

  if (sectionsLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-3 text-muted-foreground py-8">
            <div className="relative h-8 w-8">
              <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-pulse" />
              <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
            <p className="text-sm font-medium">Loading sections...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (sections.length === 0) {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10">
          <Layers className="h-10 w-10 text-muted-foreground/60" />
          <div className="text-center">
            <h3 className="font-semibold">No Sections Found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              This form has no sections to configure permissions for.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Section Permissions
        </CardTitle>
        <CardDescription>
          Expand a section to override permissions for it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sections.map((section) => {
          const isExpanded = expandedSections.has(section.id)

          return (
            <Collapsible
              key={section.id}
              open={isExpanded}
              onOpenChange={() => toggleSection(section.id)}
            >
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-3 w-full p-3 rounded-lg border text-left transition-colors",
                    "hover:bg-muted/60",
                    isExpanded && "bg-muted/40 border-primary/30",
                  )}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm flex-1">{section.title}</span>
                  <Badge variant="outline" className="text-xs">
                    Section {section.order + 1}
                  </Badge>
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="mt-2 ml-2">
                  <SectionPermissionTable
                    sectionId={section.id}
                    formId={selectedFormId}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ─── Per-section permission table ──────────────────────────────────────────────

function SectionPermissionTable({
  sectionId,
  formId,
}: {
  sectionId: string
  formId: string
}) {
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())

  const {
    permissions,
    loading,
    error,
    changes,
    saving,
    hasChanges,
    hasRolePermission,
    hasUserPermission,
    isRoleInherited,
    isUserInherited,
    togglePermission,
    resetChanges,
    saveChanges,
    getUsersForRole,
    getGrantedCountForRole,
    filteredRoles,
  } = useSectionPermissionMatrix(sectionId, formId)

  const toggleRole = (roleId: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev)
      next.has(roleId) ? next.delete(roleId) : next.add(roleId)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-muted-foreground py-6">
        <div className="relative h-6 w-6">
          <div className="absolute inset-0 rounded-full border-3 border-primary/30 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-3 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-sm">Loading permissions...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive py-4 px-2">
        <AlertCircle className="h-4 w-4" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (filteredRoles.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground">
        <AlertCircle className="mx-auto h-8 w-8 opacity-70 mb-2" />
        <p className="text-sm">No roles available (admin role excluded)</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="max-h-[calc(100vh-420px)] min-h-[300px] overflow-auto rounded-md border [&>div]:overflow-visible">
        <Table className="min-w-[640px]">
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="min-w-[220px] font-semibold">Role / User</TableHead>
              {permissions.map((p) => (
                <TableHead key={p.id} className="min-w-[100px] text-center font-semibold">
                  {p.name}
                </TableHead>
              ))}
              <TableHead className="w-[100px] text-center font-semibold">Granted</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredRoles.map((role) => {
              const grantedCount = getGrantedCountForRole(role.id, sectionId)
              const usersInRole = getUsersForRole(role.id)
              const isExpanded = expandedRoles.has(role.id)

              return (
                <Fragment key={role.id}>
                  <TableRow className="hover:bg-muted/60">
                    <TableCell className="font-medium text-sm">
                      <button
                        type="button"
                        onClick={() => toggleRole(role.id)}
                        className="flex items-center gap-2 hover:text-primary focus:outline-none"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        {role.name}
                      </button>
                    </TableCell>

                    {permissions.map((p) => (
                      <TableCell key={p.id} className="text-center">
                        <Checkbox
                          checked={hasRolePermission(role.id, sectionId, p.id)}
                          disabled={saving}
                          title={
                            isRoleInherited(role.id, p.id) ? "Inherited from form" : undefined
                          }
                          onCheckedChange={() =>
                            togglePermission("role", role.id, sectionId, p.id)
                          }
                        />
                      </TableCell>
                    ))}

                    <TableCell className="text-center">
                      <Badge variant="outline">
                        {grantedCount}/{permissions.length}
                      </Badge>
                    </TableCell>
                  </TableRow>

                  {isExpanded && (
                    usersInRole.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={permissions.length + 2}
                          className="pl-12 text-xs text-muted-foreground italic"
                        >
                          No users in this role
                        </TableCell>
                      </TableRow>
                    ) : (
                      usersInRole.map((user) => (
                        <SectionUserRow
                          key={user.id}
                          user={user}
                          sectionId={sectionId}
                          permissions={permissions}
                          saving={saving}
                          hasUserPermission={hasUserPermission}
                          isUserInherited={isUserInherited}
                          togglePermission={togglePermission}
                        />
                      ))
                    )
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Action bar */}
      <div className="flex gap-3 justify-end border-t pt-4">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasChanges || saving}
          onClick={resetChanges}
        >
          Reset
        </Button>
        <Button
          size="sm"
          disabled={!hasChanges || saving}
          onClick={() => saveChanges(sectionId)}
        >
          {saving ? (
            <>
              <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-3 w-3" />
              Save
              {hasChanges && (
                <Badge variant="secondary" className="ml-2">
                  {changes.size}
                </Badge>
              )}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

interface SectionUserRowProps {
  user: PermissionUser
  sectionId: string
  permissions: Permission[]
  saving: boolean
  hasUserPermission: (userId: string, sectionId: string, permId: string) => boolean
  isUserInherited: (userId: string, permId: string) => boolean
  togglePermission: (
    prefix: "role" | "user",
    id: string,
    sectionId: string,
    permId: string,
  ) => void
}

function SectionUserRow({
  user,
  sectionId,
  permissions,
  saving,
  hasUserPermission,
  isUserInherited,
  togglePermission,
}: SectionUserRowProps) {
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/50">
      <TableCell className="pl-12 text-sm">
        {user.first_name} {user.last_name}
        <div className="text-xs text-muted-foreground">{user.email}</div>
      </TableCell>

      {permissions.map((p) => (
        <TableCell key={p.id} className="text-center">
          <Checkbox
            checked={hasUserPermission(user.id, sectionId, p.id)}
            disabled={saving}
            title={isUserInherited(user.id, p.id) ? "Inherited from form" : undefined}
            onCheckedChange={() => togglePermission("user", user.id, sectionId, p.id)}
          />
        </TableCell>
      ))}

      <TableCell />
    </TableRow>
  )
}
