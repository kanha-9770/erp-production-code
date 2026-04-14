"use client"

import { useState } from "react"
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
import { ScrollArea } from "@/components/ui/scroll-area"
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
  FormInput,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useGetFormSectionFieldsQuery } from "@/lib/api/permissions"
import { useFieldPermissionMatrix } from "@/hooks/use-field-permission-matrix"
import type { Permission, PermissionUser } from "@/types/permissions"

interface FieldsPermissionMatrixProps {
  selectedFormId: string | null
}

interface FieldInfo {
  id: string
  label: string
  type: string
  order: number
}

interface SectionWithFields {
  id: string
  title: string
  order: number
  description?: string
  fields: FieldInfo[]
}

export function FieldsPermissionMatrix({
  selectedFormId,
}: FieldsPermissionMatrixProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())

  const {
    data: sectionsData,
    isLoading: sectionsLoading,
  } = useGetFormSectionFieldsQuery(selectedFormId!, { skip: !selectedFormId })

  const sections: SectionWithFields[] = sectionsData?.success ? sectionsData.data : []

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId)
      return next
    })
  }

  const toggleField = (fieldId: string) => {
    setExpandedFields((prev) => {
      const next = new Set(prev)
      next.has(fieldId) ? next.delete(fieldId) : next.add(fieldId)
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
            <p className="text-sm font-medium">Loading fields...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalFields = sections.reduce((sum, s) => sum + s.fields.length, 0)

  if (totalFields === 0) {
    return (
      <Card className="border-dashed border-border">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10">
          <FormInput className="h-10 w-10 text-muted-foreground/60" />
          <div className="text-center">
            <h3 className="font-semibold">No Fields Found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              This form has no fields to configure permissions for.
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
          <FormInput className="h-5 w-5" />
          Field Permissions
        </CardTitle>
        <CardDescription>
          Control access for each role on individual fields of this form. Expand
          a section to see its fields, then expand a field to configure its
          permissions.
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
                  <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium text-sm flex-1">{section.title}</span>
                  <Badge variant="outline" className="text-xs">
                    {section.fields.length} field{section.fields.length === 1 ? "" : "s"}
                  </Badge>
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="mt-2 ml-4 space-y-2">
                  {section.fields.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 px-2">
                      This section has no fields.
                    </p>
                  ) : (
                    section.fields.map((field) => {
                      const isFieldExpanded = expandedFields.has(field.id)

                      return (
                        <Collapsible
                          key={field.id}
                          open={isFieldExpanded}
                          onOpenChange={() => toggleField(field.id)}
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              className={cn(
                                "flex items-center gap-3 w-full p-2.5 rounded-md border text-left transition-colors",
                                "hover:bg-muted/60",
                                isFieldExpanded && "bg-muted/40 border-primary/30",
                              )}
                            >
                              {isFieldExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="font-medium text-sm flex-1">
                                {field.label}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {field.type}
                              </Badge>
                            </button>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <div className="mt-2 ml-2">
                              <FieldPermissionTable
                                sectionId={section.id}
                                fieldId={field.id}
                                formId={selectedFormId}
                              />
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )
                    })
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </CardContent>
    </Card>
  )
}

function FieldPermissionTable({
  sectionId,
  fieldId,
  formId,
}: {
  sectionId: string
  fieldId: string
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
  } = useFieldPermissionMatrix(fieldId, sectionId, formId)

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
      <ScrollArea className="max-h-full rounded-md border">
        <Table>
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
              const grantedCount = getGrantedCountForRole(role.id, fieldId)
              const usersInRole = getUsersForRole(role.id)
              const isExpanded = expandedRoles.has(role.id)

              return (
                <Collapsible
                  key={role.id}
                  open={isExpanded}
                  onOpenChange={() => toggleRole(role.id)}
                  asChild
                >
                  <>
                    <TableRow className="hover:bg-muted/60">
                      <TableCell className="font-medium text-sm">
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-2 hover:text-primary focus:outline-none">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            {role.name}
                          </button>
                        </CollapsibleTrigger>
                      </TableCell>

                      {permissions.map((p) => (
                        <TableCell key={p.id} className="text-center">
                          <Checkbox
                            checked={hasRolePermission(role.id, fieldId, p.id)}
                            disabled={saving}
                            title={
                              isRoleInherited(role.id, p.id)
                                ? "Inherited from form or section"
                                : undefined
                            }
                            onCheckedChange={() =>
                              togglePermission("role", role.id, fieldId, p.id)
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

                    <CollapsibleContent asChild>
                      <>
                        {usersInRole.length === 0 ? (
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
                            <FieldUserRow
                              key={user.id}
                              user={user}
                              fieldId={fieldId}
                              permissions={permissions}
                              saving={saving}
                              hasUserPermission={hasUserPermission}
                              isUserInherited={isUserInherited}
                              togglePermission={togglePermission}
                            />
                          ))
                        )}
                      </>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              )
            })}
          </TableBody>
        </Table>
      </ScrollArea>

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
          onClick={() => saveChanges(sectionId, fieldId)}
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

interface FieldUserRowProps {
  user: PermissionUser
  fieldId: string
  permissions: Permission[]
  saving: boolean
  hasUserPermission: (userId: string, fieldId: string, permId: string) => boolean
  isUserInherited: (userId: string, permId: string) => boolean
  togglePermission: (
    prefix: "role" | "user",
    id: string,
    fieldId: string,
    permId: string,
  ) => void
}

function FieldUserRow({
  user,
  fieldId,
  permissions,
  saving,
  hasUserPermission,
  isUserInherited,
  togglePermission,
}: FieldUserRowProps) {
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/50">
      <TableCell className="pl-12 text-sm">
        {user.first_name} {user.last_name}
        <div className="text-xs text-muted-foreground">{user.email}</div>
      </TableCell>

      {permissions.map((p) => (
        <TableCell key={p.id} className="text-center">
          <Checkbox
            checked={hasUserPermission(user.id, fieldId, p.id)}
            disabled={saving}
            title={
              isUserInherited(user.id, p.id) ? "Inherited from form or section" : undefined
            }
            onCheckedChange={() => togglePermission("user", user.id, fieldId, p.id)}
          />
        </TableCell>
      ))}

      <TableCell />
    </TableRow>
  )
}
