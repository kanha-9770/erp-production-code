"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  Search,
  ArrowLeft,
  HelpCircle,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Check,
  Zap,
} from "lucide-react"
import {
  useGetBindingsTreeQuery,
  useDeleteBindingMutation,
  useUpdateBindingMutation,
  type BindingEvent,
  type FunctionBinding,
} from "@/lib/api/functions"
import { AssociateFunctionDialog } from "@/components/functions/AssociateFunctionDialog"

// Top tabs
type TopTab = "crmApi" | "sdks"
// Sub-tabs under CRM API. "Function Bindings" is the default — the simple
// per-module association list. "API Names" is the read-only field reference.
type SubTab = "bindings" | "apiNames" | "dashboard" | "credits"

const EVENT_BADGE: Record<string, string> = {
  onFieldChange: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  onFieldBlur: "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  beforeSubmit: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  afterCreate: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  afterUpdate: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  manual: "bg-slate-500/15 text-slate-700 border-slate-500/30",
}

const EVENT_LABEL: Record<string, string> = {
  onFieldChange: "On field change",
  onFieldBlur: "On field blur",
  beforeSubmit: "Before submit",
  afterCreate: "After create",
  afterUpdate: "After update",
  manual: "Manual",
}

function apiSlug(s: string): string {
  return (s || "")
    .trim()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("_")
}

interface AssocDialogState {
  open: boolean
  moduleId: string
  moduleName: string
  binding?: FunctionBinding & { functionId: string }
}

