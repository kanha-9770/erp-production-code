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
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useGetFormSectionsQuery } from "@/lib/api/permissions"
import { useSectionPermissionMatrix } from "@/hooks/use-section-permission-matrix"
import type { Permission } from "@/types/permissions"

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
          Control access for each role on individual sections of this form.
          Expand a section to configure its permissions.
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
                  <SectionPermissionTable sectionId={section.id} />
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

function SectionPermissionTable({ sectionId }: { sectionId: string }) {
  const {
    permissions,
    loading,
    error,
    changes,
    saving,
    hasChanges,
    hasRolePermission,
    togglePermission,
    resetChanges,
    saveChanges,
    getGrantedCountForRole,
    filteredRoles,
  } = useSectionPermissionMatrix(sectionId)

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
      <ScrollArea className="max-h-[400px] rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="min-w-[200px] font-semibold">Role</TableHead>
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

              return (
                <TableRow key={role.id} className="hover:bg-muted/60">
                  <TableCell className="font-medium text-sm">{role.name}</TableCell>

                  {permissions.map((p) => (
                    <TableCell key={p.id} className="text-center">
                      <Checkbox
                        checked={hasRolePermission(role.id, sectionId, p.id)}
                        disabled={saving}
                        onCheckedChange={() => togglePermission(role.id, sectionId, p.id)}
                      />
                    </TableCell>
                  ))}

                  <TableCell className="text-center">
                    <Badge variant="outline">
                      {grantedCount}/{permissions.length}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </ScrollArea>

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
