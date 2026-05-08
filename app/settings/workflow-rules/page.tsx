"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useGetPermittedModulesQuery } from "@/lib/api/modules"
import { useGetWorkflowRulesQuery, useDeleteWorkflowRuleMutation, useUpdateWorkflowRuleMutation } from "@/lib/api/workflow-rules"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Search,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  History,
  Zap,
  ArrowUpDown,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────

interface WorkflowRule {
  id: string
  name: string
  description: string
  module: string
  executeOn: string
  actions: string[]
  active: boolean
  createdAt: string
  modifiedAt: string
  modifiedBy: string
}

// ── Component ──────────────────────────────────────────────────────────────

export default function WorkflowRulesPage() {
  const router = useRouter()
  const { data: modulesData, isLoading: modulesLoading } = useGetPermittedModulesQuery()
  const systemModules = useMemo(() => {
    const mods = modulesData?.modules || []
    return mods.map((m: any) => ({
      id: m.module_id || m.id,
      name: m.module_name || m.name,
    }))
  }, [modulesData])

  const { data: rulesData } = useGetWorkflowRulesQuery()
  const [deleteRule] = useDeleteWorkflowRuleMutation()
  const [updateRule] = useUpdateWorkflowRuleMutation()

  const rules: WorkflowRule[] = useMemo(() => {
    const items = rulesData?.data || []
    return items.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description || "",
      module: r.moduleName,
      executeOn: r.recordAction || r.dateField || r.executeBasedOn,
      actions: [
        ...((r.instantActions || []) as any[]).map((a: any) => {
          if (typeof a === "string") return a
          if (a?.type === "Function" && a.functionName) return `Function: ${a.functionName}`
          return a?.type || "Action"
        }),
        ...(r.scheduledExecute ? [`Scheduled (${r.scheduledExecute} ${r.scheduledUnit})`] : []),
      ],
      active: r.active,
      createdAt: r.createdAt,
      modifiedAt: r.updatedAt,
      modifiedBy: r.createdBy ? `${r.createdBy.first_name || ""} ${r.createdBy.last_name || ""}`.trim() || r.createdBy.email : "",
    }))
  }, [rulesData])

  const [searchQuery, setSearchQuery] = useState("")
  const [moduleFilter, setModuleFilter] = useState("All Modules")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<"name" | "modifiedAt">("modifiedAt")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<WorkflowRule | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newRule, setNewRule] = useState({
    name: "",
    description: "",
    module: "",
    executeOn: "Create",
  })

  const itemsPerPage = 10

  // Filtered + sorted data
  const filteredRules = useMemo(() => {
    let filtered = [...rules]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.module.toLowerCase().includes(q)
      )
    }

    if (moduleFilter !== "All Modules") {
      filtered = filtered.filter((r) => r.module === moduleFilter)
    }

    filtered.sort((a, b) => {
      const aVal = sortField === "name" ? a.name.toLowerCase() : a.modifiedAt
      const bVal = sortField === "name" ? b.name.toLowerCase() : b.modifiedAt
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1
      return 0
    })

    return filtered
  }, [rules, searchQuery, moduleFilter, sortField, sortOrder])

  const totalPages = Math.ceil(filteredRules.length / itemsPerPage)
  const paginatedRules = filteredRules.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleActive = (id: string) => {
    const rule = rules.find((r) => r.id === id)
    if (rule) updateRule({ id, active: !rule.active })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedRules.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginatedRules.map((r) => r.id)))
    }
  }

  const handleSort = (field: "name" | "modifiedAt") => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortOrder("asc")
    }
  }

  const confirmDelete = async () => {
    if (ruleToDelete) {
      await deleteRule(ruleToDelete.id)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(ruleToDelete.id)
        return next
      })
    }
    setRuleToDelete(null)
    setDeleteDialogOpen(false)
  }

  const handleDuplicate = (rule: WorkflowRule) => {
    // Navigate to create page pre-filled with the rule's module/name
    const params = new URLSearchParams({
      module: rule.module,
      name: `${rule.name} (Copy)`,
      description: rule.description,
    })
    router.push(`/settings/workflow-rules/create?${params.toString()}`)
  }

  const handleCreateRule = () => {
    const params = new URLSearchParams({
      module: newRule.module,
      name: newRule.name,
      ...(newRule.description && { description: newRule.description }),
    })
    setNewRule({ name: "", description: "", module: "", executeOn: "Create" })
    setCreateDialogOpen(false)
    router.push(`/settings/workflow-rules/create?${params.toString()}`)
  }

  const bulkDelete = async () => {
    await Promise.all(Array.from(selectedIds).map((id) => deleteRule(id)))
    setSelectedIds(new Set())
  }

  const getExecuteBadgeColor = (executeOn: string) => {
    switch (executeOn) {
      case "Create":
        return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "Edit":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "Create or Edit":
        return "bg-violet-50 text-violet-700 border-violet-200"
      case "Created Time":
        return "bg-amber-50 text-amber-700 border-amber-200"
      case "Field Update":
        return "bg-sky-50 text-sky-700 border-sky-200"
      default:
        return "bg-gray-50 text-gray-700 border-gray-200"
    }
  }

  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | string)[] = []
    if (currentPage <= 4) pages.push(1, 2, 3, 4, 5, "...", totalPages)
    else if (currentPage >= totalPages - 3)
      pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
    else pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages)
    return pages
  }

  // ── Usage Tab Content ────────────────────────────────────────────────────

  const usageStats = useMemo(() => {
    const total = rules.length
    const active = rules.filter((r) => r.active).length
    const inactive = total - active
    const byModule: Record<string, number> = {}
    rules.forEach((r) => {
      byModule[r.module] = (byModule[r.module] || 0) + 1
    })
    return { total, active, inactive, byModule }
  }, [rules])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="border-b bg-background">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold text-foreground">Workflow Rules</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Automate actions when records match certain conditions
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="rules" className="w-full">
        <div className="border-b bg-background px-4 sm:px-6">
          <TabsList className="h-10 bg-transparent p-0 gap-4">
            <TabsTrigger
              value="rules"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Rules
            </TabsTrigger>
            <TabsTrigger
              value="usage"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Usage
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Rules Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="rules" className="mt-0">
          <div className="px-4 sm:px-6 py-4 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-1 w-full sm:w-auto">
                <div className="relative flex-1 w-full sm:max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search rules..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setCurrentPage(1)
                    }}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setCurrentPage(1) }}>
                  <SelectTrigger className="w-full sm:w-44 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Modules">All Modules</SelectItem>
                    {systemModules.map((m) => (
                      <SelectItem key={m.id} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {selectedIds.size > 0 && (
                  <Button variant="destructive" size="sm" onClick={bulkDelete}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete ({selectedIds.size})
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/settings/workflow-rules/executions")}
                >
                  <History className="w-3.5 h-3.5 mr-1.5" />
                  Execution Log
                </Button>
                <Button size="sm" className="ml-auto sm:ml-0" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Create Rule
                </Button>
              </div>
            </div>

            {/* Rules Table */}
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-10 text-xs font-medium py-2 px-3">
                      <Checkbox
                        checked={
                          paginatedRules.length > 0 &&
                          selectedIds.size === paginatedRules.length
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs font-medium py-2 px-3">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => handleSort("name")}
                      >
                        Rule Name
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs font-medium py-2 px-3">
                      Module
                    </TableHead>
                    <TableHead className="text-xs font-medium py-2 px-3">
                      Execute On
                    </TableHead>
                    <TableHead className="text-xs font-medium py-2 px-3">
                      Actions
                    </TableHead>
                    <TableHead className="text-xs font-medium py-2 px-3">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                        onClick={() => handleSort("modifiedAt")}
                      >
                        Modified On
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs font-medium py-2 px-3 text-center">
                      Status
                    </TableHead>
                    <TableHead className="w-10 text-xs font-medium py-2 px-3" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRules.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-12 text-muted-foreground text-sm"
                      >
                        {rules.length === 0
                          ? "No workflow rules created yet."
                          : "No rules match your search."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRules.map((rule) => (
                      <TableRow
                        key={rule.id}
                        className="hover:bg-muted/30 group"
                      >
                        <TableCell className="py-2.5 px-3">
                          <Checkbox
                            checked={selectedIds.has(rule.id)}
                            onCheckedChange={() => toggleSelect(rule.id)}
                          />
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <div>
                            <p
                              className="text-sm font-medium text-primary cursor-pointer hover:underline"
                              onClick={() => {
                                const params = new URLSearchParams({
                                  id: rule.id,
                                  module: rule.module,
                                  name: rule.name,
                                  ...(rule.description && { description: rule.description }),
                                })
                                router.push(`/settings/workflow-rules/create?${params.toString()}`)
                              }}
                            >
                              {rule.name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {rule.description}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <span className="text-xs font-medium">{rule.module}</span>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <Badge
                            variant="outline"
                            className={`text-xs py-0.5 px-2 ${getExecuteBadgeColor(rule.executeOn)}`}
                          >
                            {rule.executeOn}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {rule.actions.map((action) => (
                              <Badge
                                key={action}
                                variant="secondary"
                                className="text-xs py-0 px-1.5"
                              >
                                {action}
                              </Badge>
                            ))}
                            {rule.actions.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                No actions
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <div>
                            <p className="text-xs">
                              {format(new Date(rule.modifiedAt), "MMM dd, yyyy")}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {rule.modifiedBy}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-center">
                          <Switch
                            checked={rule.active}
                            onCheckedChange={() => toggleActive(rule.id)}
                            className="data-[state=checked]:bg-emerald-500"
                          />
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => {
                                  const params = new URLSearchParams({
                                    moduleName: rule.module,
                                    edit: rule.id,
                                  })
                                  router.push(`/settings/workflow-rules/create?${params.toString()}`)
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                Edit Rule
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const r = await fetch(
                                      `/api/workflow-rules/${rule.id}/run`,
                                      { method: "POST", credentials: "include" },
                                    ).then((res) => res.json())
                                    const summary = r?.success
                                      ? `Run ${r.status}: ${r.results?.filter((x: any) => x.ok).length || 0}/${r.results?.length || 0} action(s) ok`
                                      : `Run failed: ${r?.error || "unknown"}`
                                    alert(summary)
                                  } catch (err: any) {
                                    alert(`Run failed: ${err?.message || String(err)}`)
                                  }
                                }}
                              >
                                <Zap className="h-3.5 w-3.5 mr-2" />
                                Run now
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDuplicate(rule)}
                              >
                                <Copy className="h-3.5 w-3.5 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  router.push(
                                    `/settings/workflow-rules/executions?ruleId=${rule.id}`,
                                  )
                                }
                              >
                                <History className="h-3.5 w-3.5 mr-2" />
                                View Execution Log
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setRuleToDelete(rule)
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {filteredRules.length > 0 && (
              <div className="flex items-center justify-between text-xs">
                <p className="text-muted-foreground">
                  Showing{" "}
                  {(currentPage - 1) * itemsPerPage + 1}
                  {"\u2013"}
                  {Math.min(currentPage * itemsPerPage, filteredRules.length)}{" "}
                  of {filteredRules.length} rules
                </p>
                {totalPages > 1 && (
                  <Pagination className="my-0">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          className={
                            currentPage === 1
                              ? "pointer-events-none opacity-50"
                              : "cursor-pointer"
                          }
                        />
                      </PaginationItem>
                      {getPageNumbers().map((page, i) =>
                        page === "..." ? (
                          <PaginationItem key={`ell-${i}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => setCurrentPage(page as number)}
                              isActive={currentPage === page}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      )}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            setCurrentPage((p) => Math.min(totalPages, p + 1))
                          }
                          className={
                            currentPage === totalPages
                              ? "pointer-events-none opacity-50"
                              : "cursor-pointer"
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Usage Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="usage" className="mt-0">
          <div className="px-4 sm:px-6 py-6 space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border bg-background p-4">
                <p className="text-sm text-muted-foreground">Total Rules</p>
                <p className="text-2xl font-semibold mt-1">{usageStats.total}</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-sm text-muted-foreground">Active Rules</p>
                <p className="text-2xl font-semibold mt-1 text-emerald-600">
                  {usageStats.active}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-sm text-muted-foreground">Inactive Rules</p>
                <p className="text-2xl font-semibold mt-1 text-muted-foreground">
                  {usageStats.inactive}
                </p>
              </div>
            </div>

            {/* Per-Module Breakdown */}
            <div className="rounded-lg border bg-background">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-medium">Rules per Module</h3>
              </div>
              <div className="divide-y">
                {Object.entries(usageStats.byModule)
                  .sort(([, a], [, b]) => b - a)
                  .map(([mod, count]) => (
                    <div
                      key={mod}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <span className="text-sm">{mod}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${(count / usageStats.total) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium w-6 text-right">
                          {count}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Delete Confirmation Dialog ──────────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Workflow Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{ruleToDelete?.name}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Rule Dialog (Zoho-style) ─────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Create New Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-1">
            {/* Module - first field like Zoho */}
            <div className="grid grid-cols-[100px_1fr] items-center gap-3">
              <Label className="text-sm text-right text-muted-foreground">Module</Label>
              <Select
                value={newRule.module}
                onValueChange={(v) =>
                  setNewRule((prev) => ({ ...prev, module: v }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select Module" />
                </SelectTrigger>
                <SelectContent>
                  {modulesLoading ? (
                    <div className="px-2 py-3">
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ) : systemModules.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                      No modules found
                    </div>
                  ) : (
                    systemModules.map((m) => (
                      <SelectItem key={m.id} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Rule Name */}
            <div className="grid grid-cols-[100px_1fr] items-center gap-3">
              <Label className="text-sm text-right text-muted-foreground">Rule Name</Label>
              <Input
                placeholder=""
                value={newRule.name}
                onChange={(e) =>
                  setNewRule((prev) => ({ ...prev, name: e.target.value }))
                }
                className="h-9"
              />
            </div>

            {/* Description - textarea like Zoho */}
            <div className="grid grid-cols-[100px_1fr] items-start gap-3">
              <Label className="text-sm text-right text-muted-foreground pt-2">Description</Label>
              <Textarea
                placeholder=""
                value={newRule.description}
                onChange={(e) =>
                  setNewRule((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={3}
                className="resize-y text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false)
                setNewRule({ name: "", description: "", module: "", executeOn: "Create" })
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateRule}
              disabled={!newRule.name.trim() || !newRule.module}
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