export default function ApisAndSdksPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: treeData, isLoading } = useGetBindingsTreeQuery()
  const [updateBinding] = useUpdateBindingMutation()
  const [deleteBinding, deleteState] = useDeleteBindingMutation()

  const [topTab, setTopTab] = useState<TopTab>("crmApi")
  const [subTab, setSubTab] = useState<SubTab>("bindings")
  const [search, setSearch] = useState("")
  const [assoc, setAssoc] = useState<AssocDialogState>({
    open: false,
    moduleId: "",
    moduleName: "",
  })

  // Drill state for the API Names reference tab.
  const moduleIdInUrl = searchParams.get("moduleId") || ""
  const tree = treeData?.data || []
  const selectedModule = useMemo(
    () => tree.find((m) => m.id === moduleIdInUrl) || null,
    [tree, moduleIdInUrl]
  )

  const goToModuleRef = (id: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("moduleId", id)
    router.push(`/settings/apis?${params.toString()}`)
  }
  const goBackRef = () => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.delete("moduleId")
    const qs = params.toString()
    router.push(`/settings/apis${qs ? `?${qs}` : ""}`)
  }

  // Per-module: every binding scoped to it. Module-level (moduleId set), plus
  // form/field-scoped bindings on its forms/fields. Shown together so the
  // page is one-stop for "what's wired into Leads".
  const moduleBindings = (mod: any) => {
    const out: any[] = []
    for (const ev of mod.events) for (const b of ev.bindings) out.push({ ...b, _scope: "module" })
    for (const f of mod.forms) {
      for (const ev of f.events) {
        for (const b of ev.bindings) {
          const scopeKind = b.fieldId ? "field" : "form"
          out.push({ ...b, _scope: scopeKind, _formName: f.name, _fieldLabel: b.fieldLabel })
        }
      }
    }
    return out
  }

  const handleDelete = async (b: any) => {
    if (!confirm(`Remove "${b.function?.displayName || b.function?.name}" from this module?`)) return
    try {
      await deleteBinding({ functionId: b.functionId, bindingId: b.id }).unwrap()
    } catch (e: any) {
      alert(e?.data?.error || e?.message || "Failed")
    }
  }
  const handleToggle = async (b: any) => {
    try {
      await updateBinding({
        functionId: b.functionId,
        bindingId: b.id,
        body: { active: !b.active },
      }).unwrap()
    } catch (e: any) {
      alert(e?.data?.error || e?.message || "Failed")
    }
  }

  const filteredTree = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tree
    return tree.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        moduleBindings(m).some((b) =>
          (b.function?.displayName || b.function?.name || "").toLowerCase().includes(q)
        )
    )
  }, [tree, search])

  return (
    <div className="container mx-auto py-4 max-w-6xl">
      {/* ── Top tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 border-b">
        <button
          onClick={() => setTopTab("crmApi")}
          className={`px-1 pb-3 text-base font-medium border-b-2 -mb-px transition-colors ${
            topTab === "crmApi"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          CRM API
        </button>
        <button
          onClick={() => setTopTab("sdks")}
          className={`px-1 pb-3 text-base font-medium border-b-2 -mb-px transition-colors ${
            topTab === "sdks"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          SDKs
        </button>
      </div>

      {topTab === "sdks" ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          SDKs documentation will appear here.
        </div>
      ) : (
        <div className="pt-6 space-y-4">
          {/* ── Sub-tab pills ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
              {(
                [
                  { value: "bindings", label: "Function Bindings" },
                  { value: "apiNames", label: "API names" },
                  { value: "dashboard", label: "Dashboard" },
                  { value: "credits", label: "Credits" },
                ] as { value: SubTab; label: string }[]
              ).map((t) => (
                <button
                  key={t.value}
                  onClick={() => setSubTab(t.value)}
                  className={`px-4 py-1 text-sm rounded transition-colors ${
                    subTab === t.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <HelpCircle className="h-4 w-4" /> Help
            </button>
          </div>

          {/* ── Function Bindings: the simple flow ────────────────────── */}
          {subTab === "bindings" && (
            <>
              <p className="text-sm text-muted-foreground">
                Associate a function with a module. The runtime auto-exposes every form field to
                the script — no field mapping required.
              </p>

              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search modules or functions"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
              ) : filteredTree.length === 0 ? (
                <div className="border rounded-md py-12 text-center text-sm text-muted-foreground">
                  {search ? "Nothing matches your search." : "No modules in this organization."}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTree.map((mod) => {
                    const bindings = moduleBindings(mod)
                    return (
                      <div key={mod.id} className="border rounded-md overflow-hidden bg-background">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{mod.name}</span>
                            <Badge variant="secondary" className="text-[10px]">
                              {bindings.length} function{bindings.length === 1 ? "" : "s"}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            onClick={() =>
                              setAssoc({
                                open: true,
                                moduleId: mod.id,
                                moduleName: mod.name,
                              })
                            }
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Associate Function
                          </Button>
                        </div>

                        {bindings.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                            No functions associated. Click <strong>Associate Function</strong> to wire one.
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-transparent hover:bg-transparent">
                                <TableHead className="w-[40%]">Function</TableHead>
                                <TableHead>When</TableHead>
                                <TableHead>Scope</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[80px] text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {bindings.map((b) => (
                                <TableRow key={b.id}>
                                  <TableCell>
                                    <div className="font-medium">
                                      {b.function?.displayName || b.function?.name}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-mono">
                                      {b.function?.name}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={`${EVENT_BADGE[b.event] || ""} font-normal text-[10px]`}
                                    >
                                      {EVENT_LABEL[b.event] || b.event}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {b._scope === "module" ? (
                                      <span className="text-xs text-muted-foreground">Module</span>
                                    ) : b._scope === "form" ? (
                                      <span className="text-xs text-muted-foreground">
                                        Form: {b._formName}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        Field: {b._fieldLabel || "—"}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {b.active ? (
                                      <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30">
                                        Active
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-muted-foreground">
                                        Disabled
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-0.5">
                                      {b._scope === "module" && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7"
                                          title="Edit"
                                          onClick={() =>
                                            setAssoc({
                                              open: true,
                                              moduleId: mod.id,
                                              moduleName: mod.name,
                                              binding: b as FunctionBinding & { functionId: string },
                                            })
                                          }
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        title={b.active ? "Disable" : "Enable"}
                                        onClick={() => handleToggle(b)}
                                      >
                                        {b.active ? (
                                          <PowerOff className="h-3.5 w-3.5" />
                                        ) : (
                                          <Power className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-red-500 hover:text-red-600"
                                        title="Delete"
                                        onClick={() => handleDelete(b)}
                                        disabled={deleteState.isLoading}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <p className="text-xs text-muted-foreground border-t pt-3">
                <strong>How it runs.</strong> Inside the script, every field is at{" "}
                <code className="font-mono">ctx.input.&lt;API_Name&gt;</code>. Return{" "}
                <code className="font-mono">{`{ API_Name: value }`}</code> to populate fields. For{" "}
                <code className="font-mono">beforeSubmit</code>, return{" "}
                <code className="font-mono">{`{ ok: false, error: "…" }`}</code> to block. See{" "}
                <code className="font-mono">docs/FUNCTION_API_GUIDE.md</code> for full reference.
              </p>
            </>
          )}

          {/* ── API Names: read-only reference ────────────────────────── */}
          {subTab === "apiNames" && (
            <>
              <div className="flex items-center gap-2">
                {selectedModule && (
                  <button
                    onClick={goBackRef}
                    className="text-muted-foreground hover:text-foreground"
                    title="Back to modules"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <p className="text-sm text-muted-foreground">
                  Reference of every module + field's API Name. Use these in your function scripts.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={selectedModule ? "Search Fields or Data Types" : "Search"}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <span className="text-sm text-muted-foreground">Filter By:</span>
                {selectedModule ? (
                  <Select
                    value={selectedModule.id}
                    onValueChange={(v) => goToModuleRef(v)}
                  >
                    <SelectTrigger className="h-9 w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tree.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value="modules" onValueChange={() => {}}>
                    <SelectTrigger className="h-9 w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="modules">Modules</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {isLoading ? (
                <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
              ) : selectedModule ? (
                <FieldsRefTable module={selectedModule} search={search} />
              ) : (
                <ModulesRefTable tree={tree} search={search} onPick={goToModuleRef} />
              )}
            </>
          )}

          {subTab === "dashboard" && <DashboardStub tree={tree} />}
          {subTab === "credits" && <CreditsStub />}
        </div>
      )}

      <AssociateFunctionDialog
        open={assoc.open}
        onOpenChange={(open) =>
          setAssoc((a) => ({ ...a, open, binding: open ? a.binding : undefined }))
        }
        moduleId={assoc.moduleId}
        moduleName={assoc.moduleName}
        binding={assoc.binding}
      />
    </div>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function ModulesRefTable(props: {
  tree: any[]
  search: string
  onPick: (id: string) => void
}) {
  const { tree, search, onPick } = props
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tree
    return tree.filter(
      (m) => m.name.toLowerCase().includes(q) || apiSlug(m.name).toLowerCase().includes(q)
    )
  }, [tree, search])

  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="font-medium">Displayed In Tabs As</TableHead>
            <TableHead className="font-medium">API Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                {search ? "No modules match your search." : "No modules."}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((m) => (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => onPick(m.id)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="text-primary hover:underline">{m.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{apiSlug(m.name)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function FieldsRefTable(props: { module: any; search: string }) {
  const { module: mod, search } = props
  const fieldRows = useMemo(() => {
    const rows: Array<{
      id: string
      label: string
      type: string
      group: string
      apiName: string
      formName: string
    }> = []
    for (const f of mod.forms) {
      for (const fld of f.fields) {
        rows.push({
          id: fld.id,
          label: fld.label,
          type: fld.type,
          group: fld.group,
          apiName: fld.apiName,
          formName: f.name,
        })
      }
    }
    return rows
  }, [mod])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return fieldRows
    return fieldRows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.apiName.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
    )
  }, [fieldRows, search])

  return (
    <div className="border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="font-medium">Field Label</TableHead>
            <TableHead className="font-medium">API Name</TableHead>
            <TableHead className="font-medium">Data Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                {search ? "No fields match." : "No fields in this module."}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div>{r.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.formName} · {r.group}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{r.apiName}</TableCell>
                <TableCell className="capitalize">{r.type}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function DashboardStub(props: { tree: any[] }) {
  const totals = useMemo(() => {
    let modules = props.tree.length
    let forms = 0
    let fields = 0
    let bindings = 0
    let active = 0
    for (const m of props.tree) {
      forms += m.forms.length
      for (const f of m.forms) {
        fields += f.fields.length
        for (const ev of f.events) {
          bindings += ev.bindings.length
          active += ev.bindings.filter((b: any) => b.active).length
        }
      }
      for (const ev of m.events) {
        bindings += ev.bindings.length
        active += ev.bindings.filter((b: any) => b.active).length
      }
    }
    return { modules, forms, fields, bindings, active }
  }, [props.tree])
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {[
        { label: "Modules", value: totals.modules },
        { label: "Forms", value: totals.forms },
        { label: "Fields", value: totals.fields },
        { label: "Total bindings", value: totals.bindings },
        { label: "Active", value: totals.active },
      ].map((s) => (
        <div key={s.label} className="border rounded p-4 text-center">
          <div className="text-2xl font-semibold">{s.value}</div>
          <div className="text-xs text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

function CreditsStub() {
  return (
    <div className="border rounded p-6 text-sm text-muted-foreground">
      <div className="flex items-start gap-2">
        <Check className="h-4 w-4 mt-0.5 text-emerald-600" />
        <div>
          Function executions are unmetered for this organization. A future release will surface
          per-function usage and credit balances here.
        </div>
      </div>
    </div>
  )
}
