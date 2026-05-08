"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import PageBackLink from "@/components/shared/page-back-link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { Search, Plus, MoreVertical, Pencil, Trash2, Copy, Code2, Link2, History, Zap, X, AlertCircle, CheckCircle2 } from "lucide-react"
import {
  useGetFunctionsQuery,
  useCreateFunctionMutation,
  useDeleteFunctionMutation,
  useUpdateFunctionMutation,
  useExecuteFunctionMutation,
} from "@/lib/api/functions"

// ── Types ──────────────────────────────────────────────────────────────────

interface FunctionItem {
  id: string
  name: string
  displayName: string
  category: string
  language: string
  description: string
  associated: boolean
  restApi: boolean
  createdAt: string
  updatedAt: string
}

// ── Component ──────────────────────────────────────────────────────────────

export default function FunctionsPage() {
  const router = useRouter()
  const { data: functionsData } = useGetFunctionsQuery()
  const [createFunction, { isLoading: isCreating }] = useCreateFunctionMutation()
  const [deleteFunction] = useDeleteFunctionMutation()
  const [updateFunction] = useUpdateFunctionMutation()
  const [executeFunctionMut, { isLoading: isExecuting }] = useExecuteFunctionMutation()

  // Test Run dialog state
  const [testFunction, setTestFunction] = useState<FunctionItem | null>(null)
  const [testInputJson, setTestInputJson] = useState<string>("{}")
  const [testInputError, setTestInputError] = useState<string>("")
  const [testResult, setTestResult] = useState<{
    success: boolean
    result?: any
    error?: string
    durationMs: number
    logs: Array<{ level: string; args: any[]; ts: number }>
  } | null>(null)

  const openTestDialog = (fn: FunctionItem) => {
    setTestFunction(fn)
    setTestInputJson("{}")
    setTestInputError("")
    setTestResult(null)
  }

  const runTestExecution = async () => {
    if (!testFunction) return
    let parsedInput: any = undefined
    if (testInputJson.trim()) {
      try {
        parsedInput = JSON.parse(testInputJson)
      } catch (err: any) {
        setTestInputError(`Invalid JSON: ${err.message}`)
        return
      }
    }
    setTestInputError("")
    try {
      const r = await executeFunctionMut({
        id: testFunction.id,
        input: parsedInput,
        // persist=true so the run shows up in the execution log immediately.
        persist: true,
      }).unwrap()
      setTestResult(r as any)
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err?.data?.error || err?.message || "Run failed",
        durationMs: 0,
        logs: [],
      } as any)
    }
  }

  const logLevelColor = (level: string): string => {
    switch (level) {
      case "error": return "bg-red-50 text-red-700"
      case "warn": return "bg-amber-50 text-amber-700"
      case "info": return "bg-blue-50 text-blue-700"
      default: return "bg-muted/30 text-foreground"
    }
  }

  const functions: FunctionItem[] = useMemo(() => {
    const items = functionsData?.data || []
    return items.map((f: any) => ({
      id: f.id,
      name: f.name,
      displayName: f.displayName || f.name,
      category: f.category || "Automation",
      language: "JavaScript",
      description: f.description || "",
      associated: f.associated || false,
      restApi: f.restApi || false,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }))
  }, [functionsData])

  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("All")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [functionToDelete, setFunctionToDelete] = useState<FunctionItem | null>(null)
  const [newFunction, setNewFunction] = useState({
    name: "",
    displayName: "",
    category: "Automation",
    language: "JavaScript",
    description: "",
  })

  const filteredFunctions = useMemo(() => {
    let filtered = [...functions]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.displayName.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q)
      )
    }

    if (categoryFilter !== "All") {
      filtered = filtered.filter((f) => f.category === categoryFilter)
    }

    return filtered
  }, [functions, searchQuery, categoryFilter])

  const categories = useMemo(() => {
    const cats = new Set(functions.map((f) => f.category))
    return ["All", ...Array.from(cats)]
  }, [functions])

  const openEditor = (fn: FunctionItem) => {
    const params = new URLSearchParams({
      id: fn.id,
      name: fn.name,
      category: fn.category,
      language: fn.language,
    })
    router.push(`/settings/functions/editor?${params.toString()}`)
  }

  const handleCreate = async () => {
    try {
      const result = await createFunction({
        name: newFunction.name,
        displayName: newFunction.displayName || newFunction.name,
        category: newFunction.category,
        language: newFunction.language,
        description: newFunction.description || undefined,
      }).unwrap()
      setCreateDialogOpen(false)
      // Navigate to editor with the new function
      const params = new URLSearchParams({
        id: result.data.id,
        name: newFunction.name,
        category: newFunction.category,
        language: newFunction.language,
      })
      setNewFunction({ name: "", displayName: "", category: "Automation", language: "JavaScript", description: "" })
      router.push(`/settings/functions/editor?${params.toString()}`)
    } catch (err) {
      console.error("Failed to create function:", err)
    }
  }

  const confirmDelete = async () => {
    if (functionToDelete) {
      await deleteFunction(functionToDelete.id)
    }
    setFunctionToDelete(null)
    setDeleteDialogOpen(false)
  }

  const handleDuplicate = async (fn: FunctionItem) => {
    try {
      await createFunction({
        name: `${fn.name}_copy`,
        displayName: `${fn.displayName} (Copy)`,
        category: fn.category,
        language: fn.language,
        description: fn.description || undefined,
      }).unwrap()
    } catch (err) {
      console.error("Failed to duplicate function:", err)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="border-b bg-background">
        <div className="px-4 sm:px-6 py-4 space-y-1.5">
          <PageBackLink href="/settings" label="Settings" />
          <div className="flex items-center gap-2 mb-1">
            <Code2 className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold text-foreground">Functions</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Listed below are the functions available for your organization. These functions can be associated to the various features.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="functions" className="w-full">
        <div className="border-b bg-background px-4 sm:px-6">
          <TabsList className="h-10 bg-transparent p-0 gap-4">
            <TabsTrigger
              value="functions"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Functions
            </TabsTrigger>
            <TabsTrigger
              value="gallery"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Gallery
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Analytics
            </TabsTrigger>
            <TabsTrigger
              value="failures"
              className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              Failures
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Functions Tab ─────────────────────────────────────────────── */}
        <TabsContent value="functions" className="mt-0">
          <div className="px-4 sm:px-6 py-4 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 flex-1 w-full sm:w-auto">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-32 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative flex-1 w-full sm:max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search Functions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/settings/functions/executions")}
              >
                <History className="w-3.5 h-3.5 mr-1.5" />
                Execution Log
              </Button>
              <Button size="sm" className="ml-auto sm:ml-0" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create Function
              </Button>
            </div>

            {/* Functions Table */}
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-xs font-medium py-2 px-3">Name</TableHead>
                    <TableHead className="text-xs font-medium py-2 px-3">Category</TableHead>
                    <TableHead className="text-xs font-medium py-2 px-3">Language</TableHead>
                    <TableHead className="text-xs font-medium py-2 px-3">REST API</TableHead>
                    <TableHead className="w-10 text-xs font-medium py-2 px-3" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFunctions.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-12 text-muted-foreground text-sm"
                      >
                        {functions.length === 0
                          ? "No functions created yet."
                          : "No functions match your search."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFunctions.map((fn) => (
                      <TableRow key={fn.id} className="hover:bg-muted/30 group">
                        <TableCell className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-sm font-medium text-primary cursor-pointer hover:underline"
                              onClick={() => openEditor(fn)}
                            >
                              {fn.displayName}
                            </span>
                            {fn.associated && (
                              <Badge className="text-[10px] py-0 px-1.5 bg-emerald-500 hover:bg-emerald-500 text-white">
                                Associated
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <span className="text-xs text-muted-foreground">{fn.category}</span>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <span className="text-xs text-muted-foreground">{fn.language}</span>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          {fn.restApi && (
                            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
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
                              <DropdownMenuItem onClick={() => openEditor(fn)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openTestDialog(fn)}>
                                <Zap className="h-3.5 w-3.5 mr-2" />
                                Test Run
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  router.push(
                                    `/settings/functions/executions?functionId=${fn.id}`,
                                  )
                                }
                              >
                                <History className="h-3.5 w-3.5 mr-2" />
                                View Execution Log
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(fn)}>
                                <Copy className="h-3.5 w-3.5 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setFunctionToDelete(fn)
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
          </div>
        </TabsContent>

        {/* ── Gallery Tab ───────────────────────────────────────────────── */}
        <TabsContent value="gallery" className="mt-0">
          <div className="px-4 sm:px-6 py-12 text-center text-muted-foreground text-sm">
            Function gallery coming soon.
          </div>
        </TabsContent>

        {/* ── Analytics Tab ─────────────────────────────────────────────── */}
        <TabsContent value="analytics" className="mt-0">
          <div className="px-4 sm:px-6 py-12 text-center text-muted-foreground text-sm">
            Function analytics coming soon.
          </div>
        </TabsContent>

        {/* ── Failures Tab ──────────────────────────────────────────────── */}
        <TabsContent value="failures" className="mt-0">
          <div className="px-4 sm:px-6 py-12 text-center text-muted-foreground text-sm">
            No failures recorded.
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Create Function Dialog ─────────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Create New Function</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-[100px_1fr] items-center gap-3">
              <Label className="text-sm text-right text-muted-foreground whitespace-nowrap">Function Name</Label>
              <Input
                placeholder="e.g. update_record_status"
                value={newFunction.name}
                onChange={(e) => setNewFunction((prev) => ({ ...prev, name: e.target.value }))}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-[100px_1fr] items-center gap-3">
              <Label className="text-sm text-right text-muted-foreground">Display Name</Label>
              <Input
                placeholder="e.g. Update Record Status"
                value={newFunction.displayName}
                onChange={(e) => setNewFunction((prev) => ({ ...prev, displayName: e.target.value }))}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-[100px_1fr] items-center gap-3">
              <Label className="text-sm text-right text-muted-foreground">Category</Label>
              <Select
                value={newFunction.category}
                onValueChange={(v) => setNewFunction((prev) => ({ ...prev, category: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Automation">Automation</SelectItem>
                  <SelectItem value="Standalone">Standalone</SelectItem>
                  <SelectItem value="Button">Button</SelectItem>
                  <SelectItem value="Related List">Related List</SelectItem>
                  <SelectItem value="Signals">Signals</SelectItem>
                  <SelectItem value="Validation Rule">Validation Rule</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-[100px_1fr] items-start gap-3">
              <Label className="text-sm text-right text-muted-foreground pt-2">Description</Label>
              <Textarea
                placeholder=""
                value={newFunction.description}
                onChange={(e) => setNewFunction((prev) => ({ ...prev, description: e.target.value }))}
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
                setNewFunction({ name: "", displayName: "", category: "Automation", language: "JavaScript", description: "" })
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newFunction.name.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Test Run Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!testFunction} onOpenChange={(open) => !open && setTestFunction(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-indigo-700" />
              Test Run — {testFunction?.displayName}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {/* ── Input ──────────────────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-xs">
                Input (JSON, available as <code className="font-mono">ctx.input</code>)
              </Label>
              <Textarea
                rows={10}
                className="text-xs font-mono"
                placeholder='{ "key": "value" }'
                value={testInputJson}
                onChange={(e) => setTestInputJson(e.target.value)}
              />
              {testInputError && (
                <p className="text-[10px] text-red-600">{testInputError}</p>
              )}
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 w-full"
                disabled={isExecuting || !testFunction}
                onClick={runTestExecution}
              >
                <Zap className="h-3.5 w-3.5" />
                {isExecuting ? "Running..." : "Run with this input"}
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Persists to the execution log so you can compare runs over time.
              </p>
            </div>

            {/* ── Result + Logs ───────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Result</Label>
                {testResult && (
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 px-1.5 py-0 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> success
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-red-100 text-red-700 hover:bg-red-100 px-1.5 py-0 gap-1">
                        <AlertCircle className="h-3 w-3" /> failed
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {testResult.durationMs}ms
                    </span>
                  </div>
                )}
              </div>
              {!testResult ? (
                <div className="border rounded p-3 text-[11px] text-muted-foreground italic h-24 flex items-center justify-center">
                  Click "Run" to test this function. Result + console logs will appear here.
                </div>
              ) : (
                <>
                  {testResult.error && (
                    <div className="px-2 py-1.5 bg-red-50 border border-red-200 rounded text-[11px] text-red-700 break-words">
                      <span className="font-medium">Error:</span> {testResult.error}
                    </div>
                  )}
                  {testResult.success && (
                    <pre className="text-[10px] bg-muted/40 border rounded p-2 overflow-auto max-h-32 font-mono">
                      {testResult.result === undefined
                        ? "(no return value)"
                        : JSON.stringify(testResult.result, null, 2)}
                    </pre>
                  )}
                </>
              )}

              <Label className="text-xs pt-2">
                Console output ({testResult?.logs?.length || 0})
              </Label>
              <div className="border rounded max-h-48 overflow-y-auto bg-muted/10">
                {!testResult?.logs?.length ? (
                  <p className="p-2 text-[11px] text-muted-foreground italic">
                    No console output yet.
                  </p>
                ) : (
                  testResult.logs.map((entry, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 px-2 py-1 text-[10px] font-mono border-b last:border-b-0 ${logLevelColor(entry.level)}`}
                    >
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {new Date(entry.ts).toISOString().slice(11, 19)}
                      </span>
                      <span className="uppercase text-[9px] shrink-0 mt-px">
                        {entry.level}
                      </span>
                      <span className="break-words flex-1">
                        {(entry.args || []).map((a) =>
                          typeof a === "object" ? JSON.stringify(a) : String(a),
                        ).join(" ")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {testFunction && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  router.push(
                    `/settings/functions/executions?functionId=${testFunction.id}`,
                  )
                }}
              >
                <History className="h-3.5 w-3.5 mr-1.5" />
                Full execution log →
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setTestFunction(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ──────────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Function</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &quot;{functionToDelete?.displayName}&quot;? This action cannot be undone.
          </p>
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
    </div>
  )
}
